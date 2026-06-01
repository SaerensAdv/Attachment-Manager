import type { DocFile } from "./docs";

/**
 * A deliverable is the concrete end product a workflow produces, on top of the
 * team's written markdown. The "deliverable layer" runs after the agent team
 * finishes and converts their combined work into the right artifact (a ready-to-
 * paste Replit prompt, a Google Ads bulk CSV, a Meta ad image, …).
 *
 * "markdown" means there is no special deliverable — the combined team output is
 * the result, exactly as before.
 */
export type DeliverableKind =
  | "replit-prompt"
  | "google-ads-csv"
  | "meta-ad-image"
  | "markdown";

export interface DeliverableMeta {
  kind: DeliverableKind;
  /** Human-readable label shown in the UI. */
  title: string;
  /** Short one-line note explaining what to do with the file. */
  note: string;
  filename: string;
  mimeType: string;
  /**
   * "text" deliverables stream as deltas (like an agent). "binary" deliverables
   * (added later: CSV/XLSX/PNG) arrive as a single base64 payload.
   */
  format: "text" | "binary";
}

export interface DeliverablePrompt {
  system: string;
  user: string;
}

export interface DeliverableContext {
  clientName: string;
  clientContent: string;
  request: string;
  /** The combined markdown the agent team just produced. */
  teamWork: string;
}

/** A workflow declares its deliverable with an HTML comment: `<!-- deliverable: replit-prompt -->`. */
const MARKER_RE = /<!--\s*deliverable:\s*([a-z0-9-]+)\s*-->/i;

/** Deliverable kinds that are fully implemented (have meta + a builder). */
const IMPLEMENTED: ReadonlySet<DeliverableKind> = new Set(["replit-prompt"]);

export function getDeliverableKind(workflow: DocFile | null): DeliverableKind {
  if (!workflow) return "markdown";
  const match = workflow.content.match(MARKER_RE);
  const raw = match?.[1]?.toLowerCase() ?? "";
  return IMPLEMENTED.has(raw as DeliverableKind)
    ? (raw as DeliverableKind)
    : "markdown";
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "saerens"
  );
}

export function deliverableMeta(
  kind: DeliverableKind,
  clientName: string,
): DeliverableMeta | null {
  switch (kind) {
    case "replit-prompt":
      return {
        kind,
        title: "Replit-projectprompt",
        note: "Plak deze prompt in een nieuw Replit-project om de pagina te laten bouwen.",
        filename: `${slug(clientName)}-replit-prompt.md`,
        mimeType: "text/markdown",
        format: "text",
      };
    default:
      return null;
  }
}

export function buildDeliverablePrompt(
  kind: DeliverableKind,
  ctx: DeliverableContext,
): DeliverablePrompt | null {
  switch (kind) {
    case "replit-prompt":
      return buildReplitPrompt(ctx);
    default:
      return null;
  }
}

function buildReplitPrompt(ctx: DeliverableContext): DeliverablePrompt {
  const system = [
    "Je bent de eindredacteur van het AI-team van Saerens Advertising. Je taak is NIET om nieuwe inhoud te bedenken, maar om het werk dat het team net leverde om te zetten in één kant-en-klare bouwopdracht (een 'prompt') die de gebruiker rechtstreeks in een nieuw Replit-project kan plakken om de website of landingspagina te laten bouwen.",
    "",
    "## Wat je krijgt",
    "- De klantcontext (merk, doelgroep, toon).",
    "- De oorspronkelijke opdracht van de gebruiker.",
    "- Het gezamenlijke werk van het team (paginastructuur, copy, designrichting, technische notities).",
    "",
    "## Wat je teruggeeft",
    "Uitsluitend de bouwprompt zelf — geen inleiding, geen uitleg, geen ```-codeblok eromheen. De prompt is in het Nederlands, gericht aan een AI-bouwer, en bevat in deze volgorde:",
    "1. **Doel & context** — wat moet er gebouwd worden, voor welke klant/business, en het doel van de pagina (de gewenste actie/conversie).",
    "2. **Doelgroep & toon** — voor wie, en de gewenste tone-of-voice.",
    "3. **Paginastructuur** — alle secties van boven naar onder, in volgorde, met per sectie de bedoeling.",
    "4. **Inhoud & copy** — de concrete teksten per sectie (koppen, paragrafen, knoppen/CTA's) zoals het team ze leverde. Verzin geen nieuwe copy; gebruik wat er is en behoud [AAN TE VULLEN: …]-markeringen ongewijzigd.",
    "5. **Merk & visueel** — kleuren, lettertypes, logo, beeldstijl en eventuele merkrestricties uit de klantcontext en de designrichting.",
    "6. **Functioneel & technisch** — responsief en mobiel-first, toegankelijk, snelle laadtijd; formulieren/CTA's die werken; en alle technische notities van het team.",
    "7. **Belangrijke regels** — verzin NOOIT tracking-ID's, pixels of analytics-codes; laat die als duidelijke placeholder staan. Niets gaat automatisch live; een mens reviewt en publiceert.",
    "",
    "## Regels",
    "- Schrijf concreet en compleet, zodat de bouwer meteen aan de slag kan zonder verdere vragen.",
    "- Verlies geen enkele inhoudelijke beslissing of copy uit het teamwerk.",
    "- Laat aannames en open punten staan als **[AAN TE VULLEN: …]** in plaats van ze te verzinnen.",
    "- Geen goedkeuringssectie en geen meta-commentaar — enkel de bouwprompt.",
  ].join("\n");

  const user = [
    "## Klantcontext",
    ctx.clientContent.trim(),
    "",
    "## Oorspronkelijke opdracht",
    ctx.request.trim(),
    "",
    "## Werk van het team",
    ctx.teamWork.trim() || "(geen)",
    "",
    "Zet dit nu om in één kant-en-klare Replit-bouwprompt volgens je instructies.",
  ].join("\n");

  return { system, user };
}
