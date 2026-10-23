import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAdminConfirm } from './contexts/AdminConfirmContext';
import {
  fetchWeekCalculator,
  setWeekCalculator,
  type WeekCalculatorNight,
  type WeekCalculatorStatus,
} from './fleetAdminService';

const TITLES: Record<string, string> = {
  disconnected: 'Not connected',
  stopped: 'Stopped',
  working: 'Working',
  idle: 'Idle',
  needs_a_look: 'Needs a look',
  off: 'Off',
  turning_off: 'Turning off',
  starting: 'Starting',
  checking: 'Checking',
  ready: 'Ready',
};

function nightLabel(night: WeekCalculatorNight): string {
  const when = new Date(night.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const mismatches = Number(night.mismatches || 0);
  if (night.kind === 'shadow_ok' && mismatches === 0) return `${when}: clean`;
  return `${when}: ${mismatches} ${mismatches === 1 ? 'difference' : 'differences'}`;
}

export function WeekCalculatorPage({ accessToken }: { accessToken: string }) {
  const { confirm } = useAdminConfirm();
  const [status, setStatus] = useState<WeekCalculatorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await fetchWeekCalculator(accessToken);
    setStatus(next);
    setError(null);
    return next;
  }, [accessToken]);

  useEffect(() => {
    let stop = false;
    void load()
      .catch((e) => {
        if (!stop) setError(e instanceof Error ? e.message : 'Could not read the week calculator.');
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load().catch((e) => setError(e instanceof Error ? e.message : 'Could not read the week calculator.'));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  const stopCalculator = async () => {
    const ok = await confirm({
      title: 'Stop the week calculator?',
      description: status?.closeRunning
        ? 'A week close is still running. Stopping now makes that close wait until you resume.'
        : 'Updates wait until you resume. Use this only if something is wrong.',
      confirmLabel: 'Stop',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await setWeekCalculator(accessToken, false));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stop the week calculator.');
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await setWeekCalculator(accessToken, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resume the week calculator.');
    } finally {
      setBusy(false);
    }
  };

  const state = status?.state ?? 'disconnected';
  const stopped = state === 'stopped';
  const canUse = Boolean(status?.canFlip && !busy);
  const waiting = status?.queueWaiting ?? 0;
  const nights = Array.isArray(status?.nights) ? status.nights : null;
  const holdKnown = typeof status?.holdLargerFleets === 'boolean';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Week calculator</h2>
        <p className="mt-1 text-sm text-slate-400">
          Starts when a week changes, finishes the work, then stops.
        </p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        ) : (
          <>
            <div className="text-2xl font-semibold text-white">{TITLES[state] ?? 'Week calculator'}</div>
            <p className="text-sm text-slate-300">{status?.message}</p>
            {typeof status?.queueWaiting === 'number' ? (
              <p className="text-sm text-slate-300">
                {waiting === 1 ? '1 update waiting' : `${waiting} updates waiting`}
              </p>
            ) : null}
            {status?.closeRunning ? (
              <p className="text-sm text-amber-300">A week close is still running.</p>
            ) : null}
            {nights ? (
              <div className="space-y-1">
                <p className="text-sm text-slate-400">Last seven nights</p>
                {nights.length === 0 ? (
                  <p className="text-sm text-slate-500">No nightly check yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {nights.map((night) => (
                      <li key={`${night.at}-${night.kind}`} className="text-sm text-slate-300">{nightLabel(night)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            {holdKnown && status?.holdLargerFleets ? (
              <p className="text-sm text-amber-300">{status.holdNote}</p>
            ) : null}
            {holdKnown && status?.holdLargerFleets === false ? (
              <p className="text-sm text-slate-400">Seven clean nights are in. A larger fleet can close.</p>
            ) : null}
            <p className="text-sm text-slate-400">{status?.costNote}</p>
            {status && !status.canFlip ? (
              <p className="text-sm text-slate-400">Only the fleet owner can stop or resume this.</p>
            ) : null}
            {status?.warning ? <p className="text-sm text-amber-300">{status.warning}</p> : null}
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {stopped ? (
              <Button
                type="button"
                disabled={!canUse}
                onClick={() => void resume()}
                className="bg-amber-600 hover:bg-amber-500"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resume'}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!canUse}
                onClick={() => void stopCalculator()}
                className="bg-slate-700 hover:bg-slate-600"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Emergency stop'}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
