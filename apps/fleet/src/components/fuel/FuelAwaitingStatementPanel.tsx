/**
 * Transaction Logs → Awaiting statement.
 * Gas card split fills whose cash half waits on the card statement, plus fills where the
 * statement and the pump disagree (split mismatches). Moved here from the Review Queue:
 * these are saved fills waiting on the statement, not driver receipts to approve.
 *
 * Loads its own backlog (same lookback as the Review Queue) — the Logs week picker
 * must not hide an old fill that is still waiting.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { FinancialTransaction } from '../../types/data';
import type { FuelEntry } from '../../types/fuel';
import { api } from '../../services/api';
import { fuelService } from '../../services/fuelService';
import { usePermissions } from '../../hooks/usePermissions';
import {
  isAwaitingCashTx,
  isStaleAwaitingCash,
  isUnresolvedSplitVariance,
  daysAwaitingCash,
  awaitingStatementRowAction,
  describeSplitCashRehome,
  describeSplitCashRehomeBlocked,
  metaFlagOn,
  splitReconTolerance,
} from '@roam/fuel-core';
import { formatFuelMoney } from '../../utils/formatFuelMoney';
import {
  fuelReviewQueueLookbackRange,
  FUEL_REVIEW_QUEUE_TX_PAGE_SIZE,
  FUEL_REVIEW_QUEUE_TX_MAX_PAGES,
} from '../../utils/fuelReviewQueueLookback';
import { SplitCashResolveDialog, type SplitCashResolveChoice } from './SplitCashResolveDialog';

export type ResolveSplitCashFn = (args: {
  tx: FinancialTransaction;
  action: SplitCashResolveChoice;
  cashAmount?: number;
  reason?: string;
}) => Promise<void> | void;

type Meta = Record<string, unknown>;

const actionBtn =
  'inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd] hover:bg-[#e6eeff] dark:bg-zinc-900 dark:text-zinc-100';

function RehomeNotes({ m }: { m: Meta }) {
  const rehome = describeSplitCashRehome(m);
  const blocked = describeSplitCashRehomeBlocked(m);
  return (
    <>
      {rehome ? <div className="mt-0.5 text-[12px] text-[#47464c] dark:text-zinc-400">{rehome}</div> : null}
      {blocked ? <div className="mt-0.5 text-[12px] text-amber-800">{blocked}</div> : null}
    </>
  );
}

const STALE_DAYS = 14;

function daysSince(ymd?: string): number | null {
  if (!ymd) return null;
  const [y, mo, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return null;
  const then = new Date(y, mo - 1, d).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** Gas card fill whose amount and litres come from the card statement (Cost shows "Awaiting"). */
function isCardFillAwaitingCharge(e: FuelEntry): boolean {
  const m = (e.metadata || {}) as Meta;
  // Split fills are listed above through their cash half.
  return metaFlagOn(m.awaitingCardStatement) && !(typeof m.fillGroupId === 'string' && m.fillGroupId);
}

export const AWAITING_STATEMENT_KEY = ['fuel-awaiting-statement'] as const;

type AwaitingStatementData = { rows: FinancialTransaction[]; cardFills: FuelEntry[] };

async function fetchAwaitingStatement(): Promise<AwaitingStatementData> {
  const range = fuelReviewQueueLookbackRange();
  const [tx, entries] = await Promise.all([
    api.getAllTransactionsInRange({
      startDate: range.startDate,
      endDate: range.endDate,
      pageSize: FUEL_REVIEW_QUEUE_TX_PAGE_SIZE,
      maxPages: FUEL_REVIEW_QUEUE_TX_MAX_PAGES,
      fuelQueue: true,
    }),
    fuelService
      .getAllFuelEntriesInRange({ startDate: range.startDate, endDate: range.endDate, pageSize: 500, maxPages: 4 })
      .catch((e) => {
        console.error('[AwaitingStatement] fuel entries load failed', e);
        return [] as FuelEntry[];
      }),
  ]);
  return {
    rows: (tx || []) as FinancialTransaction[],
    cardFills: (entries || [])
      .filter(isCardFillAwaitingCharge)
      .sort((x, y) => String(x.date || '').localeCompare(String(y.date || ''))),
  };
}

/** One load for the view and the button count (cached 60s, refreshed on focus). */
export function useAwaitingStatement(enabled = true) {
  return useQuery({
    queryKey: AWAITING_STATEMENT_KEY,
    queryFn: fetchAwaitingStatement,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Everything the view lists: mismatches + gas card fills waiting + cash parts waiting. */
export function awaitingStatementCount(data?: AwaitingStatementData): number {
  if (!data) return 0;
  let n = data.cardFills.length;
  for (const t of data.rows) {
    if (isUnresolvedSplitVariance(t) || isAwaitingCashTx(t)) n += 1;
  }
  return n;
}

export function FuelAwaitingStatementPanel({
  onResolveSplitCash,
  getDriverName,
  getVehicleName,
}: {
  onResolveSplitCash?: ResolveSplitCashFn;
  getDriverName: (id?: string) => string;
  getVehicleName: (id?: string) => string;
}) {
  const { can } = usePermissions();
  const query = useAwaitingStatement();
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const cardFills = query.data?.cardFills ?? [];
  const loading = query.isLoading;
  const error = query.error ? (query.error instanceof Error && query.error.message ? query.error.message : 'Could not load the fills waiting on the statement.') : null;
  const [resolveTx, setResolveTx] = useState<FinancialTransaction | null>(null);
  const [resolving, setResolving] = useState(false);
  const { refetch } = query;
  const load = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Same as the Review Queue: post split cash the statement already settled, then refresh.
  useEffect(() => {
    let live = true;
    void fuelService
      .ensurePostedEntries(40)
      .catch(() => ({ healed: 0, blocked: 0 }))
      .then((r) => {
        if (live && r && Number((r as { healed?: number }).healed) > 0) void refetch();
      });
    return () => {
      live = false;
    };
  }, [refetch]);

  const mismatches = useMemo(() => rows.filter((t) => isUnresolvedSplitVariance(t)), [rows]);
  const awaiting = useMemo(
    () => rows.filter((t) => isAwaitingCashTx(t) && !isUnresolvedSplitVariance(t)),
    [rows],
  );
  const staleCount = awaiting.filter((t) => isStaleAwaitingCash(t)).length;
  const blockedCount = awaiting.filter((t) => metaFlagOn((t.metadata as Meta | undefined)?.splitCashRehomeBlocked)).length;

  const driverLabel = (t: FinancialTransaction) =>
    String(t.driverName || '').trim() || (t.driverId ? getDriverName(t.driverId) : '') || 'Unknown driver';

  const confirmResolve = async (args: Parameters<ResolveSplitCashFn>[0]) => {
    if (!onResolveSplitCash) return;
    setResolving(true);
    try {
      await onResolveSplitCash(args);
      setResolveTx(null);
      await load();
    } catch (e) {
      console.error('[AwaitingStatement] resolve failed', e);
    } finally {
      setResolving(false);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-[15px] text-[#47464c]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading fills waiting on the statement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] text-[#ba1a1a]">{error}</p>
        <button type="button" onClick={() => void load()} className={actionBtn}>
          Try again
        </button>
      </div>
    );
  }

  // Stitch: docs/stitch/fuel-review-and-logs-fleet/transaction_logs_awaiting_statement
  const rowCard =
    'flex flex-col gap-3 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:bg-[#2a2a2d]';
  const listCard =
    'overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] divide-y divide-[#e6eeff] dark:bg-[#2a2a2d] dark:divide-zinc-800';
  const plateBox = 'rounded-md bg-[#e6eeff] px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider text-[#0d1c2e] dark:bg-zinc-800 dark:text-zinc-100';
  const iconTile = (icon: string, tone: 'red' | 'blue' | 'amber') => (
    <span
      className={
        'material-symbols-outlined flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[22px] ' +
        (tone === 'red'
          ? 'bg-[#ffdad6] text-[#ba1a1a]'
          : tone === 'amber'
            ? 'bg-[#fde68a]/60 text-[#b45309]'
            : 'bg-[#e6eeff] text-[#0d1c2e] dark:bg-zinc-800 dark:text-zinc-100')
      }
    >
      {icon}
    </span>
  );
  const daysChip = (days: number | null, stale: boolean) =>
    days == null ? null : (
      <span
        className={
          'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ' +
          (stale ? 'bg-[#fde68a] text-[#92400e]' : 'bg-[#fffbeb] text-[#b45309]')
        }
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {days} day{days === 1 ? '' : 's'}
      </span>
    );
  const nothing = (text: string) => (
    <div className="flex items-center justify-center gap-4 rounded-2xl bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] dark:bg-[#2a2a2d]">
      <span className="material-symbols-outlined flex h-11 w-11 items-center justify-center rounded-full bg-[#82f5c1] text-[22px] text-[#00714e]">check</span>
      <span className="text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">{text}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <p className="-mt-2 text-[15px] text-[#47464c] dark:text-zinc-400">Shows every fill still waiting, from any week.</p>

      {mismatches.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[#ba1a1a]">
              <span className="material-symbols-outlined text-[22px]">error</span>
              Card and pump don&apos;t agree ({mismatches.length})
            </h2>
            <p className="text-[15px] text-[#47464c] dark:text-zinc-400">
              The gas card charge is more than the pump total, so the cash part can&apos;t be worked out. Decide what to pay.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {mismatches.map((tx) => {
              const m = (tx.metadata || {}) as Meta;
              const pump = Number(m.splitPumpTotal) || 0;
              const statement = Number(m.splitStatementAmount);
              const derived = Number(m.splitDerivedCashAmount);
              const delta = Number(m.splitVarianceDelta);
              const plate = tx.vehicleId ? getVehicleName(tx.vehicleId) : '';
              return (
                <div
                  key={tx.id}
                  className="flex flex-col gap-4 overflow-hidden rounded-2xl border-l-4 border-[#ba1a1a] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] lg:flex-row lg:items-center dark:bg-[#2a2a2d]"
                >
                  <div className="flex flex-1 items-center gap-4">
                    {iconTile('local_gas_station', 'red')}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">
                        {fillWhenYmd(tx.date, (tx as { time?: string }).time)}
                        <span className="font-normal text-[#c9c5cd]">·</span>
                        <span className="font-medium">{driverLabel(tx)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-[#47464c] dark:text-zinc-400">
                        {plate ? <span className={plateBox}>{plate}</span> : null}
                        {tx.vendor ? <span>{tx.vendor}</span> : null}
                      </div>
                      <RehomeNotes m={m} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 rounded-xl bg-[#eff4ff] px-4 py-3 dark:bg-zinc-900/50">
                    <div>
                      <div className="text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">Pump total</div>
                      <div className="text-[17px] font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-50">{formatFuelMoney(pump)}</div>
                    </div>
                    <span className="material-symbols-outlined text-[20px] text-[#47464c]">arrow_forward</span>
                    <div>
                      <div className="text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">Card charge</div>
                      <div className="text-[17px] font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-50">
                        {Number.isFinite(statement) ? formatFuelMoney(statement) : '—'}
                      </div>
                    </div>
                    {Number.isFinite(derived) ? (
                      <div>
                        <div className="text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">Cash</div>
                        <div className="text-[17px] font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-50">{formatFuelMoney(derived)}</div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-start gap-1 lg:items-end">
                    <span className="flex items-center gap-1.5 rounded-full bg-[#ffdad6] px-3 py-1 text-[13px] font-semibold text-[#ba1a1a]">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {Number.isFinite(delta) ? `${formatFuelMoney(Math.abs(delta))} difference` : 'Amounts don’t match'}
                    </span>
                    <span className="text-[13px] text-[#47464c] dark:text-zinc-400">Allowed difference {formatFuelMoney(splitReconTolerance(pump))}</span>
                    {m.splitPumpPriceOutlier === true ? <span className="text-[13px] text-amber-700">Price looks unusual</span> : null}
                  </div>
                  {can('fuel.approve') && onResolveSplitCash ? (
                    <button
                      type="button"
                      onClick={() => setResolveTx(tx)}
                      className="min-h-[44px] shrink-0 rounded-xl bg-black px-6 text-[13px] font-medium text-white shadow-md hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900"
                    >
                      Decide pay
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[20px] font-semibold text-[#0d1c2e] dark:text-zinc-50">Gas card fills waiting for their charge ({cardFills.length})</h2>
          <p className="text-[15px] text-[#47464c] dark:text-zinc-400">
            The amount and litres come from the gas card statement. They fill in by themselves when it is uploaded.
          </p>
        </div>
        {cardFills.length === 0 ? (
          nothing('No gas card fills are waiting.')
        ) : (
          <div className={listCard}>
            {cardFills.map((e) => {
              const days = daysSince(e.date);
              const stale = (days ?? 0) >= STALE_DAYS;
              return (
                <div key={e.id} className={`${rowCard} ${stale ? '!bg-[#fffbeb] dark:!bg-[#451a03]/60' : ''}`}>
                  <div className="flex items-center gap-4">
                    {iconTile(stale ? 'hourglass_top' : 'credit_card', stale ? 'amber' : 'blue')}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">
                        {fillWhenYmd(e.date, e.time)}
                        <span className="font-normal text-[#c9c5cd]">·</span>
                        <span className="font-medium">{e.driverId ? getDriverName(e.driverId) : 'Unknown driver'}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-[#47464c] dark:text-zinc-400">
                        {e.vehicleId ? <span className={plateBox}>{getVehicleName(e.vehicleId)}</span> : null}
                        {e.vendor || e.location ? <span>{[e.vendor || e.location, e.stationAddress].filter(Boolean).join(', ')}</span> : null}
                        {e.odometer ? (
                          <>
                            <span className="text-[#c9c5cd]">·</span>
                            <span className="font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-100">{Number(e.odometer).toLocaleString('en-US')} km</span>
                          </>
                        ) : null}
                      </div>
                      {stale ? (
                        <p className="mt-1 text-[13px] text-[#92400e]">Waited 14+ days — check the latest gas card statement was uploaded.</p>
                      ) : null}
                    </div>
                  </div>
                  {daysChip(days, stale)}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[20px] font-semibold text-[#0d1c2e] dark:text-zinc-50">Cash part waiting on the statement ({awaiting.length})</h2>
          <p className="text-[15px] text-[#47464c] dark:text-zinc-400">
            For fills paid partly by gas card and partly in cash, the cash part is worked out when the statement is uploaded. Nothing to do unless a fill has waited 14 days or more.
          </p>
        </div>
        {awaiting.length === 0 ? (
          nothing('Nothing waiting.')
        ) : (
          <div className={listCard}>
            {staleCount > 0 ? (
              <div className="bg-[#fffbeb] px-5 py-3 text-[13px] text-[#92400e]">
                {staleCount} fill{staleCount === 1 ? ' has' : 's have'} waited 14+ days — a fleet owner can escalate.
              </div>
            ) : null}
            {blockedCount > 0 ? (
              <div className="bg-[#fffbeb] px-5 py-3 text-[13px] text-[#92400e]">
                {blockedCount} fill{blockedCount === 1 ? '' : 's'} can&apos;t go into an open week — reopen or create a later fuel period (or fix the missing driver).
              </div>
            ) : null}
            {awaiting.map((tx) => {
              const m = (tx.metadata || {}) as Meta;
              const days = daysAwaitingCash(tx);
              const stale = isStaleAwaitingCash(tx);
              const blocked = describeSplitCashRehomeBlocked(m);
              const escalate =
                awaitingStatementRowAction(tx, can('fuel.split_cash_override')) === 'escalate' && onResolveSplitCash;
              return (
                <div key={tx.id} className={`${rowCard} ${stale || blocked ? '!bg-[#fffbeb] dark:!bg-[#451a03]/60' : ''}`}>
                  <div className="flex items-center gap-4">
                    {iconTile(stale ? 'hourglass_top' : 'payments', stale ? 'amber' : 'blue')}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">
                        {fillWhenYmd(tx.date, (tx as { time?: string }).time)}
                        <span className="font-normal text-[#c9c5cd]">·</span>
                        <span className="font-medium">{driverLabel(tx)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-[#47464c] dark:text-zinc-400">
                        {tx.vehicleId ? <span className={plateBox}>{getVehicleName(tx.vehicleId)}</span> : null}
                        <span>Pump {formatFuelMoney(Number(m.splitPumpTotal) || 0)}</span>
                        {m.splitPumpPriceOutlier === true ? <span className="text-amber-700">· Price looks unusual</span> : null}
                      </div>
                      <RehomeNotes m={m} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {daysChip(days, stale)}
                    {escalate ? (
                      <button type="button" className={actionBtn} onClick={() => setResolveTx(tx)}>
                        Escalate
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <SplitCashResolveDialog
        open={!!resolveTx}
        tx={resolveTx}
        busy={resolving}
        onOpenChange={(open) => {
          if (!open) setResolveTx(null);
        }}
        onResolve={confirmResolve}
      />
    </div>
  );
}

/** "Wed 25 Nov, 10:46 AM" from a YYYY-MM-DD date and optional HH:mm time. */
function fillWhenYmd(date?: string, time?: string | null): string {
  const d = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return date || '—';
  const [y, mo, dd] = d.split('-').map(Number);
  const dt = new Date(y, mo - 1, dd);
  const m = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  const dayText = dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (!m) return dayText;
  dt.setHours(Number(m[1]), Number(m[2]));
  return `${dayText}, ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

export default FuelAwaitingStatementPanel;
