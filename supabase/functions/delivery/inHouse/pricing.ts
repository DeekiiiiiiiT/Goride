/** Customer menu price is computed from the website price and the store markup. */

export function customerPriceFromCost(inStoreMajor: number, markupBps: number): number {
  const raw = Number(inStoreMajor) * (1 + Number(markupBps) / 10000);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.ceil(raw / 10) * 10;
}

export function priceWithinTolerance(expectedMinor: number, actualMinor: number, toleranceBps: number): boolean {
  if (expectedMinor <= 0) return actualMinor === 0;
  const drift = Math.abs(actualMinor - expectedMinor) * 10000;
  return drift <= expectedMinor * toleranceBps;
}

/** Roam eats a higher restaurant total up to the lesser of the percent and the dollar cap. */
export function withinAbsorbCap(
  expectedMinor: number,
  actualMinor: number,
  toleranceBps: number,
  capMinor: number,
): boolean {
  if (actualMinor <= expectedMinor) return true;
  const extra = actualMinor - expectedMinor;
  const percentCap = Math.floor((expectedMinor * toleranceBps) / 10000);
  return extra <= Math.min(percentCap, Math.max(0, capMinor));
}

/** Midnight in Jamaica is 05:00 UTC. Jamaica does not use daylight saving. */
export function jamaicaDayStartIso(now = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `${day}T05:00:00.000Z`;
}

export const PRICE_STALE_DAYS = 14;
export const FIRST_ORDER_CAP_MINOR = 500_000;
export const TWO_PERSON_MINOR = 1_500_000;
export const DESK_FRESH_MS = 2 * 60 * 1000;

export function priceIsFresh(checkedAt: string | null | undefined, now = Date.now()): boolean {
  if (!checkedAt) return false;
  const at = new Date(checkedAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at <= PRICE_STALE_DAYS * 24 * 60 * 60 * 1000;
}

export function jamaicaMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Jamaica",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function withinOfferWindow(startMinute: number, endMinute: number, now = new Date()): boolean {
  const current = jamaicaMinutes(now);
  if (endMinute > startMinute) return current >= startMinute && current < endMinute;
  return current >= startMinute || current < endMinute;
}
