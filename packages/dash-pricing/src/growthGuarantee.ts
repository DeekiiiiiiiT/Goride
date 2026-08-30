/** Growth Guarantee credit math — shared by edge cron + unit tests. */

export function growthGuaranteeCreditFromCommission(
  merchantCommissionAmount: number,
  dominantRate: number,
  economyRate: number,
): number {
  if (!(dominantRate > 0) || !(dominantRate > economyRate)) return 0;
  const commission = Math.max(0, Number(merchantCommissionAmount) || 0);
  return Math.round(commission * (1 - economyRate / dominantRate) * 100) / 100;
}

/** Calendar months from assignment ISO to period-end ISO (Jamaica ≈ UTC−5). */
export function jamaicaCalendarMonthsElapsed(fromIso: string, toPeriodEndIso: string): number {
  const from = new Date(new Date(fromIso).getTime() - 5 * 60 * 60 * 1000);
  const to = new Date(new Date(toPeriodEndIso).getTime() - 5 * 60 * 60 * 1000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) {
    return Infinity;
  }
  const years = to.getUTCFullYear() - from.getUTCFullYear();
  const months = to.getUTCMonth() - from.getUTCMonth();
  let elapsed = years * 12 + months;
  if (to.getUTCDate() < from.getUTCDate()) elapsed -= 1;
  return Math.max(0, elapsed);
}

/** Jamaica calendar month YYYY-MM for an event timestamp. */
export function jamaicaPeriodYyyyMmFromIso(iso: string): string {
  const jm = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000);
  if (!Number.isFinite(jm.getTime())) return '';
  return `${jm.getUTCFullYear()}-${String(jm.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function growthGuaranteeCreditIdempotencyKey(merchantId: string, period: string): string {
  return `gg:${merchantId}:${period}`;
}

export function growthGuaranteeClawIdempotencyKey(
  merchantId: string,
  period: string,
  orderId: string,
): string {
  return `gg_claw:${merchantId}:${period}:${orderId}`;
}

/** Pure gate used by claw-back automation + unit tests. */
export function shouldClawGrowthGuarantee(opts: {
  priorQualifyingStatus: boolean;
  hasPeriodCredit: boolean;
  alreadyClawed: boolean;
  inAssignmentWindow: boolean;
  clawAmount: number;
}): boolean {
  if (!opts.priorQualifyingStatus) return false;
  if (!opts.hasPeriodCredit) return false;
  if (opts.alreadyClawed) return false;
  if (!opts.inAssignmentWindow) return false;
  return opts.clawAmount > 0;
}

export const GG_QUALIFYING_ORDER_STATUSES = new Set(['delivered', 'completed']);
