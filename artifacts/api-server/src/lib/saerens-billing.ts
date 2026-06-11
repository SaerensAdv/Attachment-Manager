/**
 * Saerens invoicing identity (sender) + billing constants.
 *
 * These values print on every factuur/offerte. They are the agency's own
 * public-facing invoicing details (NOT secrets), so they live here as code
 * config — not in env secrets and not in agent memory. Pas hier aan als de
 * gegevens wijzigen.
 *
 * LET OP (Peppol): sinds 1 januari 2026 moeten B2B-facturen tussen Belgische
 * btw-plichtigen gestructureerde e-facturen (Peppol) zijn. De PDF die deze
 * module genereert is daarom voor Belgische klanten een hoffelijkheids-/
 * leeskopie, geen wettelijk volstaande e-factuur. Bevestig de e-facturatie-flow
 * met je boekhouder.
 */

export type BtwMode = "btw_21" | "verlegd";

export interface SaerensSender {
  legalName: string;
  /** Rechtsvorm — eenmanszaak, dus geen vennootschapssuffix. */
  legalForm: string;
  /** Btw-/ondernemingsnummer, leesbaar geformatteerd. */
  vatNumber: string;
  addressLines: string[];
  /** IBAN, gegroepeerd per 4 tekens. */
  iban: string;
  email: string;
}

export const SAERENS_SENDER: SaerensSender = {
  legalName: "Saerens Advertising",
  legalForm: "Eenmanszaak",
  vatNumber: "BE 1019.436.742",
  addressLines: ["Grote Weg 324", "9500 Geraardsbergen", "België"],
  iban: "BE44 3632 5480 9845",
  email: "axel@saerensadvertising.com",
};

/** Standaard btw-tarief (België) in basispunten — 21% = 2100 bp. */
export const STANDARD_VAT_RATE_BP = 2100;

/** Standaard betalingstermijn in dagen (door de eigenaar bevestigd). */
export const DEFAULT_PAYMENT_TERM_DAYS = 30;

/**
 * Vermelding bij verlegde btw (reverse charge) voor B2B-klanten binnen de EU
 * buiten België. LET OP: bevestig de exacte wettelijke verwijzing met je
 * boekhouder en pas deze tekst hier aan indien nodig.
 */
export const REVERSE_CHARGE_NOTE =
  "Btw verlegd — intracommunautaire dienst (art. 196 Richtlijn 2006/112/EG).";

/**
 * Default btw-behandeling op basis van het btw-nummer van de klant: een klant
 * met een Belgisch btw-nummer ("BE...") krijgt 21%, elke andere (EU-)klant
 * krijgt verlegde btw. De expliciete keuze in het klantdossier heeft altijd
 * voorrang op deze afleiding.
 */
export function defaultBtwMode(vatNumber: string | null | undefined): BtwMode {
  const v = (vatNumber ?? "").replace(/\s/g, "").toUpperCase();
  return v.startsWith("BE") ? "btw_21" : "verlegd";
}

/** Type-guard zodat een vrij ingevuld veld nooit een ongeldige modus oplevert. */
export function asBtwMode(
  raw: string | null | undefined,
  fallback: BtwMode,
): BtwMode {
  return raw === "btw_21" || raw === "verlegd" ? raw : fallback;
}
