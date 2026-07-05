/**
 * Visual Studio content planning: one model call turns a LinkedIn post concept
 * into editable content for ALL visual formats (carousel slides, single image,
 * quote card) plus a recommended format and a suggested background prompt.
 * Nothing is persisted — the studio pre-fills its editor and the user edits.
 */

export const VISUAL_FORMATS = ["carousel", "single", "quote"] as const;
export type VisualFormat = (typeof VISUAL_FORMATS)[number];

export interface VisualSlide {
  kicker: string;
  title: string;
  body: string;
}

export interface VisualPlan {
  format: VisualFormat;
  slides: VisualSlide[];
  single: { kicker: string; headline: string; sub: string };
  quote: { quote: string; attribution: string };
  imagePrompt: string;
  notes: string;
}

const SCHEMA_HINT = `{
  "format": "carousel" | "single" | "quote",
  "slides": [{ "kicker": string, "title": string, "body": string }],
  "single": { "kicker": string, "headline": string, "sub": string },
  "quote": { "quote": string, "attribution": string },
  "imagePrompt": string,
  "notes": string
}`;

/** Build the system prompt for the visual content plan. */
export function buildVisualPlanPrompt(
  forcedFormat: VisualFormat | null,
): string {
  return [
    "Je bent de visual-designer van Saerens Advertising (een Belgisch Google Ads-bureau). De huisstijl is donker en strak: bijna-zwart, paars en amber, grote koppen.",
    "Je krijgt de tekst van ÉÉN LinkedIn-postconcept. Zet die om in kant-en-klare content voor drie visualformaten: een carrousel (documentpost), een losse afbeelding en een quote-card. De gebruiker kiest en bewerkt daarna zelf.",
    "",
    "## Regels",
    "- Schrijf in het Nederlands (Vlaams), in de toon van de bronpost. Baseer je UITSLUITEND op de bronpost: verzin geen cijfers, claims of namen.",
    "- 'slides' (carrousel): 3 tot 7 slides. Slide 1 is de cover: een sterke hook als titel, body leeg of één korte zin. De laatste slide rondt af (conclusie of duidelijke call-to-action). Kicker: 1–3 woorden. Titel: maximaal 9 woorden. Body: 1 à 3 korte zinnen.",
    "- 'single': kicker 1–3 woorden, kop van maximaal 10 woorden, sub van één zin.",
    "- 'quote': één krachtige uitspraak van maximaal 140 tekens, in de stem van de auteur. 'attribution' is \"Axel Saerens — Saerens Advertising\" tenzij de bron duidelijk iemand anders citeert.",
    forcedFormat
      ? `- 'format' is verplicht "${forcedFormat}" (door de gebruiker gekozen).`
      : "- 'format': kies het formaat dat dit concept het best draagt (een opsomming of stappenplan → carousel; één sterke stelling of cijfer → single; een uitgesproken mening of oneliner → quote).",
    "- 'imagePrompt': een Engelstalige prompt voor een abstracte of fotografische ACHTERGROND die bij het onderwerp past. Absoluut geen tekst, letters, cijfers of logo's in het beeld; donker en rustig genoeg om witte tekst op te leggen. Laat leeg (\"\") als een effen branded achtergrond beter werkt.",
    "- 'notes': één korte Nederlandse zin met advies voor de gebruiker (mag leeg zijn).",
    "",
    "Antwoord met UITSLUITEND geldige JSON volgens dit schema, zonder extra tekst of markdown:",
    SCHEMA_HINT,
  ].join("\n");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const MAX_SLIDES = 10;

/**
 * Tolerantly parse the model response into a clean VisualPlan. Throws when no
 * usable JSON or no usable content is found (the route retries once, then 502s).
 */
export function parseVisualPlanJson(
  text: string,
  forcedFormat: VisualFormat | null,
): VisualPlan {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Geen JSON gevonden in het visualplan-antwoord.");
  }
  const parsed = JSON.parse(stripped.slice(start, end + 1)) as Record<
    string,
    unknown
  >;

  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  const slides: VisualSlide[] = rawSlides
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      kicker: asString(s.kicker),
      title: asString(s.title),
      body: asString(s.body),
    }))
    .filter((s) => s.title.length > 0)
    .slice(0, MAX_SLIDES);

  const rawSingle =
    parsed.single && typeof parsed.single === "object"
      ? (parsed.single as Record<string, unknown>)
      : {};
  const single = {
    kicker: asString(rawSingle.kicker),
    headline: asString(rawSingle.headline),
    sub: asString(rawSingle.sub),
  };

  const rawQuote =
    parsed.quote && typeof parsed.quote === "object"
      ? (parsed.quote as Record<string, unknown>)
      : {};
  const quote = {
    quote: asString(rawQuote.quote),
    attribution: asString(rawQuote.attribution),
  };

  if (slides.length === 0 && !single.headline && !quote.quote) {
    throw new Error("Het visualplan bevat geen bruikbare content.");
  }

  const modelFormat = asString(parsed.format) as VisualFormat;
  let format: VisualFormat =
    forcedFormat ??
    (VISUAL_FORMATS.includes(modelFormat) ? modelFormat : "single");
  // Never recommend a format we got no content for.
  if (format === "carousel" && slides.length === 0) format = "single";
  if (format === "single" && !single.headline)
    format = quote.quote ? "quote" : "carousel";
  if (format === "quote" && !quote.quote)
    format = single.headline ? "single" : "carousel";

  return {
    format,
    slides,
    single,
    quote,
    imagePrompt: asString(parsed.imagePrompt),
    notes: asString(parsed.notes),
  };
}
