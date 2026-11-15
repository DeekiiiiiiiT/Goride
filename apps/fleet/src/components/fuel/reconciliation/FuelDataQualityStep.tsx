/**
 * Stitch B flagged vehicle cards + Stitch C desktop issue queue table.
 * Cash-desk actions: Review details (flagged evidence overlay) + Mark reviewed.
 */
import { useState } from 'react';
import { CheckCircle2, Plus, ReceiptText } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import type { FuelEntry, WeeklyFuelReport } from '../../../types/fuel';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { UNAVAILABLE_KM_POLICY } from '../../../utils/fuelReconGlossary';
import { isFuelDataQualityFlagged } from '../../../utils/fuelDataQualityReview';
import { FuelVehicleEvidenceSheet } from './FuelPendingLogsSheet';
import { buildFuelFlagDeskRows, type FuelFlagDeskRow } from '../../../utils/fuelFillFlagClassify';
import type { FuelFlagDispositionMap } from '../../../utils/fuelFlagDisposition';
import { toEntryYmd } from '../../../utils/fuelWeekPeriod';

export type FuelQualityRow = {
  id: string;
  plate: string;
  driverName: string;
  healthStatus?: 'Emerald' | 'Amber' | 'Red';
  pendingCount: number;
  totalSpend: number;
  companyShare: number;
  driverShare: number;
  cashFromEarnings: number;
  netPay: number;
  misc: number;
  subtitle?: string;
  odometerIncomplete?: boolean;
};

function severityLabel(r: FuelQualityRow): string {
  if (r.odometerIncomplete) return 'Odometer gap';
  if (r.healthStatus === 'Red') return 'Critical Gap';
  if (r.healthStatus === 'Amber') return 'Needs a look';
  return 'Review';
}

function severityChipClass(r: FuelQualityRow): string {
  if (r.healthStatus === 'Red') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (r.odometerIncomplete || r.healthStatus === 'Amber') {
    return 'border-amber-200/80 bg-amber-50 text-amber-900';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

/** Issue copy aligned with Fuel Flags classifier (not pending-to-post counts). */
export function plainIssue(r: FuelQualityRow, openFlaggedFillCount = 0): string {
  const parts: string[] = [];
  if (r.healthStatus && r.healthStatus !== 'Emerald') parts.push(r.healthStatus);
  if (openFlaggedFillCount > 0) {
    parts.push(
      openFlaggedFillCount === 1
        ? '1 flagged fill needs review'
        : `${openFlaggedFillCount} flagged fills need review`,
    );
  } else if (r.odometerIncomplete) {
    parts.push('Incomplete odometer data — unexplained fuel may be inflated');
  } else if (r.subtitle) {
    // Health-only / odometer subtitle from toFuelQualityRow (no pending).
    return r.subtitle;
  } else if (r.healthStatus === 'Red') {
    parts.push('Needs a fix before you lock the week.');
  } else if (r.healthStatus === 'Amber') {
    parts.push('Needs a quick look — tank cycle or gap signal.');
  } else if (r.pendingCount > 0) {
    parts.push(`${r.pendingCount} fill(s) will post when you Finalize.`);
  } else {
    parts.push('Review this vehicle.');
  }
  return parts.join(' · ');
}

/**
 * Cash-desk Data quality queue — flagged cards (B) / table (C); Mark reviewed unlocks Continue.
 */
export function FuelDataQualityStep({
  rows,
  breakdownRows,
  periodLocked,
  showBreakdown,
  onToggleBreakdown,
  onAddAdjustment,
  needsOdometerChainAck = false,
  odometerChainReviewed = false,
  odometerChainNote = '',
  onOdometerChainNoteChange,
  onAckOdometerChain,
  reviewedVehicleIds,
  onMarkReviewed,
  weekFuelEntries = [],
  weekStartYmd,
  weekEndYmd,
  dispositions,
}: {
  rows: FuelQualityRow[];
  breakdownRows: FuelQualityRow[];
  periodLocked?: boolean;
  showBreakdown: boolean;
  onToggleBreakdown: () => void;
  onAddAdjustment: () => void;
  needsOdometerChainAck?: boolean;
  odometerChainReviewed?: boolean;
  odometerChainNote?: string;
  onOdometerChainNoteChange?: (value: string) => void;
  onAckOdometerChain?: () => void;
  reviewedVehicleIds?: Set<string>;
  onMarkReviewed?: (vehicleId: string) => void;
  /** Week-window fills — powers Review details overlay (no leave wizard). */
  weekFuelEntries?: FuelEntry[];
  weekStartYmd?: string;
  weekEndYmd?: string;
  dispositions?: FuelFlagDispositionMap;
}) {
  const [reviewRow, setReviewRow] = useState<FuelQualityRow | null>(null);
  const reviewed = reviewedVehicleIds || new Set<string>();
  const flagged = rows.filter((r) =>
    isFuelDataQualityFlagged({
      healthStatus: r.healthStatus,
      odometerIncomplete: r.odometerIncomplete,
    }),
  );
  const pendingOnly = rows.filter(
    (r) =>
      !isFuelDataQualityFlagged({
        healthStatus: r.healthStatus,
        odometerIncomplete: r.odometerIncomplete,
      }) && r.pendingCount > 0,
  );
  const uncleared = flagged.filter((r) => !reviewed.has(r.id));

  const start =
    weekStartYmd ||
    (weekFuelEntries[0] ? toEntryYmd(weekFuelEntries[0].date) : '');
  const end = weekEndYmd || start;
  const allFlagRows: FuelFlagDeskRow[] =
    start && end
      ? buildFuelFlagDeskRows(weekFuelEntries, {
          weekStartYmd: start,
          weekEndYmd: end,
          weekLocked: Boolean(periodLocked),
          dispositions,
        })
      : [];

  const openCriticalByVehicle = (vehicleId: string) =>
    allFlagRows.filter(
      (r) =>
        r.entry.vehicleId === vehicleId &&
        r.reasons.some((x) => x.severity === 'critical' && !x.resolved),
    ).length;

  const openFlaggedByVehicle = (vehicleId: string) =>
    allFlagRows.filter(
      (r) =>
        r.entry.vehicleId === vehicleId && r.reasons.some((x) => !x.resolved),
    ).length;

  const flaggedFillCount = allFlagRows.filter((r) =>
    r.reasons.some((x) => !x.resolved),
  ).length;

  const reviewFlaggedRows = reviewRow
    ? allFlagRows.filter((r) => r.entry.vehicleId === reviewRow.id)
    : [];

  return (
    <div className="space-y-4">
      {(flaggedFillCount > 0 || uncleared.length > 0) && (
        <div className="flex flex-wrap items-baseline justify-between gap-2" data-testid="fuel-dq-summary">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">
            {flaggedFillCount} flagged fill{flaggedFillCount === 1 ? '' : 's'}
            {uncleared.length > 0
              ? ` · ${uncleared.length} car${uncleared.length === 1 ? '' : 's'} still need${uncleared.length === 1 ? 's' : ''} a review`
              : ''}
          </p>
          {uncleared.length > 0 ? (
            <p className="text-[15px] text-[#0b1c30]">
              Total: {formatFuelMoney(uncleared.reduce((s, r) => s + (Number(r.totalSpend) || 0), 0))}
            </p>
          ) : null}
        </div>
      )}
      {needsOdometerChainAck && !periodLocked && (
        <div className="space-y-3 rounded border border-amber-200 bg-amber-50 px-4 py-3">
          {odometerChainReviewed ? (
            <p className="text-sm text-amber-950">
              Thin odometer chain acknowledged — timing stays unmeasurable; categories unchanged.
            </p>
          ) : (
            <>
              <p className="text-sm text-amber-950">
                Not enough odometered fills to measure tank timing. Categories stay as-is; timing and
                fills-without-odometer carves stay $0.
              </p>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                  Reason <span className="font-normal normal-case">(8+ characters)</span>
                </span>
                <textarea
                  className="min-h-[72px] w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
                  value={odometerChainNote}
                  onChange={(e) => onOdometerChainNoteChange?.(e.target.value)}
                  placeholder="Why are you continuing with an unmeasurable tank window?"
                />
              </label>
              <Button
                type="button"
                className="min-h-11"
                disabled={!onAckOdometerChain || odometerChainNote.trim().length < 8}
                onClick={() => onAckOdometerChain?.()}
              >
                Acknowledge &amp; continue
              </Button>
            </>
          )}
        </div>
      )}

      {uncleared.length === 0 && flagged.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl bg-[#ecfdf5] px-4 py-4 text-[15px] text-[#069669]" title={UNAVAILABLE_KM_POLICY}>
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> No car needs a look this week.
        </div>
      ) : uncleared.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl bg-[#ecfdf5] px-4 py-4 text-[15px] text-[#069669]">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> Every flagged car is reviewed.
        </div>
      ) : (
        <ul className="space-y-3" data-testid="fuel-dq-cars">
          {uncleared.map((r) => {
            const critical = openCriticalByVehicle(r.id);
            return (
              <li key={r.id} className="flex flex-col gap-4 rounded-2xl bg-[#eff4ff] p-5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-3 text-[15px] text-[#0b1c30]">
                    <span className="text-lg font-semibold">{r.plate}</span>
                    <span className="text-[#47464c]">·</span>
                    <span>{r.driverName}</span>
                  </p>
                  <p className="mt-1 text-sm text-[#47464c]">
                    {plainIssue(r, openFlaggedByVehicle(r.id))} · {formatFuelMoney(r.totalSpend)} total
                  </p>
                  {critical > 0 && !periodLocked ? (
                    <p className="mt-1 text-[13px] text-[#ba1a1a]">
                      {critical} flagged fill{critical === 1 ? '' : 's'} need{critical === 1 ? 's' : ''} a decision first.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${r.healthStatus === 'Red' ? 'bg-[#fff1f2] text-[#ba1a1a]' : 'bg-[#dce9ff] text-[#0b1c30]'}`}>
                    {severityLabel(r)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReviewRow(r)}
                    className="h-10 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#f8f9ff]"
                  >
                    Review details
                  </button>
                  {!periodLocked && onMarkReviewed ? (
                    <button
                      type="button"
                      disabled={critical > 0}
                      title={critical > 0 ? `${critical} flagged fills need a decision first` : undefined}
                      onClick={() => onMarkReviewed(r.id)}
                      className="h-10 rounded-xl bg-[#030213] px-4 text-sm font-semibold text-white hover:bg-[#213145] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Mark reviewed
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pendingOnly.length > 0 && (
        <p className="text-xs text-slate-500">
          {pendingOnly.length} vehicle(s) have pending fills that post when you Finalize — they do
          not block Continue.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!periodLocked ? (
          <button
            type="button"
            onClick={onAddAdjustment}
            className="flex h-10 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add adjustment
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleBreakdown}
          className="flex h-10 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]"
        >
          <ReceiptText className="h-4 w-4" aria-hidden /> {showBreakdown ? 'Hide' : 'Show'} full cost breakdown
        </button>
      </div>

      {showBreakdown && (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-[#f5f2ff] text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Driver / Vehicle</th>
                <th className="px-3 py-3 font-medium">Health</th>
                <th className="px-3 py-3 font-medium text-right">Total fuel bought</th>
                <th className="px-3 py-3 font-medium text-right">Company keeps</th>
                <th className="px-3 py-3 font-medium text-right">Driver’s fuel share</th>
                <th className="px-3 py-3 font-medium text-right">Cash from earnings</th>
                <th className="px-3 py-3 font-medium text-right">Net</th>
                <th className="px-3 py-3 font-medium text-right">Unexplained</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900">{r.driverName}</div>
                    <div className="text-xs text-slate-500">{r.plate}</div>
                  </td>
                  <td className="px-3 py-3">
                    {r.healthStatus ? (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          r.healthStatus === 'Red'
                            ? 'border-rose-200 bg-rose-50 text-rose-800'
                            : r.healthStatus === 'Amber'
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {r.healthStatus}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatFuelMoney(r.totalSpend)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatFuelMoney(r.companyShare)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-700">
                    {formatFuelMoney(r.driverShare)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatFuelMoney(r.cashFromEarnings)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatFuelMoney(r.netPay)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums ${
                      r.misc > FUEL_SPEND_EPS ? 'font-semibold text-[#684000]' : ''
                    }`}
                  >
                    {formatFuelMoney(r.misc)}
                  </td>
                </tr>
              ))}
              {breakdownRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    No spend this week.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <FuelVehicleEvidenceSheet
        open={Boolean(reviewRow)}
        onOpenChange={(open) => {
          if (!open) setReviewRow(null);
        }}
        plate={reviewRow?.plate || ''}
        driverName={reviewRow?.driverName || 'Driver'}
        flaggedRows={reviewFlaggedRows}
      />
    </div>
  );
}

/** Build export/breakdown rows from live weekly reports (real fields only). */
export function buildQualityBreakdownFromReports(
  reports: WeeklyFuelReport[],
  resolve: (r: WeeklyFuelReport) => FuelQualityRow,
): FuelQualityRow[] {
  return reports
    .filter((r) => (r.totalGasCardCost || 0) > FUEL_SPEND_EPS)
    .map(resolve);
}
