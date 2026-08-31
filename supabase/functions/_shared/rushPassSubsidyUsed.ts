/**
 * Rush Pass period subsidy spend — Finding L: never select phantom columns.
 * Finding R: aggregate in Postgres (RPC), never row-transport under PostgREST max_rows.
 */

export type RushPassSubsidyLoadOk = { ok: true; usedJmd: number };
export type RushPassSubsidyLoadErr = { ok: false; error: string; usedJmd: number };
export type RushPassSubsidyLoadResult = RushPassSubsidyLoadOk | RushPassSubsidyLoadErr;

type SubsidyRpcClient = {
  // deno-lint-ignore no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

/** Pure sum — unit-tested for row-shape fixtures; production path uses RPC. */
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

function parseUsedJmd(data: unknown): number {
  const n = typeof data === "number" ? data : Number(data ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Load Pass free-delivery subsidy spent in the current membership period.
 * On RPC failure returns ok:false (callers must deny free delivery — fail closed).
 */
export async function loadRushPassSubsidyUsed(
  sb: SubsidyRpcClient,
  membershipId: string,
  periodStartIso: string,
): Promise<RushPassSubsidyLoadResult> {
  if (!membershipId || !periodStartIso) {
    return { ok: true, usedJmd: 0 };
  }

  const { data, error } = await sb.rpc("sum_rush_pass_subsidy_used", {
    p_membership_id: membershipId,
    p_period_start: periodStartIso,
  });

  if (error) {
    console.error(
      "[rushPassSubsidyUsed] rpc failed",
      { membershipId, periodStartIso, message: error.message },
    );
    return {
      ok: false,
      error: error.message ?? "subsidy_rpc_failed",
      usedJmd: 0,
    };
  }

  return {
    ok: true,
    usedJmd: parseUsedJmd(data),
  };
}
