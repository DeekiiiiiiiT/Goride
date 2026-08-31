/**
 * Platform promo / launch free-delivery subsidy spend (Finding N / R).
 * Aggregate in Postgres — never row-transport under PostgREST max_rows=1000.
 * Fail-closed on RPC error — same lesson as Finding L.
 */
import type { RushPassSubsidyLoadResult } from "./rushPassSubsidyUsed.ts";

type SubsidyRpcClient = {
  // deno-lint-ignore no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
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

function parseUsedJmd(data: unknown): number {
  const n = typeof data === "number" ? data : Number(data ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Sum platform delivery subsidy on non-Pass free-delivery orders this calendar month.
 * Pass spend is tracked separately via rush_pass_membership_id.
 */
export async function loadPromoFreeDeliverySubsidyUsed(
  sb: SubsidyRpcClient,
  monthStartIso: string = jamaicaMonthStartIso(),
): Promise<RushPassSubsidyLoadResult> {
  const { data, error } = await sb.rpc("sum_promo_fd_subsidy_used", {
    p_month_start: monthStartIso,
  });

  if (error) {
    console.error(
      "[promoFreeDeliverySubsidyUsed] rpc failed",
      { monthStartIso, message: error.message },
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
