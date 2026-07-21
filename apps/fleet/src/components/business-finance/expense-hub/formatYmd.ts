/**
 * Date display helper for Expense Hub Overview/Register (Stitch shows "Oct 24, 2023").
 * Parses YMD without timezone drift; falls back to the raw string.
 */
export function formatYmd(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
