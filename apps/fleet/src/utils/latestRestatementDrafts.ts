/**
 * Restatement queue should show one actionable draft per driver / week / kind.
 * Older version rows are internal history — hide them from operators.
 */
export type RestatementDraftLike = {
  driverId: string;
  weekKey: string;
  kind: string;
  version: number;
  status?: string;
};

export function pickLatestRestatementDrafts<T extends RestatementDraftLike>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    if (String(row.status || 'draft').toLowerCase() !== 'draft') continue;
    const key = `${row.driverId}|${String(row.weekKey).slice(0, 10)}|${String(row.kind).toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || Number(row.version) > Number(prev.version)) {
      best.set(key, row);
    }
  }
  return [...best.values()].sort((a, b) => {
    const week = String(b.weekKey).localeCompare(String(a.weekKey));
    if (week !== 0) return week;
    const driver = String(a.driverId).localeCompare(String(b.driverId));
    if (driver !== 0) return driver;
    return String(a.kind).localeCompare(String(b.kind));
  });
}
