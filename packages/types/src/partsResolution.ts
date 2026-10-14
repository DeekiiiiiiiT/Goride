/** Tier labels and fit rules shared by the catalog function and tests. */

export type PartFitScope = "powertrain" | "chassis" | "body" | "electrical" | "universal";
export type PartKind = "oem" | "oe_supplier" | "aftermarket" | "used" | "reman";
export type FitTargetKind = "engine_family" | "platform" | "catalog_variant";

export function engineFamilyRuleAllowed(fitScope: string): boolean {
  return fitScope === "powertrain" || fitScope === "universal";
}

/** A job-log component id matches a part only on the maintenance component, never the parts category. */
export function partVisibleForComponent(
  partComponentId: string | null | undefined,
  queryComponentId: string | null | undefined,
): boolean {
  if (!queryComponentId) return true;
  return partComponentId === queryComponentId;
}

export function classifyPartTier(input: {
  partKind: PartKind;
  targetKind: FitTargetKind;
  manufacturer: string | null;
  vehicleMake: string;
}): 1 | 2 | 3 | 4 {
  if (input.partKind === "oe_supplier" || input.partKind === "aftermarket" || input.partKind === "reman" || input.partKind === "used") {
    return 4;
  }
  const ownMake = (input.manufacturer ?? "").trim().toLowerCase() === input.vehicleMake.trim().toLowerCase();
  if (input.partKind === "oem" && (
    input.targetKind === "catalog_variant"
    || ((input.targetKind === "platform" || input.targetKind === "engine_family") && ownMake)
  )) {
    return 1;
  }
  if (input.targetKind === "platform") return 2;
  if (input.targetKind === "engine_family") return 3;
  return 2;
}

export function buildFitMessage(input: {
  tier: number;
  fitScope: string | null;
  sisterNames: string | null;
  sourceMake: string | null;
  manufacturer: string | null;
  referenceOem: string | null;
  confirmedInstalls: number;
  stockQty?: number | null;
}): { tierLabel: string; matchReason: string; confirmedFit: boolean } {
  const confirmedFit = input.confirmedInstalls > 0;
  if (input.tier === 0) {
    const n = input.stockQty ?? 0;
    return {
      tierLabel: "In your stock",
      matchReason: `In your stock — ${n} on the shelf.`,
      confirmedFit,
    };
  }
  if (input.tier === 1) {
    return { tierLabel: "Factory part", matchReason: "Factory part for your vehicle.", confirmedFit };
  }
  if (input.tier === 2) {
    const sister = input.sisterNames?.trim() || "a sister vehicle";
    const body = input.fitScope === "body" || input.fitScope === "chassis";
    const caution = body
      ? "Same platform — check trim, year and photos before ordering."
      : "Same platform — expected direct fit.";
    return {
      tierLabel: "Same platform",
      matchReason: `Same platform as ${sister}. ${caution}`,
      confirmedFit,
    };
  }
  if (input.tier === 3) {
    const from = input.sourceMake?.trim() ? ` — from ${input.sourceMake.trim()}.` : ".";
    return {
      tierLabel: "Same engine",
      matchReason: `Engine/powertrain compatible only${from}`,
      confirmedFit,
    };
  }
  const oem = input.referenceOem?.trim() || "part";
  const maker = input.manufacturer?.trim() || "aftermarket";
  return {
    tierLabel: "Equivalent",
    matchReason: `Equivalent to OEM ${oem} — ${maker}`,
    confirmedFit,
  };
}

export type SupersessionLink = { oldPartId: string; newPartId: string };

/** Follow replacements to the current number. Cycles stop at the start. */
export function latestSupersededPartId(partId: string, links: SupersessionLink[]): string {
  const next = new Map(links.map((l) => [l.oldPartId, l.newPartId]));
  let current = partId;
  const seen = new Set<string>();
  while (next.has(current) && !seen.has(current)) {
    seen.add(current);
    current = next.get(current)!;
  }
  return current;
}

export function alsoKnownAsNumbers(
  currentPartId: string,
  links: SupersessionLink[],
  numbers: Record<string, string | null>,
): string[] {
  const older: string[] = [];
  for (const link of links) {
    if (latestSupersededPartId(link.oldPartId, links) !== currentPartId) continue;
    const num = numbers[link.oldPartId];
    if (num && num !== numbers[currentPartId]) older.push(num);
  }
  return [...new Set(older)];
}

const PRICE_STALE_DAYS = 90;

export function priceIsStale(observedAt: string | null | undefined, now = new Date(), maxDays = PRICE_STALE_DAYS): boolean {
  if (!observedAt) return true;
  const t = new Date(observedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > maxDays * 24 * 60 * 60 * 1000;
}

export function landedCostJmd(input: {
  unitPrice: number;
  currency: string;
  fxRateToJmd?: number | null;
  dutyRate?: number | null;
  freightEstimate?: number | null;
}): number {
  const currency = (input.currency || "USD").toUpperCase();
  const fx = currency === "JMD" ? 1 : (input.fxRateToJmd != null && input.fxRateToJmd > 0 ? input.fxRateToJmd : 1);
  const duty = input.dutyRate != null && input.dutyRate > 0 ? input.dutyRate : 0;
  const freight = input.freightEstimate != null && input.freightEstimate > 0 ? input.freightEstimate : 0;
  return Math.round((input.unitPrice * fx * (1 + duty) + freight) * 100) / 100;
}

export function totalImpactJmd(landed: number, leadDays: number, downtimePerDay: number): number {
  const lead = Number.isFinite(leadDays) && leadDays > 0 ? leadDays : 0;
  const down = Number.isFinite(downtimePerDay) && downtimePerDay > 0 ? downtimePerDay : 0;
  return Math.round((landed + lead * down) * 100) / 100;
}

/** Parts usage is committed before the service record and the ledger charge. */
export const MAINTENANCE_SAVE_ORDER = [
  "work_order_lines",
  "parts_usage",
  "service_record",
  "ledger",
] as const;

/** Readiness of the variant decides tiered search. The one-week second-fleet lock is retired. */
export function tieredSearchReady(coveragePct: number): boolean {
  return Number.isFinite(coveragePct) && coveragePct >= 60;
}

/** A ledger post is allowed only after parts usage succeeded, or when the job has no part. */
export function ledgerAllowedAfterParts(input: {
  needsUsage: boolean;
  usageCommitted: boolean;
}): boolean {
  if (!input.needsUsage) return true;
  return input.usageCommitted;
}

/** Non-null means the save must fail. A missing error means the usage write succeeded. */
export function usageWriteFailure(error: { message?: string } | null | undefined): string | null {
  if (!error) return null;
  const message = (error.message ?? "").trim();
  return message || "Parts usage was not saved";
}
