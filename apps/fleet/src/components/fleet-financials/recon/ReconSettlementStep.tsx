/**
 * Read-only per-driver settlement amounts (Close Week confirm pattern) — R2-26.
 * Cash desk link lives here — after fuel/tolls — not on Trips & earnings.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { MONEY_EPS, periodEndForAnchor } from '@roam/finance-core';
import type { ReconRunPayload } from '../../../services/reconApi';
import { useSettlementQueue } from '../../../hooks/useSettlementQueue';
import { collectCashPayment, payDriverWeek } from '../../../hooks/useCashCollection';
import { settlementCommandsApi, isPeriodFrozenError } from '../../../services/settlementCommandsApi';
import { weekCloseApi } from '../../../services/weekCloseApi';
import { resolvePayQueueOwed } from '../../../utils/driverSettlementsPayAmount';
import { computeSettlementLaneMetrics } from '../../../utils/settlementLaneMetrics';
import { humanBlockerLabel } from '../../../utils/weekCloseBlockers';
import { LogCashPaymentModal } from '../../drivers/LogCashPaymentModal';
import { RecordPayoutModal, type RecordPayoutSavePayload } from '../../drivers/RecordPayoutModal';
import { SettleFromBalanceModal } from './SettleFromBalanceModal';
import { Button } from '../../ui/button';
import { toast } from 'sonner';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

function collectOwedMajor(r: {
  amountOwed?: number | null;
  collectKind?: string | null;
  cashStillHeld?: number | null;
  settlementAmount?: number | null;
}): number {
  if (r.amountOwed != null && Number.isFinite(r.amountOwed)) return Math.max(0, Number(r.amountOwed));
  if (r.collectKind === 'cash_held') return Math.max(0, Number(r.cashStillHeld) || 0);
  return Math.max(0, Math.abs(Number(r.settlementAmount) || 0));
}

export function ReconSettlementStep({
  run,
  onNavigate,
}: {
  run: ReconRunPayload;
  onNavigate?: (
    page: string,
    opts?: { startYmd: string; endYmd?: string; driverId?: string },
  ) => void;
}) {
  const weekKey = run.run.weekKey;
  const periodEnd = useMemo(
    () => format(addDays(parseISO(`${weekKey}T12:00:00`), 6), 'yyyy-MM-dd'),
    [weekKey],
  );

  const queueParams = {
    weekFrom: weekKey,
    weekTo: periodEnd,
    minAmount: 0,
    pageSize: 200,
    groupBy: 'week' as const,
  };
  const collectQuery = useSettlementQueue({ view: 'collect', ...queueParams });
  const payQuery = useSettlementQueue({ view: 'pay', ...queueParams });
  const qc = useQueryClient();
  const [payTarget, setPayTarget] = useState<{
    driverId: string;
    name: string;
    amount: number;
  } | null>(null);
  const [collectTarget, setCollectTarget] = useState<{
    driverId: string;
    name: string;
    amount: number;
  } | null>(null);
  const [settleTarget, setSettleTarget] = useState<{
    driverId: string;
    name: string;
    amount: number;
  } | null>(null);

  const movementsQuery = useQuery({
    queryKey: ['recon-settlement-movements', weekKey, periodEnd],
    queryFn: () =>
      settlementCommandsApi.getMovements({
        weekFrom: weekKey,
        weekTo: periodEnd,
        kind: 'pay',
        pageSize: 200,
      }),
  });
  const previewQuery = useQuery({
    queryKey: ['recon-close-preview', weekKey, run.run.serviceLine],
    queryFn: () =>
      weekCloseApi.preview(weekKey, (run.run.serviceLine as 'rideshare' | 'rush_delivery') || 'rideshare'),
    staleTime: 30_000,
    retry: false,
  });

  const awaitingDriverIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of movementsQuery.data?.rows || []) {
      if (String(row.status || '').toLowerCase() !== 'pending') continue;
      if (String(row.kind || '') !== 'pay') continue;
      const id = String(row.driverId || '').trim();
      if (id) ids.add(id);
    }
    return ids;
  }, [movementsQuery.data?.rows]);

  const overReturnNotes = useMemo(() => {
    const all = [...(previewQuery.data?.blockers || []), ...(previewQuery.data?.weekBlockers || [])];
    return all.filter((b) => String(b.code || '').toUpperCase() === 'CASH_HELD_OVER_RETURNED');
  }, [previewQuery.data]);

  const settlement = useMemo(() => {
    return computeSettlementLaneMetrics(
      collectQuery.data?.rows || [],
      payQuery.data?.rows || [],
    );
  }, [collectQuery.data?.rows, payQuery.data?.rows]);

  const drivers = useMemo(() => {
    type Row = {
      driverId: string;
      driverName?: string;
      amountOwed?: number | null;
      collectKind?: string | null;
      cashStillHeld?: number | null;
      settlementAmount?: number | null;
    };
    const byId = new Map<
      string,
      { driverId: string; name: string; owed: number; fleet: number }
    >();
    for (const r of (collectQuery.data?.rows || []) as Row[]) {
      const id = String(r.driverId || '').trim();
      if (!id) continue;
      const cur = byId.get(id) || {
        driverId: id,
        name: String(r.driverName || id),
        owed: 0,
        fleet: 0,
      };
      if (r.driverName) cur.name = String(r.driverName);
      if (r.collectKind !== 'cash_held') cur.owed += collectOwedMajor(r);
      byId.set(id, cur);
    }
    for (const r of (payQuery.data?.rows || []) as Row[]) {
      const id = String(r.driverId || '').trim();
      if (!id) continue;
      const cur = byId.get(id) || {
        driverId: id,
        name: String(r.driverName || id),
        owed: 0,
        fleet: 0,
      };
      if (r.driverName) cur.name = String(r.driverName);
      cur.fleet += resolvePayQueueOwed(r);
      byId.set(id, cur);
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [collectQuery.data?.rows, payQuery.data?.rows]);

  const loading = collectQuery.isLoading || payQuery.isLoading;

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading settlement amounts…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Who owes whom for the week of {weekKey}. Pay or collect here. A bank payout stays open until
        it clears. Closing is the next step.
      </p>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onNavigate?.('driver-settlements', {
            startYmd: weekKey,
            endYmd: periodEndForAnchor(weekKey),
          })
        }
      >
        Open in Driver Settlements
      </Button>

      <dl className="grid gap-2 sm:grid-cols-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Fleet owes</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{MONEY(settlement.fleetOwes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Drivers owe</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{MONEY(settlement.driversOwe)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Cash held</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{MONEY(settlement.cashHeld)}</dd>
        </div>
      </dl>

      {previewQuery.data?.fuelCreditExceedsCashInHand && settlement.fleetOwes > MONEY_EPS ? (
        <p className="text-sm text-slate-600">
          This pay includes company fuel already covered. Cash returned was not more than cash collected.
        </p>
      ) : null}

      {overReturnNotes.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {overReturnNotes.map((b, i) => (
            <li key={`${b.driverId || 'week'}-${i}`}>
              {humanBlockerLabel(b)}
              {Number.isFinite(Number(b.persisted)) ? ` (${MONEY(Number(b.persisted))})` : ''}. Pay
              and Collect do not clear this.
            </li>
          ))}
        </ul>
      ) : null}

      {drivers.filter((d) => d.owed > MONEY_EPS || d.fleet > MONEY_EPS || awaitingDriverIds.has(d.driverId)).length === 0 ? (
        <p className="text-sm text-slate-500">Nothing left to pay or collect for this week.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Driver</th>
                <th className="px-3 py-2 font-medium tabular-nums">Driver owes</th>
                <th className="px-3 py-2 font-medium tabular-nums">Fleet owes</th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {drivers
                .filter((d) => d.owed > MONEY_EPS || d.fleet > MONEY_EPS || awaitingDriverIds.has(d.driverId))
                .map((d) => (
                <tr key={d.driverId} className="border-t border-slate-100 text-slate-800">
                  <td className="px-3 py-2 font-medium">
                    {d.name}
                    {awaitingDriverIds.has(d.driverId) ? (
                      <span className="mt-1 block text-xs font-normal text-amber-800">Awaiting bank clear</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {d.owed > MONEY_EPS ? MONEY(d.owed) : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {d.fleet > MONEY_EPS ? MONEY(d.fleet) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {d.fleet > MONEY_EPS ? (
                        <Button type="button" size="sm" className="h-11" onClick={() => setPayTarget({ driverId: d.driverId, name: d.name, amount: d.fleet })}>
                          Pay
                        </Button>
                      ) : null}
                      {d.owed > MONEY_EPS ? (
                        <Button type="button" size="sm" variant="outline" className="h-11" onClick={() => setCollectTarget({ driverId: d.driverId, name: d.name, amount: d.owed })}>
                          Collect
                        </Button>
                      ) : null}
                      {d.owed > MONEY_EPS ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-11"
                          onClick={() =>
                            setSettleTarget({
                              driverId: d.driverId,
                              name: d.name,
                              amount: d.owed,
                            })
                          }
                        >
                          Settle from balance
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordPayoutModal
        isOpen={!!payTarget}
        onClose={() => setPayTarget(null)}
        driverName={payTarget?.name || ''}
        maxAmount={payTarget?.amount || 0}
        workPeriodStart={weekKey}
        workPeriodEnd={periodEnd}
        onSave={async (payload: RecordPayoutSavePayload) => {
          if (!payTarget) return;
          try {
            const { needsApproval } = await payDriverWeek(qc, {
              driverId: payTarget.driverId,
              weekAnchor: weekKey,
              amount: Math.abs(Number(payload.amount) || 0),
              method: payload.paymentMethod,
              reference: payload.referenceNumber,
              note: payload.notes,
              expectedOutstanding: payTarget.amount,
            });
            if (needsApproval) toast.info('Sent for approval');
            else if (String(payload.paymentMethod || '') !== 'Cash') {
              toast.message('Payout logged — awaiting bank clear');
            }
            await qc.invalidateQueries({ queryKey: ['recon-run'] });
            await previewQuery.refetch();
          } catch (err) {
            if (isPeriodFrozenError(err)) {
              toast.error('Reopen the week first');
              return;
            }
            toast.error(err instanceof Error ? err.message : 'Pay failed');
            throw err;
          }
        }}
      />

      <LogCashPaymentModal
        isOpen={!!collectTarget}
        onClose={() => setCollectTarget(null)}
        driverName={collectTarget?.name || ''}
        cashOwed={collectTarget?.amount || 0}
        initialAmount={collectTarget?.amount}
        initialWorkPeriodStart={`${weekKey}T12:00:00.000Z`}
        initialWorkPeriodEnd={`${periodEnd}T12:00:00.000Z`}
        allowedTypes={['payment']}
        onSave={async (payment) => {
          if (!collectTarget) return;
          await collectCashPayment(qc, {
            driverId: collectTarget.driverId,
            weekAnchor: weekKey,
            amount: Math.abs(Number(payment.amount) || 0),
            method: payment.paymentMethod,
            reference: payment.referenceNumber,
            note: payment.notes,
            expectedOutstanding: collectTarget.amount,
          });
          await qc.invalidateQueries({ queryKey: ['recon-run'] });
          await previewQuery.refetch();
        }}
      />

      <SettleFromBalanceModal
        open={!!settleTarget}
        onClose={() => setSettleTarget(null)}
        driverId={settleTarget?.driverId || ''}
        driverName={settleTarget?.name || ''}
        owingWeekStart={weekKey}
        owingAmount={settleTarget?.amount || 0}
        onConfirm={async ({ creditWeekStart, amount }) => {
          if (!settleTarget) return;
          try {
            await settlementCommandsApi.settleFromBalance({
              driverId: settleTarget.driverId,
              owingWeekStart: weekKey,
              creditWeekStart,
              amount,
              idempotencyKey: `settle-from-balance:${settleTarget.driverId}:${weekKey}:${creditWeekStart}:${amount.toFixed(2)}`,
            });
            toast.success(
              `Moved ${MONEY(amount)} onto week of ${creditWeekStart}`,
            );
            await qc.invalidateQueries({ queryKey: ['settlements'] });
            await qc.invalidateQueries({ queryKey: ['recon-run'] });
            await qc.invalidateQueries({ queryKey: ['recon-close-preview'] });
            await collectQuery.refetch();
            await payQuery.refetch();
            await previewQuery.refetch();
          } catch (err) {
            if (isPeriodFrozenError(err)) {
              toast.error('Reopen the week first');
              throw err;
            }
            toast.error(err instanceof Error ? err.message : 'Settle from balance failed');
            throw err;
          }
        }}
      />
    </div>
  );
}
