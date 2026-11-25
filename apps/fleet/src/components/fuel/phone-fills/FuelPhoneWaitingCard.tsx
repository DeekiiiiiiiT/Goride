/**
 * "Fills waiting on drivers' phones" + the Review Queue tiles + the Drivers-page chip.
 * Look: Stitch Fleet screens 1, 2 (tiles), 6 and 7. Content: docs/fuel-log-offline-first-audit.md
 * S2 / FO-14 and docs/fuel-review-queue-review.md section 3 — no invented ids, buttons or rates.
 */
import React, { useEffect, useState } from 'react';
import { fuelService } from '../../../services/fuelService';
import type { VehicleLite } from './FuelNeedsLookPanel';

type Row = Awaited<ReturnType<typeof fuelService.getPhoneOutbox>>['drivers'][number];

function sinceLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return sameDay ? time : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

/** Stitch screen 2 — three tiles at the top of the Review Queue. */
export function FuelReviewTiles({
  needsLook,
  waitingFills,
  waitingDrivers,
  ready,
}: {
  needsLook: number;
  waitingFills: number;
  waitingDrivers: number;
  ready: number;
}) {
  const tile = 'flex flex-col justify-between rounded-xl p-5 shadow-sm';
  const head = 'text-[12px] font-semibold uppercase tracking-wider';
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className={`${tile} ${needsLook ? 'bg-[#ffdad6]/40 text-[#ba1a1a]' : 'bg-[#eff4ff] text-[#47464c]'} dark:bg-zinc-800/60`}>
        <div className="mb-2 flex items-center justify-between">
          <span className={head}>Needs a look</span>
          <span className="material-symbols-outlined text-[20px]">warning</span>
        </div>
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-[32px] font-bold leading-none tabular-nums">{needsLook}</span>
          <span className="text-[12px] font-semibold">{needsLook === 1 ? 'fill' : 'fills'}</span>
        </div>
        <p className="text-[13px] font-medium">{needsLook ? "Photos the app couldn't read" : 'Nothing to check'}</p>
      </div>
      <div className={`${tile} ${waitingFills ? 'bg-[#ffdbca]/30 text-[#cf6721]' : 'bg-[#eff4ff] text-[#47464c]'} dark:bg-zinc-800/60`}>
        <div className="mb-2 flex items-center justify-between">
          <span className={head}>Waiting on phones</span>
          <span className="material-symbols-outlined text-[20px]">phonelink_ring</span>
        </div>
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-[32px] font-bold leading-none tabular-nums">{waitingFills}</span>
          <span className="text-[12px] font-semibold">{waitingFills === 1 ? 'fill' : 'fills'}</span>
        </div>
        <p className="text-[13px] font-medium">
          {waitingFills ? `On ${plural(waitingDrivers, "driver's phone", "drivers' phones")}` : 'Nothing waiting'}
        </p>
      </div>
      <div className={`${tile} bg-[#eff4ff] text-[#47464c] dark:bg-zinc-800/60 dark:text-zinc-300`}>
        <div className="mb-2 flex items-center justify-between">
          <span className={head}>Ready to approve</span>
          <span className="material-symbols-outlined text-[20px]">verified</span>
        </div>
        <div className="mb-1 flex items-baseline gap-2">
          <span className={`text-[32px] font-bold leading-none tabular-nums ${ready ? 'text-[#0d1c2e] dark:text-zinc-50' : ''}`}>{ready}</span>
          <span className="text-[12px] font-semibold">{ready === 1 ? 'fill' : 'fills'}</span>
        </div>
        <p className="text-[13px]">{ready ? 'In Pending below' : 'Nothing to approve'}</p>
      </div>
    </div>
  );
}

/** Stitch screen 1 / 7 — the waiting-on-phones card. Hidden when nothing waits. */
export function FuelPhoneWaitingCard({ rows, vehicles = {} }: { rows: Row[]; vehicles?: Record<string, VehicleLite> }) {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + (r.pendingCount || 0), 0);
  return (
    <div className="relative mb-8 overflow-hidden rounded-xl bg-white p-5 shadow-sm sm:p-7 dark:bg-[#2a2a2d]">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[#cf6721]" />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ffdbca]/60 text-[#cf6721]">
          <span className="material-symbols-outlined text-[24px]">smartphone</span>
        </span>
        <h3 className="text-[20px] font-semibold leading-7 tracking-tight text-[#0d1c2e] dark:text-zinc-50">Fills waiting on drivers' phones</h3>
        <span className="flex items-center gap-1.5 rounded-full bg-[#ffdbca]/70 px-3 py-1 text-[13px] font-semibold text-[#763300]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#cf6721]" />
          {plural(rows.length, 'driver')} · {plural(total, 'fill')} waiting
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const name = r.driverName || 'Driver';
          const v = r.vehicleId ? vehicles[r.vehicleId] : undefined;
          return (
            <div key={r.driverId} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-[#eff4ff] px-4 py-4 sm:px-5 dark:bg-zinc-800/60">
              <div className="flex min-w-[220px] flex-1 items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#dce9ff] text-[15px] font-semibold text-[#46445b] dark:bg-zinc-700 dark:text-zinc-200">
                  {initials(name)}
                </span>
                <div className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">{name}</span>
                    {v?.plate ? (
                      <span className="rounded-md bg-[#dce9ff] px-2 py-0.5 text-[13px] font-bold tracking-wider text-[#0d1c2e] dark:bg-zinc-700 dark:text-zinc-100">{v.plate}</span>
                    ) : null}
                  </div>
                  {v?.car ? (
                    <span className="mt-0.5 flex items-center gap-1 text-[13px] text-[#47464c] dark:text-zinc-400">
                      <span className="material-symbols-outlined text-[15px]">directions_car</span> {v.car}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-[#ffdbca]/70 px-3 py-1.5 text-[13px] font-semibold text-[#763300]">
                <span className="material-symbols-outlined text-[16px] text-[#cf6721]">schedule</span>
                {plural(r.pendingCount, 'fill')} · since {sinceLabel(r.oldestPendingAt)}
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-[#47464c] dark:text-zinc-400">
                <span className="material-symbols-outlined text-[16px]">signal_cellular_connected_no_internet_4_bar</span>
                Phone last seen {sinceLabel(r.lastSeenAt)}
              </span>
              {r.appVersion ? (
                <span className="rounded-lg bg-white px-2.5 py-1 text-[13px] font-semibold text-[#47464c] dark:bg-zinc-900 dark:text-zinc-300">App {r.appVersion}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-5 flex items-center gap-2 text-[15px] text-[#0d1c2e] dark:text-zinc-200">
        <span className="material-symbols-outlined text-[18px] text-[#006c4a]">cloud_sync</span>
        They send by themselves when the phone has signal.
      </p>
    </div>
  );
}

/** "2 on phone" chip on a driver row (Stitch Fleet screen 6). Hidden when nothing waits. */
export function FuelOnPhoneChip({ info, name }: { info?: { count: number; since: string | null }; name?: string }) {
  if (!info || !(info.count > 0)) return null;
  const text = `${info.count} fuel fill${info.count === 1 ? '' : 's'} on ${name ? `${name}'s` : 'the'} phone since ${sinceLabel(info.since)}. They send when the phone has signal.`;
  return (
    <span className="group relative inline-flex w-fit shrink-0">
      <span
        tabIndex={0}
        aria-label={text}
        className="inline-flex cursor-default items-center gap-1.5 rounded-full bg-[#fffbeb] px-2.5 py-1 text-[12px] font-semibold text-[#b45309] shadow-sm hover:bg-[#fef3c7] dark:bg-amber-950/40 dark:text-amber-300"
      >
        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14zm-1-6h-3V8h-2v5H8l4 4 4-4z" />
        </svg>
        {info.count} on phone
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-64 rounded-lg bg-[#0b1c30] p-2.5 text-xs font-medium leading-tight text-white shadow-2xl group-hover:block group-focus-within:block"
      >
        <span className="flex items-start gap-1.5">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[14px] text-amber-400">cloud_sync</span>
          <span>{text}</span>
        </span>
      </span>
    </span>
  );
}
