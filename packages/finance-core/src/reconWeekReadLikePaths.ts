/**
 * WRA-65: POSTs that prepare week numbers — not a person's decision. Server week guard
 * skips the version check; the Week Reconciliation client must not send x-recon-week.
 * Single list for edge (`recon_week_version_guard`) and fleet (`reconWeekContext`).
 */

export const RECON_WEEK_READ_LIKE_PATH_PATTERNS: readonly RegExp[] = [
  /\/fuel\/periods\/ensure\/?$/,
  /\/fuel\/periods\/[^/]+\/compute\/?$/,
  /\/fuel\/periods\/[^/]+\/materialize\/?$/,
  /\/toll-info\/impact-preview(\?|$)/,
  /\/toll-reconciliation\/auto-match(\?|$)/,
];

function pathForMatch(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) {
      const u = new URL(raw, 'https://recon.local');
      return u.pathname;
    }
  } catch {
    /* not a URL */
  }
  const noQuery = raw.split('?')[0];
  return noQuery;
}

/** True when this URL or path is read-like for week version (no header, no claim). */
export function isReconWeekReadLikePath(input: string): boolean {
  const clean = pathForMatch(input);
  if (!clean) return false;
  return RECON_WEEK_READ_LIKE_PATH_PATTERNS.some((re) => re.test(clean) || re.test(input));
}