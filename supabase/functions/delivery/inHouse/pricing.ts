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

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Sunday is 0, matching merchant_hours.day_of_week. Uses Jamaica, not the server clock. */
export function jamaicaWeekday(now = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    weekday: "short",
  }).format(now);
  const index = WEEKDAY_SHORT.indexOf(name.slice(0, 3));
  return index < 0 ? 0 : index;
}

export function clockToMinutes(value: string): number {
  const [hours, minutes] = String(value || "").slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hours)) return 0;
  return hours * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

/** True when Jamaica's clock sits inside this day's open and close. */
export function isOpenAt(open: string, close: string, isClosed: boolean, now = new Date()): boolean {
  if (isClosed || !open || !close) return false;
  const current = jamaicaMinutes(now);
  const openMinutes = clockToMinutes(open);
  const closeMinutes = clockToMinutes(close);
  if (closeMinutes > openMinutes) return current >= openMinutes && current < closeMinutes;
  return current >= openMinutes || current < closeMinutes;
}

export type WeekHourRow = {
  day_of_week?: number;
  dayOfWeek?: number;
  open_time?: string | null;
  open?: string | null;
  close_time?: string | null;
  close?: string | null;
  is_closed?: boolean | null;
  isClosed?: boolean | null;
};

export function storeOpenNow(hours: WeekHourRow[], now = new Date()): boolean {
  const day = jamaicaWeekday(now);
  const row = hours.find((entry) => Number(entry.day_of_week ?? entry.dayOfWeek) === day);
  if (!row) return false;
  return isOpenAt(
    String(row.open_time ?? row.open ?? ""),
    String(row.close_time ?? row.close ?? ""),
    Boolean(row.is_closed ?? row.isClosed),
    now,
  );
}

/** Widest open and close across the week, kept only so older readers are not blank. */
export function weekOfferWindow(hours: Array<{ open: string; close: string; isClosed: boolean }>): { start: number; end: number } {
  const openDays = hours.filter((day) => !day.isClosed);
  if (!openDays.length) return { start: 0, end: 0 };
  return {
    start: Math.min(...openDays.map((day) => clockToMinutes(day.open))),
    end: Math.max(...openDays.map((day) => clockToMinutes(day.close))),
  };
}

type CatalogOption = {
  id?: string;
  name?: string;
  label?: string;
  priceAdjustment?: number;
  marketplaceAdjustment?: number;
};

function catalogOptions(groups: unknown): CatalogOption[] {
  if (!Array.isArray(groups)) return [];
  const options: CatalogOption[] = [];
  for (const group of groups) {
    if (isReplaceGroup(group)) continue;
    const nested = (group as { options?: unknown }).options;
    if (Array.isArray(nested)) options.push(...(nested as CatalogOption[]));
  }
  return options;
}

function isReplaceGroup(group: unknown): boolean {
  if (!group || typeof group !== "object") return false;
  const row = group as { kind?: string; priceMode?: string };
  return row.kind === "priced" || row.priceMode === "replace";
}

/** Options the customer picked, from either the cart shape or the stored order line. */
export function pickedOptions(item: unknown): Array<{ id?: string; name?: string }> {
  const raw = item as { modifiers?: unknown; options?: unknown };
  const source = Array.isArray(raw.modifiers) ? raw.modifiers : raw.options;
  if (!Array.isArray(source)) return [];
  const picked: Array<{ id?: string; name?: string }> = [];
  const take = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    const row = entry as { id?: string; name?: string; selections?: unknown };
    if (Array.isArray(row.selections)) {
      for (const selection of row.selections) take(selection);
      return;
    }
    if (row.id || row.name) picked.push({ id: row.id, name: row.name });
  };
  source.forEach(take);
  return picked;
}

function findCatalogOption(catalog: CatalogOption[], pick: { id?: string; name?: string }): CatalogOption | undefined {
  const id = String(pick.id || "");
  const name = String(pick.name || "").trim().toLowerCase();
  return catalog.find((option) => {
    if (id && String(option.id || "") === id) return true;
    if (!name) return false;
    return [option.name, option.label].some((label) => String(label || "").trim().toLowerCase() === name);
  });
}

/** Restaurant extra is what Roam spends. Customer extra is the marked-up price already stored on the option. A priced choice replaces the dish price instead of adding to it. */
export function optionExtras(groups: unknown, picked: Array<{ id?: string; name?: string }>): { restaurant: number; customer: number } {
  const catalog = catalogOptions(groups);
  let restaurant = 0;
  let customer = 0;
  for (const pick of picked) {
    const match = findCatalogOption(catalog, pick);
    if (!match) continue;
    const restaurantExtra = Math.max(0, Number(match.priceAdjustment) || 0);
    const customerExtra = match.marketplaceAdjustment == null
      ? restaurantExtra
      : Math.max(0, Number(match.marketplaceAdjustment) || 0);
    restaurant += restaurantExtra;
    customer += customerExtra;
  }
  return { restaurant, customer };
}

/** Dish price after a required price choice replaces the base, then extras are added. */
export function appliedMenuPrice(
  groups: unknown,
  picked: Array<{ id?: string; name?: string }>,
  base: { restaurant: number; customer: number },
): { restaurant: number; customer: number } {
  let restaurant = base.restaurant;
  let customer = base.customer;
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (!isReplaceGroup(group)) continue;
      const options = Array.isArray((group as { options?: unknown }).options)
        ? (group as { options: CatalogOption[] }).options
        : [];
      const match = picked.map((pick) => findCatalogOption(options, pick)).find(Boolean);
      if (!match) continue;
      restaurant = Math.max(0, Number(match.priceAdjustment) || 0);
      customer = match.marketplaceAdjustment == null
        ? restaurant
        : Math.max(0, Number(match.marketplaceAdjustment) || 0);
    }
  }
  const extras = optionExtras(groups, picked);
  return { restaurant: restaurant + extras.restaurant, customer: customer + extras.customer };
}

/** Option names for the kitchen and the buyer. The line price already includes the money. */
export function kitchenModifiers(
  picks: Array<{ name?: string }>,
): Array<{ name: string; priceAdjustment: number }> | undefined {
  if (!picks.length) return undefined;
  return picks.map((pick) => ({
    name: String(pick.name || "Option"),
    priceAdjustment: 0,
  }));
}
