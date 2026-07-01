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
  fetchGoogleAdsReport,
  fetchGoogleAdsAdCopyContext,
  fetchGoogleAdsNegativesContext,
  type GoogleAdsMetrics,
} from "./google-ads";
import {
  runMember,
  runQcStep,
  type AgentRunContext,
} from "./generation-agent-runner";
import {
  runDeliverableStep,
  runReportEmailAction,
  runSeoReportEmailAction,
  runEmailReplyAction,
  type DeliverableExecContext,
} from "./generation-deliverable-executor";
import {
  buildSeoReportPeriods,
  fetchSeoReportSnapshot,
  type SeoReportCadence,
  type SeoReportMetrics,
} from "./seo-report-data";

import {
  extractMonitorList,
  extractHandoffBrief,
  resolveBriefGateFlags,
} from "./generation-text";
import { recordAlert } from "./alerts-store";

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

import {
  QC_REVIEWER_PATH,
  QC_HUMANIZER_PATH,
  FANOUT_SEEDS,
  FANOUT_DIRECTIVE,
} from "./generation-routing";
import type {
  GenerationContext,
  GenerationSink,
  GenerationResult,
  StepRecord,
  MemberOutcome,
} from "./generation-types";

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

  // Read-only-by-convention inputs shared by every per-agent run (members +
  // QC). Built once; the agent runner reads it and never mutates the run's state.
  const agentRc: AgentRunContext = {
    send,
    signal,
    isGone,
    grandTotal,
    request,
    teamPaths,
    memberTitles,
    clientPath,
    workflowPath,
    clientDocs,
    reviewerWillRun,
  };
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
  // SEO report: the structured snapshot + resolved cadence/period, captured at
  // run start and reused by the post-loop SEO email action.
  let reportSeoMetrics: SeoReportMetrics | null = null;
  let reportSeoCadence: SeoReportCadence = "monthly";
  let reportSeoPeriodLabel = "";
  // Live SEARCH ad-group structure captured at run start for the ad-copy CSV.
  let adCopyLiveData: string | null = null;
  let negativesLiveData: string | null = null;
  // Fan-out: the written rationale for which candidate won, appended to the
  // archived markdown at the very end (after the deliverable) for transparency.
  let fanoutNote = "";
  // Fan-out: a structured snapshot of every usable creative variation plus the
  // selector's rationale, persisted on the run so the run/archive view can show
  // the alternatives (not just the winner). Null for non-fan-out runs.
  let fanoutSelection: {
    rationale: string;
    candidates: {
      variant: number;
      text: string;
      status: string;
      winner: boolean;
      // Per-loser note: a brief reason this variation lost (e.g. "weaker hook").
      // Empty for the winner and whenever no per-variant reason was captured.
      reason: string;
    }[];
  } | null = null;
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
        fanoutCandidates: fanoutSelection
          ? JSON.stringify(fanoutSelection)
          : null,
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
      // Surface non-interactive run failures the operator never sees live. A
      // "user" run is watched in the browser (errors stream over SSE), so only
      // scheduled/inbound/autonomous failures become a durable alert. Deduped on
      // the run id so re-archival can't double-record. Best-effort.
      if (runStatus === "failed" && triggerSource !== "user") {
        void recordAlert({
          source: "generation",
          severity: "error",
          message: `Automatische run mislukte${
            clientName ? ` voor ${clientName}` : ""
          } (${workflowTitle}).`,
          context: {
            key: `generation:${row.id}`,
            generationId: row.id,
            triggerSource,
            workflow: workflowTitle,
            client: clientName ?? null,
          },
        });
      }
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

    // SEO/website report: before the team writes, assemble the organic snapshot
    // — Search Console (primary, three completed windows for real PoP/YoY),
    // technical crawl health, PageSpeed (current-state) and optional Bing — and
    // inject each labelled block into the client doc so the team compares real,
    // period-correct numbers. The cadence (monthly vs quarterly) is read from
    // the workflow path. Best-effort: every source fails independently into a
    // note; the report still runs on existing data. The structured metrics drive
    // the PDF cover/charts and the email KPI strip.
    if (deliverableKind === "seo-report-email" && !isGone()) {
      reportSeoCadence = workflowPath.includes("quarterly")
        ? "quarterly"
        : "monthly";
      const clientId = dbClientIdFromPath(clientPath);
      try {
        reportClient = reportClient ?? (clientId !== null ? await getClientRow(clientId) : null);
        const periods = buildSeoReportPeriods(new Date(), reportSeoCadence);
        reportSeoPeriodLabel = periods.current.label;
        const snapshot = await fetchSeoReportSnapshot(
          reportClient ?? {},
          clientId,
          reportSeoCadence,
          periods,
        );
        reportSeoMetrics = snapshot.metrics;
        const doc = clientDocs.find((d) => d.path === clientPath);
        if (doc && snapshot.blocks.length > 0) {
          doc.content += "\n\n" + snapshot.blocks.join("\n") + "\n";
        }
        for (const note of snapshot.notes) {
          send({ type: "deliverable_note", message: note });
        }
      } catch (err) {
        send({
          type: "deliverable_note",
          message:
            "SEO-data kon niet opgehaald worden; het rapport gebruikt de bestaande data. " +
            (err instanceof Error ? err.message : String(err)).slice(0, 200),
        });
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
      // Per-loser notes keyed by 1-based variant number (matches `usable`
      // ordering). Populated only by the selection model; empty for the
      // single-usable / abort / fail branches, so a missing reason never breaks
      // the display.
      const loserReasons = new Map<number, string>();
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
          "RATIONALE: <2 tot 4 zinnen die uitleggen waarom deze variant wint>",
          "REASONS:",
          "- Variant <nummer>: <korte reden van max 1 zin waarom net deze variant afvalt (bv. zwakkere hook, beleidsrisico, te generiek)>",
          "Geef één REASONS-regel per niet-winnende variant; laat de winnende variant weg.",
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
          const rm = selText.match(
            /RATIONALE:\s*([\s\S]+?)(?:\n\s*REASONS:|$)/i,
          );
          // Capture the per-loser notes from the REASONS block (lines like
          // "- Variant 2: zwakkere hook"). Tolerant of any leading marker and
          // of `:`, `-` or `–` separators; ignored when absent.
          const reasonsBlock = selText.match(/REASONS:\s*([\s\S]+)/i)?.[1] ?? "";
          const reasonRe = /variant\s*(\d+)\s*[:\-–]\s*(.+)/gi;
          for (
            let rMatch = reasonRe.exec(reasonsBlock);
            rMatch !== null;
            rMatch = reasonRe.exec(reasonsBlock)
          ) {
            const vn = Number.parseInt(rMatch[1], 10);
            const note = rMatch[2].trim();
            if (vn >= 1 && note) loserReasons.set(vn, note);
          }
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

      // Snapshot every usable variation (winner flagged) + the rationale so the
      // run/archive view can show the alternatives, not just the auto-chosen
      // winner. Captured even when the rationale is empty (e.g. selection
      // aborted) so the variations themselves are never lost.
      const candidateSnapshot = usable.map((c, n) => {
        const isWinner = c === winner;
        return {
          variant: n + 1,
          text: c.text.trim(),
          status: c.status,
          winner: isWinner,
          // Per-loser note: why this variation lost. Only losers carry one, and
          // only when the selector supplied it for this variant.
          reason: isWinner ? "" : (loserReasons.get(n + 1) ?? ""),
        };
      });
      fanoutSelection = {
        rationale: rationale.trim(),
        candidates: candidateSnapshot,
      };
      send({
        type: "fanout_candidates",
        rationale: rationale.trim(),
        candidates: candidateSnapshot,
      });

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
        : runMember(agentRc, idx, prior, briefs);

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
        const hRes = await runQcStep(
          agentRc,
          "humanizer",
          humanizerIndex,
          humanizerTitle,
          priorWork,
        );
        steps.push({ ...hRes.step, stepOrder: nextStepOrder++ });
        if (hRes.downgrade) runStatus = "partial";
        if (hRes.text.trim()) {
          priorWork += `\n\n## ${humanizerTitle}\n\n${hRes.text.trim()}`;
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
        const rRes = await runQcStep(
          agentRc,
          "reviewer",
          reviewerIndex,
          reviewerTitle,
          priorWork,
        );
        steps.push({ ...rRes.step, stepOrder: nextStepOrder++ });
        if (rRes.downgrade) runStatus = "partial";
        reviewerText = rRes.text;
      }
    }

    // The deliverable + e-mailed report build on the team work plus any
    // humanized pass, but NOT the reviewer's internal verdict.
    const deliverableSource = priorWork;

    // Build the read-only context the deliverable + held e-mail actions read.
    const deliverableCtx: DeliverableExecContext = {
      send,
      signal,
      isGone,
      workflowPath,
      clientName,
      clientContent,
      request,
      deliverableKind,
      deliverableSource,
      adCopyLiveData,
      negativesLiveData,
      reportClient,
      reportMetrics,
      reportSeoMetrics,
      reportSeoCadence,
      reportSeoPeriodLabel,
      memberTitles,
      teamPaths,
      humanizerRan,
      humanizerTitle,
      reviewerText,
      steps,
      emailReply: ctx.emailReply ?? null,
    };

    // Deliverable layer: turn the combined team work into the concrete end
    // product the workflow declares. Best-effort — a failure here never loses
    // the run; it's reported and the run still finishes with the markdown. The
    // executor self-gates (no step when aborted or the kind has no deliverable).
    const delEffect = await runDeliverableStep(deliverableCtx);
    if (delEffect.step) {
      steps.push({ ...delEffect.step, stepOrder: nextStepOrder++ });
      if (delEffect.downgrade) runStatus = "partial";
    }

    // Action deliverable: draft the monthly report and HOLD it for human
    // approval (nothing is sent here). Recorded as a final step; the held send
    // is tracked by approvalStatus, not run status.
    if (deliverableKind === "monthly-report-email" && !isGone()) {
      const actEffect = await runReportEmailAction(deliverableCtx);
      steps.push({ ...actEffect.step, stepOrder: nextStepOrder++ });
      if (actEffect.approval) {
        pendingApproval = actEffect.approval.payload;
        approvalStatus = actEffect.approval.status;
      }
      if (actEffect.downgrade) runStatus = "partial";
    }

    // Action deliverable: draft the recurring SEO/website report and HOLD it for
    // human approval — same checkpoint as the monthly Ads report, but rendered
    // from the SEO snapshot with the report cadence (monthly/quarterly).
    if (deliverableKind === "seo-report-email" && !isGone()) {
      const actEffect = await runSeoReportEmailAction(deliverableCtx);
      steps.push({ ...actEffect.step, stepOrder: nextStepOrder++ });
      if (actEffect.approval) {
        pendingApproval = actEffect.approval.payload;
        approvalStatus = actEffect.approval.status;
      }
      if (actEffect.downgrade) runStatus = "partial";
    }

    // Action deliverable (Phase 2): hold a team-drafted REPLY to an inbound
    // client message — same approval checkpoint, but the snapshot carries the
    // threading headers so the approved reply lands in the original Gmail thread.
    if (deliverableKind === "email-reply" && !isGone()) {
      const actEffect = await runEmailReplyAction(deliverableCtx);
      steps.push({ ...actEffect.step, stepOrder: nextStepOrder++ });
      if (actEffect.approval) {
        pendingApproval = actEffect.approval.payload;
        approvalStatus = actEffect.approval.status;
      }
      if (actEffect.downgrade) runStatus = "partial";
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
