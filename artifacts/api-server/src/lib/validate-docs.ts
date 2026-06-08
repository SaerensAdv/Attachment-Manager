import {
  getDocGraph,
  listDocFiles,
  extractSection,
  type DocFile,
} from "./docs";
import { ALWAYS_KNOWLEDGE } from "./generate-context";
import { departmentSlugs, getDepartments } from "./team";

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  kind: string;
  source?: string;
  target?: string;
  message: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  checkedAt: string;
  counts: { error: number; warning: number; info: number };
}

// Matches doc-path references like `AGENTS.md`, `ARCHITECTURE.md` or
// `agents/foo.md`, `knowledge/bar.md`, etc. inside backtick spans.
const PATH_REF_RE =
  /(?:AGENTS|ARCHITECTURE)\.md|(?:agents|clients|workflows|templates|knowledge)\/[A-Za-z0-9._-]+\.md/g;

/**
 * Runs integrity checks over the documentation graph at request time. Pure and
 * read-only; the messages are Dutch (UI language) while ids/paths stay as-is.
 */
export function validateDocs(extra: DocFile[] = []): ValidationReport {
  const graph = getDocGraph(extra);
  const files = listDocFiles(extra);
  const ids = new Set(graph.nodes.map((n) => n.id));
  const issues: ValidationIssue[] = [];

  // 1. Broken path references inside backtick spans.
  for (const file of files) {
    const seen = new Set<string>();
    const spans = file.content.match(/`([^`]+)`/g) ?? [];
    for (const raw of spans) {
      const inner = raw.slice(1, -1).trim();
      const matches = inner.match(PATH_REF_RE);
      if (!matches) continue;
      for (const ref of matches) {
        if (ref === file.id || seen.has(ref)) continue;
        seen.add(ref);
        if (!ids.has(ref)) {
          issues.push({
            severity: "error",
            kind: "broken-reference",
            source: file.id,
            target: ref,
            message: `'${file.title}' verwijst naar '${ref}', maar dat document bestaat niet (meer).`,
          });
        }
      }
    }
  }

  // 2. Agents missing from the orchestrator routing guide.
  const orchestrator = files.find((f) => f.id === "agents/orchestrator.md");
  if (!orchestrator) {
    issues.push({
      severity: "error",
      kind: "missing-orchestrator",
      target: "agents/orchestrator.md",
      message:
        "agents/orchestrator.md ontbreekt; automatische routing naar specialisten is niet mogelijk.",
    });
  } else {
    const routing =
      extractSection(orchestrator.content, /routing\s+guide/i) ??
      orchestrator.content;
    for (const node of graph.nodes) {
      if (node.category !== "agent" || node.id === orchestrator.id) continue;
      if (!routing.includes(node.title)) {
        issues.push({
          severity: "warning",
          kind: "unrouted-agent",
          source: orchestrator.id,
          target: node.id,
          message: `Agent '${node.title}' staat niet in de routing-tabel van de Orchestrator en kan dus niet automatisch toegewezen worden.`,
        });
      }
    }
  }

  // 3. Isolated nodes (no edges at all).
  const connected = new Set<string>();
  for (const edge of graph.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  for (const node of graph.nodes) {
    if (!connected.has(node.id)) {
      issues.push({
        severity: "info",
        kind: "isolated-node",
        source: node.id,
        message: `'${node.title}' heeft geen enkele verbinding in de kaart.`,
      });
    }
  }

  // 4. Agents not placed under a department in the AGENTS.md "Agency
  //    organisation" section. Departments are the single org model, so every
  //    agent must belong to exactly one — there is no opt-out. A missing agent
  //    silently lands in the "Overig" catch-all on the team page and map.
  const agentsDoc = files.find((f) => f.id === "AGENTS.md");
  if (agentsDoc) {
    const placed = departmentSlugs(agentsDoc.content);
    for (const file of files) {
      if (file.category !== "agent") continue;
      const slug = file.id.replace(/^agents\//, "").replace(/\.md$/, "");
      if (placed.has(slug)) continue;
      issues.push({
        severity: "warning",
        kind: "undepartmented-agent",
        source: agentsDoc.id,
        target: file.id,
        message: `Agent '${file.title}' (${slug}) staat onder geen enkele afdeling in de "Agency organisation" van AGENTS.md en valt daardoor in 'Overig'. Voeg de agent toe aan een afdeling in ${agentsDoc.id}.`,
      });
    }
  }

  // 4b. Departments without a named owner (head). Every department must name an
  //     owner on its "Owner:" line; a missing owner means the team page and map
  //     cannot mark a lead for that department.
  if (agentsDoc) {
    for (const dept of getDepartments(agentsDoc.content)) {
      if (dept.ownerSlug) continue;
      issues.push({
        severity: "warning",
        kind: "ownerless-department",
        source: agentsDoc.id,
        message: `Afdeling '${dept.title}' heeft geen eigenaar (head). Voeg een "Owner: \`agents/<slug>.md\`"-regel toe aan de afdeling in ${agentsDoc.id}.`,
      });
    }
  }

  // 5. Mandatory quality docs that are missing.
  for (const path of ALWAYS_KNOWLEDGE) {
    if (!ids.has(path)) {
      issues.push({
        severity: "error",
        kind: "missing-quality-doc",
        target: path,
        message: `Het verplichte kwaliteitsdocument '${path}' ontbreekt; elke generatie verliest deze standaard.`,
      });
    }
  }

  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;

  const order: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return { issues, checkedAt: new Date().toISOString(), counts };
}
