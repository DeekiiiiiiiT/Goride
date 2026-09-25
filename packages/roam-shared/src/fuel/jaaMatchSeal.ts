/** Shared refusal code for /jaa/apply-matches (rematch + import apply). */
export const WEEK_SEALED_MATCH_CODE = 'week_sealed' as const;

function ymd(v: unknown): string {
  return String(v || '').slice(0, 10);
}

/** Pure: dates + org a match pair would write into (for seal checks + tests). */
export function datesAndOrgForMatchPair(
  pair: {
    statementEntry?: Record<string, unknown>;
    driverEntry?: Record<string, unknown>;
  },
  fallbackOrgId = '',
): { orgId: string; datesYmd: string[] } {
  const stmt = pair.statementEntry || {};
  const drv = pair.driverEntry || {};
  const orgId = String(stmt.organizationId || drv.organizationId || fallbackOrgId || '');
  const datesYmd = [...new Set([ymd(stmt.date), ymd(drv.date)].filter(Boolean))];
  return { orgId, datesYmd };
}

/** Count per-pair sealed refusals from apply-matches results. */
export function countSealedMatchRefusals(
  results: Array<{ ok?: boolean; code?: string }>,
): number {
  return results.filter((r) => r.ok === false && r.code === WEEK_SEALED_MATCH_CODE).length;
}
