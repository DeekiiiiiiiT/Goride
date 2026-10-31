/** Display helpers for fleet Find parts — no Stitch sample literals. */

export function formatPriceJmd(value: number | null | undefined): string {
  if (value == null || value <= 0) return "No price yet";
  return `J$ ${Math.round(value).toLocaleString()}`;
}

export function formatKm(value: number | null | undefined): string {
  if (value == null || value <= 0) return "None yet";
  return `${Math.round(value).toLocaleString()} km`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || value < 0) return "—";
  return `${Math.round(value)}%`;
}

/** Remaining life bar from km since install vs expected interval (matches fleet-core wearPercent). */
export function wearLifeBarPercent(kmSince: number | null | undefined, intervalKm: number | null | undefined): number | null {
  if (kmSince == null || intervalKm == null || intervalKm <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - kmSince / intervalKm) * 100)));
}

export function orDash(value: string | null | undefined): string {
  const t = String(value || "").trim();
  return t || "—";
}

export function orNoneYet(value: string | null | undefined): string {
  const t = String(value || "").trim();
  return t || "None yet";
}
