import type { Client } from "@workspace/db";

/**
 * Briefing fields the AI may PROPOSE values for. These mirror the editable
 * briefing fields in the cliëntfiche (see clients-form.ts FIELDS), minus the
 * fields that can't be inferred from public material (website, landingPages,
 * reportEmail). List fields are returned to the UI as newline-joined strings so
 * they drop straight into the same textareas the user edits.
 */
export const BRIEFING_STRING_KEYS = [
  "business",
  "world",
  "languages",
  "mainGoal",
  "conversionAction",
  "kpis",
  "budget",
  "toneOfVoice",
  "restrictions",
] as const;

export const BRIEFING_LIST_KEYS = [
  "services",
  "audience",
  "locations",
  "channels",
] as const;

export type BriefingKey =
  | (typeof BRIEFING_STRING_KEYS)[number]
  | (typeof BRIEFING_LIST_KEYS)[number];

/**
 * Commercial fields the AI must NOT invent — they are real agreements with the
 * client (goals, KPIs, budget). The model is told to leave them empty unless the
 * source material states them explicitly.
 */
const COMMERCIAL_KEYS: ReadonlySet<string> = new Set([
  "mainGoal",
  "conversionAction",
  "kpis",
  "budget",
]);

const MAX_INTAKE_CHARS = 18_000;
const MAX_LIVE_CHARS = 4_000;

function clamp(value: string | null | undefined, max: number): string {
  const text = (value ?? "").trim();
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…(ingekort)";
}

function block(label: string, value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  return `### ${label}\n${text}`;
}

/**
 * Assemble the raw material the model reasons over: the client's own website
 * text plus any already-pulled live data and the existing briefing (so the model
 * refines rather than blanks fields).
 */
export function buildBriefingContext(client: Client): string {
  const existing = [
    block("Business", client.business),
    block("World", client.world),
    block("Services", client.services),
    block("Target audience", client.audience),
    block("Locations", client.locations),
    block("Languages", client.languages),
    block("Tone of voice", client.toneOfVoice),
    block("Channels", client.channels),
    block("Brand restrictions", client.restrictions),
  ].filter((s): s is string => s !== null);

  const parts: (string | null)[] = [
    `## Client name\n${client.name}`,
    client.website?.trim() ? `## Website URL\n${client.website.trim()}` : null,
    existing.length > 0
      ? `## Existing briefing (refine, do not blindly overwrite)\n${existing.join("\n\n")}`
      : null,
    block(
      "Website content (raw, read from the client's own site)",
      clamp(client.websiteIntake, MAX_INTAKE_CHARS),
    ),
    block("Google Ads (live)", clamp(client.googleAdsLive, MAX_LIVE_CHARS)),
    block(
      "Search Console (live)",
      clamp(client.searchConsoleLive, MAX_LIVE_CHARS),
    ),
    block("Bing Webmaster (live)", clamp(client.bingLive, MAX_LIVE_CHARS)),
    block("GA4 analytics (live)", clamp(client.ga4Live, MAX_LIVE_CHARS)),
    block(
      "Google Maps / Places (live)",
      clamp(client.placesLive, MAX_LIVE_CHARS),
    ),
  ];

  return parts.filter((s): s is string => s !== null).join("\n\n");
}

export const BRIEFING_SCHEMA_HINT = `{
  "suggestions": {
    "business": string,
    "world": "E-commerce" | "Lead generation" | "",
    "services": string[],
    "audience": string[],
    "locations": string[],
    "languages": string,
    "toneOfVoice": string,
    "channels": string[],
    "restrictions": string,
    "mainGoal": string,
    "conversionAction": string,
    "kpis": string,
    "budget": string
  },
  "notes": string
}`;

/** Build the system prompt for proposing briefing-field values. */
export function buildBriefingPrompt(): string {
  return [
    "Je bent de briefing-assistent van het AI-team van Saerens Advertising (een Belgisch Google Ads-bureau).",
    "Je krijgt het ruwe bronmateriaal van één klant: de tekst van hun eigen website, eventueel live data (Google Ads, Search Console, GA4, Maps) en de bestaande briefing.",
    "Jouw taak: stel waarden VOOR voor de briefingvelden van de cliëntfiche, zodat een medewerker ze enkel nog hoeft na te kijken en te bevestigen.",
    "",
    "## Regels",
    "- Baseer je UITSLUITEND op het meegegeven bronmateriaal. Verzin niets.",
    "- Schrijf de waarden in het Nederlands (Vlaams), tenzij het bronmateriaal duidelijk een andere taal voor de klant aangeeft.",
    "- 'world' is exact 'E-commerce' of 'Lead generation' (of leeg als onduidelijk).",
    "- 'services', 'audience', 'locations' en 'channels' zijn arrays van korte items (één begrip per item).",
    "- COMMERCIËLE velden ('mainGoal', 'conversionAction', 'kpis', 'budget') zijn echte afspraken met de klant. Laat ze LEEG ('') tenzij ze expliciet in het bronmateriaal staan. Gok hier nooit.",
    "- Voor alle andere velden: kun je iets redelijk afleiden, vul het in; anders leeg laten.",
    "- Behoud bestaande briefingwaarden wanneer die al goed zijn; verbeter of vul aan waar het bronmateriaal dat ondersteunt.",
    "- 'notes': één korte Nederlandse zin over wat je niet kon afleiden of wat de medewerker zeker moet bevestigen.",
    "",
    "Antwoord met UITSLUITEND geldige JSON volgens dit schema, zonder extra tekst of markdown:",
    BRIEFING_SCHEMA_HINT,
  ].join("\n");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asLines(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => asString(v))
      .filter(Boolean)
      .join("\n");
  }
  return asString(value);
}

export interface BriefingSuggestResult {
  suggestions: Partial<Record<BriefingKey, string>>;
  notes: string;
}

/** Tolerantly parse the model response into clean per-field suggestions. */
export function parseBriefingJson(text: string): BriefingSuggestResult {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Geen JSON gevonden in briefing-antwoord.");
  }
  const parsed = JSON.parse(stripped.slice(start, end + 1)) as Record<
    string,
    unknown
  >;
  const rawSuggestions =
    parsed.suggestions && typeof parsed.suggestions === "object"
      ? (parsed.suggestions as Record<string, unknown>)
      : {};

  const suggestions: Partial<Record<BriefingKey, string>> = {};
  for (const key of BRIEFING_STRING_KEYS) {
    if (COMMERCIAL_KEYS.has(key)) {
      // Pass commercial fields through only if the model put something there;
      // the UI still flags them for confirmation.
      const v = asString(rawSuggestions[key]);
      if (v) suggestions[key] = v;
      continue;
    }
    const v = asString(rawSuggestions[key]);
    if (v) suggestions[key] = v;
  }
  for (const key of BRIEFING_LIST_KEYS) {
    const v = asLines(rawSuggestions[key]);
    if (v) suggestions[key] = v;
  }

  return { suggestions, notes: asString(parsed.notes) };
}
