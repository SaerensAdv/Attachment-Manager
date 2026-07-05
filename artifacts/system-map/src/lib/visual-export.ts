import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

/**
 * Rasterise a full-size (unscaled) artboard node to a PNG data URL. Fonts are
 * awaited first: html-to-image embeds same-origin @fontsource CSS reliably,
 * but only once the faces are actually loaded.
 */
export async function nodeToPng(
  node: HTMLElement,
  w: number,
  h: number,
): Promise<string> {
  await document.fonts.ready;
  return toPng(node, { width: w, height: h, pixelRatio: 1 });
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * Bundle carousel slide PNGs into a single PDF sized exactly to the artboard
 * (LinkedIn documentpost upload). px_scaling keeps 1px = 1pt-equivalent so the
 * pages match the PNG dimensions without resampling.
 */
export function slidesToPdf(
  pngs: string[],
  w: number,
  h: number,
  filename: string,
): void {
  const pdf = new jsPDF({
    orientation: h >= w ? "portrait" : "landscape",
    unit: "px",
    format: [w, h],
    hotfixes: ["px_scaling"],
  });
  pngs.forEach((png, i) => {
    if (i > 0) pdf.addPage([w, h], h >= w ? "portrait" : "landscape");
    pdf.addImage(png, "PNG", 0, 0, w, h);
  });
  pdf.save(filename);
}
