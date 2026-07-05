/**
 * Visual Studio domain model. A "visual" is a branded LinkedIn asset rendered
 * from real DOM (text stays crisp HTML, never pixels in an AI image) in one of
 * three formats: carousel (documentpost, 4:5), single image (4:5) or quote
 * card (1:1). All copy is editable in the studio; AI only pre-fills.
 */
export type VisualFormat = "carousel" | "single" | "quote";
export type VisualTheme = "dark" | "light";

export interface SlideContent {
  kicker: string;
  title: string;
  body: string;
}

export interface StudioContent {
  format: VisualFormat;
  theme: VisualTheme;
  slides: SlideContent[];
  single: { kicker: string; headline: string; sub: string };
  quote: { quote: string; attribution: string };
  /** Optional AI-generated background as a data URL (export-safe, no CORS). */
  backgroundImage: string | null;
  /** Suggested gpt-image-1 prompt, editable before generating. */
  imagePrompt: string;
}

export const CANVAS_SIZES: Record<VisualFormat, { w: number; h: number }> = {
  carousel: { w: 1080, h: 1350 },
  single: { w: 1080, h: 1350 },
  quote: { w: 1080, h: 1080 },
};

export const FORMAT_LABELS: Record<VisualFormat, string> = {
  carousel: "Carrousel (documentpost)",
  single: "Losse afbeelding",
  quote: "Quote-card",
};

export function emptySlide(): SlideContent {
  return { kicker: "", title: "", body: "" };
}

/** Dutch sample content so the studio never opens on an empty artboard. */
export function defaultContent(): StudioContent {
  return {
    format: "carousel",
    theme: "dark",
    slides: [
      {
        kicker: "Google Ads",
        title: "Waarom je ROAS liegt zonder goede tracking",
        body: "",
      },
      {
        kicker: "Stap 1",
        title: "Meet wat een lead écht waard is",
        body: "Niet elke conversie is gelijk. Koppel je conversiewaarde aan marge, niet aan omzet — anders stuurt Google op de verkeerde klanten.",
      },
      {
        kicker: "Stap 2",
        title: "Sluit de datalek in je funnel",
        body: "Telefonische leads die nergens geregistreerd worden? Dat is budget dat onzichtbaar verdampt. Meet oproepen apart van formulieren.",
      },
      {
        kicker: "Conclusie",
        title: "Eerst meten, dan schalen",
        body: "Volg ons voor meer praktische Google Ads-inzichten voor Belgische KMO's.",
      },
    ],
    single: {
      kicker: "Google Ads",
      headline: "3,93× gemiddelde ROAS voor onze klanten",
      sub: "Van clicks naar klanten — zonder jaarcontract.",
    },
    quote: {
      quote:
        "Wie zijn tracking niet op orde heeft, betaalt Google om te gokken.",
      attribution: "Axel Saerens — Saerens Advertising",
    },
    backgroundImage: null,
    imagePrompt: "",
  };
}

/** sessionStorage key used to hand a post concept from the archive to the studio. */
export const VISUAL_SOURCE_KEY = "visual-studio-source";

export interface PostConcept {
  label: string;
  text: string;
}

/**
 * Split a team-run's markdown into individual post concepts. Content runs
 * usually mark variants with headings like "## Variant 1" or "### Post 2 — …";
 * anything without such headings falls back to one concept with the full text,
 * and the studio always keeps free-text paste as the escape hatch.
 */
export function extractPostConcepts(markdown: string): PostConcept[] {
  const lines = markdown.split("\n");
  const raw: { label: string; body: string[] }[] = [];
  let current: { label: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m && /\b(variant|concept|optie|idee|post)\b/i.test(m[1])) {
      if (current) raw.push(current);
      current = { label: m[1].replace(/[*_`#]/g, "").trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) raw.push(current);

  const usable = raw
    .map((c) => ({ label: c.label, text: c.body.join("\n").trim() }))
    .filter((c) => c.text.length >= 40);
  if (usable.length > 0) return usable;

  const text = markdown.trim();
  return text ? [{ label: "Volledige output", text }] : [];
}
