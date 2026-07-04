import type { HandoffBrief } from "./generate-context";
import type { MonitoredTermInput } from "./monitored-terms-store";

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
export function extractMonitorList(text: string): {
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
export function extractFinalReport(teamWork: string, titles: string[]): string {
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

/**
 * Extract ONE agent's bounded section from the team output: the body under the
 * FIRST "## <title>" heading, up to (but excluding) the next "## <boundary>"
 * heading. Unlike `extractFinalReport` (which returns everything after the LAST
 * matching heading to the end), this returns a single, bounded contribution —
 * used to isolate the LEAD author's section for a multi-contributor report where
 * later members only append internal detail rather than rewriting the whole
 * report. Boundaries are the other agents' exact titles; the target title is
 * never its own boundary. Returns "" when the heading is not found.
 */
export function extractAgentSection(
  teamWork: string,
  title: string,
  boundaryTitles: string[],
): string {
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(title);
  if (!target) return "";
  const boundary = new Set(
    boundaryTitles.map(norm).filter((t) => t && t !== target),
  );
  const lines = teamWork.replace(/\r\n/g, "\n").split("\n");
  const h2 = /^##\s+(.+?)\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = h2.exec(lines[i]);
    if (m && norm(m[1]) === target) {
      start = i;
      break;
    }
  }
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = h2.exec(lines[i]);
    if (m && boundary.has(norm(m[1]))) {
      end = i;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

/**
 * Remove ONE agent's "## <title>" section from the team output: the heading and
 * its whole body, up to (but excluding) the next AGENT-boundary heading in
 * `boundaryTitles`, or to end-of-text when none follows. Used to drop the
 * Humanizer's trailing rewrite before harvesting the internal werklijst, so a
 * preserved werklijst is not captured twice.
 *
 * The boundary MUST be the other agents' exact titles — NOT "the next H2 of any
 * kind". A humanized report's body legitimately contains its own H2 sections
 * (e.g. `## Kerncijfers…`) and may even preserve a `## Interne werklijst`
 * verbatim; stopping at the first arbitrary H2 would leave that body (and its
 * duplicated werklijst) behind. The target title is never its own boundary.
 * Returns the text unchanged when the heading is absent.
 */
export function stripAgentSection(
  teamWork: string,
  title: string,
  boundaryTitles: string[],
): string {
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(title);
  if (!target) return teamWork;
  const boundary = new Set(
    boundaryTitles.map(norm).filter((t) => t && t !== target),
  );
  const lines = teamWork.replace(/\r\n/g, "\n").split("\n");
  const h2 = /^##\s+(.+?)\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = h2.exec(lines[i]);
    if (m && norm(m[1]) === target) {
      start = i;
      break;
    }
  }
  if (start < 0) return teamWork;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = h2.exec(lines[i]);
    if (m && boundary.has(norm(m[1]))) {
      end = i;
      break;
    }
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim();
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
 * A NARROWER marker used only to CAPTURE the internal werklijst deliverable
 * (`extractInternalWorklist`). It must match the genuine werklijst/internal-note
 * headings but NOT the reviewer's QC/approval meta ("Menselijke goedkeuring
 * vereist", "approval required") — that commentary is stripped from the client
 * report by the broad `REPORT_INTERNAL_HEADING`, but it is not part of the
 * technical werklijst, so it must never bleed into the internal PDF.
 */
const REPORT_WORKLIST_HEADING =
  /interne werklijst|interne nota|niet voor de klant|intern gebruik|internal worklist|internal note/i;

/**
 * A leading heading that merely restates the report title already printed on the
 * PDF cover (client name + period). The cover carries "SEO-RAPPORT · <client> ·
 * <period>", so an in-body title heading like "Maandelijks SEO-rapport — juni
 * 2026" or "Rapportage — Maandrapport <client>" is pure duplication. Only the
 * FIRST content heading is ever treated this way (see `toClientFacingReport`).
 */
const REPORT_TITLE_RESTATE =
  /^(rapportage|maandelijks|seo[-\s]?rapport|maand(?:rapport|verslag)|kwartaal(?:rapport|verslag))\b/i;
/**
 * An internal attribution / period / author / section-note line the LEAD
 * sometimes emits as a blockquote at the top of its section (e.g.
 * "> Reporting Specialist — Bram", "> Rapportperiode: … | Opgesteld door: …",
 * "> Dit is de klantgerichte sectie …"). Never client-facing. Matched ONLY on
 * blockquote lines so genuine client prose is never touched.
 */
const REPORT_META_BLOCKQUOTE =
  /^>\s*(reporting specialist|seo specialist|dit is de klantgerichte sectie|de interne werklijst|rapportperiode\b|vergelijking\s*:|opgesteld door\b|opgemaakt door\b|auteur\s*:)/i;
/**
 * The start of a sign-off block (greeting + name + agency + contact). The
 * signature lives in the e-mail cover, never the PDF body, so everything from
 * this line to the end of the report is dropped.
 */
const REPORT_SIGNATURE_START =
  /^(met vriendelijke groet(?:en)?|met sportieve groet(?:en)?|vriendelijke groet(?:en)?|beste groet(?:en)?|hoogachtend|met de meeste hoogachting)[,.!]?\s*$/i;

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
  let lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headingRe = /^(#{1,6})\s+(.*?)\s*$/;

  // Drop a leading heading that merely restates the report title already on the
  // PDF cover (client + period). Skip leading blank AND internal meta-blockquote
  // lines when locating that first content heading — the LEAD sometimes emits a
  // meta blockquote above the title (the blockquote itself is stripped below).
  {
    let k = 0;
    while (
      k < lines.length &&
      (lines[k].trim() === "" || REPORT_META_BLOCKQUOTE.test(lines[k].trim()))
    )
      k++;
    const hm = headingRe.exec(lines[k] ?? "");
    if (hm && REPORT_TITLE_RESTATE.test(hm[2].trim())) lines.splice(k, 1);
  }

  // Truncate a trailing sign-off block (greeting + name + agency + contact); the
  // signature belongs to the e-mail cover, never the PDF body.
  for (let k = 0; k < lines.length; k++) {
    if (REPORT_SIGNATURE_START.test(lines[k].trim())) {
      lines = lines.slice(0, k);
      break;
    }
  }

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
    if (REPORT_META_BLOCKQUOTE.test(lines[i].trim())) {
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
 * The counterpart to `toClientFacingReport`: collect the INTERNAL sections a
 * report keeps for the agency + web developer (the "interne werklijst"). Walks
 * markdown headings exactly like `toClientFacingReport`; for every heading whose
 * title matches an internal marker (e.g. "Interne werklijst (niet voor de
 * klant)") it captures that heading and its whole body — including nested
 * subheadings — until the next heading of the same or higher level. Unlike the
 * strip, placeholder-only sections that are NOT internal are never captured
 * here; and an internal section that is itself empty or a bare placeholder stub
 * is skipped. Multiple internal sections are joined with a `---` rule. Returns
 * "" when the report has no usable internal section.
 */
export function extractInternalWorklist(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headingRe = /^(#{1,6})\s+(.*?)\s*$/;
  const sections: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = headingRe.exec(lines[i]);
    if (m && REPORT_WORKLIST_HEADING.test(m[2])) {
      const level = m[1].length;
      let j = i + 1;
      while (j < lines.length) {
        const mj = headingRe.exec(lines[j]);
        if (mj && mj[1].length <= level) break;
        j++;
      }
      const section = lines.slice(i, j).join("\n").trim();
      // Skip an internal section that carries no real content (empty or a bare
      // placeholder stub) so an empty "Interne werklijst" heading never yields
      // a blank internal PDF. Mirrors the stub test in `toClientFacingReport`.
      const body = lines.slice(i + 1, j).join("\n");
      const meaningful = body
        .replace(/^#{1,6}\s+.*$/gm, "") // drop nested subheadings
        .replace(/^>.*$/gm, "")
        .replace(REPORT_PLACEHOLDER, "")
        .replace(/[*_>#`[\]\-\s]/g, "")
        .trim();
      const isStub =
        meaningful.length === 0 ||
        (REPORT_PLACEHOLDER.test(body) && meaningful.length < 40);
      if (!isStub) sections.push(section);
      i = j;
      continue;
    }
    i++;
  }
  return sections.join("\n\n---\n\n").trim();
}

/**
 * Single source of truth for splitting a multi-contributor report into the two
 * deliverables: the SHORT client-facing report (PDF + cover e-mail) and the
 * separate INTERNAL werklijst (agency + web developer, never the client).
 *
 * The client report is authored by the LEAD (`memberTitles[0]`); later members
 * only append technical detail to the internal werklijst rather than rewriting
 * the whole report. So:
 *  - Client report: when the Humanizer rewrote the draft (untruncated) we prefer
 *    its polished section; otherwise we take the LEAD's bounded section. Either
 *    way `toClientFacingReport` strips every internal/placeholder section.
 *  - Internal werklijst: harvested from the whole team body (minus the
 *    Humanizer's trailing rewrite, so a preserved werklijst is not counted
 *    twice). `extractInternalWorklist` captures only genuine werklijst headings.
 *
 * Used by both the deliverable executor (live runs) and the render script
 * (re-render from an archived run) so the two never drift.
 */
export function splitReportDeliverables(
  teamWork: string,
  opts: { memberTitles: string[]; humanizerTitle: string; humanizerRan: boolean },
): { clientReport: string; internalWorklist: string | null } {
  const { memberTitles, humanizerTitle, humanizerRan } = opts;
  const leadTitle = memberTitles[0] ?? "";
  const boundary = [...memberTitles, humanizerTitle];
  // Client report: when the Humanizer ran it is the LAST section, so take its
  // BOUNDED section (never `extractFinalReport`, whose short-body fallback would
  // spill the whole team draft — reviewer/QC meta included — into the client
  // PDF). Fall back to the lead's bounded section, then to the heading-stripped
  // whole only when the draft carries no agent headings at all.
  const clientSource = humanizerRan
    ? stripHumanizerMeta(extractAgentSection(teamWork, humanizerTitle, boundary)) ||
      extractAgentSection(teamWork, leadTitle, boundary) ||
      extractFinalReport(teamWork, memberTitles)
    : extractAgentSection(teamWork, leadTitle, boundary) ||
      extractFinalReport(teamWork, memberTitles);
  const clientReport = toClientFacingReport(clientSource);
  // Internal werklijst: harvest from the whole team body minus the Humanizer's
  // section (bounded to the next agent/EOF, so a preserved werklijst inside the
  // Humanizer's rewrite is not counted twice). The original members' werklijsten
  // remain, so nothing is lost.
  const internalSource = humanizerRan
    ? stripAgentSection(teamWork, humanizerTitle, boundary)
    : teamWork;
  const internalWorklist =
    extractInternalWorklist(internalSource) ||
    extractInternalWorklist(clientSource) ||
    null;
  return { clientReport, internalWorklist };
}
