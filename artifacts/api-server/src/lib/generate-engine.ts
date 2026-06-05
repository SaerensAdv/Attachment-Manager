import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { Client } from "@workspace/db";
import { buildGenerationContext } from "./generate-context";
import { getDocFile, type DocFile } from "./docs";
import { loadClientDocs, getClientRow, dbClientIdFromPath } from "./clients-store";
import { saveGeneration, saveGenerationSteps } from "./generations-store";
import {
  getDeliverableKind,
  deliverableMeta,
  buildDeliverablePrompt,
} from "./deliverables";
import { fetchGoogleAdsReport, type GoogleAdsMetrics } from "./google-ads";
import { renderReportPdf } from "./report-pdf";
import { sendEmail } from "./email";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build a Saerens-branded, email-client-safe HTML body (inline styles only). */
function buildBrandedEmail(args: {
  clientName: string;
  periodLabel: string;
  dateLabel: string;
  bodyText: string;
  metrics: GoogleAdsMetrics | null;
}): string {
  const { clientName, periodLabel, dateLabel, bodyText, metrics } = args;
  const NEARBLACK = "#0A0A0B";
  const INDIGO = "#29274E";
  const PURPLE = "#716BEB";
  const AMBER = "#F4A425";
  const INK = "#1A1A22";
  const MUTED = "#6B6B72";
  const HAIR = "#E4E2EE";

  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${INK};">${escapeHtml(
          p,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  let kpiBlock = "";
  if (metrics) {
    const cur = metrics.currency || "EUR";
    const eur = (n: number, d = 0): string => {
      try {
        return new Intl.NumberFormat("nl-BE", {
          style: "currency",
          currency: cur,
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }).format(n);
      } catch {
        return `${n.toFixed(d)} ${cur}`;
      }
    };
    const intf = (n: number): string =>
      new Intl.NumberFormat("nl-BE").format(Math.round(n));
    const kpis: { label: string; value: string }[] = [
      { label: "Adspend", value: eur(metrics.totals.cost) },
      { label: "Leads", value: intf(metrics.totals.conversions) },
      {
        label: "Cost / lead",
        value: metrics.totals.cpa !== null ? eur(metrics.totals.cpa, 2) : "n.v.t.",
      },
      {
        label: "ROAS",
        value:
          metrics.totals.roas !== null
            ? `${new Intl.NumberFormat("nl-BE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(metrics.totals.roas)}×`
            : "n.v.t.",
      },
    ];
    const cells = kpis
      .map(
        (k) =>
          `<td style="padding:12px 10px;text-align:center;border:1px solid ${HAIR};">` +
          `<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">${escapeHtml(
            k.label,
          )}</div>` +
          `<div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:${INDIGO};margin-top:4px;">${escapeHtml(
            k.value,
          )}</div>` +
          `</td>`,
      )
      .join("");
    kpiBlock =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
      `style="border-collapse:collapse;margin:4px 0 22px;"><tr>${cells}</tr></table>`;
  }

  return (
    `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F5F5F8;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F8;padding:24px 0;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid ${HAIR};">` +
    // header band
    `<tr><td style="background:${NEARBLACK};padding:26px 32px;border-bottom:3px solid ${PURPLE};">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;letter-spacing:2px;color:#FFFFFF;">SAERENS ADVERTISING</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:2px;color:${AMBER};margin-top:3px;">VAN CLICKS NAAR KLANTEN</div>` +
    `</td></tr>` +
    // title
    `<tr><td style="padding:28px 32px 6px;">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${PURPLE};font-weight:bold;">Maandrapport Google Ads</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;color:${INK};margin-top:6px;">${escapeHtml(
      clientName,
    )}</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};margin-top:4px;">${escapeHtml(
      periodLabel,
    )} · ${escapeHtml(dateLabel)}</div>` +
    `</td></tr>` +
    // body
    `<tr><td style="padding:18px 32px 4px;">${kpiBlock}${paragraphs}</td></tr>` +
    // footer
    `<tr><td style="padding:18px 32px 26px;border-top:1px solid ${HAIR};">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:${MUTED};">` +
    `Het volledige rapport vind je in de bijgevoegde PDF.<br>Saerens Advertising · Google Ads` +
    `</div></td></tr>` +
    `</table></td></tr></table></body></html>`
  );
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
    },
  };
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
  } = ctx;

  const isGone = () => signal.aborted;

  let priorWork = "";
  let persisted = false;
  let savedId: number | null = null;
  let runStatus = "completed";
  const steps: StepRecord[] = [];
  // For the monthly-report-email deliverable: the client row (for reportEmail)
  // is loaded once at run start and reused by the post-loop email action.
  let reportClient: Client | null = null;
  // Structured live numbers captured at run start; drive the PDF cover/charts.
  let reportMetrics: GoogleAdsMetrics | null = null;

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
    ...extra,
  });

  try {
    // Monthly report: before the team writes, pull the client's *previous
    // calendar month* live Google Ads data and inject it into the selected
    // client doc, so the report is built from real, period-correct numbers.
    // Best-effort: any failure leaves the run with whatever data already exists.
    if (deliverableKind === "monthly-report-email" && !isGone()) {
      const clientId = dbClientIdFromPath(clientPath);
      if (clientId !== null) {
        try {
          reportClient = await getClientRow(clientId);
          const customerId = reportClient?.googleAdsCustomerId?.trim();
          if (customerId) {
            const live = await fetchGoogleAdsReport(customerId, {
              range: "LAST_MONTH",
            });
            reportMetrics = live.metrics;
            const doc = clientDocs.find((d) => d.path === clientPath);
            if (doc && live.text.trim()) {
              doc.content +=
                "\n\n## Google Ads live performance (vorige maand)\n\n" +
                "```\n" +
                live.text.trim() +
                "\n```\n";
            }
          }
        } catch (err) {
          send({
            type: "deliverable_note",
            message:
              "Live Google Ads-data (vorige maand) kon niet opgehaald worden; het rapport gebruikt de bestaande data. " +
              (err instanceof Error ? err.message : String(err)).slice(0, 200),
          });
        }
      }
    }

    for (let i = 0; i < teamPaths.length; i++) {
      if (isGone()) break;

      const path = teamPaths[i];
      const isFinal = i === teamPaths.length - 1;

      let systemPrompt: string;
      try {
        ({ systemPrompt } = await buildGenerationContext({
          agentPath: path,
          clientPath,
          workflowPath,
          extraDocs: clientDocs,
          team: { members: memberTitles, position: i, priorWork, isFinal },
        }));
      } catch (err) {
        steps.push({
          agentPath: path,
          agentTitle: memberTitles[i],
          stepOrder: i,
          role: i === 0 ? "lead" : "member",
          status: "failed",
          durationMs: null,
          inputTokens: null,
          outputTokens: null,
          charCount: null,
          errorMessage: (err instanceof Error
            ? err.message
            : String(err)
          ).slice(0, 500),
        });
        runStatus = "partial";
        await persistRun();
        const message =
          "Kon de context niet samenstellen: " +
          (err instanceof Error ? err.message : String(err));
        send({ error: message });
        return result({ error: message });
      }

      send({
        type: "agent_start",
        index: i,
        total: teamPaths.length,
        agent: { path, title: memberTitles[i] },
        role: i === 0 ? "lead" : "member",
      });

      const startedAt = Date.now();
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
          // Real mid-step failure: record where it broke (keeping partial
          // output), then rethrow so the outer catch archives + reports it.
          steps.push({
            agentPath: path,
            agentTitle: memberTitles[i],
            stepOrder: i,
            role: i === 0 ? "lead" : "member",
            status: "failed",
            durationMs: Date.now() - startedAt,
            inputTokens,
            outputTokens,
            charCount: agentText.length || null,
            errorMessage: (streamErr instanceof Error
              ? streamErr.message
              : String(streamErr)
            ).slice(0, 500),
          });
          runStatus = "partial";
          if (agentText.trim()) {
            priorWork += `\n\n## ${memberTitles[i]}\n\n${agentText.trim()}`;
          }
          throw streamErr;
        }
        // Abort: fall through to the aborted-step path below.
      }

      steps.push({
        agentPath: path,
        agentTitle: memberTitles[i],
        stepOrder: i,
        role: i === 0 ? "lead" : "member",
        status: isGone() ? "aborted" : truncated ? "truncated" : "completed",
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        charCount: agentText.length,
        errorMessage: null,
      });

      if (isGone()) {
        runStatus = "partial";
        break;
      }

      // Keep run-level status consistent with a token-cutoff step.
      if (truncated) runStatus = "partial";

      send({ type: "agent_done", index: i, truncated });
      priorWork += `\n\n## ${memberTitles[i]}\n\n${agentText.trim()}`;
    }

    // Deliverable layer: turn the combined team work into the concrete end
    // product the workflow declares. Best-effort — a failure here never loses
    // the run; it's reported and the run still finishes with the markdown.
    const meta = isGone() ? null : deliverableMeta(deliverableKind, clientName);
    const prompt = meta
      ? buildDeliverablePrompt(deliverableKind, {
          clientName,
          clientContent,
          request,
          teamWork: priorWork,
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
        stepOrder: teamPaths.length,
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
      const teamWork = priorWork.trim();
      try {
        send({ type: "deliverable_start", deliverable: { title: "Maandrapport e-mailen" } });
        if (!recipient) {
          throw new Error(
            "Geen rapport-ontvanger ingesteld voor deze klant (veld 'Rapport-ontvanger').",
          );
        }
        if (!teamWork) {
          throw new Error("Het team leverde geen rapport om te versturen.");
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
                  content: `Klant: ${clientName}\nPeriode: ${periodLabel}\n\nVolledig rapport van het team:\n\n${teamWork}`,
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
        const reportBody = extractFinalReport(teamWork, memberTitles);
        const pdf = await renderReportPdf(reportBody, {
          clientName,
          subtitle: `Maandrapport — ${periodLabel}`,
          dateLabel,
          metrics: reportMetrics,
        });

        const subject = `Maandrapport ${clientName} — ${periodLabel}`;
        const html = buildBrandedEmail({
          clientName,
          periodLabel,
          dateLabel,
          bodyText: emailBody,
          metrics: reportMetrics,
        });

        if (isGone()) throw new Error("Afgebroken voor verzending.");
        await sendEmail({
          to: recipient,
          subject,
          html,
          attachments: [
            {
              filename: `maandrapport-${clientName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")}.pdf`,
              mimeType: "application/pdf",
              content: pdf,
            },
          ],
        });
        send({ type: "deliverable_done", truncated: false });
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
        agentTitle: "Maandrapport e-mailen",
        stepOrder: teamPaths.length + 1,
        role: "deliverable",
        status: actionStatus,
        durationMs: Date.now() - actionStartedAt,
        inputTokens: actionIn,
        outputTokens: actionOut,
        charCount: null,
        errorMessage: actionError,
      });
      if (actionStatus !== "completed") runStatus = "partial";
    }

    if (!isGone()) {
      const archived = await persistRun();
      send({ done: true, archived });
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
