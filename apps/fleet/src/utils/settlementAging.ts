/** Aging buckets for settlement desk receivables (days since period end). */

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days since periodEnd (UTC date string YYYY-MM-DD). Negative → 0. */
export function daysOverdue(periodEnd: string, asOf: Date = new Date()): number {
  const end = String(periodEnd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return 0;
  const periodDay = startOfLocalDay(new Date(`${end}T12:00:00`));
  const asOfDay = startOfLocalDay(asOf);
  const ms = asOfDay.getTime() - periodDay.getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function agingBucket(periodEnd: string, asOf: Date = new Date()): AgingBucket {
  const days = daysOverdue(periodEnd, asOf);
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}
