import type { MaintenanceLineAction, MaintenanceServiceCategory } from "../../../../types/maintenance";

type FieldValues = Record<string, string | number | boolean | null>;

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** A service/job (alignment, rotation, puncture repair…) rather than a physical part. */
export function isServiceJob(cat: Pick<MaintenanceServiceCategory, "is_part"> | null | undefined): boolean {
  return cat?.is_part === false;
}

/**
 * The action a line saves: the job's own `default_action` (set in Dominion, required by the
 * database). The fallback should never fire — if it does, the server sent a job without it.
 */
export function defaultActionForCategory(
  cat: Pick<MaintenanceServiceCategory, "is_part" | "code" | "default_action">,
): MaintenanceLineAction {
  if (cat.default_action) return cat.default_action;
  console.warn(`[log service] job "${cat.code}" has no default_action — using fallback`);
  return isServiceJob(cat) ? "other" : "replace";
}

/**
 * Cost of a service job: one total, or a price per wheel × wheels picked.
 * Stored as labour (a service is labour); "No charge" makes it 0.
 */
export function serviceJobCost(values: FieldValues, positions: string[], complimentary: boolean): number {
  if (complimentary) return 0;
  const amount = num(values.service_amount) ?? 0;
  if (amount <= 0) return 0;
  if (values.cost_mode === "per_wheel") return amount * positions.length;
  return amount;
}

/**
 * Boxes the details form hides for a job. Tire Change: quantity × unit price is the cost, so no
 * separate labour box, no labour hours and no part number.
 * Keys: field_schema keys ("labor") plus "labor_hours" and "part_number" for the fixed boxes.
 */
export function hiddenLineFieldsFor(cat: Pick<MaintenanceServiceCategory, "code"> | null | undefined): string[] {
  if ((cat?.code || "").toLowerCase() === "tires") return ["labor", "labor_hours", "part_number"];
  return [];
}

export function serviceJobAmount(values: FieldValues): number | null {
  return num(values.service_amount) ?? null;
}
