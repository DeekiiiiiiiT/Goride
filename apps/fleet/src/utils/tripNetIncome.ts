import type { Trip } from '../types/data';

/**
 * Honest net-to-driver for ledger display/export/stats.
 * Never falls back to gross or fare amount (those are not net).
 * Returns null when net is genuinely unknown → UI renders "—".
 */
export function getTripNetIncome(t: Trip): number | null {
  if (t.netToDriver != null && Number.isFinite(Number(t.netToDriver))) {
    return Number(t.netToDriver);
  }

  // InDrive: prefer explicit net, else gross/amount minus service fee
  if (t.indriveNetIncome != null && Number.isFinite(Number(t.indriveNetIncome))) {
    return Number(t.indriveNetIncome);
  }
  const platform = String(t.platform || '').toLowerCase();
  if (platform === 'roam' || platform === 'goride') {
    const gross = t.amount != null && Number.isFinite(Number(t.amount)) ? Number(t.amount) : null;
    if (gross == null) return null;
    const commissionRaw = (t as Trip & { roamCommission?: number; platformFee?: number }).roamCommission
      ?? (t as Trip & { platformFee?: number }).platformFee;
    if (commissionRaw == null || !Number.isFinite(Number(commissionRaw))) return null;
    return gross - Number(commissionRaw);
  }
  if (platform === 'indrive' || platform === 'in drive') {
    const fee = t.indriveServiceFee != null ? Number(t.indriveServiceFee) : null;
    const gross =
      t.grossEarnings != null
        ? Number(t.grossEarnings)
        : t.amount != null
          ? Number(t.amount)
          : null;
    if (fee != null && Number.isFinite(fee) && gross != null && Number.isFinite(gross)) {
      return gross - fee;
    }
  }

  return null;
}
