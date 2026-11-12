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
 * Brakes, engine oil change, oil filter and engine air filter: price + labour cost only — no labour
 * hours, labour rate, brand or part number.
 * Keys: field_schema keys ("labor") plus "labor_hours", "labor_rate", "brand" and "part_number"
 * for the fixed boxes.
 */
const SHORT_FORM_CODES = new Set(["brakes", "oil", "oil_filter", "air_filter"]);

export function hiddenLineFieldsFor(cat: Pick<MaintenanceServiceCategory, "code"> | null | undefined): string[] {
  const code = (cat?.code || "").toLowerCase();
  if (code === "tires") return ["labor", "labor_hours", "part_number"];
  if (SHORT_FORM_CODES.has(code)) return ["labor_hours", "labor_rate", "brand", "part_number"];
  if (sidePositionsFor(cat)) return ["labor_hours", "labor_rate", "brand", "part_number"];
  return [];
}

/**
 * Jobs that are done on one side of one axle: the form shows Left / Right instead of the four
 * wheel buttons. Saved as the usual wheel codes (LF/RF front, LR/RR rear) so history reads the same.
 */
export function sidePositionsFor(
  cat: Pick<MaintenanceServiceCategory, "code"> | null | undefined,
): { value: string; label: string }[] | null {
  const code = (cat?.code || "").toLowerCase();
  if (code === "front_stabilizer_link") return [{ value: "LF", label: "Left" }, { value: "RF", label: "Right" }];
  if (code === "rear_stabilizer_link") return [{ value: "LR", label: "Left" }, { value: "RR", label: "Right" }];
  return null;
}

export function serviceJobAmount(values: FieldValues): number | null {
  return num(values.service_amount) ?? null;
}
