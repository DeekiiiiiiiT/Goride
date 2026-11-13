import { fmtTollMinor } from '../tollV2Format';
import type { TollV2ImportReport, TollV2ImportReportRow } from './tollV2ImportTypes';

const PROBLEM_STATUSES = new Set([
  'rejected',
  'take_back_needs_person',
  'topup_changed_needs_person',
  'refused_sealed_week',
  'unknown_plate',
  'unknown_driver',
  'unknown_vehicle',
  'unknown_plaza',
]);

export function importRowStatusLabel(row: TollV2ImportReportRow): string {
  const s = String(row.status ?? '');
  if (s === 'new') return 'New';
  if (s === 'unchanged' || s === 'trip_only') return 'Already in';
  // Normal outcomes of a read, nothing to fix here:
  if (s === 'duplicate') return 'Copy of a toll already in (not counted twice)';
  if (s === 'after_seal') return 'Came after the week was sealed (listed under late items)';
  if (s === 'corrected') return 'Amount updated';
  if (s === 'correction_pending') return 'Amount change waiting (listed under late items)';
  if (s === 'unknown_driver') {
    const name = String(row.driver_name ?? '').trim();
    return `Problem: Driver ${name || 'in the file'} isn't set up in Roam Fleet`;
  }
  if (s === 'unknown_plate') {
    const plate = String(row.plate ?? row.ref ?? '').trim();
    return `Problem: Car ${plate || 'in the file'} isn't in your fleet`;
  }
  if (PROBLEM_STATUSES.has(s) || s.includes('needs_person') || s.includes('unknown')) {
    const reason = row.reason ? String(row.reason) : s.replace(/_/g, ' ');
    return `Problem: ${reason}`;
  }
  if (s) return `Problem: ${s.replace(/_/g, ' ')}`;
  return '—';
}

export function isImportProblemRow(row: TollV2ImportReportRow): boolean {
  const label = importRowStatusLabel(row);
  return label.startsWith('Problem:');
}

export function problemRows(report: TollV2ImportReport | undefined): TollV2ImportReportRow[] {
  if (!report?.report?.length) return [];
  return report.report.filter(isImportProblemRow);
}

export function countProblems(report: TollV2ImportReport | undefined): number {
  return problemRows(report).length;
}

function sumAmountMinor(rows: TollV2ImportReportRow[]): number {
  return rows.reduce((acc, r) => {
    const a = r.amount_minor;
    if (typeof a === 'number' && Number.isFinite(a)) return acc + Math.abs(a);
    return acc;
  }, 0);
}

/** Reports saved before amounts were stored have none; then the amount is left out, never shown as J$0.00. */
function hasAmounts(rows: TollV2ImportReportRow[]): boolean {
  return rows.some((r) => typeof r.amount_minor === 'number');
}

/** Rows that count toward the amount read: not problems, and not a copy of a toll already counted. */
function usedRows(rows: TollV2ImportReportRow[]): TollV2ImportReportRow[] {
  return rows.filter((r) => !isImportProblemRow(r) && r.status !== 'duplicate');
}

export function resultLineForKind(
  kind: string | undefined,
  report: TollV2ImportReport | undefined,
): string | null {
  if (!report) return null;
  const rows = report.report ?? [];
  const counts = report.counts ?? {};
  const problems = countProblems(report);

  if (kind === 'tag_statement') {
    const tollRows = rows.filter((r) => {
      const s = String(r.status ?? '');
      return s === 'new' || s === 'unchanged' || s.includes('charge');
    });
    const n = Number(counts.new ?? 0) + Number(counts.unchanged ?? 0) || tollRows.length || Number(report.rows ?? 0);
    // The amount covers the same rows as the count: tolls of this read (late ones and copies are listed elsewhere).
    const counted = rows.filter((r) => r.status === 'new' || r.status === 'unchanged');
    const spend = hasAmounts(rows) ? ` · ${fmtTollMinor(sumAmountMinor(counted))}` : '';
    return `${n} tolls read${spend} · ${problems} problems`;
  }
  if (kind === 'topups') {
    const n = Number(counts.new ?? 0) + Number(counts.unchanged ?? 0) || usedRows(rows).length || rows.length;
    const spend = hasAmounts(rows) ? ` · ${fmtTollMinor(sumAmountMinor(usedRows(rows)))}` : '';
    return `${n} ${n === 1 ? 'top-up' : 'top-ups'} read${spend}`;
  }
  if (kind === 'uber') {
    const tripN = Number(report.rows ?? 0) || rows.length;
    const paybacks = usedRows(rows).filter(
      (r) => r.status !== 'trip_only' && typeof r.amount_minor === 'number' && (r.amount_minor as number) > 0,
    );
    const payN = paybacks.length;
    const paySum = hasAmounts(rows) ? ` · ${fmtTollMinor(sumAmountMinor(paybacks))}` : '';
    return `${tripN} trips read · ${payN} toll ${payN === 1 ? 'payback' : 'paybacks'}${paySum}`;
  }
  return null;
}

export function reportForSource(
  reports: TollV2ImportReport[],
  sourceId: string,
): TollV2ImportReport | undefined {
  const kind =
    sourceId === 'toll_usage'
      ? 'tag_statement'
      : sourceId === 'toll_topup'
        ? 'topups'
        : sourceId === 'uber_bundle'
          ? 'uber'
          : null;
  if (!kind) return undefined;
  return reports.find((r) => r.kind === kind);
}

export function tollFilesSummary(
  sources: Array<{ id: string; status: string; requirement: string }>,
  reports: TollV2ImportReport[],
  readProblems: Partial<Record<string, TollV2ImportReportRow[]>> = {},
): { received: number; total: number; problems: number } {
  const tollIds = new Set(['toll_usage', 'toll_topup', 'uber_bundle']);
  const applicable = sources.filter((s) => tollIds.has(s.id) && s.requirement !== 'not_applicable');
  const total = applicable.length;
  const received = applicable.filter((s) => s.status === 'received').length;
  // The latest read of each file only; an older upload's problems are already replaced.
  const problems = applicable.reduce(
    (acc, s) => acc + countProblems(reportForSource(reports, s.id)) + (readProblems[s.id]?.length ?? 0),
    0,
  );
  return { received, total, problems };
}

/** The reader's problem rows (never saved: the file isn't kept) in the report-row shape the card uses. */
export function readProblemRows(
  problems: Array<{ row?: number; reason?: string; code?: string; value?: string; name?: string }> | undefined,
): TollV2ImportReportRow[] {
  return (problems ?? [])
    .filter((p) => p.code === 'unknown_driver' || p.code === 'unknown_plate')
    .map((p) => ({
      row: p.row,
      status: p.code,
      reason: p.reason,
      ref: p.value,
      ...(p.code === 'unknown_driver' ? { driver_id: p.value, driver_name: p.name } : { plate: p.value }),
    }));
}

export function normalizePlateAlias(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}
