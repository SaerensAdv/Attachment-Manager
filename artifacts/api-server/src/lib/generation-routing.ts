import {
  getDocFile,
  parseFanoutMarker,
  MAX_FANOUT,
  type DocFile,
} from "./docs";
import { loadClientDocs } from "./clients-store";
import { getDeliverableKind } from "./deliverables";
import type { GenerationContext, ResolveResult } from "./generation-types";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Ensure a selected path maps to an existing doc of the expected category. */
function isValidDoc(
  path: string,
  expectedCategory: string,
  extra: DocFile[] = [],
): boolean {
  const doc = getDocFile(path, extra);
  return doc !== null && doc.category === expectedCategory;
}

/** The two cross-cutting QC agents. They are never executors on the team; they
 * form the final quality gate that runs after the team finishes. */
export const QC_REVIEWER_PATH = "agents/qa-compliance-reviewer.md";
export const QC_HUMANIZER_PATH = "agents/humanizer.md";
const QC_PATHS = new Set<string>([QC_REVIEWER_PATH, QC_HUMANIZER_PATH]);

/**
 * Validate a raw request body and resolve it into a runnable context. Mirrors
 * the rules the UI relies on: a deduped team (orchestrator dropped, it only
 * routes), a known client + workflow, and a non-empty request.
 */
export async function resolveGenerationContext(
  body: unknown,
): Promise<ResolveResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const agentPath = asString(b.agentPath);
  const clientPath = asString(b.clientPath);
  const workflowPath = asString(b.workflowPath);
  const request = asString(b.request);

  if (!agentPath || !clientPath || !workflowPath || !request) {
    return {
      ok: false,
      status: 400,
      error:
        "agentPath, clientPath, workflowPath en request zijn allemaal verplicht.",
    };
  }

  const rawTeam = [
    agentPath,
    ...(Array.isArray(b.additionalAgentPaths)
      ? b.additionalAgentPaths.filter((p): p is string => typeof p === "string")
      : []),
  ];
  const seen = new Set<string>();
  const teamPaths: string[] = [];
  for (const p of rawTeam) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (p === "agents/orchestrator.md") continue;
    // The QC agents are never executors — they run as the final quality gate.
    if (QC_PATHS.has(p)) continue;
    if (isValidDoc(p, "agent")) teamPaths.push(p);
  }
  if (teamPaths.length === 0) {
    return { ok: false, status: 400, error: "Onbekende of ongeldige agent." };
  }

  const clientDocs = await loadClientDocs();
  if (!isValidDoc(clientPath, "client", clientDocs)) {
    return { ok: false, status: 400, error: "Onbekende of ongeldige klant." };
  }
  if (!isValidDoc(workflowPath, "workflow")) {
    return { ok: false, status: 400, error: "Onbekende of ongeldige workflow." };
  }

  const memberTitles = teamPaths.map((p) => getDocFile(p)?.title ?? "Teamlid");
  const clientDoc = getDocFile(clientPath, clientDocs);
  const clientName = (clientDoc?.title ?? clientPath).replace(/^Client:\s*/i, "");
  const clientContent = clientDoc?.content ?? "";
  const workflowDoc = getDocFile(workflowPath);
  const workflowTitle = (workflowDoc?.title ?? workflowPath).replace(
    /^Workflow:\s*/i,
    "",
  );
  const deliverableKind = getDeliverableKind(workflowDoc);

  const stages = parseStages(b.stages, teamPaths);
  // A "markdown" deliverable (or none) means the team's text IS the output, so
  // it is client-facing and the Humanizer language pass applies. Structured
  // deliverables (CSV, Replit prompt, e-mailed report) treat team work as
  // intermediate. An explicit clientFacing flag from routing overrides.
  const clientFacing =
    typeof b.clientFacing === "boolean"
      ? b.clientFacing
      : deliverableKind === null || deliverableKind === "markdown";
  const qcEnabled = b.qcEnabled === false ? false : true;
  const touchesLiveAccount = b.touchesLiveAccount === true;
  // Fan-out is opt-in via the workflow marker; an explicit numeric body value
  // overrides it (and can switch it off with a value below 2), always clamped to
  // the safety cap so a request can never spawn an unbounded number of runs.
  const fanout =
    typeof b.fanout === "number" && Number.isFinite(b.fanout)
      ? b.fanout < 2
        ? 0
        : Math.min(Math.floor(b.fanout), MAX_FANOUT)
      : parseFanout(workflowDoc);

  return {
    ok: true,
    ctx: {
      teamPaths,
      memberTitles,
      clientPath,
      clientName,
      clientContent,
      workflowPath,
      workflowTitle,
      workflowDoc,
      deliverableKind,
      request,
      clientDocs,
      stages,
      clientFacing,
      qcEnabled,
      touchesLiveAccount,
      fanout,
    },
  };
}

/**
 * Turn an optional routing-provided parallel plan (groups of agent paths) into
 * groups of indices into `teamPaths`. The plan is only honoured when every
 * teamPath appears exactly once across all groups; any mismatch (unknown path,
 * duplicate, or missing member) falls back to fully sequential execution so we
 * never silently drop or double-run an agent.
 */
export function parseStages(raw: unknown, teamPaths: string[]): number[][] {
  const sequential = teamPaths.map((_, i) => [i]);
  if (!Array.isArray(raw) || raw.length === 0) return sequential;

  const indexByPath = new Map<string, number>();
  teamPaths.forEach((p, i) => indexByPath.set(p, i));

  const used = new Set<number>();
  const groups: number[][] = [];
  for (const group of raw) {
    if (!Array.isArray(group) || group.length === 0) return sequential;
    const indices: number[] = [];
    for (const path of group) {
      if (typeof path !== "string") return sequential;
      const idx = indexByPath.get(path);
      if (idx === undefined || used.has(idx)) return sequential;
      used.add(idx);
      indices.push(idx);
    }
    groups.push(indices);
  }
  // Every team member must be placed exactly once.
  if (used.size !== teamPaths.length) return sequential;
  return groups;
}

// MAX_FANOUT lives in ./docs (the single source of truth shared with the doc
// graph) and is re-exported here for the engine's callers and tests.
export { MAX_FANOUT };

/**
 * Parse a workflow doc's opt-in fan-out marker (`<!-- fanout: 3 -->`). Fan-out
 * runs the LEAD creative agent N times with diversity, then a selection pass
 * picks the strongest candidate. Returns 0 (off) for a missing doc/marker, a
 * value below 2, or a non-numeric/garbled value, so every non-opted workflow
 * behaves exactly as before. Thin convenience wrapper over `parseFanoutMarker`.
 */
export function parseFanout(workflow: DocFile | null): number {
  if (!workflow) return 0;
  return parseFanoutMarker(workflow.content);
}

/**
 * Per-candidate diversity directives for a fan-out run. Each candidate gets one
 * distinct angle so the N variations are genuinely different (not reworded
 * twins). Cycled by index, so any fan-out size up to MAX_FANOUT is covered.
 */
export const FANOUT_SEEDS = [
  "Invalshoek A — kies de meest voor de hand liggende, heldere insteek: het kernvoordeel en een duidelijke call-to-action, zakelijk en direct.",
  "Invalshoek B — kies bewust een ANDERE hoek dan de meest voor de hand liggende: een ander voordeel, een andere doelgroep-hoek of een ander koopmotief.",
  "Invalshoek C — durf een verrassende, creatievere insteek (sterke hook, ongewone opening) die nog steeds on-brand en policy-conform blijft.",
  "Invalshoek D — een rationele, bewijs-gedreven insteek: concrete voordelen, cijfers/feiten waar onderbouwd, en CTA-helderheid.",
  "Invalshoek E — een emotionele, verhalende insteek die inspeelt op de situatie van de doelgroep.",
];

/** Shared instruction prepended to every fan-out candidate's diversity seed. */
export const FANOUT_DIRECTIVE =
  "Dit is één van meerdere parallelle varianten. Lever EXACT ÉÉN volledige, " +
  "zelfstandige versie van de gevraagde copy/creatives volgens onderstaande " +
  "invalshoek. Verwijs niet naar andere varianten. Respecteer alle platform- en " +
  "merkregels onverkort.";
