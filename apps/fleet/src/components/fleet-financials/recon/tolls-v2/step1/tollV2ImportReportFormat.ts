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

function usedRows(rows: TollV2ImportReportRow[]): TollV2ImportReportRow[] {
  return rows.filter((r) => !isImportProblemRow(r));
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
    const spend = hasAmounts(rows) ? ` · ${fmtTollMinor(sumAmountMinor(usedRows(rows)))}` : '';
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
): { received: number; total: number; problems: number } {
  const tollIds = new Set(['toll_usage', 'toll_topup', 'uber_bundle']);
  const applicable = sources.filter((s) => tollIds.has(s.id) && s.requirement !== 'not_applicable');
  const total = applicable.length;
  const received = applicable.filter((s) => s.status === 'received').length;
  const problems = reports.reduce((acc, r) => acc + countProblems(r), 0);
  return { received, total, problems };
}

export function normalizePlateAlias(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}
