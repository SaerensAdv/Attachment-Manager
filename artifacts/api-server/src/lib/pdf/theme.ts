import { colors as BRAND } from "@workspace/brand";

/**
 * PDF style tokens. The 11 brand hexes come straight from `@workspace/brand`
 * (the single source of truth shared with the web decks); a few cover-only
 * shades that are intentionally NOT part of the brand palette live here too.
 */

// --- Saerens brand palette (single source: @workspace/brand) ---
export const NEARBLACK = BRAND.nearblack;
export const INDIGO = BRAND.indigo;
export const PURPLE = BRAND.purple;
export const AMBER = BRAND.amber;
export const INK = BRAND.ink;
export const MUTED = BRAND.muted;
export const HAIR = BRAND.hair;
export const PANEL = BRAND.panel;
export const CARD_DARK = BRAND.cardDark;
export const CARD_LABEL = BRAND.cardLabel;
export const WHITE = BRAND.white;

// --- PDF-only shades (dark-cover gradients/dividers) ---
export const COVER_SUB = "#C9C7D6"; // subtitle text on the dark cover
export const COVER_DIVIDER = "#262532"; // faint divider above the stat strip
export const FOOTER_GREY = "#6E6C82"; // cover footer meta text

export const MARGIN = { top: 64, bottom: 76, left: 56, right: 56 };
