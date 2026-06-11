/**
 * Saerens Advertising house-style tokens — the SINGLE source of truth for the
 * palette and typography shared by the report PDF (pdfkit) and the web slide
 * decks (Tailwind v4). The prose reference lives in `knowledge/saerens-brand.md`;
 * keep the two in sync. `brand.css` is generated from these tokens (see css.ts).
 */
export const colors = {
  nearblack: "#0A0A0B", // dark cover / opening background
  indigo: "#29274E", // deep secondary, glow blobs
  purple: "#716BEB", // primary accent
  amber: "#F4A425", // CTA / highlight accent
  ink: "#1A1A22", // body text on light
  muted: "#6B6B72", // secondary text
  hair: "#E4E2EE", // hairline / divider on light
  panel: "#F5F5F8", // light panel background
  cardDark: "#17161F", // KPI card on dark cover
  cardLabel: "#9A98AB", // muted label on dark cards
  white: "#FFFFFF",
} as const;

export const fonts = {
  display: "Plus Jakarta Sans",
  body: "Outfit",
  displayStack: '"Plus Jakarta Sans", system-ui, sans-serif',
  bodyStack: '"Outfit", system-ui, sans-serif',
  pdf: "Helvetica", // pdfkit built-in (no TTF embedding)
} as const;

export type BrandColors = typeof colors;
export type BrandFonts = typeof fonts;
