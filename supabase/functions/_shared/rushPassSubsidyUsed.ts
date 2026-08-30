/**
 * Rush Pass period subsidy spend — Finding L: never select columns that aren't on
 * delivery.orders (PostgREST 400 → silent used=0 was fail-open unlimited free delivery).
 */

/** Columns selected from delivery.orders for Pass subsidy aggregation (schema-guarded). */
export const RUSH_PASS_SUBSIDY_ORDER_SELECT =
  "platform_delivery_subsidy_jmd, pricing_snapshot, status" as const;

export const RUSH_PASS_SUBSIDY_ORDER_COLUMNS = [
  "platform_delivery_subsidy_jmd",
  "pricing_snapshot",
  "status",
] as const;

export type RushPassSubsidyLoadOk = { ok: true; usedJmd: number };
export type RushPassSubsidyLoadErr = { ok: false; error: string; usedJmd: number };
export type RushPassSubsidyLoadResult = RushPassSubsidyLoadOk | RushPassSubsidyLoadErr;

type OrdersQueryClient = {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
};

/** Pure sum — unit-tested; skips cancelled/rejected. */
export function sumRushPassSubsidyFromOrderRows(rows: unknown[]): number {
  let used = 0;
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const st = String(r.status ?? "").toLowerCase();
    if (st === "cancelled" || st === "rejected") continue;
    const snap = (r.pricing_snapshot ?? {}) as Record<string, unknown>;
    const fromCol = Number(r.platform_delivery_subsidy_jmd ?? 0);
    // promo_cost_jmd lives only inside pricing_snapshot JSONB — never as a table column
    const fromSnap = Number(
      snap.platform_delivery_subsidy_jmd ??
        snap.platformDeliverySubsidyJmd ??
        snap.promo_cost_jmd ??
        snap.promoCostJmd ??
        0,
    );
    used += fromCol > 0 ? fromCol : fromSnap;
  }
  return Math.round(used * 100) / 100;
}

/**
 * Load Pass free-delivery subsidy spent in the current membership period.
 * On query failure returns ok:false (callers must deny free delivery — fail closed).
 */
export async function loadRushPassSubsidyUsed(
  sb: OrdersQueryClient,
  membershipId: string,
  periodStartIso: string,
): Promise<RushPassSubsidyLoadResult> {
  if (!membershipId || !periodStartIso) {
    return { ok: true, usedJmd: 0 };
  }

  const { data, error } = await sb
    .from("orders")
    .select(RUSH_PASS_SUBSIDY_ORDER_SELECT)
    .eq("rush_pass_membership_id", membershipId)
    .gte("placed_at", periodStartIso);

  if (error) {
    console.error(
      "[rushPassSubsidyUsed] query failed",
      { membershipId, periodStartIso, message: error.message },
    );
    return {
      ok: false,
      error: error.message ?? "orders_query_failed",
      usedJmd: 0,
    };
  }

  return {
    ok: true,
    usedJmd: sumRushPassSubsidyFromOrderRows(data ?? []),
  };
}
