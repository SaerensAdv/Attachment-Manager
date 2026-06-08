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
  | "slide-deck-prompt"
  | "animated-video-prompt"
  | "data-app-prompt"
  | "monthly-report-email"
  | "google-ads-csv"
  | "negative-keywords-csv"
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
  /**
   * Optional live, read-only data the engine fetched at run start (e.g. a
   * client's real Google Ads ad-group structure) so the deliverable is grounded
   * in real account data rather than invented structure.
   */
  liveData?: string;
}

/** A workflow declares its deliverable with an HTML comment: `<!-- deliverable: replit-prompt -->`. */
const MARKER_RE = /<!--\s*deliverable:\s*([a-z0-9-]+)\s*-->/i;

/**
 * Deliverable kinds the engine knows how to act on. Two flavours:
 * - text deliverables (e.g. replit-prompt) stream a model-generated artifact via
 *   `buildDeliverablePrompt` + `deliverableMeta`.
 * - action deliverables (e.g. monthly-report-email) are handled specially in the
 *   engine (render a PDF, send an email) and have no streamed text prompt.
 */
const KNOWN: ReadonlySet<DeliverableKind> = new Set([
  "replit-prompt",
  "slide-deck-prompt",
  "animated-video-prompt",
  "data-app-prompt",
  "monthly-report-email",
  "google-ads-csv",
  "negative-keywords-csv",
]);

export function getDeliverableKind(workflow: DocFile | null): DeliverableKind {
  if (!workflow) return "markdown";
  const match = workflow.content.match(MARKER_RE);
  const raw = match?.[1]?.toLowerCase() ?? "";
  return KNOWN.has(raw as DeliverableKind)
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
        title: "Replit-bouwprompt (website)",
        note: "Plak deze prompt in een nieuw Replit-project (type: Web App) om de website te laten bouwen. Een mens reviewt en publiceert; niets gaat live.",
        filename: `${slug(clientName)}-website-prompt.md`,
        mimeType: "text/markdown",
        format: "text",
      };
    case "slide-deck-prompt":
      return {
        kind,
        title: "Replit-bouwprompt (slide deck)",
        note: "Plak deze prompt in een nieuw Replit-project (type: Slides) om de presentatie te laten bouwen. Een mens reviewt en exporteert; niets gaat live.",
        filename: `${slug(clientName)}-slide-deck-prompt.md`,
        mimeType: "text/markdown",
        format: "text",
      };
    case "animated-video-prompt":
      return {
        kind,
        title: "Replit-bouwprompt (animatievideo)",
        note: "Plak deze prompt in een nieuw Replit-project (type: Animation) om de video te laten bouwen. Een mens reviewt en rendert; niets gaat live.",
        filename: `${slug(clientName)}-animated-video-prompt.md`,
        mimeType: "text/markdown",
        format: "text",
      };
    case "data-app-prompt":
      return {
        kind,
        title: "Replit-bouwprompt (data-app)",
        note: "Plak deze prompt in een nieuw Replit-project (type: Data Visualization) om het dashboard te laten bouwen. Een mens koppelt de echte data en publiceert; niets gaat live.",
        filename: `${slug(clientName)}-data-app-prompt.md`,
        mimeType: "text/markdown",
        format: "text",
      };
    case "google-ads-csv":
      return {
        kind,
        title: "Google Ads RSA-CSV",
        note: "Controleer en importeer dit CSV-bestand in Google Ads Editor; niets gaat automatisch live.",
        filename: `${slug(clientName)}-ad-copy.csv`,
        mimeType: "text/csv;charset=utf-8",
        format: "text",
      };
    case "negative-keywords-csv":
      return {
        kind,
        title: "Negatieve zoekwoorden-CSV",
        note: "Controleer en importeer dit CSV-bestand in Google Ads Editor; niets gaat automatisch live.",
        filename: `${slug(clientName)}-negatives.csv`,
        mimeType: "text/csv;charset=utf-8",
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
    case "slide-deck-prompt":
      return buildSlideDeckPrompt(ctx);
    case "animated-video-prompt":
      return buildAnimatedVideoPrompt(ctx);
    case "data-app-prompt":
      return buildDataAppPrompt(ctx);
    case "google-ads-csv":
      return buildAdCopyCsvPrompt(ctx);
    case "negative-keywords-csv":
      return buildNegativesCsvPrompt(ctx);
    default:
      return null;
  }
}

/** Exact Google Ads Editor header row for a campaign-level negative keyword import. */
const NEGATIVES_CSV_HEADER =
  "Campaign,Ad group,Keyword,Match Type,Criterion Type";

function buildNegativesCsvPrompt(ctx: DeliverableContext): DeliverablePrompt {
  const system = [
    "You are the deliverable editor of Saerens Advertising's AI team. Your job is NOT to invent new negatives, but to convert the team's approved negative-keyword recommendations into ONE Google Ads Editor-compatible CSV the user can review and bulk-import. Follow knowledge/google-ads-standards.md: negatives are driven by relevance to the client's intent, excluded at campaign level by default.",
    "",
    "## What you receive",
    "- The client context (brand, services, what counts as relevant intent).",
    "- The original request.",
    "- The client's REAL live data when available: active search campaigns, the search terms report (term, campaign, cost, clicks, conversions), and existing campaign-level negatives.",
    "- The team's analysis and approved list of search terms to exclude (with the campaign and, where given, match type).",
    "",
    "## What you return",
    "Output ONLY the CSV text — no intro, no explanation, no markdown, no ``` code fences.",
    `The FIRST line is exactly this header: ${NEGATIVES_CSV_HEADER}`,
    "Then ONE data row per negative keyword.",
    "",
    "## Hard rules",
    "- Wrap EVERY field in double quotes. Escape an internal double quote by doubling it (\"\").",
    '- "Criterion Type" is always "Negative".',
    '- "Ad group" is empty ("") for campaign-level negatives (Saerens default). Only fill an ad group when the team explicitly scoped a negative to one ad group.',
    '- "Match Type" is one of Broad, Phrase, Exact. Use what the team specified; when unspecified, default to "Phrase".',
    "- Use the REAL Campaign name from the live data. If the team named a campaign that is not in the live data, keep the team's name as written.",
    "- Only include a term as a negative when the team recommended a FIRM exclusion. If the team only flagged a term as borderline, 'monitor', or 'to confirm', do NOT add it.",
    "- NEVER add a negative for a term that produced conversions unless the team explicitly says so.",
    "- Read the account's structure from the live campaign names + client context first. When the account is split by search intent (distinct intents visible in the campaign names or stated in the client context), a term that belongs to ANOTHER campaign's intent is mis-routed, not irrelevant: only exclude it from the campaign it does NOT belong to (a cross-campaign negative), and never from the campaign where it IS relevant. Different accounts segment differently (or not at all) — read each on its own terms, never assume.",
    "- Honour the client's documented service scope: never add a negative for a term that matches a service the client offers, or a qualifier that matches their method (e.g. 'zonder hogedruk' for a cleaner that works without high pressure), even if it has not converted yet.",
    "- Do NOT duplicate an existing negative (same campaign + same keyword text + same match type) that already appears in the live 'existing negatives' list.",
    "- Keep the keyword text in the language it was searched in. No emojis, no ALL CAPS. Respect Google Ads policy.",
    "- If there are no usable negatives to add, output only the header row.",
  ].join("\n");

  const user = [
    "## Client context",
    ctx.clientContent.trim(),
    "",
    "## Original request",
    ctx.request.trim(),
    "",
    "## Live negatives data (real account data)",
    ctx.liveData?.trim() ||
      "(no live data available — use the team's recommendations and the campaign names as written)",
    "",
    "## Team's analysis and approved negatives",
    ctx.teamWork.trim() || "(none)",
    "",
    "Now produce the single Google Ads Editor negative-keywords CSV per your instructions.",
  ].join("\n");

  return { system, user };
}

/** Exact Google Ads Editor header row for an RSA bulk import. */
const RSA_CSV_HEADER =
  "Campaign,Ad group,Ad type," +
  Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`).join(",") +
  "," +
  Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`).join(",") +
  ",Path 1,Path 2,Final URL";

function buildAdCopyCsvPrompt(ctx: DeliverableContext): DeliverablePrompt {
  const system = [
    "You are the deliverable editor of Saerens Advertising's AI team. Your job is NOT to invent new offers or claims, but to convert the team's approved Responsive Search Ad (RSA) copy into ONE Google Ads Editor-compatible CSV the user can review and bulk-import. Follow knowledge/ad-copy-standards.md.",
    "",
    "## What you receive",
    "- The client context (brand, audience, tone).",
    "- The original request.",
    "- The client's REAL live SEARCH ad-group structure (campaigns, ad groups, Final URL, display paths, keyword themes, existing RSA copy) when available.",
    "- The team's approved copy (headlines and descriptions per ad group).",
    "",
    "## What you return",
    "Output ONLY the CSV text — no intro, no explanation, no markdown, no ``` code fences.",
    `The FIRST line is exactly this header: ${RSA_CSV_HEADER}`,
    "Then ONE data row per ad group.",
    "",
    "## Hard rules",
    "- Wrap EVERY field in double quotes. Escape an internal double quote by doubling it (\"\").",
    '- The "Ad type" column is always "Responsive search ad".',
    "- Character limits: each headline <= 30 chars, each description <= 90 chars, each display path (Path 1/Path 2) <= 15 chars. Never exceed them; shorten wording instead.",
    "- Provide as many DISTINCT headlines as the team supplied, ideally up to 15, and up to 4 descriptions. Minimum 3 headlines and 2 descriptions per ad group. Leave any unused headline/description slot as an empty quoted field (\"\").",
    "- Do not add pin columns in this version.",
    "- Use the REAL Campaign, Ad group and Final URL from the live structure. If an ad group's Final URL is unknown, put [VUL FINAL URL IN] in that field so the human spots it before upload. Never invent a URL.",
    "- If the team wrote copy for an ad group that is not in the live structure, still include it, using the campaign/ad group names as written and [VUL FINAL URL IN] for the Final URL.",
    "- Keep the copy in the language the team wrote it in (Dutch / NL-BE by default). Do not translate. No emojis, no ALL CAPS, no excessive punctuation; respect Google Ads policy.",
    "- If there is no usable team copy and no live structure, output only the header row.",
  ].join("\n");

  const user = [
    "## Client context",
    ctx.clientContent.trim(),
    "",
    "## Original request",
    ctx.request.trim(),
    "",
    "## Live SEARCH ad-group structure (real account data)",
    ctx.liveData?.trim() || "(no live structure available — mark structure columns for fill-in)",
    "",
    "## Team's approved copy",
    ctx.teamWork.trim() || "(none)",
    "",
    "Now produce the single Google Ads Editor CSV per your instructions.",
  ].join("\n");

  return { system, user };
}

/**
 * Spec for a "Replit build prompt" deliverable. Every build prompt (website,
 * slide deck, animated video, data app) converts the team's markdown into ONE
 * paste-ready prompt for the Replit Agent. The skeleton (`sections`) and the
 * artifact wording differ per kind; the rules, intake and "nothing goes live"
 * guarantee are shared so no single kind is secretly web-biased.
 */
interface BuildPromptSpec {
  /** NL phrase for what gets built, e.g. "de website of landingspagina". */
  artifactNL: string;
  /** Replit app type the user picks when starting the project. */
  replitAppType: string;
  /** Knowledge node that grounds this artifact type, e.g. "knowledge/replit-slide-decks.md". */
  knowledgeRef: string;
  /** Ordered, numbered "## Wat je teruggeeft" section lines. */
  sections: string[];
  /** Optional artifact-specific extra rules appended after the shared rules. */
  extraRules?: string[];
}

function buildBuildPrompt(
  ctx: DeliverableContext,
  spec: BuildPromptSpec,
): DeliverablePrompt {
  const system = [
    `Je bent de eindredacteur van het AI-team van Saerens Advertising. Je taak is NIET om nieuwe inhoud te bedenken, maar om het werk dat het team net leverde om te zetten in één kant-en-klare bouwopdracht (een 'prompt') die de gebruiker rechtstreeks in een nieuw Replit-project (type: ${spec.replitAppType}) kan plakken om ${spec.artifactNL} te laten bouwen.`,
    `Volg ${spec.knowledgeRef} voor wat dit Replit-artefacttype kan en hoe je er goed voor prompt.`,
    "",
    "## Wat je krijgt",
    "- De klantcontext (merk, doelgroep, toon).",
    "- De oorspronkelijke opdracht van de gebruiker.",
    "- Het gezamenlijke werk van het team (structuur, copy/inhoud, designrichting, technische notities).",
    "",
    "## Wat je teruggeeft",
    "Uitsluitend de bouwprompt zelf — geen inleiding, geen uitleg, geen ```-codeblok eromheen. De prompt is in het Nederlands, gericht aan een AI-bouwer (de Replit Agent), en bevat in deze volgorde:",
    ...spec.sections,
    "",
    "## Regels",
    "- Schrijf concreet en compleet, zodat de bouwer meteen aan de slag kan zonder verdere vragen.",
    "- Gebruik NOOIT emoji's of decoratieve symbolen, niet in de prompt zelf en niet in het eindresultaat. Het resultaat moet professioneel en emoji-vrij zijn.",
    "- Verlies geen enkele inhoudelijke beslissing, copy of cijfer uit het teamwerk.",
    "- Behoud bestaande **[AAN TE VULLEN: …]**-markeringen uit het teamwerk ongewijzigd, en laat nieuwe aannames of open punten op dezelfde manier staan in plaats van ze te verzinnen.",
    "- Verzin NOOIT tracking-ID's, pixels, analytics-codes, prijzen, cijfers of claims; laat onbevestigde zaken als duidelijke placeholder staan.",
    "- Niets gaat automatisch live; een mens reviewt, exporteert/rendert en publiceert.",
    "- Geen goedkeuringssectie en geen meta-commentaar — enkel de bouwprompt.",
    ...(spec.extraRules ?? []),
  ].join("\n");

  const user = [
    "## Klantcontext",
    ctx.clientContent.trim(),
    "",
    "## Oorspronkelijke opdracht",
    ctx.request.trim(),
    ...(ctx.liveData?.trim()
      ? ["", "## Live data (echte accountdata)", ctx.liveData.trim()]
      : []),
    "",
    "## Werk van het team",
    ctx.teamWork.trim() || "(geen)",
    "",
    `Zet dit nu om in één kant-en-klare Replit-bouwprompt om ${spec.artifactNL} te laten bouwen, volgens je instructies.`,
  ].join("\n");

  return { system, user };
}

function buildReplitPrompt(ctx: DeliverableContext): DeliverablePrompt {
  return buildBuildPrompt(ctx, {
    artifactNL: "de website of landingspagina",
    replitAppType: "Web App",
    knowledgeRef: "knowledge/replit-prompting.md",
    sections: [
      "1. **Doel & context** — wat moet er gebouwd worden, voor welke klant/business, en het doel van de pagina (de gewenste actie/conversie).",
      "2. **Doelgroep & toon** — voor wie, en de gewenste tone-of-voice.",
      "3. **Paginastructuur** — alle secties van boven naar onder, in volgorde, met per sectie de bedoeling.",
      "4. **Inhoud & copy** — de concrete teksten per sectie (koppen, paragrafen, knoppen/CTA's) zoals het team ze leverde. Verzin geen nieuwe copy; neem de definitieve copy uit het teamwerk over en behoud [AAN TE VULLEN: …]-markeringen ongewijzigd.",
      "5. **Merk & visueel** — kleuren, lettertypes, logo, beeldstijl en eventuele merkrestricties uit de klantcontext en de designrichting.",
      "6. **Functioneel & technisch** — responsief en mobiel-first, toegankelijk, snelle laadtijd; formulieren/CTA's die werken; en alle technische notities van het team.",
      "7. **Belangrijke regels** — verzin NOOIT tracking-ID's, pixels of analytics-codes; laat die als duidelijke placeholder staan.",
    ],
    extraRules: [
      "- Bij een site met meerdere pagina's: zet de paginastructuur en de copy per pagina/sectie apart en overzichtelijk neer, zodat de bouwer pagina per pagina kan bouwen in plaats van alles in één blok.",
    ],
  });
}

function buildSlideDeckPrompt(ctx: DeliverableContext): DeliverablePrompt {
  return buildBuildPrompt(ctx, {
    artifactNL: "de presentatie (slide deck)",
    replitAppType: "Slides",
    knowledgeRef: "knowledge/replit-slide-decks.md",
    sections: [
      "1. **Doel & doelgroep** — wat de presentatie moet bereiken en voor wie (de zaal).",
      "2. **Verhaallijn** — de slides in volgorde, met per slide één duidelijk doel (één idee per slide).",
      "3. **Inhoud per slide** — de kop en de concrete bullets/cijfers per slide zoals het team ze leverde; verzin geen cijfers.",
      "4. **Visueel per slide** — grafieken (welk type en op basis van welke data), iconen, beeldrichting.",
      "5. **Thema & merk** — kleuren, lettertypes en stijl, geënt op het merk van de klant; licht of donker.",
      "6. **Aantal slides & export** — een expliciet aantal slides; bouw als React-deck dat exporteerbaar is naar PPTX/Google Slides/PDF.",
      "7. **Belangrijke regels** — verzin geen logo's, testimonials of cijfers; gebruik duidelijke placeholders.",
    ],
  });
}

function buildAnimatedVideoPrompt(ctx: DeliverableContext): DeliverablePrompt {
  return buildBuildPrompt(ctx, {
    artifactNL: "de geanimeerde video",
    replitAppType: "Animation",
    knowledgeRef: "knowledge/replit-animated-videos.md",
    sections: [
      "1. **Doel & lengte** — waar de video voor dient en een richtduur (explainers/promo's werken best op ~30–60s).",
      "2. **Storyboard per scène** — elke scène in volgorde met: wat er te zien is, de tekst/overlay op het scherm, en de overgang naar de volgende scène.",
      "3. **Visuele stijl** — kleurenschema, typografie, sfeer en tempo.",
      "4. **Merk & assets** — logo en waar het verschijnt (bv. een logo-reveal op het einde), merkkleuren en beeldrichting.",
      "5. **Afsluiting/CTA** — de slotboodschap of call-to-action.",
      "6. **Technisch** — React-motion graphics (geen Remotion, geen AI-gegenereerde video), auto-play loop, exporteerbaar als MP4 (720p/1080p, 16:9).",
      "7. **Belangrijke regels** — verzin geen claims, prijzen of cijfers; gebruik duidelijke placeholders.",
    ],
  });
}

function buildDataAppPrompt(ctx: DeliverableContext): DeliverablePrompt {
  return buildBuildPrompt(ctx, {
    artifactNL: "het interactieve dashboard (data-app)",
    replitAppType: "Data Visualization",
    knowledgeRef: "knowledge/replit-data-apps.md",
    sections: [
      "1. **Doel** — welke beslissing het dashboard ondersteunt en wat het moet tonen/volgen.",
      "2. **Databron & koppeling** — exact waar de data leeft en hoe te koppelen (Replit DB, warehouse-connector, externe API of geüpload bestand); verzin nooit een databron.",
      "3. **Metrics/KPI's** — de concrete cijfers die zichtbaar moeten zijn, geënt op het werk van het team; verzin geen data.",
      "4. **Grafiektypes** — welk visueel voor welke metric (trendlijn, balk per campagne, tabel, single-stat tegel).",
      "5. **Filters & interactie** — bv. datumbereik, campagne-/regioselector, zoekbalk, drill-downs.",
      "6. **Layout & merk** — groepering en prioriteit van tegels; kleuren/typografie in het merk; licht/donker.",
      "7. **Ingebouwd** — refresh/auto-refresh, export naar PDF, grafiekdata naar CSV, en een korte analyse-samenvatting.",
      "8. **Belangrijke regels** — verzin geen metrics, rijen of koppelingen; gebruik duidelijke placeholders.",
    ],
  });
}
