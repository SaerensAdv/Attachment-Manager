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
 * Saerens Advertising house style, injected verbatim into agency-authored build
 * prompts (decks, dashboards, agency promos) so the built artifact looks like the
 * branded Saerens report instead of generic output. Concrete tokens are kept here
 * (agency-constant) and mirror `knowledge/saerens-brand.md` / `report-pdf.ts`.
 */
const SAERENS_HOUSE_STYLE = [
  "## Saerens-huisstijl",
  "Dit is bureau-afzendermateriaal: Saerens Advertising is de afzender. Pas de Saerens-huisstijl actief toe in het ontwerp (zoals het Saerens Google Ads-rapport) — niet als losse placeholder.",
  '- Bureau: Saerens Advertising — officieel Google Partner-bureau voor Google Ads, 100% remote, actief in Vlaanderen en Nederland.',
  "- Werkwijze (gebruik als copy waar relevant, niet als placeholder): vaste maandelijkse vergoeding, geen opstartkosten, geen jaarcontract, maandelijks opzegbaar, transparant via een live dashboard, eerlijk advies, reactie binnen 24 uur.",
  "- Kleurenpalet: achtergrond near-black #0A0A0B, indigo #29274E, paars #716BEB (primair accent), amber #F4A425 (CTA-accent), tekst-inkt #1A1A22, gedempt grijs #6B6B72, wit #FFFFFF, lichtpaneel #F5F5F8, haarlijn #E4E2EE.",
  "- Typografie: koppen in 'Plus Jakarta Sans', bodytekst in 'Outfit' (beide via Google Fonts). Gebruik deze lettertypes overal, ook als het team een ander (generiek) lettertype zoals Inter voorstelde — voor merkelementen (kleuren, lettertypes, logo) gaat de huisstijl vóór op generieke teamkeuzes.",
  '- Logo & merk: gebruik het woordmerk "SAERENS ADVERTISING" (in Plus Jakarta Sans, lichte letterspatiëring) met een "SA"-monogram. Het merkteken staat op https://saerensadvertising.com/SA_logo-100.webp (eenkleurig lijn-logo; op een donkere achtergrond wit maken met CSS-filter brightness(0) invert(1)).',
  "- Stijl: zoals het Saerens-rapport — een donkere cover/openingsscherm (near-black met paars + amber accenten en het witte SA-merk), gevolgd door lichte inhoud; pill-vormige knoppen; ruime witruimte; zakelijk, helder, vertrouwenwekkend; nooit emoji's.",
  "- Contact (bureau): contactpersoon Axel Saerens, e-mail axel@saerensadvertising.com, website saerensadvertising.com. Vul deze in i.p.v. ze open te laten; laat enkel een echt onbekend gegeven (bv. telefoonnummer) als placeholder staan.",
  "- Bewijspunten (echte cijfers, laatste 365 dagen — alleen op bureau-afzendermateriaal en alleen als de context erom vraagt): 3,93x gemiddelde ROAS, 1,58 miljoen euro conversiewaarde, 1.820+ leads, 456.000 euro beheerd advertentiebudget. Verzin nooit andere cijfers.",
].join("\n");

const SAERENS_SIGNATURE = [
  "## Saerens-signatuur",
  "Bij dit artefact staat het merk van de klant centraal in de inhoud en het ontwerp. Saerens Advertising verschijnt alleen als afzender-signatuur — gebruik de huisstijl NIET om het klantmerk te vervangen of te overschaduwen.",
  '- Beperk de Saerens-aanwezigheid tot een afsluitende signatuur (bv. een korte logo-reveal of eindkaart): het woordmerk "SAERENS ADVERTISING" met "SA"-monogram.',
  "- Logo: het merkteken staat op https://saerensadvertising.com/SA_logo-100.webp (eenkleurig lijn-logo; op een donkere achtergrond wit maken met CSS-filter brightness(0) invert(1)).",
  "- Saerens-accentkleuren (alleen subtiel in de signatuur, niet in de hele klantinhoud): paars #716BEB, amber #F4A425, near-black #0A0A0B.",
  "- Vermeld geen bureau-bewijspunten (ROAS, conversiewaarde, leads, budget) en geen bureau-werkwijze op klant-afzendermateriaal — die horen alleen op materiaal waar Saerens zelf de afzender is.",
  "- Contact in de signatuur indien relevant: Axel Saerens, axel@saerensadvertising.com, saerensadvertising.com.",
].join("\n");

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
  /**
   * Whose brand leads, which decides if the Saerens house style is injected:
   * - "agency": Saerens is the author (deck, dashboard) — full house style.
   * - "client": the client's own product (website) — client brand leads, no house style.
   * - "client+signature": client brand leads the content, Saerens signs it (a logo
   *   reveal / end-card + accent colours), e.g. a product explainer video.
   */
  brand: "agency" | "client" | "client+signature";
  /** Optional artifact-specific extra rules appended after the shared rules. */
  extraRules?: string[];
}

function buildBuildPrompt(
  ctx: DeliverableContext,
  spec: BuildPromptSpec,
): DeliverablePrompt {
  const today = new Date().toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });
  const brandBlock =
    spec.brand === "client"
      ? [
          "",
          "## Merk",
          "- Dit artefact is het eigen product van de klant: het merk van de klant staat centraal. Gebruik de merk- en visuele identiteit uit de klantcontext (kleuren, lettertypes, logo, beeldstijl). Leg de Saerens-huisstijl hier NIET op.",
        ]
      : spec.brand === "client+signature"
        ? ["", SAERENS_SIGNATURE]
        : ["", SAERENS_HOUSE_STYLE];
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
    "- Vul alles in wat al bekend is, in plaats van het als placeholder te laten staan: de datum van vandaag (zie 'Vandaag'), de bureaugegevens (zie 'Saerens-huisstijl', indien aanwezig) en alle klantgegevens uit de klantcontext (bedrijfsnaam, sector, website, toon).",
    "- Los bestaande **[AAN TE VULLEN: …]**-markeringen uit het teamwerk op zodra het antwoord blijkt uit die bronnen; laat alleen markeringen staan die echt opdracht- of klantspecifiek én onbekend blijven (bv. exact maandtarief, opzegtermijn, telefoonnummer). Verzin nooit een ontbrekend gegeven.",
    "- Verzin NOOIT tracking-ID's, pixels, analytics-codes, prijzen, cijfers of claims; laat onbevestigde zaken als duidelijke placeholder staan.",
    "- Niets gaat automatisch live; een mens reviewt, exporteert/rendert en publiceert.",
    "- Geen goedkeuringssectie en geen meta-commentaar — enkel de bouwprompt.",
    ...(spec.extraRules ?? []),
    ...brandBlock,
  ].join("\n");

  const user = [
    "## Vandaag",
    today,
    "",
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
    brand: "client",
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
    brand: "agency",
    sections: [
      "1. **Doel & doelgroep** — wat de presentatie moet bereiken en voor wie (de zaal).",
      "2. **Verhaallijn** — de slides in volgorde, met per slide één duidelijk doel (één idee per slide).",
      "3. **Inhoud per slide** — de kop en de concrete bullets/cijfers per slide zoals het team ze leverde; verzin geen cijfers.",
      "4. **Visueel per slide** — grafieken (welk type en op basis van welke data), iconen, beeldrichting.",
      "5. **Thema, merk & lay-out** — pas de Saerens-huisstijl én de vaste Saerens-decklay-out toe (zie 'Saerens-huisstijl'):\n   - Donkere cover én slotslide (bijna-zwart #0A0A0B) met zachte paars/indigo blur-orbs en een dunne paars→amber gradient-lijn aan één rand; linksboven het wit getinte SA-logo met de woordmerk 'SAERENS ADVERTISING' (geen tagline).\n   - Lichte inhoudsslides (#F5F5F8, inkt #1A1A22): elke slide opent met een paarse boventitel (uppercase, ruim gespatieerd) boven een grote display-kop; inhoud in witte kaarten met dunne hairline-rand (#E4E2EE) en zachte ronding.\n   - Rechtsboven op elke inhoudsslide klein de woordmerk 'SAERENS ADVERTISING'; onderaan links een bronregel en onderaan rechts het paginanummer (bv. '04 / 11').\n   - Herbruikbare blokken: stat-kaarten (label + groot cijfer + context), een vergelijkingstabel (statistiek · vorige · huidige · verschil, negatieven in rood #C0392B), eenvoudige staafdiagrammen met div's (geen externe chartlib), bevindingen als korte bullets met paarse markers naast één opvallende callout-kaart (amber rand) of een donkere indigo banner (#29274E), en een prioriteitentabel met pill-labels (amber 'Hoog', grijs 'Midden').\n   - Schaal alles in vw/vh zodat de slides op elk scherm en bij export identiek ogen. Plus Jakarta Sans (koppen), Outfit (body), paars #716BEB als structuuraccent en amber #F4A425 voor cover/slot en de belangrijkste highlight; pill-knoppen; nooit emoji's.",
      "6. **Aantal slides & export** — een expliciet aantal slides; bouw als React-deck dat exporteerbaar is naar PPTX/Google Slides/PDF.",
      "7. **Belangrijke regels** — verzin geen testimonials of cijfers; gebruik de echte Saerens-bewijspunten alleen waar de context erom vraagt, en duidelijke placeholders voor de rest.",
    ],
  });
}

function buildAnimatedVideoPrompt(ctx: DeliverableContext): DeliverablePrompt {
  return buildBuildPrompt(ctx, {
    artifactNL: "de geanimeerde video",
    replitAppType: "Animation",
    knowledgeRef: "knowledge/replit-animated-videos.md",
    brand: "client+signature",
    sections: [
      "1. **Doel & lengte** — waar de video voor dient en een richtduur (explainers/promo's werken best op ~30–60s).",
      "2. **Storyboard per scène** — elke scène in volgorde met: wat er te zien is, de tekst/overlay op het scherm, en de overgang naar de volgende scène.",
      "3. **Visuele stijl** — kleurenschema, typografie, sfeer en tempo.",
      "4. **Merk & assets** — het merk van de klant staat centraal in de inhoud; sluit af met een Saerens-logo-reveal/eindkaart in de Saerens-huisstijl (zie 'Saerens-huisstijl') met de tagline en het SA-merk, en gebruik de Saerens-accentkleuren (paars #716BEB, amber #F4A425) voor de signatuur.",
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
    brand: "agency",
    sections: [
      "1. **Doel** — welke beslissing het dashboard ondersteunt en wat het moet tonen/volgen.",
      "2. **Databron & koppeling** — exact waar de data leeft en hoe te koppelen (Replit DB, warehouse-connector, externe API of geüpload bestand); verzin nooit een databron.",
      "3. **Metrics/KPI's** — de concrete cijfers die zichtbaar moeten zijn, geënt op het werk van het team; verzin geen data.",
      "4. **Grafiektypes** — welk visueel voor welke metric (trendlijn, balk per campagne, tabel, single-stat tegel).",
      "5. **Filters & interactie** — bv. datumbereik, campagne-/regioselector, zoekbalk, drill-downs.",
      "6. **Layout & merk** — groepering en prioriteit van tegels; pas de Saerens-huisstijl toe (zie 'Saerens-huisstijl'): donker dashboard-chrome met paars/amber accenten en het witte SA-merk in de header, Plus Jakarta Sans (koppen) en Outfit (body).",
      "7. **Ingebouwd** — refresh/auto-refresh, export naar PDF, grafiekdata naar CSV, en een korte analyse-samenvatting.",
      "8. **Belangrijke regels** — verzin geen metrics, rijen of koppelingen; gebruik duidelijke placeholders.",
    ],
  });
}
