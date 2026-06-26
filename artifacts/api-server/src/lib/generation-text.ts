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
