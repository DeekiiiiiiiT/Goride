/**
 * One-time past-weeks cleanup. Nothing is posted until that step is confirmed.
 * Later steps stay locked until the one above is done.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../ui/button';
import { settlementCommandsApi } from '../../../services/settlementCommandsApi';
import { weekCloseApi } from '../../../services/weekCloseApi';
import { toast } from 'sonner';

const CLOSE_WEEKS = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'];

type WeekRow = { week: string; driverId: string; amount: number; closed: boolean };
type Choice = 'carry' | 'write_off';
type CorrectionLine = { sourceWeek: string; amount: number; sentence: string; driverId?: string };
type Oct12 = { sourceWeek: string; amount: number; sentence: string } | null;

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function PastWeeksCard({
  onOpenCloseWeek,
}: {
  onOpenCloseWeek?: (weekKey: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [openCloseWeeks, setOpenCloseWeeks] = useState<string[]>(CLOSE_WEEKS);
  const [lines, setLines] = useState<CorrectionLine[]>([]);
  const [net, setNet] = useState(0);
  const [oct12, setOct12] = useState<Oct12>(null);
  const [matchesAudit, setMatchesAudit] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [driverId, setDriverId] = useState('');
  const [payoutReady, setPayoutReady] = useState(false);
  const [payoutGap, setPayoutGap] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [legacy, corrections, closed] = await Promise.all([
        settlementCommandsApi.legacyWeeks({ confirm: false }),
        settlementCommandsApi.fuelShareCorrections({ confirm: false }),
        weekCloseApi.listClosed(2026).catch(() => []),
      ]);
      const nextWeeks = legacy.weeks || [];
      setWeeks(nextWeeks);
      setChoice((prev) => {
        const next: Record<string, Choice> = {};
        for (const week of nextWeeks) next[week.week] = prev[week.week] || 'carry';
        return next;
      });
      const closedKeys = new Set(closed.map((week) => String(week.weekKey).slice(0, 10)));
      setOpenCloseWeeks(CLOSE_WEEKS.filter((week) => !closedKeys.has(week)));
      setLines(corrections.lines || []);
      setNet(Number(corrections.net) || 0);
      setOct12(corrections.oct12 || null);
      setMatchesAudit(Boolean(corrections.matchesAudit));
      setCorrectionReason(corrections.reason || '');
      const id = corrections.lines?.[0]?.driverId || nextWeeks[0]?.driverId || '';
      setDriverId(id);
      if (id) {
        const payout = await settlementCommandsApi.payoutBackfill({ confirm: false, driverId: id });
        setPayoutReady(Boolean(payout.ready));
        setPayoutGap(payout.stillOff?.[0] ? `Week of ${payout.stillOff[0].week} would still be off.` : '');
      }
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load past weeks');
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const olderDone = loaded && weeks.length === 0;
  const closeDone = olderDone && openCloseWeeks.length === 0;
  const correctionsDone = closeDone && lines.length === 0 && !oct12;

  const confirmOlder = async () => {
    setBusy(true);
    try {
      await settlementCommandsApi.legacyWeeks({
        confirm: true,
        choices: weeks.map((week) => ({
          week: week.week,
          action: choice[week.week] || 'carry',
          reason: reason[week.week],
        })),
      });
      toast.success('Older weeks were posted onto the open week.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post older weeks');
    } finally {
      setBusy(false);
    }
  };

  const confirmCorrections = async () => {
    setBusy(true);
    try {
      await settlementCommandsApi.fuelShareCorrections({ confirm: true, driverId: driverId || undefined });
      toast.success('Corrections were posted onto the open week.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not post corrections');
    } finally {
      setBusy(false);
    }
  };

  const confirmPayouts = async () => {
    if (!driverId) return;
    setBusy(true);
    try {
      await settlementCommandsApi.payoutBackfill({ confirm: true, driverId });
      toast.success('Missing payments were recorded.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record payments');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 p-4 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Past weeks</h2>
        <p className="text-sm text-slate-600">
          Do these in order. Nothing is posted until you confirm that step.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">1. Older weeks (Dec–Jan)</h3>
        <p className="text-sm text-slate-600">
          These weeks are not recalculated. Later weeks cannot close until this is done.
          Carry keeps the amount and moves it to the open week. Write-off needs a reason.
        </p>
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {!loading && olderDone ? <p className="text-sm text-slate-600">Older weeks are done.</p> : null}
        {weeks.map((week) => (
          <div key={`${week.driverId}-${week.week}`} className="grid gap-2 border-b border-slate-100 pb-2 sm:grid-cols-[8rem_8rem_1fr]">
            <span className="text-sm font-medium">{week.week}</span>
            <span className="text-sm tabular-nums">{money(week.amount)}</span>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label>
                <input
                  type="radio"
                  checked={(choice[week.week] || 'carry') === 'carry'}
                  onChange={() => setChoice((prev) => ({ ...prev, [week.week]: 'carry' }))}
                />{' '}
                Carry
              </label>
              <label>
                <input
                  type="radio"
                  checked={choice[week.week] === 'write_off'}
                  onChange={() => setChoice((prev) => ({ ...prev, [week.week]: 'write_off' }))}
                />{' '}
                Write off
              </label>
              {choice[week.week] === 'write_off' ? (
                <input
                  className="min-w-[16rem] rounded border border-slate-300 px-2 py-1"
                  placeholder="Why this is written off"
                  value={reason[week.week] || ''}
                  onChange={(e) => setReason((prev) => ({ ...prev, [week.week]: e.target.value }))}
                />
              ) : null}
            </div>
          </div>
        ))}
        {weeks.length > 0 ? (
          <Button type="button" disabled={busy} onClick={() => void confirmOlder()}>
            Confirm older weeks
          </Button>
        ) : null}
      </div>

      <div className={olderDone ? 'space-y-2' : 'space-y-2 opacity-60'}>
        <h3 className="text-sm font-semibold text-slate-800">2. Close Sep 7 through Oct 5</h3>
        <p className="text-sm text-slate-600">
          Finalize fuel first, then close these weeks in order. An earlier open week still blocks the next one.
        </p>
        {!olderDone ? <p className="text-sm text-slate-500">Finish older weeks first.</p> : null}
        {olderDone && closeDone ? <p className="text-sm text-slate-600">These weeks are closed.</p> : null}
        {olderDone && openCloseWeeks.length > 0 ? (
          <>
            <ul className="text-sm text-slate-700 list-disc pl-5">
              {openCloseWeeks.map((week) => <li key={week}>Week of {week} is still open</li>)}
            </ul>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenCloseWeek?.(openCloseWeeks[0])}
            >
              Open Close Week
            </Button>
          </>
        ) : null}
      </div>

      <div className={closeDone ? 'space-y-2' : 'space-y-2 opacity-60'}>
        <h3 className="text-sm font-semibold text-slate-800">3. Corrections</h3>
        {!closeDone ? <p className="text-sm text-slate-500">Close Sep 7 through Oct 5 first.</p> : null}
        {closeDone && correctionsDone ? (
          <p className="text-sm text-slate-600">Corrections are already on the open week.</p>
        ) : null}
        {lines.map((line) => (
          <p key={line.sourceWeek} className="text-sm text-slate-700">{line.sentence}</p>
        ))}
        {oct12 ? <p className="text-sm text-slate-700">{oct12.sentence}</p> : null}
        {(lines.length > 0 || oct12) ? (
          <p className="text-sm font-medium text-slate-900">
            Jan 19 through Aug 31: {money(net)}
            {oct12 ? `. Oct 12: ${money(oct12.amount)}` : ''}
          </p>
        ) : null}
        {closeDone && !matchesAudit && !correctionsDone ? (
          <p className="text-sm text-amber-800">{correctionReason || 'These amounts do not match the audit yet.'}</p>
        ) : null}
        {closeDone && !correctionsDone ? (
          <Button type="button" disabled={busy || !matchesAudit} onClick={() => void confirmCorrections()}>
            Confirm corrections
          </Button>
        ) : null}
      </div>

      <div className={correctionsDone ? 'space-y-2' : 'space-y-2 opacity-60'}>
        <h3 className="text-sm font-semibold text-slate-800">4. Missing payments</h3>
        <p className="text-sm text-slate-600">
          Jun 15 records the $2,565.44 payment that was reversed, not another reversal.
          Confirm stays off unless payments minus reversals will match what every week says was paid.
        </p>
        {!correctionsDone ? <p className="text-sm text-slate-500">Post the corrections first.</p> : null}
        {correctionsDone && !payoutReady ? (
          <p className="text-sm text-amber-800">{payoutGap || 'Payments would still not match.'}</p>
        ) : null}
        {correctionsDone ? (
          <Button type="button" disabled={busy || !payoutReady || !driverId} onClick={() => void confirmPayouts()}>
            Confirm missing payments
          </Button>
        ) : null}
      </div>
    </section>
  );
}
