import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const stableIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/, "Governance IDs must be stable lowercase slugs");
const sourceSchema = z.enum(["clickup", "github", "replit"]);
const sourceTypeSchema = z.enum(["workspace", "space", "folder", "list", "task", "doc", "page", "agent", "workflow", "sop", "client", "integration", "run"]);
const relationSchema = z.enum(["contains", "references", "assigned_to", "governed_by", "executes", "reads_from", "writes_to", "generated", "approved_by", "related_to"]);
const kindSchema = z.enum(["sop", "workflow", "super-agent-record", "super-agent", "integration-record", "integration", "project", "repository"]);
const lifecycleSchema = z.enum(["draft", "proposed", "testing", "active", "paused", "degraded", "deprecated", "archived"]);
const objectSchema = z.object({
  id: stableIdSchema,
  kind: kindSchema,
  label: z.string().min(1),
  owner: sourceSchema,
  lifecycle: lifecycleSchema,
  graph: z.object({ id: z.string().min(1), source: sourceSchema, sourceType: sourceTypeSchema }),
});
const linkSchema = z.object({ from: stableIdSchema, to: stableIdSchema, relation: relationSchema, direction: z.enum(["directed", "undirected"]).optional().default("directed") });
const manifestSchema = z.object({ version: z.literal(1), objects: z.array(objectSchema).min(1), links: z.array(linkSchema) });

export type BrainGovernanceObject = z.infer<typeof objectSchema>;
export type BrainGovernanceManifest = z.infer<typeof manifestSchema>;
export interface BrainGovernanceIssue { code: string; message: string; objectId?: string }
export interface BrainGovernanceResult { manifest: BrainGovernanceManifest; issues: BrainGovernanceIssue[] }

export function findBrainGovernanceRoot(start = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, "brain-governance.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Could not locate brain-governance.json");
    dir = parent;
  }
}
function addIssue(issues: BrainGovernanceIssue[], issue: BrainGovernanceIssue): void {
  if (!issues.some((current) => current.code === issue.code && current.objectId === issue.objectId && current.message === issue.message)) issues.push(issue);
}
export function validateBrainGovernance(manifest: BrainGovernanceManifest): BrainGovernanceResult {
  const issues: BrainGovernanceIssue[] = [];
  const byId = new Map<string, BrainGovernanceObject>();
  const graphIds = new Set<string>();
  for (const object of manifest.objects) {
    if (byId.has(object.id)) addIssue(issues, { code: "duplicate_object_id", message: `Duplicate governance object: ${object.id}`, objectId: object.id });
    else byId.set(object.id, object);
    if (graphIds.has(object.graph.id)) addIssue(issues, { code: "duplicate_graph_id", message: `Graph node is owned by multiple governance objects: ${object.graph.id}`, objectId: object.id });
    graphIds.add(object.graph.id);
    if (object.owner !== object.graph.source) addIssue(issues, { code: "owner_source_mismatch", message: `${object.id} owner must match its canonical graph source`, objectId: object.id });
    if (!object.graph.id.startsWith(`${object.graph.source}:${object.graph.sourceType}:`)) addIssue(issues, { code: "invalid_graph_namespace", message: `${object.id} graph id does not match source and type`, objectId: object.id });
  }
  const linkKeys = new Set<string>();
  for (const link of manifest.links) {
    if (!byId.has(link.from)) addIssue(issues, { code: "missing_link_source", message: `Unknown governance link source: ${link.from}`, objectId: link.from });
    if (!byId.has(link.to)) addIssue(issues, { code: "missing_link_target", message: `Unknown governance link target: ${link.to}`, objectId: link.to });
    if (link.from === link.to) addIssue(issues, { code: "self_link", message: `Governance object cannot link to itself: ${link.from}`, objectId: link.from });
    const key = `${link.relation}:${link.from}->${link.to}`;
    if (linkKeys.has(key)) addIssue(issues, { code: "duplicate_link", message: `Duplicate governance link: ${key}`, objectId: link.from });
    linkKeys.add(key);
  }
  for (const object of manifest.objects) {
    if (object.graph.source !== "clickup") {
      const governed = manifest.links.some((link) => link.from === object.id && link.relation === "governed_by" && byId.get(link.to)?.owner === "clickup");
      if (!governed) addIssue(issues, { code: "technical_object_without_governance", message: `${object.id} must be governed by one ClickUp object`, objectId: object.id });
    }
    if (object.kind === "super-agent") {
      const governed = manifest.links.some((link) => link.from === object.id && link.relation === "governed_by" && byId.get(link.to)?.kind === "super-agent-record");
      if (!governed) addIssue(issues, { code: "agent_without_record", message: `${object.id} must be governed by a Super Agent record`, objectId: object.id });
    }
  }
  const crossSystemLinks = manifest.links.filter((link) => byId.get(link.from)?.graph.source !== byId.get(link.to)?.graph.source);
  if (crossSystemLinks.length === 0) addIssue(issues, { code: "no_cross_system_links", message: "Governance manifest must contain at least one cross-system relationship" });
  return { manifest, issues };
}
export function parseBrainGovernance(raw: unknown): BrainGovernanceManifest { return manifestSchema.parse(raw); }
export function loadBrainGovernance(start = process.cwd()): BrainGovernanceResult {
  const root = findBrainGovernanceRoot(start);
  return validateBrainGovernance(parseBrainGovernance(JSON.parse(readFileSync(join(root, "brain-governance.json"), "utf8"))));
}
