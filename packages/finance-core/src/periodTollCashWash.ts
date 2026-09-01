import { round2 } from './money.ts';

/**
 * Settlement wash credit for a period row.
 * Prefers metadata.financeCore.tollCashWashEligible (post NEW-4);
 * legacy rows stored wash in tollCashSpend.
 */
export function resolvePeriodTollCashWash(p: {
  tollCashSpend?: number | null;
  metadata?: Record<string, unknown> | null;
}): number {
  const fc = (p.metadata as { financeCore?: { tollCashWashEligible?: unknown } } | null)?.financeCore;
  if (
    fc != null &&
    fc.tollCashWashEligible != null &&
    Number.isFinite(Number(fc.tollCashWashEligible))
  ) {
    return round2(Math.max(0, Number(fc.tollCashWashEligible)));
  }
  return round2(Math.max(0, Number(p.tollCashSpend) || 0));
}

export type PeriodRowForCashHeld = {
  cash_collected?: number | null;
  cash_returned?: number | null;
  cash_written_off?: number | null;
  toll_charged_to_driver?: number | null;
  toll_cash_spend?: number | null;
  fuel_fleet_share?: number | null;
  metadata?: Record<string, unknown> | null;
};

/** Expected cash_still_held from persisted period inputs (finance-recon identity). */
export function computeExpectedCashStillHeld(p: PeriodRowForCashHeld): number {
  const tollWash = resolvePeriodTollCashWash({
    tollCashSpend: p.toll_cash_spend,
    metadata: p.metadata,
  });
  return round2(
    Math.max(
      0,
      (Number(p.cash_collected) || 0) +
        (Number(p.toll_charged_to_driver) || 0) -
        (Number(p.cash_returned) || 0) -
        tollWash -
        (Number(p.fuel_fleet_share) || 0) -
        (Number(p.cash_written_off) || 0),
    ),
  );
}
