import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { Client } from "@workspace/db";
import { buildGenerationContext, type HandoffBrief } from "./generate-context";
import {
  getDocFile,
  parseFanoutMarker,
  MAX_FANOUT,
  type DocFile,
} from "./docs";
import { loadClientDocs, getClientRow, dbClientIdFromPath } from "./clients-store";
import { saveGeneration, saveGenerationSteps } from "./generations-store";
import {
  listMonitoredTerms,
  recordMonitoredTerms,
  type MonitoredTermInput,
} from "./monitored-terms-store";
import {
  getDeliverableKind,
  deliverableMeta,
  buildDeliverablePrompt,
} from "./deliverables";
import {
  fetchGoogleAdsReport,
  fetchGoogleAdsAdCopyContext,
  fetchGoogleAdsNegativesContext,
  type GoogleAdsMetrics,
} from "./google-ads";
import type { ReportDeliveryPayload } from "./monthly-report-email";
import type { EmailReplyPayload } from "./email-reply";
import { resolveHeadIdentity, ownerEmail } from "./email-identity";

/** Remove the internal "## <AgentTitle>" section headers from team output. */
function stripAgentHeadings(text: string, titles: string[]): string {
  const set = new Set(titles.map((t) => t.trim().toLowerCase()));
  return text
    .split("\n")
    .filter((line) => {
      const m = /^##\s+(.+?)\s*$/.exec(line);
      return !(m && set.has(m[1].trim().toLowerCase()));
    })
    .join("\n");
}

/**
 * Extract the optional machine-readable monitor list the optimization
 * specialist emits as an HTML comment (`<!-- monitor-list [ ... ] -->`). The
 * comment never renders in the UI (HTML comments are stripped before
 * markdown), so it is an invisible side channel: we parse the JSON array of
 * monitored terms, then return the team text with the block removed so it never
 * leaks into the deliverable or the archived run. Best-effort: malformed JSON
 * yields no items but still strips the block.
 */
function extractMonitorList(text: string): {
  items: MonitoredTermInput[];
  stripped: string;
} {
  const re = /<!--\s*monitor-list\b([\s\S]*?)-->/i;
  const m = re.exec(text);
  if (!m) return { items: [], stripped: text };
  const stripped = text.replace(re, "").trim();
  let items: MonitoredTermInput[] = [];
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed)) {
      items = parsed
        .filter(
          (p): p is Record<string, unknown> =>
            !!p && typeof p === "object" && typeof (p as any).term === "string",
        )
        .map((p) => ({
          term: String(p.term),
          campaign: typeof p.campaign === "string" ? p.campaign : null,
          reason: typeof p.reason === "string" ? p.reason : null,
          suggestedAction:
            typeof p.suggestedAction === "string" ? p.suggestedAction : null,
          status: typeof p.status === "string" ? p.status : null,
          note: typeof p.note === "string" ? p.note : null,
        }));
    }
  } catch {
    // malformed monitor block — drop it, never sink the run
  }
  return { items, stripped };
}

/**
 * Extract the optional typed handoff brief an agent emits as an HTML comment
 * (`<!-- handoff-brief { ... } -->`), exactly like the monitor-list side
 * channel: the comment never renders (HTML comments are stripped before
 * markdown), so we parse its JSON, then return the text with EVERY handoff-brief
 * block removed so it never leaks into the deliverable or the archived run.
 * Best-effort: on any malformation (no comment, bad JSON, wrong shape, or an
 * entirely empty brief) it returns `brief: null` but still strips the block, so
 * the run continues exactly as it does today (prose only).
 */
export function extractHandoffBrief(text: string): {
  brief: HandoffBrief | null;
  stripped: string;
} {
  // Strip ALL handoff-brief comments (an agent should emit one, but never let a
  // stray second block leak into the archive).
  const stripAll = /<!--\s*handoff-brief\b[\s\S]*?-->/gi;
  const stripped = text.replace(stripAll, "").trim();
  // Parse the FIRST block for its payload.
  const one = /<!--\s*handoff-brief\b([\s\S]*?)-->/i;
  const m = one.exec(text);
  if (!m) return { brief: null, stripped };
  try {
    const parsed = JSON.parse(m[1].trim());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { brief: null, stripped };
    }
    const p = parsed as Record<string, unknown>;
    const strArray = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .filter((x): x is string => typeof x === "string" && x.trim() !== "")
            .map((x) => x.trim())
        : [];
    const brief: HandoffBrief = {
      agent: "",
      decisions: strArray(p.decisions),
      keyFacts: strArray(p.keyFacts),
      openQuestions: strArray(p.openQuestions),
      forNext:
        typeof p.forNext === "string" && p.forNext.trim() !== ""
          ? p.forNext.trim()
          : null,
      clientFacing: typeof p.clientFacing === "boolean" ? p.clientFacing : null,
      touchesLiveAccount:
        typeof p.touchesLiveAccount === "boolean" ? p.touchesLiveAccount : null,
    };
    const empty =
      brief.decisions.length === 0 &&
      brief.keyFacts.length === 0 &&
      brief.openQuestions.length === 0 &&
      brief.forNext === null &&
      brief.clientFacing === null &&
      brief.touchesLiveAccount === null;
    return { brief: empty ? null : brief, stripped };
  } catch {
    // malformed brief — drop it, never sink the run
    return { brief: null, stripped };
  }
}

/**
 * Fold the accumulated handoff briefs into the QC-gate flags. The structured
 * brief is PREFERRED over routing's resolution when it carries a flag, with
 * today's logic as the fallback (a `null` field here means "not stated — fall
 * back"). Semantics:
 *  - `clientFacing`: the last brief that explicitly states it wins (the most
 *    downstream agent's view of the final output).
 *  - `touchesLiveAccount`: OR across briefs — a brief can flag that the work
 *    touches a live account, but never downgrade that safety signal.
 */
export function resolveBriefGateFlags(briefs: HandoffBrief[]): {
  clientFacing: boolean | null;
  touchesLiveAccount: boolean | null;
} {
  let clientFacing: boolean | null = null;
  let sawLive = false;
  let live = false;
  for (const b of briefs) {
    if (typeof b.clientFacing === "boolean") clientFacing = b.clientFacing;
    if (typeof b.touchesLiveAccount === "boolean") {
      sawLive = true;
      if (b.touchesLiveAccount) live = true;
    }
  }
  return { clientFacing, touchesLiveAccount: sawLive ? live : null };
}

/**
 * The team output concatenates each member's section under a "## <AgentTitle>"
 * heading; the LAST such section is the final, client-ready version (e.g. the
 * Humanizer's). Return that section's body for the client-facing PDF, falling
 * back to the full text (agent headers stripped) if it looks too thin.
 */
function extractFinalReport(teamWork: string, titles: string[]): string {
  const set = titles.map((t) => t.trim().toLowerCase());
  const lines = teamWork.split("\n");
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(.+?)\s*$/.exec(lines[i]);
    if (m && set.includes(m[1].trim().toLowerCase())) lastIdx = i;
  }
  if (lastIdx >= 0) {
    const body = lines
      .slice(lastIdx + 1)
      .join("\n")
      .trim();
    if (body.length >= 200) return body;
  }
  return stripAgentHeadings(teamWork, titles).trim();
}

/** A line that introduces the Humanizer's "Humanized version" block, as either a
 * markdown heading (`## Humanized version`) or a numbered/bold label
 * (`1. **Humanized version**`), in English or Dutch. */
const HUMANIZED_LABEL_RE =
  /^(?:#{1,6}\s*|\d+\.\s*)?\*{0,2}(?:humanized version|gehumaniseerde versie|menselijke versie)\*{0,2}\s*:?\s*$/i;
/** A line that introduces one of the Humanizer's trailing meta sections (what
 * changed / preserved / flags / approval note). Everything from here on is
 * internal QC commentary, never part of the client-facing text. */
const HUMANIZER_META_LABEL_RE =
  /^(?:#{1,6}\s*|\d+\.\s*)?\*{0,2}(?:what changed|wat (?:is er )?veranderd[e]?|changes|wijzigingen|preserved|behouden|flags|vlaggen|human approval required|menselijke goedkeuring(?: vereist)?)\*{0,2}\s*:?\s*$/i;

/**
 * Reduce the Humanizer's structured output to just its "Humanized version" — the
 * one part that is client-facing. The Humanizer (`agents/humanizer.md`) emits a
 * rewritten draft followed by internal QC notes (what changed / preserved /
 * flags / approval). Those notes are valuable in the archived audit trail but
 * must never reach the client, so we strip them only when building the
 * client-facing report/reply. If the output has no recognisable structure
 * (plain rewritten prose), it is returned unchanged.
 */
export function stripHumanizerMeta(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let sawLabel = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (HUMANIZER_META_LABEL_RE.test(trimmed)) break; // internal notes start here
    if (!sawLabel && HUMANIZED_LABEL_RE.test(trimmed)) {
      // Drop the "Humanized version" label and any preamble before it.
      sawLabel = true;
      out.length = 0;
      continue;
    }
    out.push(line);
  }
  const result = out.join("\n").trim();
  return result.length > 0 ? result : text.trim();
}

const REPORT_PLACEHOLDER = /AAN TE VULLEN|\[(in |nog )?te vullen|\[to fill|\[todo|\[placeholder/i;
const REPORT_INTERNAL_HEADING =
  /interne nota|niet voor de klant|menselijke goedkeuring|intern gebruik|approval required|internal note/i;

/**
 * Reduce a report to the client-facing version that goes into the PDF + cover
 * email. The archived run keeps the full text (internal notes + approval
 * checklist) for the team; the client never sees unfinished placeholders or
 * internal-only sections. Drops, deterministically:
 *  - whole heading-sections that are internal-only (e.g. "Interne nota's"),
 *  - whole sections whose body is essentially just a "[AAN TE VULLEN]" stub,
 *  - any stray placeholder lines elsewhere.
 */
export function toClientFacingReport(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headingRe = /^(#{1,6})\s+(.*?)\s*$/;
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = headingRe.exec(lines[i]);
    if (m) {
      const level = m[1].length;
      const title = m[2];
      let j = i + 1;
      while (j < lines.length) {
        const mj = headingRe.exec(lines[j]);
        if (mj && mj[1].length <= level) break;
        j++;
      }
      const body = lines.slice(i + 1, j).join("\n");
      const meaningful = body
        .replace(/^>.*$/gm, "")
        .replace(REPORT_PLACEHOLDER, "")
        .replace(/[*_>#`\-\s]/g, "")
        .trim();
      const dropSection =
        REPORT_INTERNAL_HEADING.test(title) ||
        (REPORT_PLACEHOLDER.test(body) && meaningful.length < 40);
      if (dropSection) {
        i = j;
        continue;
      }
      out.push(lines[i]);
      i++;
      continue;
    }
    if (REPORT_PLACEHOLDER.test(lines[i])) {
      i++;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?:\s*\n-{3,}\s*)+$/g, "") // drop trailing separators left by stripped sections
    .trim();
}

/**
 * The three calendar periods a monthly report compares: the report month (the
 * previous calendar month), the month before it (period-over-period), and the
 * same month one year earlier (year-over-year). Dates are inclusive YYYY-MM-DD.
 */
function buildMonthlyPeriods(base: Date): {
  current: { start: string; end: string; label: string; short: string };
  previous: { start: string; end: string; label: string; short: string };
  yearAgo: { start: string; end: string; label: string; short: string };
} {
  // Anchor on the agency timezone so a run in the first/last hours of a month
  // still resolves to the correct "previous calendar month" (UTC could still be
  // in the prior month at e.g. 00:30 Brussels on the 1st).
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(base);
  const nowY = Number(parts.find((p) => p.type === "year")?.value);
  const nowM = Number(parts.find((p) => p.type === "month")?.value); // 1-based
  // The report covers the previous calendar month relative to the run date.
  const repStart = new Date(Date.UTC(nowY, nowM - 2, 1));
  const ry = repStart.getUTCFullYear();
  const rm = repStart.getUTCMonth();
  const mk = (y: number, m: number, short: string) => {
    const s = new Date(Date.UTC(y, m, 1));
    const e = new Date(Date.UTC(y, m + 1, 0));
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const label = s.toLocaleDateString("nl-BE", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return { start: fmt(s), end: fmt(e), label, short };
  };
  return {
    current: mk(ry, rm, "rapportmaand"),
    previous: mk(ry, rm - 1, "vorige maand"),
    yearAgo: mk(ry - 1, rm, "zelfde periode vorig jaar"),
  };
}

/**
 * The generation engine: the single source of truth for running a team of
 * agents over a client + workflow, producing the deliverable, and archiving the
 * run with a faithful per-agent audit trail. Both the interactive SSE route and
 * the autonomous (n8n/scheduler-triggered) route call into this, so the
 * archival + step->run status rules live in exactly one place.
 */

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

/** A sink for streamed events. SSE writes them to the client; autonomous no-ops. */
export type GenerationSink = (payload: unknown) => void;

/** The two cross-cutting QC agents. They are never executors on the team; they
 * form the final quality gate that runs after the team finishes. */
export const QC_REVIEWER_PATH = "agents/qa-compliance-reviewer.md";
export const QC_HUMANIZER_PATH = "agents/humanizer.md";
const QC_PATHS = new Set<string>([QC_REVIEWER_PATH, QC_HUMANIZER_PATH]);

/**
 * Inbound-reply context attached by the email poller (Phase 2). When present on
 * a run whose workflow declares the `email-reply` deliverable, the engine holds
 * a team-drafted reply for approval instead of sending anything, carrying the
 * threading headers needed to land the reply in the original Gmail conversation.
 */
export interface EmailReplyContext {
  /** FK to the email_threads row this conversation belongs to. */
  emailThreadId: number;
  /** Gmail threadId to attach the reply to. */
  gmailThreadId: string;
  /** The whitelisted client recipient (client.reportEmail). */
  recipient: string;
  /** Subject for the reply (e.g. "Re: <original subject>"). */
  subject: string;
  /** Message-ID of the client's inbound message we are replying to. */
  inReplyTo: string | null;
  /** Space-separated References chain (the thread's Message-IDs so far). */
  references: string | null;
  /** The client's inbound message text, kept so a human can review in context. */
  inboundText: string;
}

export interface GenerationContext {
  teamPaths: string[];
  memberTitles: string[];
  clientPath: string;
  clientName: string;
  clientContent: string;
  workflowPath: string;
  workflowTitle: string;
  workflowDoc: DocFile | null;
  deliverableKind: ReturnType<typeof getDeliverableKind>;
  request: string;
  clientDocs: DocFile[];
  /**
   * Set by the inbound email poller for an `email-reply` run; carries the thread
   * + inbound message so the engine can hold a threaded reply for approval.
   */
  emailReply?: EmailReplyContext;
  /**
   * Execution plan as groups of indices into `teamPaths`. Each group runs in
   * order; agents WITHIN a group run in parallel (independent branches that all
   * build on the same prior work). Defaults to one agent per stage (fully
   * sequential). Every teamPath index appears exactly once.
   */
  stages: number[][];
  /**
   * Whether the team's output is itself the client-facing text (so the
   * Humanizer language pass applies). False for structured artifacts (CSV,
   * Replit prompt, e-mailed report) where the team work is intermediate.
   */
  clientFacing: boolean;
  /** Run the final QC gate (QA & Compliance always; Humanizer if clientFacing). */
  qcEnabled: boolean;
  /** The work touches live spend, tracking or accounts (human-approval note). */
  touchesLiveAccount: boolean;
  /**
   * Fan-out-with-selection: when >= 2, the LEAD agent (index 0) runs this many
   * times with diversity seeds and a best-of selection pass picks the strongest
   * candidate before its output flows downstream. 0 (the default) disables
   * fan-out — the lead runs once, exactly as every non-opted workflow does.
   */
  fanout: number;
}

export type ResolveResult =
  | { ok: true; ctx: GenerationContext }
  | { ok: false; status: number; error: string };

/** The outcome of a run, used by callers to report to the client. */
export interface GenerationResult {
  status: string;
  archived: boolean;
  generationId: number | null;
  finalMarkdown: string;
  aborted: boolean;
  // Set to "pending" when a client-facing deliverable was drafted but is held
  // for human approval before it reaches the client (otherwise null).
  approvalStatus: string | null;
  error?: string;
}

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
const FANOUT_SEEDS = [
  "Invalshoek A — kies de meest voor de hand liggende, heldere insteek: het kernvoordeel en een duidelijke call-to-action, zakelijk en direct.",
  "Invalshoek B — kies bewust een ANDERE hoek dan de meest voor de hand liggende: een ander voordeel, een andere doelgroep-hoek of een ander koopmotief.",
  "Invalshoek C — durf een verrassende, creatievere insteek (sterke hook, ongewone opening) die nog steeds on-brand en policy-conform blijft.",
  "Invalshoek D — een rationele, bewijs-gedreven insteek: concrete voordelen, cijfers/feiten waar onderbouwd, en CTA-helderheid.",
  "Invalshoek E — een emotionele, verhalende insteek die inspeelt op de situatie van de doelgroep.",
];

/** Shared instruction prepended to every fan-out candidate's diversity seed. */
const FANOUT_DIRECTIVE =
  "Dit is één van meerdere parallelle varianten. Lever EXACT ÉÉN volledige, " +
  "zelfstandige versie van de gevraagde copy/creatives volgens onderstaande " +
  "invalshoek. Verwijs niet naar andere varianten. Respecteer alle platform- en " +
  "merkregels onverkort.";

interface StepRecord {
  agentPath: string;
  agentTitle: string;
  stepOrder: number;
  role: string;
  status: string;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  charCount: number | null;
  errorMessage: string | null;
  /**
   * The agent's parsed handoff brief, serialized to JSON, for the per-agent
   * audit panel. Only set for executor steps that emitted a valid brief; left
   * undefined for QC / deliverable / approval steps and briefless agents.
   */
  handoffBrief?: string | null;
}

/**
 * Run the resolved generation. `sink` receives streamed events (SSE deltas,
 * agent_start/done, deliverable_*, and the terminal done/error); for autonomous
 * runs pass a no-op sink. `signal` aborts the upstream Anthropic calls when the
 * client disconnects or a timeout fires. `triggerSource` is recorded on the run
 * ("user" for interactive, "autonomous" for n8n/scheduler).
 */
export async function runGeneration(
  ctx: GenerationContext,
  opts: { sink: GenerationSink; signal: AbortSignal; triggerSource: string },
): Promise<GenerationResult> {
  const { sink: send, signal, triggerSource } = opts;
  const {
    teamPaths,
    memberTitles,
    clientPath,
    clientName,
    clientContent,
    workflowPath,
    workflowTitle,
    deliverableKind,
    request,
    clientDocs,
    stages,
    clientFacing,
    qcEnabled,
    touchesLiveAccount,
  } = ctx;
  // Tolerate an older/partial context shape (e.g. tests) that omits fanout.
  const fanout = ctx.fanout ?? 0;

  const isGone = () => signal.aborted;

  // ---- Final QC gate plan ---------------------------------------------------
  // The QC agents are not team executors; they run as the closing quality gate.
  // The QA & Compliance Reviewer always runs when QC is on; the Humanizer runs
  // only for client-facing text. Both are best-effort and never discard the
  // team's work. We resolve them up front so the plan event lists every step.
  const qcReviewerDoc = getDocFile(QC_REVIEWER_PATH);
  const qcHumanizerDoc = getDocFile(QC_HUMANIZER_PATH);
  const reviewerWillRun = qcEnabled && !!qcReviewerDoc;
  const humanizerWillRun = qcEnabled && clientFacing && !!qcHumanizerDoc;
  const humanizerTitle = qcHumanizerDoc?.title ?? "Humanizer";
  const reviewerTitle = qcReviewerDoc?.title ?? "QA & Compliance Reviewer";

  // Index of each team member's stage group, so the UI can show parallel steps.
  const stageOfIndex = new Map<number, number>();
  stages.forEach((group, s) => group.forEach((i) => stageOfIndex.set(i, s)));

  const qcStepsPlan: {
    index: number;
    path: string;
    title: string;
    mode: "humanizer" | "reviewer";
  }[] = [];
  let qcCursor = teamPaths.length;
  if (humanizerWillRun) {
    qcStepsPlan.push({
      index: qcCursor++,
      path: QC_HUMANIZER_PATH,
      title: humanizerTitle,
      mode: "humanizer",
    });
  }
  if (reviewerWillRun) {
    qcStepsPlan.push({
      index: qcCursor++,
      path: QC_REVIEWER_PATH,
      title: reviewerTitle,
      mode: "reviewer",
    });
  }
  const grandTotal = teamPaths.length + qcStepsPlan.length;
  const humanizerIndex = qcStepsPlan.find((q) => q.mode === "humanizer")?.index;
  const reviewerIndex = qcStepsPlan.find((q) => q.mode === "reviewer")?.index;

  let priorWork = "";
  // Typed handoff briefs accumulated across stages (best-effort). Each agent's
  // brief is parsed + stripped from its prose; the next stage gets a clean
  // "Handoff so far" recap and the QC gate can read the flags from them.
  const handoffBriefs: HandoffBrief[] = [];
  let persisted = false;
  let savedId: number | null = null;
  let runStatus = "completed";
  // The effective quality-gate flags this run resolved to (briefs folded over
  // routing). Initialised to routing's up-front resolution and refined once the
  // team's handoff briefs are in, so the archived row records what drove the
  // gate even on a run that fails before the gate runs.
  let effectiveClientFacing = clientFacing;
  let effectiveTouchesLiveAccount = touchesLiveAccount;
  // Human approval checkpoint state for a client-facing outbound deliverable.
  // When set to "pending", `pendingApproval` holds the JSON snapshot of the
  // drafted-but-unsent delivery so it can be released after a human approves.
  let approvalStatus: string | null = null;
  let pendingApproval: string | null = null;
  const steps: StepRecord[] = [];
  // For the monthly-report-email deliverable: the client row (for reportEmail)
  // is loaded once at run start and reused by the post-loop email action.
  let reportClient: Client | null = null;
  // Structured live numbers captured at run start; drive the PDF cover/charts.
  let reportMetrics: GoogleAdsMetrics | null = null;
  // Live SEARCH ad-group structure captured at run start for the ad-copy CSV.
  let adCopyLiveData: string | null = null;
  let negativesLiveData: string | null = null;
  // Fan-out: the written rationale for which candidate won, appended to the
  // archived markdown at the very end (after the deliverable) for transparency.
  let fanoutNote = "";
  // Step-order cursor for any steps recorded DURING the team loop that sit after
  // the team members (the fan-out selection pass). The QC/deliverable steps
  // continue from here so the audit trail never collides or double-numbers.
  let postTeamStepOrder = teamPaths.length;

  const persistRun = async (): Promise<boolean> => {
    if (persisted) return true;
    const markdown = priorWork.trim();
    // Archive the run when there's either produced markdown OR at least one
    // recorded step, so failed/aborted/early-failure runs still leave a row +
    // audit trail to review later (the whole point of autonomous runs).
    if (!markdown && steps.length === 0) return false;
    try {
      const totalTokens = steps.reduce(
        (a, s) => a + (s.inputTokens ?? 0) + (s.outputTokens ?? 0),
        0,
      );
      const durationMs = steps.reduce((a, s) => a + (s.durationMs ?? 0), 0);
      const row = await saveGeneration({
        clientPath,
        clientName,
        workflowPath,
        workflowTitle,
        leadAgentPath: teamPaths[0],
        leadAgentTitle: memberTitles[0],
        teamPaths: JSON.stringify(teamPaths),
        teamTitles: JSON.stringify(memberTitles),
        requestText: request,
        finalMarkdown: markdown,
        triggerSource,
        status: runStatus,
        durationMs: durationMs || null,
        totalTokens: totalTokens || null,
        approvalStatus,
        pendingDelivery: pendingApproval,
        emailThreadId: ctx.emailReply?.emailThreadId ?? null,
        clientFacing: effectiveClientFacing,
        touchesLiveAccount: effectiveTouchesLiveAccount,
      });
      savedId = row.id;
      // Best-effort: a failure to write the step trail must never lose the run.
      try {
        await saveGenerationSteps(
          steps.map((s) => ({ ...s, generationId: row.id })),
        );
      } catch (stepErr) {
        console.error(
          "Kon stappen niet opslaan:",
          stepErr instanceof Error ? stepErr.message : String(stepErr),
        );
      }
      persisted = true;
      return true;
    } catch (err) {
      console.error(
        "Kon generatie niet opslaan in archief:",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  };

  const result = (extra?: Partial<GenerationResult>): GenerationResult => ({
    status: runStatus,
    archived: persisted,
    generationId: savedId,
    finalMarkdown: priorWork.trim(),
    aborted: isGone(),
    approvalStatus,
    ...extra,
  });

  try {
    // Announce the full plan first so the run timeline shows every step up
    // front: each team stage (members in the same stage run in parallel) plus
    // the closing QC gate. The frontend pre-creates a segment per step.
    send({
      type: "plan",
      total: grandTotal,
      clientFacing,
      touchesLiveAccount,
      stages: stages.map((group) =>
        group.map((i) => ({
          index: i,
          path: teamPaths[i],
          title: memberTitles[i],
          role: i === 0 ? "lead" : "member",
        })),
      ),
      members: teamPaths.map((p, i) => ({
        index: i,
        path: p,
        title: memberTitles[i],
        role: i === 0 ? "lead" : "member",
        stage: stageOfIndex.get(i) ?? i,
      })),
      qc: qcStepsPlan.map((q) => ({
        index: q.index,
        path: q.path,
        title: q.title,
        mode: q.mode,
      })),
    });

    // When the work touches live spend, tracking or accounts, surface it once
    // up front — the team still proposes only; nothing goes live automatically.
    if (touchesLiveAccount) {
      send({
        type: "deliverable_note",
        message:
          "Deze opdracht raakt live uitgaven, tracking of accounts. Het team levert enkel voorstellen; een mens zet niets automatisch live.",
      });
    }

    // Monthly report: before the team writes, pull the client's live Google Ads
    // data for THREE periods — the report month, the previous month (MoM) and the
    // same month last year (YoY) — and inject each as a clearly labelled block so
    // the report compares real, period-correct numbers instead of guessing.
    // Best-effort: the report month is required; MoM/YoY each fail independently
    // (e.g. a client with no history last year) without sinking the report.
    if (deliverableKind === "monthly-report-email" && !isGone()) {
      const clientId = dbClientIdFromPath(clientPath);
      if (clientId !== null) {
        try {
          reportClient = await getClientRow(clientId);
          const customerId = reportClient?.googleAdsCustomerId?.trim();
          if (customerId) {
            const periods = buildMonthlyPeriods(new Date());
            const blocks: string[] = [];
            const fetchBlock = async (
              period: { start: string; end: string; label: string; short: string },
              heading: string,
            ): Promise<GoogleAdsMetrics | null> => {
              const live = await fetchGoogleAdsReport(customerId, {
                custom: period,
              });
              if (live.text.trim()) {
                blocks.push(
                  `## ${heading} — ${period.label} (${period.start} t.e.m. ${period.end})\n\n` +
                    "```\n" +
                    live.text.trim() +
                    "\n```\n",
                );
              }
              return live.metrics;
            };

            // Report month — required; its metrics drive the PDF cover + charts.
            reportMetrics = await fetchBlock(
              periods.current,
              "Google Ads live performance — rapportmaand",
            );

            // Previous month (MoM) — best-effort.
            try {
              await fetchBlock(
                periods.previous,
                "Google Ads live performance — vorige maand (MoM-vergelijking)",
              );
            } catch (err) {
              send({
                type: "deliverable_note",
                message:
                  `Vergelijkingsdata vorige maand (${periods.previous.label}) kon niet opgehaald worden. ` +
                  (err instanceof Error ? err.message : String(err)).slice(0, 200),
              });
            }

            // Same month last year (YoY) — best-effort.
            try {
              await fetchBlock(
                periods.yearAgo,
                "Google Ads live performance — zelfde periode vorig jaar (YoY-vergelijking)",
              );
            } catch (err) {
              send({
                type: "deliverable_note",
                message:
                  `Jaar-op-jaar data (${periods.yearAgo.label}) kon niet opgehaald worden. ` +
                  (err instanceof Error ? err.message : String(err)).slice(0, 200),
              });
            }

            const doc = clientDocs.find((d) => d.path === clientPath);
            if (doc && blocks.length > 0) {
              doc.content += "\n\n" + blocks.join("\n") + "\n";
            }
          }
        } catch (err) {
          send({
            type: "deliverable_note",
            message:
              "Live Google Ads-data (rapportmaand) kon niet opgehaald worden; het rapport gebruikt de bestaande data. " +
              (err instanceof Error ? err.message : String(err)).slice(0, 200),
          });
        }
      }
    }

    // Ad-copy CSV: pull the client's live SEARCH ad-group structure (campaigns,
    // ad groups, Final URLs, display paths, keyword themes, existing RSAs) so the
    // copy maps onto REAL ad groups and the CSV is import-ready. Injected into the
    // client doc so the team writes per real ad group, and kept for the
    // deliverable prompt. Best-effort: a failure is reported and the CSV falls
    // back to the team's copy with fill-in markers.
    if (deliverableKind === "google-ads-csv" && !isGone()) {
      const clientId = dbClientIdFromPath(clientPath);
      if (clientId !== null) {
        try {
          const adClient = await getClientRow(clientId);
          const customerId = adClient?.googleAdsCustomerId?.trim();
          if (customerId) {
            const live = await fetchGoogleAdsAdCopyContext(customerId);
            if (live.text.trim()) {
              adCopyLiveData = live.text.trim();
              const doc = clientDocs.find((d) => d.path === clientPath);
              if (doc) {
                doc.content +=
                  "\n\n## Google Ads live ad-group structure (for ad copy)\n\n```\n" +
                  adCopyLiveData +
                  "\n```\n";
              }
            } else {
              send({
                type: "deliverable_note",
                message:
                  "Geen live zoekcampagne-structuur gevonden voor deze klant; de CSV gebruikt de teksten van het team met in-te-vullen velden.",
              });
            }
          } else {
            send({
              type: "deliverable_note",
              message:
                "Geen Google Ads customer ID voor deze klant; de CSV is gebaseerd op de teksten van het team, niet op live ad-groepen.",
            });
          }
        } catch (err) {
          send({
            type: "deliverable_note",
            message:
              "Live Google Ads-structuur kon niet opgehaald worden; de CSV gebruikt de teksten van het team. " +
              (err instanceof Error ? err.message : String(err)).slice(0, 200),
          });
        }
      } else {
        send({
          type: "deliverable_note",
          message:
            "Deze klant is geen gekoppelde account; de CSV is gebaseerd op de teksten van het team, niet op live ad-groepen.",
        });
      }
    }

    // Negatives CSV: pull the client's live search-term data (terms with metrics
    // and the campaign each ran in), the active search campaigns, and existing
    // negatives so the team mines for irrelevant terms against REAL data and the
    // CSV maps onto real campaigns without duplicating existing negatives.
    // Injected into the client doc for the team, and kept for the deliverable
    // prompt. Best-effort: a failure is reported and the CSV falls back to the
    // team's recommendations.
    if (deliverableKind === "negative-keywords-csv" && !isGone()) {
      const clientId = dbClientIdFromPath(clientPath);
      if (clientId !== null) {
        try {
          const negClient = await getClientRow(clientId);
          const customerId = negClient?.googleAdsCustomerId?.trim();
          if (customerId) {
            const live = await fetchGoogleAdsNegativesContext(customerId);
            if (live.text.trim()) {
              negativesLiveData = live.text.trim();
              const doc = clientDocs.find((d) => d.path === clientPath);
              if (doc) {
                doc.content +=
                  "\n\n## Google Ads live data (for negative keyword mining)\n\n```\n" +
                  negativesLiveData +
                  "\n```\n";
              }
            } else {
              send({
                type: "deliverable_note",
                message:
                  "Geen live zoekterm-data gevonden voor deze klant; de CSV gebruikt de aanbevelingen van het team.",
              });
            }
          } else {
            send({
              type: "deliverable_note",
              message:
                "Geen Google Ads customer ID voor deze klant; de CSV is gebaseerd op de aanbevelingen van het team, niet op live zoektermen.",
            });
          }
        } catch (err) {
          send({
            type: "deliverable_note",
            message:
              "Live Google Ads-data kon niet opgehaald worden; de CSV gebruikt de aanbevelingen van het team. " +
              (err instanceof Error ? err.message : String(err)).slice(0, 200),
          });
        }
      } else {
        send({
          type: "deliverable_note",
          message:
            "Deze klant is geen gekoppelde account; de CSV is gebaseerd op de aanbevelingen van het team, niet op live zoektermen.",
        });
      }
    }

    // Resurface terms already on the monitor list from prior weeks, with their
    // age, so the team escalates stale ones (Saerens' rule: fix the landing page
    // / bid first, exclude only if that also fails) instead of letting them
    // linger unseen. Decoupled from the live read above: the monitor list must
    // resurface even when the live fetch fails or the client has no customer ID.
    if (deliverableKind === "negative-keywords-csv" && !isGone()) {
      const monClientId = dbClientIdFromPath(clientPath);
      if (monClientId !== null) {
        try {
          const monitored = await listMonitoredTerms(monClientId);
          if (monitored.length > 0) {
            const lines = monitored.map((m) => {
              const parts = [
                `- "${m.term}"`,
                m.campaign ? `campaign: ${m.campaign}` : null,
                `${m.weeksMonitored} week(s) monitored`,
                m.suggestedAction ? `prior action: ${m.suggestedAction}` : null,
                m.reason ? `reason: ${m.reason}` : null,
                m.note ? `note: ${m.note}` : null,
              ].filter(Boolean);
              return parts.join(" — ");
            });
            const doc = clientDocs.find((d) => d.path === clientPath);
            if (doc) {
              doc.content +=
                "\n\n## Monitor list (relevant terms tracked across weeks)\n\n" +
                "These terms were judged relevant but not yet converting in earlier weeks. " +
                "Apply Saerens' escalation rule: address the landing page or bid first; only " +
                "if that also fails over time does a term become a candidate for exclusion. " +
                "Re-emit each still-monitored term in this run's monitor-list block (and mark " +
                "any that converted as resolved, or any you exclude as excluded).\n\n" +
                lines.join("\n") +
                "\n";
            }
          }
        } catch (monErr) {
          send({
            type: "deliverable_note",
            message:
              "Bestaande monitor-lijst kon niet geladen worden; deze run start zonder eerdere monitor-termen. " +
              (monErr instanceof Error ? monErr.message : String(monErr)).slice(0, 160),
          });
        }
      }
    }

    // Run one team member against a fixed snapshot of the prior work. Returns a
    // structured result instead of throwing so that callers can run a whole
    // stage in parallel and reconcile the outcomes deterministically afterward.
    interface MemberOutcome {
      index: number;
      text: string;
      status: "completed" | "truncated" | "aborted" | "failed";
      truncated: boolean;
      durationMs: number;
      inputTokens: number | null;
      outputTokens: number | null;
      errorMessage: string | null;
      /** Context build failed before any model call — fatal for the run. */
      contextFailed: boolean;
      /** A real mid-stream failure (not an abort) — fatal for the run. */
      streamFailed: boolean;
    }

    const runMember = async (
      i: number,
      stagePrior: string,
      stageBriefs: HandoffBrief[],
    ): Promise<MemberOutcome> => {
      const path = teamPaths[i];
      const isFinal = i === teamPaths.length - 1;
      const startedAt = Date.now();

      let systemPrompt: string;
      try {
        ({ systemPrompt } = await buildGenerationContext({
          agentPath: path,
          clientPath,
          workflowPath,
          extraDocs: clientDocs,
          team: {
            members: memberTitles,
            position: i,
            priorWork: stagePrior,
            isFinal,
            handoffBriefs: stageBriefs,
          },
          // When the QA & Compliance Reviewer will run, it owns the single
          // human-approval section, so no executor writes its own.
          suppressApproval: reviewerWillRun,
        }));
      } catch (err) {
        return {
          index: i,
          text: "",
          status: "failed",
          truncated: false,
          durationMs: Date.now() - startedAt,
          inputTokens: null,
          outputTokens: null,
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
          contextFailed: true,
          streamFailed: false,
        };
      }

      send({
        type: "agent_start",
        index: i,
        total: grandTotal,
        agent: { path, title: memberTitles[i] },
        role: i === 0 ? "lead" : "member",
      });

      let agentText = "";
      let truncated = false;
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;

      try {
        const stream = anthropic.messages.stream(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: "user", content: request }],
          },
          { signal },
        );

        for await (const event of stream) {
          if (isGone()) break;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            agentText += event.delta.text;
            send({ content: event.delta.text, index: i });
          }
        }

        if (!isGone()) {
          const finalMsg = await stream.finalMessage();
          truncated = finalMsg.stop_reason === "max_tokens";
          inputTokens = finalMsg.usage?.input_tokens ?? null;
          outputTokens = finalMsg.usage?.output_tokens ?? null;
        }
      } catch (streamErr) {
        const isAbort =
          streamErr instanceof Error && streamErr.name === "AbortError";
        if (!isAbort && !isGone()) {
          // Real mid-step failure: keep partial output, mark fatal so the
          // caller archives + reports it after reconciling the stage.
          return {
            index: i,
            text: agentText,
            status: "failed",
            truncated: false,
            durationMs: Date.now() - startedAt,
            inputTokens,
            outputTokens,
            errorMessage: (streamErr instanceof Error
              ? streamErr.message
              : String(streamErr)
            ).slice(0, 500),
            contextFailed: false,
            streamFailed: true,
          };
        }
        // Abort: fall through to the aborted outcome below.
      }

      const aborted = isGone();
      if (!aborted) send({ type: "agent_done", index: i, truncated });
      return {
        index: i,
        text: agentText,
        status: aborted ? "aborted" : truncated ? "truncated" : "completed",
        truncated,
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        errorMessage: null,
        contextFailed: false,
        streamFailed: false,
      };
    };

    // Fan-out-with-selection for the LEAD (index 0). Runs the lead `fanout`
    // times in parallel against the SAME prior-work snapshot — each candidate
    // gets a distinct diversity seed and never sees another candidate, so the
    // variations are genuinely different and isolated. A best-of selection pass
    // then ranks them against the brief + platform policy and forwards ONLY the
    // winner downstream (its text becomes the lead's contribution). The losing
    // candidates are discarded and never reach the deliverable or the archive;
    // the written rationale is captured for transparency. Mirrors runMember's
    // outcome contract (fatal contextFailed/streamFailed, partial on abort) so
    // the stage reconcile + archival logic is identical to a normal lead run.
    const runLeadFanout = async (
      stagePrior: string,
      stageBriefs: HandoffBrief[],
    ): Promise<MemberOutcome> => {
      const i = 0;
      const path = teamPaths[i];
      const isFinal = i === teamPaths.length - 1;
      const startedAt = Date.now();

      // Build the lead's system prompt ONCE; every candidate shares it and
      // differs only by the diversity seed on the user turn.
      let systemPrompt: string;
      try {
        ({ systemPrompt } = await buildGenerationContext({
          agentPath: path,
          clientPath,
          workflowPath,
          extraDocs: clientDocs,
          team: {
            members: memberTitles,
            position: i,
            priorWork: stagePrior,
            isFinal,
            handoffBriefs: stageBriefs,
          },
          suppressApproval: reviewerWillRun,
        }));
      } catch (err) {
        return {
          index: i,
          text: "",
          status: "failed",
          truncated: false,
          durationMs: Date.now() - startedAt,
          inputTokens: null,
          outputTokens: null,
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
          contextFailed: true,
          streamFailed: false,
        };
      }

      send({
        type: "agent_start",
        index: i,
        total: grandTotal,
        agent: { path, title: memberTitles[i] },
        role: "lead",
      });
      send({
        type: "deliverable_note",
        message: `Fan-out: ${fanout} varianten worden parallel gegenereerd; de sterkste wordt automatisch gekozen.`,
      });

      interface Candidate {
        variant: number;
        text: string;
        status: "completed" | "truncated" | "aborted" | "failed";
        truncated: boolean;
        inputTokens: number | null;
        outputTokens: number | null;
        errorMessage: string | null;
      }

      // One isolated candidate run. Internal — its deltas are NOT streamed to the
      // UI (they would interleave under one index); only the winner is shown.
      const generateCandidate = async (variant: number): Promise<Candidate> => {
        const seed = FANOUT_SEEDS[variant % FANOUT_SEEDS.length];
        let text = "";
        let truncated = false;
        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        try {
          const stream = anthropic.messages.stream(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 8192,
              system: systemPrompt,
              messages: [
                {
                  role: "user",
                  content: `${request}\n\n---\n\n${FANOUT_DIRECTIVE}\n\n${seed}`,
                },
              ],
            },
            { signal },
          );
          for await (const event of stream) {
            if (isGone()) break;
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              text += event.delta.text;
            }
          }
          if (!isGone()) {
            const finalMsg = await stream.finalMessage();
            truncated = finalMsg.stop_reason === "max_tokens";
            inputTokens = finalMsg.usage?.input_tokens ?? null;
            outputTokens = finalMsg.usage?.output_tokens ?? null;
          }
        } catch (streamErr) {
          const isAbort =
            streamErr instanceof Error && streamErr.name === "AbortError";
          if (!isAbort && !isGone()) {
            return {
              variant,
              text,
              status: "failed",
              truncated: false,
              inputTokens,
              outputTokens,
              errorMessage: (streamErr instanceof Error
                ? streamErr.message
                : String(streamErr)
              ).slice(0, 500),
            };
          }
        }
        const aborted = isGone();
        return {
          variant,
          text,
          status: aborted ? "aborted" : truncated ? "truncated" : "completed",
          truncated,
          inputTokens,
          outputTokens,
          errorMessage: null,
        };
      };

      const candidates = await Promise.all(
        Array.from({ length: fanout }, (_, v) => generateCandidate(v)),
      );

      const sumTok = (pick: (c: Candidate) => number | null): number | null => {
        const total = candidates.reduce((a, c) => a + (pick(c) ?? 0), 0);
        return total || null;
      };

      // A user abort during candidate generation: contribute nothing, mirroring
      // runMember's aborted outcome (partial text is discarded).
      if (isGone()) {
        return {
          index: i,
          text: "",
          status: "aborted",
          truncated: false,
          durationMs: Date.now() - startedAt,
          inputTokens: sumTok((c) => c.inputTokens),
          outputTokens: sumTok((c) => c.outputTokens),
          errorMessage: null,
          contextFailed: false,
          streamFailed: false,
        };
      }

      const usable = candidates.filter(
        (c) => c.text.trim() && c.status !== "aborted" && c.status !== "failed",
      );

      // Every candidate failed with a real error: fatal, like a lead stream that
      // blew up — the outer loop archives + reports it.
      if (usable.length === 0) {
        const firstFailed = candidates.find((c) => c.status === "failed");
        return {
          index: i,
          text: candidates.find((c) => c.text.trim())?.text ?? "",
          status: "failed",
          truncated: false,
          durationMs: Date.now() - startedAt,
          inputTokens: sumTok((c) => c.inputTokens),
          outputTokens: sumTok((c) => c.outputTokens),
          errorMessage:
            firstFailed?.errorMessage ?? "Geen bruikbare fan-out variant.",
          contextFailed: false,
          streamFailed: !!firstFailed,
        };
      }

      // Selection pass: pick the strongest usable candidate. With a single
      // usable candidate there is nothing to rank, so skip the model call.
      let winner = usable[0];
      let rationale = "";
      let selStatus = "completed";
      let selIn: number | null = null;
      let selOut: number | null = null;
      const selStartedAt = Date.now();

      if (usable.length === 1) {
        rationale =
          "Slechts één bruikbare variant na de fan-out; die is automatisch gekozen.";
      } else {
        const list = usable
          .map(
            (c, n) =>
              `### Variant ${n + 1}\n\n${c.text.trim()}`,
          )
          .join("\n\n");
        const selSystem = [
          "Je bent de beste-van selector van het AI-team van Saerens Advertising. Je krijgt meerdere kandidaat-versies van dezelfde creatieve opdracht (advertentiecopy of creatives). Je taak: kies de ÉNE sterkste variant.",
          "",
          "Beoordeel elke variant op: aansluiting bij de brief en de klantcontext, onderscheidende en overtuigende invalshoek, merkstem, en naleving van het advertentiebeleid (Google Ads / Meta): geen onverifieerbare superlatieven, geen verboden claims, respecteer karakterlimieten, geen overdreven leestekens of misleiding.",
          "",
          "Antwoord in EXACT dit formaat, niets anders:",
          "WINNER: <nummer van de gekozen variant>",
          "RATIONALE: <2 tot 4 zinnen die uitleggen waarom deze variant wint en kort waarom de anderen afvallen>",
        ].join("\n");
        const selUser = [
          "## Brief / oorspronkelijke opdracht",
          request.trim(),
          "",
          "## Klantcontext",
          clientContent.trim() || "(geen aanvullende klantcontext)",
          "",
          `## Kandidaten (${usable.length})`,
          list,
          "",
          `Kies de sterkste variant (1 t.e.m. ${usable.length}).`,
        ].join("\n");
        try {
          const selMsg = await anthropic.messages.create(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              system: selSystem,
              messages: [{ role: "user", content: selUser }],
            },
            { signal },
          );
          const selText = selMsg.content
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("");
          const wm = selText.match(/WINNER:\s*(\d+)/i);
          const rm = selText.match(/RATIONALE:\s*([\s\S]+)/i);
          const picked = wm ? Number.parseInt(wm[1], 10) - 1 : -1;
          if (picked >= 0 && picked < usable.length) {
            winner = usable[picked];
            rationale =
              rm?.[1]?.trim() ||
              selText.trim() ||
              "Gekozen door de beste-van selector.";
          } else {
            rationale =
              "De selector gaf geen geldige keuze terug; de eerste bruikbare variant is gekozen.";
            selStatus = "partial";
          }
          selIn = selMsg.usage?.input_tokens ?? null;
          selOut = selMsg.usage?.output_tokens ?? null;
        } catch (selErr) {
          if (isGone() || (selErr instanceof Error && selErr.name === "AbortError")) {
            // Aborted mid-selection: keep the first usable candidate, no note.
            selStatus = "aborted";
            rationale = "";
          } else {
            // Best-effort: a selection failure never sinks the run — fall back
            // to the first usable candidate and flag the run partial.
            selStatus = "failed";
            rationale =
              "De beste-van selectie kon niet voltooid worden; de eerste bruikbare variant is gekozen. " +
              (selErr instanceof Error ? selErr.message : String(selErr)).slice(0, 200);
          }
        }
      }

      const winnerLabel = usable.indexOf(winner) + 1;

      // Record the selection as its own audit-trail step (cost + outcome). It is
      // attributed to the workflow (not an agent) so it never pollutes agent KPIs.
      steps.push({
        agentPath: workflowPath,
        agentTitle: `Beste-van selectie (fan-out, ${usable.length} varianten)`,
        stepOrder: postTeamStepOrder++,
        role: "selection",
        status: selStatus,
        durationMs: Date.now() - selStartedAt,
        inputTokens: selIn,
        outputTokens: selOut,
        charCount: rationale.length || null,
        errorMessage: null,
      });
      if (selStatus !== "completed" && selStatus !== "aborted") {
        runStatus = "partial";
      }

      // Capture the rationale for the archived markdown + tell the user live.
      if (rationale.trim()) {
        fanoutNote =
          `${fanout} varianten gegenereerd; variant ${winnerLabel} van ${usable.length} bruikbare gekozen.\n\n${rationale.trim()}`;
        send({
          type: "deliverable_note",
          message: `Fan-out: variant ${winnerLabel} gekozen. ${rationale.trim()}`.slice(0, 400),
        });
      }

      // Stream the winner's text under the lead index so the UI shows the
      // chosen output, then close the lead step.
      send({ content: winner.text, index: i });
      send({ type: "agent_done", index: i, truncated: winner.truncated });

      return {
        index: i,
        text: winner.text,
        status: winner.status,
        truncated: winner.truncated,
        durationMs: Date.now() - startedAt,
        inputTokens: sumTok((c) => c.inputTokens),
        outputTokens: sumTok((c) => c.outputTokens),
        errorMessage: null,
        contextFailed: false,
        streamFailed: false,
      };
    };

    // Dispatch one team index: the lead uses fan-out-with-selection when the
    // workflow opted in; everyone else runs once as before.
    const runIndex = (
      idx: number,
      prior: string,
      briefs: HandoffBrief[],
    ): Promise<MemberOutcome> =>
      idx === 0 && fanout >= 2
        ? runLeadFanout(prior, briefs)
        : runMember(idx, prior, briefs);

    // Execute the plan stage by stage. Members within a stage are genuinely
    // independent, so they run in parallel against the SAME prior-work snapshot
    // and their outputs are appended in stage order for a stable transcript.
    // Sequential chains (one member per stage) pass each hand-off forward.
    stageLoop: for (const group of stages) {
      if (isGone()) break;
      const stagePrior = priorWork;
      // Snapshot the briefs collected so far: every member in this stage sees
      // the same prior handoffs (mirroring how stagePrior freezes the prose).
      const stageBriefs = handoffBriefs.slice();
      const outcomes =
        group.length === 1
          ? [await runIndex(group[0], stagePrior, stageBriefs)]
          : await Promise.all(
              group.map((i) => runIndex(i, stagePrior, stageBriefs)),
            );

      // Reconcile in the group's declared order so parallelism never changes
      // the resulting transcript.
      for (const outcome of outcomes) {
        const i = outcome.index;
        // Parse + STRIP this member's handoff brief up front, so the side-channel
        // comment never reaches the deliverable or the archive. We keep the
        // parsed brief in TWO places: the next stage's "Handoff so far" recap
        // (handoffBriefs) and this step's own audit row (stepBrief), so the run
        // timeline can show a per-agent panel of what each agent handed off.
        let stepBrief: HandoffBrief | null = null;
        let strippedText = outcome.text;
        if (outcome.text.trim() && outcome.status !== "aborted") {
          const { brief, stripped } = extractHandoffBrief(outcome.text);
          strippedText = stripped;
          if (brief) stepBrief = { ...brief, agent: memberTitles[i] };
        }
        steps.push({
          agentPath: teamPaths[i],
          agentTitle: memberTitles[i],
          stepOrder: i,
          role: i === 0 ? "lead" : "member",
          status: outcome.status,
          durationMs: outcome.durationMs,
          inputTokens: outcome.inputTokens,
          outputTokens: outcome.outputTokens,
          charCount: outcome.text.length || null,
          errorMessage: outcome.errorMessage,
          handoffBrief: stepBrief ? JSON.stringify(stepBrief) : null,
        });
        // Surface this member's parsed handoff brief live, so a reviewer watching
        // the run sees the same "Interne overdracht" panel + flags that the
        // archive shows, the moment each step's brief is reconciled.
        if (stepBrief) send({ type: "agent_brief", index: i, brief: stepBrief });
        // Keep every non-empty contribution except an aborted one (its partial
        // text is discarded, mirroring the original sequential behaviour). The
        // brief was already parsed + stripped above; accumulate it so the next
        // stage gets a clean "Handoff so far" recap.
        if (outcome.text.trim() && outcome.status !== "aborted") {
          if (strippedText) {
            priorWork += `\n\n## ${memberTitles[i]}\n\n${strippedText}`;
          }
          if (stepBrief) handoffBriefs.push(stepBrief);
        }
        if (outcome.status !== "completed") runStatus = "partial";
      }

      // A fatal failure (context build or real mid-stream error) ends the run
      // after the stage is recorded, matching the original fail-fast contract.
      const fatal = outcomes.find((o) => o.contextFailed || o.streamFailed);
      if (fatal) {
        runStatus = "partial";
        await persistRun();
        const message = fatal.contextFailed
          ? "Kon de context niet samenstellen: " + (fatal.errorMessage ?? "onbekende fout")
          : (fatal.errorMessage ?? "Onbekende fout tijdens generatie");
        send({ error: message });
        return result({ error: message });
      }

      if (isGone()) {
        runStatus = "partial";
        break stageLoop;
      }
    }

    // Capture this run's monitor list from the team output and persist it, so
    // monitored terms carry across weeks with their age. The list rides in an
    // HTML comment that never renders; parse it, upsert by client + term, and
    // strip the block from priorWork so it never reaches the deliverable or the
    // archived run. Best-effort: monitor bookkeeping never sinks the run.
    if (deliverableKind === "negative-keywords-csv") {
      // Always strip the monitor block from priorWork — even on an aborted run —
      // so the invisible side-channel comment never reaches the deliverable or
      // the archived markdown. Only persist when the run actually completed.
      const monClientId = dbClientIdFromPath(clientPath);
      const { items, stripped } = extractMonitorList(priorWork);
      priorWork = stripped;
      if (!isGone() && monClientId !== null && items.length > 0) {
        try {
          const { inserted, updated } = await recordMonitoredTerms(
            monClientId,
            items,
          );
          send({
            type: "deliverable_note",
            message: `Monitor-lijst bijgewerkt: ${inserted} nieuw, ${updated} herzien.`,
          });
        } catch (monErr) {
          send({
            type: "deliverable_note",
            message:
              "Monitor-lijst kon niet bewaard worden; de termen worden volgende week opnieuw beoordeeld. " +
              (monErr instanceof Error ? monErr.message : String(monErr)).slice(0, 160),
          });
        }
      }
    }

    // ---- Final QC gate ------------------------------------------------------
    // After the team finishes, run the closing quality gate over their combined
    // draft. The Humanizer (client-facing text only) rewrites the whole draft
    // into a natural-voice version; the QA & Compliance Reviewer always issues a
    // verdict. Both are their OWN best-effort steps: a failure marks the run
    // partial and records a failed step but NEVER discards the team's markdown.
    //
    // Steps after the team are numbered with a running counter so the audit
    // trail stays ordered as QC inserts steps ahead of the deliverable.
    let nextStepOrder = postTeamStepOrder;
    let reviewerText = "";

    // Run one QC agent over a fixed draft. Best-effort: returns text (empty on
    // failure/abort) and records its own step; it never throws.
    const runQcStep = async (
      mode: "humanizer" | "reviewer",
      index: number,
      title: string,
      draft: string,
    ): Promise<string> => {
      const startedAt = Date.now();
      let systemPrompt: string;
      try {
        ({ systemPrompt } = await buildGenerationContext({
          agentPath: mode === "humanizer" ? QC_HUMANIZER_PATH : QC_REVIEWER_PATH,
          clientPath,
          workflowPath,
          extraDocs: clientDocs,
          qc: { mode, draft },
        }));
      } catch (err) {
        steps.push({
          agentPath: mode === "humanizer" ? QC_HUMANIZER_PATH : QC_REVIEWER_PATH,
          agentTitle: title,
          stepOrder: nextStepOrder++,
          role: "quality",
          status: "failed",
          durationMs: Date.now() - startedAt,
          inputTokens: null,
          outputTokens: null,
          charCount: null,
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        });
        runStatus = "partial";
        return "";
      }

      send({
        type: "agent_start",
        index,
        total: grandTotal,
        agent: {
          path: mode === "humanizer" ? QC_HUMANIZER_PATH : QC_REVIEWER_PATH,
          title,
        },
        role: "quality",
      });

      let text = "";
      let truncated = false;
      let inTok: number | null = null;
      let outTok: number | null = null;
      let status = "completed";
      try {
        const stream = anthropic.messages.stream(
          {
            model: "claude-sonnet-4-6",
            max_tokens: mode === "humanizer" ? 16000 : 8192,
            system: systemPrompt,
            messages: [{ role: "user", content: request }],
          },
          { signal },
        );
        for await (const event of stream) {
          if (isGone()) break;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            text += event.delta.text;
            send({ content: event.delta.text, index });
          }
        }
        if (!isGone()) {
          const finalMsg = await stream.finalMessage();
          truncated = finalMsg.stop_reason === "max_tokens";
          inTok = finalMsg.usage?.input_tokens ?? null;
          outTok = finalMsg.usage?.output_tokens ?? null;
        }
        status = isGone() ? "aborted" : truncated ? "truncated" : "completed";
        if (!isGone()) send({ type: "agent_done", index, truncated });
      } catch (qcErr) {
        if (isGone() || (qcErr instanceof Error && qcErr.name === "AbortError")) {
          status = "aborted";
        } else {
          // Best-effort: report, mark partial, keep the team's markdown intact.
          status = "failed";
          send({ type: "agent_done", index, truncated: false });
        }
      }
      steps.push({
        agentPath: mode === "humanizer" ? QC_HUMANIZER_PATH : QC_REVIEWER_PATH,
        agentTitle: title,
        stepOrder: nextStepOrder++,
        role: "quality",
        status,
        durationMs: Date.now() - startedAt,
        inputTokens: inTok,
        outputTokens: outTok,
        charCount: text.length || null,
        errorMessage: null,
      });
      if (status !== "completed") runStatus = "partial";
      // An aborted pass contributes nothing; the team's work stands.
      return status === "aborted" ? "" : text;
    };

    // Source the QC-gate flags from the accumulated handoff briefs, falling
    // back to routing's resolution when a brief is silent. A brief can only
    // REFINE the up-front plan, never invent a step that was never announced:
    //  - clientFacing: a brief may DOWNGRADE (skip the planned Humanizer), but
    //    cannot synthesise a Humanizer pass that was never planned.
    //  - touchesLiveAccount: a brief may UPGRADE (surface the live-account note
    //    after the team runs), but the OR-merge never downgrades the signal.
    const briefFlags = resolveBriefGateFlags(handoffBriefs);
    effectiveClientFacing = briefFlags.clientFacing ?? clientFacing;
    effectiveTouchesLiveAccount =
      briefFlags.touchesLiveAccount === true || touchesLiveAccount;

    // If the team's briefs reveal the work touches a live account but routing
    // did not flag it up front, surface the one-time note now (best-effort).
    if (
      effectiveTouchesLiveAccount &&
      !touchesLiveAccount &&
      !isGone()
    ) {
      send({
        type: "deliverable_note",
        message:
          "Deze opdracht raakt live uitgaven, tracking of accounts. Het team levert enkel voorstellen; een mens zet niets automatisch live.",
      });
    }

    let humanizerRan = false;
    if (qcEnabled) {
      if (
        humanizerWillRun &&
        effectiveClientFacing &&
        humanizerIndex !== undefined &&
        !isGone() &&
        priorWork.trim()
      ) {
        const humanized = await runQcStep(
          "humanizer",
          humanizerIndex,
          humanizerTitle,
          priorWork,
        );
        if (humanized.trim()) {
          priorWork += `\n\n## ${humanizerTitle}\n\n${humanized.trim()}`;
          humanizerRan = true;
        }
      }
      if (
        reviewerWillRun &&
        reviewerIndex !== undefined &&
        !isGone() &&
        priorWork.trim()
      ) {
        // Reviewer text is held back and appended AFTER the deliverable so its
        // internal verdict never feeds the deliverable/report generation.
        reviewerText = await runQcStep(
          "reviewer",
          reviewerIndex,
          reviewerTitle,
          priorWork,
        );
      }
    }

    // The deliverable + e-mailed report build on the team work plus any
    // humanized pass, but NOT the reviewer's internal verdict.
    const deliverableSource = priorWork;

    // Deliverable layer: turn the combined team work into the concrete end
    // product the workflow declares. Best-effort — a failure here never loses
    // the run; it's reported and the run still finishes with the markdown.
    const meta = isGone() ? null : deliverableMeta(deliverableKind, clientName);
    const prompt = meta
      ? buildDeliverablePrompt(deliverableKind, {
          clientName,
          clientContent,
          request,
          teamWork: deliverableSource,
          liveData: adCopyLiveData ?? negativesLiveData ?? undefined,
        })
      : null;
    if (!isGone() && meta && prompt) {
      const delStartedAt = Date.now();
      let delChars = 0;
      let delIn: number | null = null;
      let delOut: number | null = null;
      let delStatus = "completed";
      try {
        send({ type: "deliverable_start", deliverable: meta });
        const dstream = anthropic.messages.stream(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 16000,
            system: prompt.system,
            messages: [{ role: "user", content: prompt.user }],
          },
          { signal },
        );
        for await (const event of dstream) {
          if (isGone()) break;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            delChars += event.delta.text.length;
            send({ type: "deliverable_delta", content: event.delta.text });
          }
        }
        let deliverableTruncated = false;
        if (!isGone()) {
          try {
            const dfinal = await dstream.finalMessage();
            deliverableTruncated = dfinal.stop_reason === "max_tokens";
            delIn = dfinal.usage?.input_tokens ?? null;
            delOut = dfinal.usage?.output_tokens ?? null;
          } catch {
            // best-effort truncation detection
          }
        }
        delStatus = isGone()
          ? "aborted"
          : deliverableTruncated
            ? "truncated"
            : "completed";
        if (!isGone())
          send({ type: "deliverable_done", truncated: deliverableTruncated });
      } catch (err) {
        delStatus = "failed";
        if (!isGone() && !(err instanceof Error && err.name === "AbortError")) {
          const message = err instanceof Error ? err.message : String(err);
          send({ type: "deliverable_error", message });
        }
      }
      steps.push({
        agentPath: workflowPath,
        agentTitle: meta.title ?? "Eindproduct",
        stepOrder: nextStepOrder++,
        role: "deliverable",
        status: delStatus,
        durationMs: Date.now() - delStartedAt,
        inputTokens: delIn,
        outputTokens: delOut,
        charCount: delChars || null,
        errorMessage: null,
      });
      if (delStatus !== "completed") runStatus = "partial";
    }

    // Action deliverable: e-mail the finished monthly report (PDF attached) to
    // the client's report recipient. Best-effort and recorded as a final step in
    // the audit trail — a failure here marks the run partial but never loses it.
    if (deliverableKind === "monthly-report-email" && !isGone()) {
      const actionStartedAt = Date.now();
      let actionStatus = "completed";
      let actionError: string | null = null;
      let actionIn: number | null = null;
      let actionOut: number | null = null;
      const recipient = reportClient?.reportEmail?.trim() ?? null;
      const teamWork = deliverableSource.trim();
      try {
        send({ type: "deliverable_start", deliverable: { title: "Maandrapport opstellen" } });
        if (!recipient) {
          throw new Error(
            "Geen rapport-ontvanger ingesteld voor deze klant (veld 'Rapport-ontvanger').",
          );
        }
        if (!teamWork) {
          throw new Error("Het team leverde geen rapport om te versturen.");
        }

        // Client-facing version: the PDF + cover email must never contain
        // unfinished "[AAN TE VULLEN]" placeholders or internal-only sections.
        // The archived run keeps the full text (incl. approval checklist). No
        // fallback to the raw body — if sanitizing leaves nothing, we refuse to
        // send rather than risk leaking internal content to the client.
        // When the Humanizer rewrote the draft (untruncated), prefer its
        // section as the report body over the raw specialist sections.
        const reportHumanized =
          humanizerRan && !steps.some(
            (s) => s.role === "quality" && s.agentTitle === humanizerTitle && s.status === "truncated",
          );
        const reportTitles = reportHumanized
          ? [...memberTitles, humanizerTitle]
          : memberTitles;
        const reportFinal = reportHumanized
          ? stripHumanizerMeta(extractFinalReport(teamWork, reportTitles))
          : extractFinalReport(teamWork, reportTitles);
        const clientReport = toClientFacingReport(reportFinal);
        if (!clientReport) {
          throw new Error(
            "De klantgerichte rapportversie is leeg na het verwijderen van interne/placeholder-secties; rapport niet verzonden.",
          );
        }

        // Short Dutch cover email summarising the report, generated by the model.
        const periodLabel = "vorige maand";
        let emailBody = "";
        try {
          const emailMsg = await anthropic.messages.create(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 1200,
              system: [
                "Je bent accountmanager bij Saerens Advertising, een Belgisch Google Ads-bureau.",
                "Schrijf een korte, professionele begeleidende e-mail (in het Nederlands/Vlaams) bij het maandrapport van een klant.",
                "De volledige analyse zit als PDF in bijlage — vat in de e-mail enkel de 3 à 5 belangrijkste punten samen (resultaten, opvallende wijzigingen, voorgestelde volgende stappen).",
                "Gebruik GEEN emoji's. Geen markdown-koppen. Begin met een aanhef en eindig met een professionele afsluiting namens Saerens Advertising.",
                "Hou het onder ~200 woorden. Geef enkel de e-mailtekst terug, zonder onderwerpregel.",
              ].join("\n"),
              messages: [
                {
                  role: "user",
                  content: `Klant: ${clientName}\nPeriode: ${periodLabel}\n\nKlantgericht rapport:\n\n${clientReport}`,
                },
              ],
            },
            { signal },
          );
          emailBody = emailMsg.content
            .map((b) => (b.type === "text" ? b.text : ""))
            .join("")
            .trim();
          actionIn = emailMsg.usage?.input_tokens ?? null;
          actionOut = emailMsg.usage?.output_tokens ?? null;
        } catch (bodyErr) {
          if (bodyErr instanceof Error && bodyErr.name === "AbortError") throw bodyErr;
          // Fall back to a minimal cover note so the report still goes out.
          emailBody = `Beste,\n\nIn bijlage vind je het maandrapport van ${clientName} (${periodLabel}). De volledige analyse staat in de PDF.\n\nMet vriendelijke groeten,\nSaerens Advertising`;
        }

        const dateLabel = new Date().toLocaleDateString("nl-BE", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const subject = `Maandrapport ${clientName} — ${periodLabel}`;

        if (isGone()) throw new Error("Afgebroken voor opslag.");

        // Human approval checkpoint: do NOT send. Snapshot everything needed to
        // render + send later, and HOLD it. A human reviews the draft + the
        // reviewer's verdict and approves (release) or requests changes. The PDF
        // is rendered at approval time from this payload, so nothing reaches the
        // client unattended.
        // Freeze the responsible Head's email identity (derived from the lead
        // agent's department) so the held draft is sent FROM that Head with the
        // owner in CC. Best-effort: a missing alias degrades to the primary
        // mailbox (Gmail rewrites an unverified From anyway).
        const identity = await resolveHeadIdentity(teamPaths[0]);
        const payload: ReportDeliveryPayload = {
          recipient,
          subject,
          clientName,
          periodLabel,
          dateLabel,
          emailBody,
          clientReport,
          metrics: reportMetrics,
          fromName: identity?.displayName,
          fromAddress: identity?.address ?? undefined,
          cc: ownerEmail() ?? undefined,
          signature: identity?.signature,
          headAgentPath: identity?.headAgentPath ?? teamPaths[0],
        };
        pendingApproval = JSON.stringify(payload);
        approvalStatus = "pending";
        send({ type: "deliverable_done", truncated: false });
        // Surface the held draft + the internal reviewer verdict so a human can
        // decide before it goes out. The reviewer text is the QC gate's output.
        send({
          type: "approval_required",
          recipient,
          clientReport,
          reviewerVerdict: reviewerText.trim() || null,
        });
      } catch (err) {
        if (isGone() || (err instanceof Error && err.name === "AbortError")) {
          actionStatus = "aborted";
        } else {
          actionStatus = "failed";
          actionError = (err instanceof Error ? err.message : String(err)).slice(
            0,
            500,
          );
          send({ type: "deliverable_error", message: actionError });
        }
      }
      steps.push({
        agentPath: workflowPath,
        agentTitle:
          actionStatus === "completed"
            ? "Maandrapport opgesteld — wacht op goedkeuring"
            : "Maandrapport opstellen",
        stepOrder: nextStepOrder++,
        role: "deliverable",
        status: actionStatus,
        durationMs: Date.now() - actionStartedAt,
        inputTokens: actionIn,
        outputTokens: actionOut,
        charCount: null,
        errorMessage: actionError,
      });
      // Drafting the report succeeded even though it is held for approval, so the
      // run itself stays "completed"; only a real drafting failure marks it
      // partial. The held send is tracked by approvalStatus, not run status.
      if (actionStatus !== "completed") runStatus = "partial";
    }

    // Action deliverable (Phase 2): hold a team-drafted REPLY to an inbound
    // client message. Same human-approval checkpoint as the monthly report —
    // nothing is sent here — but the snapshot carries the threading headers so
    // the approved reply lands in the original Gmail conversation. The inbound
    // context (thread, recipient, message-id chain) is attached by the poller.
    if (deliverableKind === "email-reply" && !isGone()) {
      const actionStartedAt = Date.now();
      let actionStatus = "completed";
      let actionError: string | null = null;
      const er = ctx.emailReply ?? null;
      try {
        send({ type: "deliverable_start", deliverable: { title: "Antwoord opstellen" } });
        if (!er) {
          throw new Error(
            "Geen e-mailthread-context voor dit antwoord (interne fout).",
          );
        }
        const teamWork = deliverableSource.trim();
        if (!teamWork) {
          throw new Error("Het team leverde geen antwoord om te versturen.");
        }

        // Client-facing: strip internal/placeholder sections, and prefer the
        // Humanizer's rewritten section over the raw specialist text when it ran
        // without truncation (mirrors the monthly-report body selection).
        const replyHumanized =
          humanizerRan && !steps.some(
            (s) => s.role === "quality" && s.agentTitle === humanizerTitle && s.status === "truncated",
          );
        const replyTitles = replyHumanized
          ? [...memberTitles, humanizerTitle]
          : memberTitles;
        const replyFinal = replyHumanized
          ? stripHumanizerMeta(extractFinalReport(teamWork, replyTitles))
          : extractFinalReport(teamWork, replyTitles);
        const replyBody = toClientFacingReport(replyFinal);
        if (!replyBody) {
          throw new Error(
            "Het klantgerichte antwoord is leeg na het verwijderen van interne/placeholder-secties; niet verzonden.",
          );
        }

        if (isGone()) throw new Error("Afgebroken voor opslag.");

        // Freeze the responsible Head's identity (same derivation as the report)
        // so the held reply is sent FROM that Head with the owner in CC.
        const identity = await resolveHeadIdentity(teamPaths[0]);
        const payload: EmailReplyPayload = {
          kind: "email-reply",
          recipient: er.recipient,
          subject: er.subject,
          clientName,
          replyBody,
          inboundText: er.inboundText,
          fromName: identity?.displayName,
          fromAddress: identity?.address ?? undefined,
          cc: ownerEmail() ?? undefined,
          signature: identity?.signature,
          headAgentPath: identity?.headAgentPath ?? teamPaths[0],
          threadId: er.gmailThreadId,
          inReplyTo: er.inReplyTo ?? undefined,
          references: er.references ?? undefined,
          emailThreadId: er.emailThreadId,
        };
        pendingApproval = JSON.stringify(payload);
        approvalStatus = "pending";
        send({ type: "deliverable_done", truncated: false });
        // Surface the inbound message + the held reply draft + the internal
        // reviewer verdict so a human can decide before it goes out.
        send({
          type: "approval_required",
          recipient: er.recipient,
          clientReport: replyBody,
          reviewerVerdict: reviewerText.trim() || null,
        });
      } catch (err) {
        if (isGone() || (err instanceof Error && err.name === "AbortError")) {
          actionStatus = "aborted";
        } else {
          actionStatus = "failed";
          actionError = (err instanceof Error ? err.message : String(err)).slice(
            0,
            500,
          );
          send({ type: "deliverable_error", message: actionError });
        }
      }
      steps.push({
        agentPath: workflowPath,
        agentTitle:
          actionStatus === "completed"
            ? "Antwoord opgesteld — wacht op goedkeuring"
            : "Antwoord opstellen",
        stepOrder: nextStepOrder++,
        role: "deliverable",
        status: actionStatus,
        durationMs: Date.now() - actionStartedAt,
        inputTokens: null,
        outputTokens: null,
        charCount: null,
        errorMessage: actionError,
      });
      if (actionStatus !== "completed") runStatus = "partial";
    }

    // The reviewer's verdict is internal QA: append it to the archived markdown
    // AFTER the deliverable/report so it never fed those, but is kept for audit.
    if (reviewerText.trim()) {
      priorWork += `\n\n## QA & Compliance — interne controle\n\n${reviewerText.trim()}`;
    }

    // Fan-out selection rationale: append AFTER the deliverable snapshot so it
    // never feeds the deliverable, but the archive records why the winner won.
    if (fanoutNote.trim()) {
      priorWork += `\n\n## Fan-out — interne selectie\n\n${fanoutNote.trim()}`;
    }

    if (!isGone()) {
      const archived = await persistRun();
      send({
        done: true,
        archived,
        generationId: savedId,
        approvalRequired: approvalStatus === "pending",
      });
      return result({ archived });
    }
    // Aborted: still archive the partial trail so it's reviewable afterward.
    await persistRun();
    return result();
  } catch (err) {
    if (isGone() || (err instanceof Error && err.name === "AbortError")) {
      await persistRun();
      return result();
    }
    runStatus = "partial";
    await persistRun();
    const message = err instanceof Error ? err.message : String(err);
    send({ error: message });
    return result({ error: message });
  }
}
