import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { Client } from "@workspace/db";
import { buildGenerationContext } from "./generate-context";
import { getDocFile, type DocFile } from "./docs";
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

/** Everything needed to run a generation, after validation. */
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
  let persisted = false;
  let savedId: number | null = null;
  let runStatus = "completed";
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
          team: { members: memberTitles, position: i, priorWork: stagePrior, isFinal },
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

    // Execute the plan stage by stage. Members within a stage are genuinely
    // independent, so they run in parallel against the SAME prior-work snapshot
    // and their outputs are appended in stage order for a stable transcript.
    // Sequential chains (one member per stage) pass each hand-off forward.
    stageLoop: for (const group of stages) {
      if (isGone()) break;
      const stagePrior = priorWork;
      const outcomes =
        group.length === 1
          ? [await runMember(group[0], stagePrior)]
          : await Promise.all(group.map((i) => runMember(i, stagePrior)));

      // Reconcile in the group's declared order so parallelism never changes
      // the resulting transcript.
      for (const outcome of outcomes) {
        const i = outcome.index;
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
        });
        // Keep every non-empty contribution except an aborted one (its partial
        // text is discarded, mirroring the original sequential behaviour).
        if (outcome.text.trim() && outcome.status !== "aborted") {
          priorWork += `\n\n## ${memberTitles[i]}\n\n${outcome.text.trim()}`;
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
    let nextStepOrder = teamPaths.length;
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

    let humanizerRan = false;
    if (qcEnabled) {
      if (
        humanizerWillRun &&
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
        const reportTitles =
          humanizerRan && !steps.some(
            (s) => s.role === "quality" && s.agentTitle === humanizerTitle && s.status === "truncated",
          )
            ? [...memberTitles, humanizerTitle]
            : memberTitles;
        const clientReport = toClientFacingReport(
          extractFinalReport(teamWork, reportTitles),
        );
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
        const payload: ReportDeliveryPayload = {
          recipient,
          subject,
          clientName,
          periodLabel,
          dateLabel,
          emailBody,
          clientReport,
          metrics: reportMetrics,
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

    // The reviewer's verdict is internal QA: append it to the archived markdown
    // AFTER the deliverable/report so it never fed those, but is kept for audit.
    if (reviewerText.trim()) {
      priorWork += `\n\n## QA & Compliance — interne controle\n\n${reviewerText.trim()}`;
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
