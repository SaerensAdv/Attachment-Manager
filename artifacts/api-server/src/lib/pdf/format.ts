/** Number formatting for the PDFs (nl-BE locale). */

export function eur(n: number, currency: string, dec = 0): string {
  try {
    return new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(n);
  } catch {
    return `${n.toFixed(dec)} ${currency}`.trim();
  }
}

export function int(n: number): string {
  return new Intl.NumberFormat("nl-BE").format(Math.round(n));
}

export function dec(n: number, d = 2): string {
  return new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
}
