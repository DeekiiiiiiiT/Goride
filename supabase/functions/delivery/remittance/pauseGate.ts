/**
 * Single pause gate for remittance (C-7).
 * Production: remittance pause always checked; legacy pause as secondary audit.
 */

import { isCourierRemittancePaused } from "./remittanceLedger.ts";

// deno-lint-ignore no-explicit-any
type Sb = { schema: (s: string) => any; from: (t: string) => any };

export type PauseGateResult =
  | { ok: true }
  | {
    ok: false;
    status: 403;
    error: string;
    code: "cod_cash_paused";
    balanceMinor: number;
    thresholdMinor: number;
  };

export async function assertCourierNotPaused(
  sb: Sb,
  courierId: string,
): Promise<PauseGateResult> {
  const paused = await isCourierRemittancePaused(sb, courierId);
  if (paused.isPaused) {
    return {
      ok: false,
      status: 403,
      error:
        `You're holding J$${(paused.balanceMinor / 100).toFixed(2)} for Roam — remit to go online again.`,
      code: "cod_cash_paused",
      balanceMinor: paused.balanceMinor,
      thresholdMinor: paused.thresholdMinor,
    };
  }

  // Secondary: legacy rows may still exist from pre-cutover.
  try {
    const db = typeof sb.schema === "function" ? sb.schema("delivery") : sb;
    const { data } = await db
      .from("courier_cash_balances")
      .select("is_paused, balance_jmd, pause_threshold_jmd")
      .eq("courier_id", courierId)
      .maybeSingle();
    if (data?.is_paused) {
      return {
        ok: false,
        status: 403,
        error:
          "Your account is paused — settle your COD cash balance before accepting new deliveries.",
        code: "cod_cash_paused",
        balanceMinor: Math.round(Number(data.balance_jmd ?? 0) * 100),
        thresholdMinor: Math.round(
          Number(data.pause_threshold_jmd ?? 10000) * 100,
        ),
      };
    }
  } catch {
    /* ignore legacy lookup failures */
  }
  return { ok: true };
}
