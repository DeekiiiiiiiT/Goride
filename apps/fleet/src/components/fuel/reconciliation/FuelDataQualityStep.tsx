/**
 * Stitch B flagged vehicle cards + Stitch C desktop issue queue table.
 * Cash-desk actions: Review details (flagged evidence overlay) + Mark reviewed.
 */
import { useState } from 'react';
import { Gauge, TrendingUp, TriangleAlert, User } from 'lucide-react';
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

function FlaggedVehicleCard({
  r,
  periodLocked,
  onReviewDetails,
  onMarkReviewed,
  openCriticalCount = 0,
  openFlaggedFillCount = 0,
}: {
  r: FuelQualityRow;
  periodLocked?: boolean;
  onReviewDetails: (row: FuelQualityRow) => void;
  onMarkReviewed?: (vehicleId: string) => void;
  openCriticalCount?: number;
  openFlaggedFillCount?: number;
}) {
  const markBlocked = openCriticalCount > 0;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold tracking-tight text-slate-900">{r.plate}</span>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
            <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Driver: <span className="font-medium text-slate-900">{r.driverName}</span>
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${severityChipClass(r)}`}
        >
          {r.odometerIncomplete ? (
            <Gauge className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          )}
          {severityLabel(r)}
        </span>
      </div>
      <p className="mt-2.5 rounded-lg border border-slate-200/60 bg-slate-50/80 p-2.5 text-sm leading-relaxed text-slate-600">
        {plainIssue(r, openFlaggedFillCount)}
        {r.totalSpend > FUEL_SPEND_EPS && (
          <>
            {' '}
            <strong className="font-semibold text-slate-900">
              {formatFuelMoney(r.totalSpend)}
            </strong>
          </>
        )}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-sm font-semibold text-[#3525cd] transition-colors hover:bg-slate-200 active:scale-[0.98]"
          onClick={() => onReviewDetails(r)}
        >
          Review details
          <span aria-hidden>→</span>
        </button>
        {!periodLocked && onMarkReviewed && (
          <>
            <Button
              type="button"
              className="h-12 min-h-12 w-full rounded-xl bg-[#3525cd] text-white hover:bg-[#2a1ea4] disabled:opacity-50"
              disabled={markBlocked}
              onClick={() => onMarkReviewed(r.id)}
            >
              Mark reviewed
            </Button>
            {markBlocked && (
              <p className="text-center text-xs text-rose-700">
                {openCriticalCount} flagged fill
                {openCriticalCount === 1 ? '' : 's'} need a decision first.
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
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
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">
            {flaggedFillCount} flagged fill{flaggedFillCount === 1 ? '' : 's'}
          </span>
          {uncleared.length > 0
            ? ` · ${uncleared.length} vehicle${uncleared.length === 1 ? '' : 's'} still need review`
            : ''}
        </p>
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

      {/* Desktop filter/utility bar — Stitch C */}
      <div className="hidden items-center justify-between gap-2 rounded border border-slate-200 bg-white p-2.5 md:flex">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-slate-200 bg-slate-100 px-2.5 py-1 text-sm font-bold text-[#3525cd]">
            All Issues ({uncleared.length})
          </span>
          <span className="px-2.5 py-1 text-sm text-slate-500">
            Flagged vehicles pending review
          </span>
        </div>
        {!periodLocked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 min-h-8"
            onClick={onAddAdjustment}
          >
            <TrendingUp className="mr-1.5 h-4 w-4" />
            Add Adjustment
          </Button>
        )}
      </div>

      {/* Mobile utility — Stitch B keeps actions quieter */}
      {!periodLocked && (
        <div className="flex flex-wrap gap-2 md:hidden">
          <Button type="button" variant="outline" className="min-h-11" onClick={onAddAdjustment}>
            <TrendingUp className="mr-2 h-4 w-4" />
            Add Adjustment
          </Button>
        </div>
      )}

      <p className="text-[12px] leading-[16px] text-slate-500 md:hidden" title={UNAVAILABLE_KM_POLICY}>
        {UNAVAILABLE_KM_POLICY}
      </p>

      {uncleared.length === 0 && flagged.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-10 text-center text-sm text-emerald-800">
          Nothing to fix — Continue.
        </div>
      ) : uncleared.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
          All flagged vehicles reviewed — Continue.
        </div>
      ) : (
        <>
          {/* Stitch B mobile cards */}
          <div className="space-y-3 md:hidden">
            <div className="flex items-baseline justify-between gap-2 px-0.5">
              <h4 className="text-base font-semibold text-slate-900">
                Vehicles that need a quick look ({uncleared.length})
              </h4>
              <span className="text-xs text-slate-400">Action required</span>
            </div>
            <ul className="space-y-3">
              {uncleared.map((r) => (
                <li key={r.id}>
                  <FlaggedVehicleCard
                    r={r}
                    periodLocked={periodLocked}
                    onReviewDetails={setReviewRow}
                    onMarkReviewed={onMarkReviewed}
                    openCriticalCount={openCriticalByVehicle(r.id)}
                    openFlaggedFillCount={openFlaggedByVehicle(r.id)}
                  />
                </li>
              ))}
            </ul>
          </div>

          {/* Stitch C desktop table */}
          <div className="hidden overflow-hidden rounded border border-slate-200 bg-white md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Vehicle &amp; Plate</th>
                  <th className="px-3 py-2.5 font-semibold">Driver</th>
                  <th className="px-3 py-2.5 font-semibold">Issue Description</th>
                  <th className="px-3 py-2.5 font-semibold">Severity</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Impact</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {uncleared.map((r) => (
                  <tr
                    key={r.id}
                    className={`min-h-[52px] transition-colors hover:bg-slate-50/60 ${
                      r.healthStatus === 'Red' ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{r.plate}</div>
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-900">{r.driverName}</td>
                    <td className="px-3 py-3">
                      <div
                        className={
                          r.healthStatus === 'Red'
                            ? 'font-medium text-rose-700'
                            : 'text-slate-900'
                        }
                      >
                        {plainIssue(r, openFlaggedByVehicle(r.id))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${severityChipClass(r)}`}
                      >
                        {severityLabel(r)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div
                        className={`font-bold tabular-nums ${
                          r.healthStatus === 'Red' ? 'text-rose-700' : 'text-slate-900'
                        }`}
                      >
                        {formatFuelMoney(r.totalSpend)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 min-h-8"
                          onClick={() => setReviewRow(r)}
                        >
                          Review details
                        </Button>
                        {!periodLocked && onMarkReviewed && (
                          <Button
                            type="button"
                            size="sm"
                            className={`h-8 min-h-8 disabled:opacity-50 ${
                              r.healthStatus === 'Red'
                                ? 'bg-rose-600 text-white hover:bg-rose-700'
                                : 'bg-[#3525cd] text-white hover:bg-[#2a1ea4]'
                            }`}
                            disabled={openCriticalByVehicle(r.id) > 0}
                            title={
                              openCriticalByVehicle(r.id) > 0
                                ? `${openCriticalByVehicle(r.id)} flagged fills need a decision first`
                                : undefined
                            }
                            onClick={() => onMarkReviewed(r.id)}
                          >
                            Mark reviewed
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
              <span>
                Showing {uncleared.length} vehicle exception
                {uncleared.length === 1 ? '' : 's'} (mark reviewed to continue)
              </span>
              <span className="text-xs text-slate-400">Sorted by severity</span>
            </div>
          </div>
        </>
      )}

      {pendingOnly.length > 0 && (
        <p className="text-xs text-slate-500">
          {pendingOnly.length} vehicle(s) have pending fills that post when you Finalize — they do
          not block Continue.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="min-h-11 md:hidden"
        onClick={onToggleBreakdown}
      >
        {showBreakdown ? 'Hide' : 'Show'} full cost breakdown
      </Button>
      <Button
        type="button"
        variant="link"
        className="hidden h-auto min-h-11 px-0 text-sm text-[#3525cd] md:inline-flex"
        onClick={onToggleBreakdown}
      >
        {showBreakdown ? 'Hide' : 'Show'} full cost breakdown →
      </Button>

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
