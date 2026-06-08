import type { Client, ClientInput } from "@workspace/api-client-react";

// `groupId` is numeric and lives outside the string-only form state (it is
// managed separately in the editor, not as a text field).
export type FieldKey = Exclude<keyof ClientInput, "name" | "groupId">;

export type FormState = Record<Exclude<keyof ClientInput, "groupId">, string>;

export interface FieldDef {
  key: FieldKey;
  label: string;
  kind: "input" | "textarea" | "list";
  placeholder?: string;
  help?: string;
}

// One source of truth for the editor form, mirroring clients/_template.md.
// "list" fields render as a textarea where every line becomes a bullet in the
// generated markdown brain.
export const FIELDS: FieldDef[] = [
  {
    key: "business",
    label: "Business",
    kind: "textarea",
    placeholder: "Wat doet het bedrijf? Welke producten/diensten verkopen ze?",
  },
  {
    key: "world",
    label: "Wereld",
    kind: "input",
    placeholder: "E-commerce of Lead generation",
  },
  {
    key: "services",
    label: "Diensten / producten",
    kind: "list",
    placeholder: "Eén dienst of product per regel",
    help: "Eén per regel",
  },
  {
    key: "audience",
    label: "Doelgroep",
    kind: "list",
    placeholder: "Eén doelgroep per regel",
    help: "Eén per regel",
  },
  {
    key: "locations",
    label: "Locaties / regio's",
    kind: "list",
    placeholder: "Bv. Vlaanderen, Brussel, heel België",
    help: "Eén per regel",
  },
  {
    key: "languages",
    label: "Talen",
    kind: "input",
    placeholder: "Bv. Nederlands, Frans",
  },
  {
    key: "mainGoal",
    label: "Hoofddoel",
    kind: "textarea",
    placeholder: "Wat wil de klant bereiken met Google Ads?",
  },
  {
    key: "conversionAction",
    label: "Primaire conversie-actie",
    kind: "textarea",
    placeholder: "Bv. offerte-aanvraag, aankoop, telefoontje",
  },
  {
    key: "kpis",
    label: "Doelstellingen / KPI's",
    kind: "textarea",
    placeholder: "Bv. ROAS 4, CPA onder €30, 50 leads per maand",
  },
  {
    key: "budget",
    label: "Budget",
    kind: "input",
    placeholder: "Bv. €2.000 / maand",
  },
  {
    key: "toneOfVoice",
    label: "Tone of voice",
    kind: "input",
    placeholder: "Bv. professioneel, toegankelijk, no-nonsense",
  },
  {
    key: "channels",
    label: "Advertentiekanalen",
    kind: "list",
    placeholder: "Bv. Search, Performance Max, Display, YouTube",
    help: "Eén per regel",
  },
  {
    key: "restrictions",
    label: "Merkrestricties & notities",
    kind: "textarea",
    placeholder: "Belangrijke do's & don'ts, merkregels, gevoeligheden",
  },
  {
    key: "website",
    label: "Website",
    kind: "input",
    placeholder: "https://...",
  },
  {
    key: "landingPages",
    label: "Landingspagina's",
    kind: "input",
    placeholder: "Belangrijkste landingspagina's",
  },
  {
    key: "reportEmail",
    label: "Rapport-ontvanger (e-mail)",
    kind: "input",
    placeholder: "naam@bedrijf.be",
    help: "Maandrapport wordt naar dit adres gestuurd",
  },
];

// "Huidige stand" — vrije notities over de echte stand van zaken per klant.
// De vroegere plak-velden voor Google Ads- en Search Console-data zijn verwijderd:
// die data wordt nu live opgehaald (zie de live-integraties) en hoeft niet meer
// manueel geplakt te worden.
export const STATE_FIELDS: FieldDef[] = [
  {
    key: "currentState",
    label: "Huidige situatie",
    kind: "textarea",
    placeholder:
      "Korte stand van zaken: wat loopt er nu, wat is recent gewijzigd, aandachtspunten...",
    help: "Vrije notities",
  },
];

export const EMPTY_FORM: FormState = {
  name: "",
  business: "",
  world: "",
  services: "",
  audience: "",
  locations: "",
  languages: "",
  mainGoal: "",
  conversionAction: "",
  kpis: "",
  budget: "",
  toneOfVoice: "",
  channels: "",
  restrictions: "",
  website: "",
  landingPages: "",
  currentState: "",
  googleAdsData: "",
  searchConsoleData: "",
  reportEmail: "",
  googleAdsCustomerId: "",
  competitorAdvertisers: "",
  searchConsoleSiteUrl: "",
  ga4PropertyId: "",
  placesQuery: "",
  placesCompetitors: "",
  pagespeedUrls: "",
  businessProfileLocationId: "",
};

export function clientToForm(c: Client): FormState {
  const out = { ...EMPTY_FORM };
  for (const k of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
    const v = (c as unknown as Record<string, unknown>)[k];
    out[k] = typeof v === "string" ? v : "";
  }
  return out;
}

export function formToInput(f: FormState): ClientInput {
  const out: Record<string, string | null> = {};
  for (const k of Object.keys(EMPTY_FORM) as (keyof FormState)[]) {
    const v = f[k].trim();
    out[k] = k === "name" ? v : v === "" ? null : v;
  }
  return out as unknown as ClientInput;
}

// Detect a 409 optimistic-locking conflict from a failed update and return the
// server's current row, if present. The generated client throws an ApiError
// (duck-typed here to avoid importing internals) carrying `status` and the
// parsed `data` body `{ error, current }`.
export function asConflict(err: unknown): Client | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { status?: unknown; data?: unknown };
  if (e.status !== 409) return null;
  const data = e.data as { current?: unknown } | null;
  const current = data?.current;
  if (current && typeof current === "object" && "id" in current) {
    return current as Client;
  }
  return null;
}

// Bounded paste fields — keep in sync with MAX_LARGE_FIELD_LEN on the server.
export const MAX_STATE_FIELD_LEN = 50_000;

// Shared editorial input styling: sharp ink-bordered fields on white paper.
export const INPUT_CLASS =
  "rounded-none border border-foreground bg-card px-3 py-2 text-sm font-['Inter'] shadow-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:border-accent";
