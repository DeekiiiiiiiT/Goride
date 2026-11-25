/**
 * "Fills waiting on drivers' phones" (Stitch Fleet screens 1 / 7; docs/fuel-log-offline-first-audit.md S2, FO-14).
 * Hidden when nothing waits. Round 2: only the card is new — no invented ids, buttons or rates.
 */
import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { fuelService } from '../../../services/fuelService';

type Row = Awaited<ReturnType<typeof fuelService.getPhoneOutbox>>['drivers'][number];

function sinceLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return sameDay ? time : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
}

export function useFuelPhoneOutbox(): { rows: Row[]; total: number } {
  const [state, setState] = useState<{ rows: Row[]; total: number }>({ rows: [], total: 0 });
  useEffect(() => {
    let live = true;
    const load = () =>
      fuelService
        .getPhoneOutbox()
        .then((r) => live && setState({ rows: r.drivers || [], total: r.totalPending || 0 }))
        .catch(() => {
          /* the card just stays hidden */
        });
    void load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  return state;
}

export function FuelPhoneWaitingCard({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + (r.pendingCount || 0), 0);
  return (
    <div className="mb-4 rounded-2xl border border-black/5 border-l-4 border-l-amber-500 bg-white p-5 shadow-sm dark:bg-[#2a2a2d] dark:border-[#3a3a3d]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <Smartphone className="h-5 w-5" />
        </span>
        <h3 className="text-xl font-semibold text-[#0b1c30] dark:text-zinc-50">Fills waiting on drivers' phones</h3>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {rows.length} driver{rows.length === 1 ? '' : 's'} · {total} fill{total === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.driverId}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-4 py-3 dark:bg-zinc-800/60"
          >
            <span className="font-semibold text-[#0b1c30] dark:text-zinc-50">{r.driverName || 'Driver'}</span>
            {r.vehicleId ? (
              <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-zinc-700 dark:text-zinc-200">{r.vehicleId}</span>
            ) : null}
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              {r.pendingCount} fill{r.pendingCount === 1 ? '' : 's'} · since {sinceLabel(r.oldestPendingAt)}
            </span>
            <span className="text-sm text-[#47464c] dark:text-zinc-400">Phone last seen {sinceLabel(r.lastSeenAt)}</span>
            {r.appVersion ? (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">App {r.appVersion}</span>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-[#47464c] dark:text-zinc-400">They send by themselves when the phone has signal.</p>
    </div>
  );
}

/** "2 on phone" chip on a driver row (Stitch Fleet screen 6). Hidden when nothing waits. */
export function FuelOnPhoneChip({ info, name }: { info?: { count: number; since: string | null }; name?: string }) {
  if (!info || !(info.count > 0)) return null;
  const title = `${info.count} fuel fill${info.count === 1 ? '' : 's'} on ${name ? `${name}'s` : 'the'} phone since ${sinceLabel(info.since)}. They send when the phone has signal.`;
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
    >
      <Smartphone className="h-3 w-3" /> {info.count} on phone
    </span>
  );
}
