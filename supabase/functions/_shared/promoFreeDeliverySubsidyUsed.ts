/**
 * Platform promo / launch free-delivery subsidy spend (Finding N).
 * Fail-closed on query error — same lesson as Finding L.
 */
import {
  RUSH_PASS_SUBSIDY_ORDER_SELECT,
  sumRushPassSubsidyFromOrderRows,
  type RushPassSubsidyLoadResult,
} from "./rushPassSubsidyUsed.ts";

type OrdersQueryClient = {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
};

/** Jamaica calendar month start (UTC midnight of the 1st). */
export function jamaicaMonthStartIso(now = new Date()): string {
  // America/Jamaica is UTC-5 year-round (no DST)
  const jamaicaOffsetMs = 5 * 60 * 60 * 1000;
  const local = new Date(now.getTime() - jamaicaOffsetMs);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  // Re-express as UTC instant for Jamaica midnight on the 1st
  return new Date(Date.UTC(y, m, 1, 5, 0, 0, 0)).toISOString();
}

/**
 * Sum platform delivery subsidy on non-Pass free-delivery orders this calendar month.
 * Pass spend is tracked separately via rush_pass_membership_id.
 */
export async function loadPromoFreeDeliverySubsidyUsed(
  sb: OrdersQueryClient,
  monthStartIso: string = jamaicaMonthStartIso(),
): Promise<RushPassSubsidyLoadResult> {
  const { data, error } = await sb
    .from("orders")
    .select(RUSH_PASS_SUBSIDY_ORDER_SELECT)
    .is("rush_pass_membership_id", null)
    .gte("placed_at", monthStartIso);

  if (error) {
    console.error(
      "[promoFreeDeliverySubsidyUsed] query failed",
      { monthStartIso, message: error.message },
    );
    return {
      ok: false,
      error: error.message ?? "orders_query_failed",
      usedJmd: 0,
    };
  }

  // Only count rows that actually applied free delivery (snapshot)
  const freeRows = (data ?? []).filter((row: unknown) => {
    const r = row as Record<string, unknown>;
    const snap = (r.pricing_snapshot ?? {}) as Record<string, unknown>;
    return (
      snap.free_delivery_applied === true ||
      snap.freeDeliveryApplied === true
    );
  });

  return {
    ok: true,
    usedJmd: sumRushPassSubsidyFromOrderRows(freeRows),
  };
}
