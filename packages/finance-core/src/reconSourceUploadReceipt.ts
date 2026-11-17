/**
 * WRA-70 — Step 1 upload receipt lines (pure formatters).
 */
export type ReconSourceLastUpload = {
  uploadedAt: string;
  fileName: string | null;
  rowCount: number | null;
  coverageStart: string;
  coverageEnd: string;
};

const BLOCKING = new Set(['missing', 'partial', 'waiting_external']);

function shortMonthDay(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return ymd.slice(0, 10);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function monthShortUtc(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

/** e.g. "9–15 Nov" when same month, else "28 Oct–3 Nov". */
export function formatCoverageRangeShort(coverageStart: string, coverageEnd: string): string {
  const a = shortMonthDay(coverageStart);
  const b = shortMonthDay(coverageEnd);
  const sameMonth = coverageStart.slice(0, 7) === coverageEnd.slice(0, 7);
  if (sameMonth) {
    const dayA = String(Number(coverageStart.slice(8, 10)));
    const dayB = String(Number(coverageEnd.slice(8, 10)));
    return `${dayA}–${dayB} ${monthShortUtc(coverageStart)}`;
  }
  return `${a}–${b}`;
}

export function formatUploadReceiptLine(
  last: ReconSourceLastUpload,
  timeZone = 'America/Jamaica',
): string {
  const when = new Date(last.uploadedAt);
  const time = Number.isFinite(when.getTime())
    ? when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
    : last.uploadedAt;
  const name = (last.fileName || 'upload').trim();
  const rows =
  last.rowCount != null && Number.isFinite(last.rowCount)
    ? `${last.rowCount} row${last.rowCount === 1 ? '' : 's'}`
    : null;
  const range = formatCoverageRangeShort(last.coverageStart, last.coverageEnd);
  const parts = [`Uploaded ${time}`, name];
  if (rows) parts.push(rows);
  parts.push(range);
  return parts.join(' · ');
}

/**
 * Status line under the card title (receipt is shown separately).
 */
export type IndriveLoggedDay = {
  day: string;
  tripCount: number;
  amountMajor: number;
};

function formatWeekdayDayUtc(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return ymd.slice(0, 10);
  const when = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = when.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${d}`;
}

/** WRA-71 — e.g. "Sun 15 · 8 trips logged · J$10,650" */
export function formatIndriveLoggedDayLine(day: IndriveLoggedDay): string {
  const trips =
    day.tripCount === 1 ? '1 trip logged' : `${day.tripCount} trips logged`;
  const amount = Math.abs(Number(day.amountMajor) || 0);
  const money =
    amount % 1 === 0
      ? `J$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `J$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${formatWeekdayDayUtc(day.day)} · ${trips} · ${money}`;
}

/** WRA-72 — week-level cash tolls line for Step 1. */
export function formatCashTollsDriverWeekLine(
  rowCount: number,
  amountMinor: number | null | undefined,
): string {
  if (!rowCount || rowCount <= 0) return 'None logged by the driver';
  const tollWord = rowCount === 1 ? 'cash toll' : 'cash tolls';
  const minor = Math.abs(Number(amountMinor) || 0);
  const major = minor / 100;
  const money =
    major % 1 === 0
      ? `J$${major.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `J$${major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${rowCount} ${tollWord} logged by driver · ${money}`;
}

/** True when coverage still has a "no activity" attest but real data also arrived. */
export function coverageHasAttestDataConflict(coverage: Record<string, string> | undefined): boolean {
  if (!coverage) return false;
  return Object.values(coverage).some((v) => v === 'covered_over_attest');
}

export function reconAttestDataConflictLine(): string {
  return 'Marked no activity, but data arrived';
}

export function sourceCardSubtitle(opts: {
  status: string;
  lastUpload?: ReconSourceLastUpload | null;
  uncoveredDayLabels?: string | null;
  pendingUnits?: number;
}): string | null {
  const { status, lastUpload, uncoveredDayLabels, pendingUnits = 0 } = opts;
  if (lastUpload && BLOCKING.has(status) && pendingUnits > 0) {
    return 'Uploaded — checking…';
  }
  if (lastUpload && BLOCKING.has(status) && pendingUnits <= 0 && uncoveredDayLabels) {
    return `Uploaded, but nothing for ${uncoveredDayLabels}`;
  }
  return status.replace(/_/g, ' ');
}