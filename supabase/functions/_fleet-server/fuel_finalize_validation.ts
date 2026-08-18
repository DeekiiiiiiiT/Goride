/**
 * Server-side arithmetic + settled-entry checks before posting finalized snapshots.
 */
import * as kv from "./kv_store.tsx";
import {
  validateFinalizedReportArithmetic,
  type FinalizeValidationResult,
} from "./fuel_finalize_arithmetic.ts";

export { roundCentsEqual, validateFinalizedReportArithmetic } from "./fuel_finalize_arithmetic.ts";
export type { FinalizeValidationResult };

export async function validateSettledEntriesBelongToWeek(
  report: Record<string, unknown>,
): Promise<FinalizeValidationResult> {
  const weekStart = String(report.weekStart || "").split("T")[0];
  const weekEnd = String(report.weekEnd || weekStart).split("T")[0];
  const driverId = String(report.driverId || "");
  const stubs = Array.isArray((report.metadata as any)?.settledEntries)
    ? ((report.metadata as any).settledEntries as Array<Record<string, unknown>>)
    : [];

  for (const stub of stubs) {
    const id = String(stub.id || "");
    if (!id) return { ok: false, error: "settledEntries stub missing id" };
    const entry = await kv.get(`fuel_entry:${id}`);
    if (!entry) {
      return { ok: false, error: `settledEntries id ${id} not found` };
    }
    const entryDriver = String(entry.driverId || stub.driverId || "");
    if (driverId && entryDriver && entryDriver !== driverId) {
      return { ok: false, error: `settledEntries ${id} belongs to a different driver` };
    }
    const day = String(entry.date || stub.date || "").split("T")[0];
    if (day && weekStart && (day < weekStart || day > weekEnd)) {
      return { ok: false, error: `settledEntries ${id} is outside the report week` };
    }
  }

  return { ok: true };
}

export async function validateFinalizedReportForPost(
  report: Record<string, unknown>,
): Promise<FinalizeValidationResult> {
  const arith = validateFinalizedReportArithmetic(report);
  if (!arith.ok) return arith;
  return validateSettledEntriesBelongToWeek(report);
}
