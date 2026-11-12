/**
 * Step 6 Trips & earnings (Stitch screen 8). Reads only saved rows (WRA-07):
 * the calculator's close check and the saved driver weeks. Nothing runs on open.
 *  - Seal earnings / Reseal is a button (a change through the week wrapper).
 *  - Statement cash vs trip cash per driver, with Accept statement cash
 *    (approval dialog: Send for approval or Approve it myself).
 *  - Activity vs trips per driver (WRA-21): read only, never blocks Close.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { TRIPS_EARNINGS_BLOCKER_CODES } from '@roam/finance-core';
import {
  fetchWeekActivity,
  fetchWeekMoney,
  sealEarnings,
  sendForApproval,
  type ReconCashMismatch,
  type ReconWeekActivity,
  type ReconRunPayload,
} from '../../../services/reconApi';
import { weekCloseApi } from '../../../services/weekCloseApi';
import { humanBlockerLabel } from '../../../utils/weekCloseBlockers';
import { CloseWeekUberReimportDialog } from '../CloseWeekUberReimportDialog';
import { toast } from 'sonner';
import { ReconApprovalDialog } from './ReconApprovalDialog';
import { approvalErrorMessage, assertWeekUnchanged, useReconApprovals } from './useReconApprovals';
import { formatWeekRange } from './weekListFormat';

const TRIPS_EARNINGS_CODES = new Set<string>(TRIPS_EARNINGS_BLOCKER_CODES);
const EARNINGS_SEAL_CODES = new Set(['EARNINGS_STATEMENT_MISSING', 'EARNINGS_STATEMENT_UNVERIFIED', 'EARNINGS_ENGINE_DRIFT']);

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}J$${body}`;
};

type StepBlocker = { code: string; message: string | null; driverId: string | null; severity: string };

/** Trips & earnings items from the saved close check. Exported for tests. */
export function tripsStepBlockers(closeCheck: ReconRunPayload['closeCheck']): {
  waiting: boolean;
  failed: boolean;
  items: StepBlocker[];
  needsSeal: boolean;
} {
  if (!closeCheck || closeCheck.status === 'none') return { waiting: true, failed: false, items: [], needsSeal: false };
  if (closeCheck.status === 'error') return { waiting: false, failed: true, items: [], needsSeal: false };
  const items = closeCheck.blockers
    .filter((b) => TRIPS_EARNINGS_CODES.has(String(b.code || '').toUpperCase()))
    .map((b) => ({ code: b.code, message: b.message, driverId: b.driver_id, severity: b.severity }));
  return {
    waiting: false,
    failed: false,
    items,
    needsSeal: items.some((b) => EARNINGS_SEAL_CODES.has(String(b.code).toUpperCase())),
  };
}

function hoursText(h: number): string {
  return `${(Number.isFinite(h) && h > 0 ? h : 0).toFixed(1)} h`;
}

/** WRA-21: one line per driver; Roam's own name when the Uber driver is known to Roam. */
export function activityCardRows(
  activity: ReconWeekActivity | undefined,
  roamNames: Map<string, string>,
): Array<{ driverId: string; name: string; online: string; onTrip: string; share: string; trips: number }> {
  if (!activity || activity.status !== 'ok') return [];
  return activity.drivers.map((d) => ({
    driverId: d.driverId,
    name: roamNames.get(d.driverId) || d.name,
    online: hoursText(d.onlineHours),
    onTrip: hoursText(d.onTripHours),
    share: d.onTripPct === null ? '—' : `${d.onTripPct}%`,
    trips: d.tripsCompleted,
  }));
}

function ActivityVsTrips({
  line,
  weekKey,
  roamNames,
}: {
  line: 'rideshare' | 'rush_delivery';
  weekKey: string;
  roamNames: Map<string, string>;
}) {
  const query = useQuery({
    queryKey: ['recon-week-activity', line, weekKey],
    queryFn: () => fetchWeekActivity(line, weekKey),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const activity = query.data;
  const rows = activityCardRows(activity, roamNames);

  return (
    <section className="space-y-3 rounded-2xl border border-[#e5eeff] bg-white p-5" data-testid="recon-activity-vs-trips">
      <div>
        <p className="text-lg font-semibold text-[#0b1c30]">Activity vs trips</p>
        <p className="text-sm text-[#47464c]">
          Uber hours online against hours on a trip, from this week&apos;s Uber upload. For a look only — it never stops Close.
          InDrive has no activity export.
        </p>
      </div>
      {query.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-[#47464c]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading activity…</p>
      ) : query.isError ? (
        <p className="text-sm text-[#93000a]">Could not load activity. Reload the week.</p>
      ) : !activity || activity.status === 'no_upload' ? (
        <p className="text-sm text-[#47464c]">No Uber upload for this week yet.</p>
      ) : activity.status === 'not_recorded' ? (
        <p className="text-sm text-[#47464c]">Not recorded for this week. Hours are saved with Uber uploads made from 11 Nov 2026.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#47464c]">This week&apos;s Uber upload has no driver hours.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.driverId} className="rounded-xl bg-[#f8f9ff] p-4 text-sm" data-testid="recon-activity-row">
              <p className="font-semibold text-[#0b1c30]">{r.name}</p>
              <dl className="mt-1 grid grid-cols-4 gap-2">
                <div><dt className="text-[12px] text-[#47464c]">Online</dt><dd className="font-semibold tabular-nums">{r.online}</dd></div>
                <div><dt className="text-[12px] text-[#47464c]">On a trip</dt><dd className="font-semibold tabular-nums">{r.onTrip}</dd></div>
                <div><dt className="text-[12px] text-[#47464c]">On a trip %</dt><dd className="font-semibold tabular-nums">{r.share}</dd></div>
                <div><dt className="text-[12px] text-[#47464c]">Trips</dt><dd className="font-semibold tabular-nums">{r.trips}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ReconTripsEarningsStep({
  run,
  onRefresh,
}: {
  run: ReconRunPayload;
  onRefresh?: (payload?: ReconRunPayload) => void | Promise<void>;
}) {
  const weekKey = run.run.weekKey;
  const line = run.run.serviceLine as 'rideshare' | 'rush_delivery';
  const version = Number(run.run.version);
  const closed = run.run.state === 'closed';
  const approvals = useReconApprovals();
  const [uberOpen, setUberOpen] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [cashTarget, setCashTarget] = useState<ReconCashMismatch | null>(null);
  const [busy, setBusy] = useState(false);

  const state = tripsStepBlockers(run.closeCheck);
  const moneyQuery = useQuery({
    queryKey: ['recon-week-money', line, weekKey, version],
    queryFn: () => fetchWeekMoney(line, weekKey),
    staleTime: 30_000,
    retry: false,
  });
  const nameById = useMemo(
    () => new Map((moneyQuery.data?.drivers ?? []).map((d) => [d.driverId, d.driverName || `Driver ${d.driverId.slice(0, 8)}`])),
    [moneyQuery.data?.drivers],
  );
  const openCash = (moneyQuery.data?.cashSourceMismatches ?? []).filter((m) => !m.accepted);

  const doSeal = async () => {
    setSealing(true);
    try {
      const payload = await sealEarnings(line, weekKey, version);
      toast.success('Earnings sealed from the uploaded trips');
      await onRefresh?.(payload && (payload as ReconRunPayload).run ? payload : undefined);
    } catch (e) {
      toast.error(approvalErrorMessage(e));
    } finally {
      setSealing(false);
    }
  };

  const sendCash = async (reason: string) => {
    if (!cashTarget) return;
    setBusy(true);
    try {
      await sendForApproval({ line, weekKey, action: 'accept_statement_cash', params: { driverId: cashTarget.driverId }, reason, expectedVersion: version });
      toast.success('Sent for approval');
      setCashTarget(null);
      approvals.refresh();
    } catch (e) {
      toast.error(approvalErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const selfCash = async (reason: string) => {
    if (!cashTarget) return;
    setBusy(true);
    try {
      await assertWeekUnchanged(line, weekKey, version);
      await weekCloseApi.acknowledgeCashSource(weekKey, cashTarget.driverId, reason);
      toast.success('Statement cash accepted');
      setCashTarget(null);
      await moneyQuery.refetch();
      await onRefresh?.();
    } catch (e) {
      toast.error(approvalErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const driverName = (m: { driverId: string; driverName?: string | null }) =>
    m.driverName || nameById.get(m.driverId) || `Driver ${m.driverId.slice(0, 8)}`;

  return (
    <div className="space-y-5" data-testid="recon-trips-step">
      {state.waiting ? (
        <p className="flex items-center gap-2 rounded-2xl bg-[#eff4ff] px-4 py-3 text-sm text-[#0b1c30]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Waiting for the calculator to check this week.
        </p>
      ) : state.failed ? (
        <p className="rounded-2xl bg-[#fff1f2] px-4 py-3 text-sm text-[#93000a]">Could not load this week&apos;s checks. Reload the week.</p>
      ) : (
        <div
          className={
            state.needsSeal
              ? 'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-5 py-4'
              : 'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#a7f3d0] bg-[#ecfdf5] px-5 py-4'
          }
          data-testid="recon-earnings-seal"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-[#0b1c30]">
            {state.needsSeal ? <AlertCircle className="h-5 w-5 text-[#92400e]" aria-hidden /> : <CheckCircle2 className="h-5 w-5 text-[#069669]" aria-hidden />}
            {state.needsSeal ? 'Earnings are not sealed from the uploaded trips yet.' : 'Earnings sealed from the uploaded trips.'}
          </p>
          {!closed ? (
            <button
              type="button"
              onClick={() => void doSeal()}
              disabled={sealing}
              data-testid="recon-seal-earnings"
              className={
                state.needsSeal
                  ? 'flex h-10 items-center gap-2 rounded-xl bg-[#030213] px-4 text-sm font-semibold text-white disabled:opacity-60'
                  : 'flex h-10 items-center gap-2 rounded-xl bg-[#e5eeff] px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#d3e4fe] disabled:opacity-60'
              }
            >
              {sealing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              {state.needsSeal ? 'Seal earnings' : 'Reseal'}
            </button>
          ) : null}
        </div>
      )}

      {state.items.filter((b) => !EARNINGS_SEAL_CODES.has(String(b.code).toUpperCase())).length > 0 ? (
        <ul className="space-y-2">
          {state.items
            .filter((b) => !EARNINGS_SEAL_CODES.has(String(b.code).toUpperCase()))
            .map((b, i) => (
              <li key={`${b.code}-${i}`} className="flex gap-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#0b1c30]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#92400e]" aria-hidden />
                <span>
                  {humanBlockerLabel(b as never)}
                  {b.driverId ? ` — ${nameById.get(b.driverId) || `Driver ${b.driverId.slice(0, 8)}`}` : ''}
                </span>
              </li>
            ))}
        </ul>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-[#e5eeff] bg-white p-5" data-testid="recon-cash-check">
        <div>
          <p className="text-lg font-semibold text-[#0b1c30]">Statement cash vs trip cash</p>
          <p className="text-sm text-[#47464c]">Cash on the platform statement against the cash on each driver&apos;s trips.</p>
        </div>
        {moneyQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-[#47464c]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
        ) : moneyQuery.isError ? (
          <p className="text-sm text-[#ba1a1a]">Could not load the cash check.</p>
        ) : openCash.length === 0 ? (
          <p className="text-sm text-[#069669]">Every driver&apos;s cash matches, or was accepted.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-[12px] uppercase tracking-wider text-[#47464c]">
                <tr>
                  <th className="py-2 font-semibold">Driver</th>
                  <th className="py-2 font-semibold">Statement</th>
                  <th className="py-2 font-semibold">Trips</th>
                  <th className="py-2 font-semibold">Difference</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {openCash.map((m) => (
                  <tr key={m.driverId} className="border-t border-[#eff4ff]">
                    <td className="py-2 font-medium text-[#0b1c30]">{driverName(m)}</td>
                    <td className="py-2 tabular-nums">{MONEY(m.uberCash)}</td>
                    <td className="py-2 tabular-nums">{MONEY(m.uberTripCash)}</td>
                    <td className="py-2 font-semibold tabular-nums text-[#ba1a1a]">{MONEY(m.mismatch)}</td>
                    <td className="py-2 text-right">
                      {!closed ? (
                        <button
                          type="button"
                          onClick={() => setCashTarget(m)}
                          className="h-9 rounded-xl bg-[#030213] px-3 text-[13px] font-semibold text-white"
                        >
                          Accept statement cash
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ActivityVsTrips line={line} weekKey={weekKey} roamNames={nameById} />

      {!closed ? (
        <button
          type="button"
          onClick={() => setUberOpen(true)}
          className="h-10 rounded-xl bg-[#e5eeff] px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#d3e4fe]"
        >
          Re-upload Uber week
        </button>
      ) : null}

      {uberOpen ? (
        <CloseWeekUberReimportDialog
          open={uberOpen}
          onOpenChange={setUberOpen}
          weekLabel={formatWeekRange(weekKey)}
          weekKey={weekKey}
          onImported={async () => {
            await onRefresh?.();
          }}
        />
      ) : null}

      <ReconApprovalDialog
        open={!!cashTarget}
        onOpenChange={(o) => !o && setCashTarget(null)}
        title="Accept statement cash?"
        summary={cashTarget ? `${driverName(cashTarget)} · difference ${MONEY(cashTarget.mismatch)}` : ''}
        detail={
          cashTarget
            ? `Settlement uses the statement cash (${MONEY(cashTarget.uberCash)}); the trips add up to ${MONEY(cashTarget.uberTripCash)}. Accepting clears this check without changing collected cash.`
            : ''
        }
        confirmLabel="Approve & accept"
        canApprove={approvals.canApprove}
        otherApprovers={approvals.otherApprovers}
        busy={busy}
        onSend={sendCash}
        onSelfApprove={selfCash}
      />
    </div>
  );
}
