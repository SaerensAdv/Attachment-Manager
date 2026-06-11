import { colors, fonts } from "./tokens";

export { colors, fonts } from "./tokens";
export type { BrandColors, BrandFonts } from "./tokens";
export { renderBrandCss } from "./css";

/** Convenience grouped accessor: `brand.colors.purple`, `brand.fonts.display`. */
export const brand = { colors, fonts } as const;
