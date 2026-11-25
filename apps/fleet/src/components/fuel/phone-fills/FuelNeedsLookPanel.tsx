/**
 * Review Queue — fills from drivers' phones that need a look.
 * Look: Stitch Fleet screens 2, 4, 5 and 7 (docs/fuel-review-queue-review.md section 3).
 * Content: docs/fuel-log-offline-first-audit.md S6, S9, S10 and section 9 Keep/Drop.
 *
 * Save numbers → POST /fuel/fill/:id/numbers. Save and approve → that, then the normal approve
 * (approval is the one step that posts a fill). Reject → the normal reject, with a reason.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { FinancialTransaction } from '../../../types/data';
import { fuelService } from '../../../services/fuelService';
import { FuelPhotoTile, type PhotoNote } from './FuelPhotoViewer';

type Meta = Record<string, unknown>;
type StationLite = { id: string; name: string; address?: string };
type ApproveFn = (id: string, stationOpts?: { matchedStationId?: string; stationLocation?: string }) => Promise<void> | void;
export type VehicleLite = { plate?: string; car?: string };

export function isPhoneFillNeedingLook(t: FinancialTransaction): boolean {
  const m = (t.metadata || {}) as Meta;
  return String(t.status) === 'Pending' && typeof m.captureId === 'string' && m.photoReadStatus === 'needs_look';
}

export function isPhoneFillBeingRead(t: FinancialTransaction): boolean {
  const m = (t.metadata || {}) as Meta;
  return String(t.status) === 'Pending' && typeof m.captureId === 'string' && m.photoReadStatus === 'waiting';
}

export function money(n: number) {
  return `J$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseNumber(v: string): number | undefined {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function when(t: FinancialTransaction) {
  const m = (t.metadata || {}) as Meta;
  const iso = typeof m.capturedAt === 'string' ? m.capturedAt : `${t.date}T${(t as { time?: string }).time || '00:00:00'}`;
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

const label = 'text-[12px] font-semibold uppercase tracking-wider text-[#47464c] dark:text-zinc-400';
const chip = 'rounded-full bg-[#e6eeff] px-3 py-1 text-[12px] font-semibold text-[#47464c] dark:bg-zinc-800 dark:text-zinc-300';
const box = 'rounded-xl bg-white p-4 shadow-sm dark:bg-[#2a2a2d]';

function NotRead() {
  return (
    <span className="flex items-center gap-1 text-[12px] font-semibold text-[#ba1a1a]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#ba1a1a]" /> Not read
    </span>
  );
}

function SourceTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-[#e6eeff] px-2 py-0.5 text-[12px] font-semibold text-[#47464c] dark:bg-zinc-800 dark:text-zinc-300">{children}</span>;
}

/** Stitch screen 5 — "Where was this fill?" */
function StationPicker({
  stations,
  initial,
  onCancel,
  onUse,
}: {
  stations: StationLite[];
  initial: string | null;
  onCancel: () => void;
  onUse: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string | null>(initial);
  const needle = q.trim().toLowerCase();
  const list = stations
    .filter((s) => !needle || s.name.toLowerCase().includes(needle) || (s.address || '').toLowerCase().includes(needle))
    .slice(0, 5);
  return (
    <div className="bg-[#eff4ff]/70 p-4 sm:p-8 dark:bg-zinc-900/60">
      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-7 dark:bg-[#2a2a2d]">
        <div className="flex flex-col gap-1 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e6eeff] text-black dark:bg-zinc-800 dark:text-zinc-100">
              <span className="material-symbols-outlined text-[20px]">pin_drop</span>
            </div>
            <h3 className="text-[20px] font-semibold leading-7 tracking-tight text-[#0d1c2e] dark:text-zinc-50">Where was this fill?</h3>
          </div>
          <p className="mt-1 text-[15px] text-[#47464c] dark:text-zinc-400">The phone didn't send a location for this fill.</p>
        </div>
        <div className="relative mb-6">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[#47464c]">search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stations…"
            className="h-12 w-full rounded-xl bg-[#f8f9ff] pl-12 pr-4 text-[15px] text-[#0d1c2e] placeholder:text-[#47464c]/60 focus:outline-none focus:ring-2 focus:ring-black dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="Stations">
          {list.length === 0 ? <p className="text-[15px] text-[#47464c]">No station matches.</p> : null}
          {list.map((s) => {
            const on = pick === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPick(s.id)}
                className={`flex min-h-[56px] items-center justify-between rounded-xl p-4 text-left transition-colors ${on ? 'bg-[#dce9ff]/60' : 'bg-[#f8f9ff] hover:bg-[#eff4ff] dark:bg-zinc-900'}`}
              >
                <span className="flex items-center gap-4">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${on ? 'bg-white' : 'bg-[#e6eeff]'}`}>
                    {on ? <span className="h-2.5 w-2.5 rounded-full bg-black" /> : null}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold text-[#0d1c2e] dark:text-zinc-100">{s.name}</span>
                    {s.address ? <span className="mt-0.5 text-[13px] text-[#47464c] dark:text-zinc-400">{s.address}</span> : null}
                  </span>
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#47464c] dark:bg-zinc-800">
                  <span className="material-symbols-outlined text-[18px]">local_gas_station</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="h-11 rounded-xl bg-white px-5 text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd] hover:bg-[#e6eeff]">
            Cancel
          </button>
          <button
            type="button"
            disabled={!pick}
            onClick={() => pick && onUse(pick)}
            className="h-11 rounded-xl bg-black px-6 text-[13px] font-medium text-white shadow-md disabled:opacity-40"
          >
            Use this station
          </button>
        </div>
      </div>
    </div>
  );
}

function FillCard({
  t,
  driverName,
  vehicle,
  onSaved,
  onApprove,
  onReject,
  stations,
}: {
  t: FinancialTransaction;
  driverName?: string;
  vehicle?: VehicleLite;
  onSaved: (t: FinancialTransaction) => void;
  onApprove: ApproveFn;
  onReject: (id: string, reason?: string) => Promise<void> | void;
  stations: StationLite[];
}) {
  const m = (t.metadata || {}) as Meta;
  const [stationId, setStationId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [total, setTotal] = useState('');
  const [liters, setLiters] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const tot = parseNumber(total);
  const lit = parseNumber(liters);
  const amount = Math.abs(Number(t.amount) || 0);
  const vol = Number(m.fuelVolume) || 0;
  const odo = Number((t as { odometer?: number }).odometer) || 0;
  const fromPhoto = Array.isArray(m.readFromPhoto) ? (m.readFromPhoto as string[]) : [];
  const odoMethod = String(m.odometerMethod || '');
  const odoFromPhoto = fromPhoto.includes('odometer') || odoMethod === 'ai_verified' || odoMethod === 'photo_read';
  const noLocation = !m.locationMetadata;
  const chosen = stations.find((s) => s.id === stationId);
  const stationName = chosen?.name || String(m.stationName || (t as { vendor?: string }).vendor || '');
  const refused = typeof m.refusedCode === 'string';
  const isCard = String(t.paymentMethod || '').toLowerCase().includes('card');
  const plate = vehicle?.plate || (t as { vehiclePlate?: string }).vehiclePlate || '';
  const rate = tot && lit ? tot / lit : amount && vol ? amount / vol : 0;

  const odoNote: PhotoNote = odo
    ? odoFromPhoto
      ? { tone: 'good', text: `Read clearly (${odo.toLocaleString('en-US')} km)` }
      : { tone: 'plain', text: 'Typed by driver' }
    : { tone: 'bad', text: "Couldn't read" };
  const pumpMissing = !amount && !vol ? 'Total & litres' : !amount ? 'Total' : !vol ? 'Litres' : '';
  const pumpNote: PhotoNote = pumpMissing ? { tone: 'bad', text: `${pumpMissing} couldn't be read` } : { tone: 'good', text: 'Read clearly' };

  const save = async (andApprove: boolean) => {
    if (!tot || !lit) return;
    setBusy(true);
    try {
      const updated = await fuelService.saveFillNumbers(t.id, { total: tot, liters: lit });
      onSaved(updated);
      if (andApprove) await onApprove(t.id, chosen ? { matchedStationId: chosen.id, stationLocation: chosen.address || chosen.name } : undefined);
      else toast.success('Numbers saved — ready to approve');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the numbers');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm dark:bg-[#2a2a2d]">
      {/* Line 1 — date · driver · plate · car */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6eeff] p-4 sm:p-6 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px] font-medium text-[#47464c] dark:text-zinc-400">{when(t)}</span>
          <span className="text-[#c9c5cd]">•</span>
          <span className="text-[17px] font-semibold leading-6 text-[#0d1c2e] dark:text-zinc-50">{driverName || t.driverName || 'Driver'}</span>
          {plate ? (
            <>
              <span className="text-[#c9c5cd]">•</span>
              <span className="rounded-md bg-[#e6eeff] px-2.5 py-0.5 text-[13px] font-bold uppercase tracking-wider text-[#0d1c2e] dark:bg-zinc-800 dark:text-zinc-100">{plate}</span>
            </>
          ) : null}
          {vehicle?.car ? <span className="text-[15px] text-[#47464c] dark:text-zinc-400">{vehicle.car}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 items-center gap-1.5 rounded-xl bg-white px-4 text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd] lg:hidden"
        >
          {open ? 'Close' : 'Open'}
          <span className="material-symbols-outlined text-[18px]">{open ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}</span>
        </button>
      </div>

      {/* Line 2 — values and chips */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#eff4ff]/50 px-4 py-4 sm:px-6 dark:bg-zinc-900/40">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-12">
          <div>
            <span className={`${label} mb-0.5 block`}>Total amount</span>
            {amount ? (
              <span className="flex items-center gap-2 text-[20px] font-bold tabular-nums text-[#0d1c2e] dark:text-zinc-50">
                {money(amount)} {fromPhoto.includes('amount') ? <SourceTag>From photo</SourceTag> : null}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[20px] font-bold text-[#ba1a1a]">
                <span className="material-symbols-outlined text-[18px]">error</span> Total not read
              </span>
            )}
          </div>
          <div>
            <span className={`${label} mb-0.5 block`}>Volume (litres)</span>
            {vol ? (
              <span className="flex items-center gap-2 text-[20px] font-bold tabular-nums text-[#0d1c2e] dark:text-zinc-50">
                {vol} L {fromPhoto.includes('liters') ? <SourceTag>From photo</SourceTag> : null}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[20px] font-bold text-[#ba1a1a]">
                <span className="material-symbols-outlined text-[18px]">error</span> Litres not read
              </span>
            )}
          </div>
          <div>
            <span className={`${label} mb-0.5 block`}>Odometer reading</span>
            <span className="flex items-center gap-2 text-[20px] font-bold tabular-nums text-[#0d1c2e] dark:text-zinc-50">
              {odo ? `${odo.toLocaleString('en-US')} km` : '—'}
              {odo && odoFromPhoto ? (
                <span className="flex items-center gap-0.5 rounded-full bg-[#82f5c1] px-2 py-0.5 text-[12px] font-semibold text-[#00714e]">
                  <span className="material-symbols-outlined text-[12px]">check</span> From photo
                </span>
              ) : null}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-[#ffdad6] px-3 py-1 text-[12px] font-semibold text-[#ba1a1a]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ba1a1a]" /> Needs a look
          </span>
          {m.needsLookReason ? <span className={chip}>{String(m.needsLookReason)}</span> : null}
          <span className={chip}>{isCard ? 'Gas Card' : 'Cash'}</span>
          {noLocation ? (
            <span className={`${chip} flex items-center gap-1`}>
              <span className="material-symbols-outlined text-[14px]">location_off</span> No location from the phone
            </span>
          ) : stationName ? (
            <span className={`${chip} flex items-center gap-1`}>
              <span className="material-symbols-outlined text-[14px]">location_on</span> {stationName}
            </span>
          ) : null}
        </div>
      </div>

      <div className={open ? '' : 'hidden lg:block'}>
        {/* Photos + numbers */}
        <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-6">
            <span className="text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">Photos</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FuelPhotoTile
                url={typeof m.odometerProofUrl === 'string' ? m.odometerProofUrl : undefined}
                label="Odometer"
                icon="speed"
                overlayValue={odo ? `${odo.toLocaleString('en-US')} km` : "Couldn't read"}
                overlayBad={!odo}
                note={odoNote}
              />
              <FuelPhotoTile
                url={t.receiptUrl || undefined}
                label="Pump"
                icon="local_gas_station"
                overlayValue={amount ? money(amount) : "Couldn't read"}
                overlayBad={!amount}
                note={pumpNote}
              />
            </div>
            {refused ? (
              <div className="mt-1 flex items-start gap-3 rounded-xl bg-[#eff4ff] p-3.5 dark:bg-zinc-900/50">
                <span className="material-symbols-outlined mt-0.5 text-[18px] text-[#47464c]">info</span>
                <p className="text-[13px] font-medium text-[#0d1c2e] dark:text-zinc-200">The fill couldn't be saved the normal way. Check it, then approve or reject.</p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col justify-between rounded-xl bg-[#eff4ff]/40 p-5 lg:col-span-6 dark:bg-zinc-900/40">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[17px] font-semibold text-[#0d1c2e] dark:text-zinc-50">Missing numbers</span>
                <span className="text-[12px] font-semibold uppercase tracking-wider text-[#ba1a1a]">Type to approve</span>
              </div>
              <div className="space-y-4">
                <div className={`${box} flex items-center justify-between`}>
                  <div className="flex flex-col">
                    <span className={label}>1. Odometer reading</span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[20px] font-bold tabular-nums text-[#0d1c2e] dark:text-zinc-50">{odo ? `${odo.toLocaleString('en-US')} km` : '—'}</span>
                      {odo ? <SourceTag>{odoFromPhoto ? 'From photo' : 'Typed by driver'}</SourceTag> : null}
                    </div>
                  </div>
                </div>

                <div className={`${box} flex flex-col gap-2`}>
                  <div className="flex items-center justify-between">
                    <label htmlFor={`tot-${t.id}`} className="text-[12px] font-semibold uppercase tracking-wider text-[#0d1c2e] dark:text-zinc-100">
                      2. Total amount (J$) <span className="text-[#ba1a1a]">*</span>
                    </label>
                    {tot ? <SourceTag>Typed by you</SourceTag> : amount ? <SourceTag>From photo</SourceTag> : <NotRead />}
                  </div>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[15px] font-semibold text-[#47464c]">J$</span>
                    <input
                      id={`tot-${t.id}`}
                      inputMode="decimal"
                      value={total}
                      onChange={(e) => setTotal(e.target.value)}
                      placeholder="0.00"
                      className="h-11 w-full rounded-xl bg-[#eff4ff] pl-10 pr-4 text-[15px] font-semibold tabular-nums text-[#0d1c2e] shadow-inner focus:bg-white focus:outline-none focus:ring-2 focus:ring-black dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  {amount ? <p className="text-[12px] font-semibold text-[#47464c] dark:text-zinc-400">Read from the photo: {money(amount)}</p> : null}
                </div>

                <div className={`${box} flex flex-col gap-2`}>
                  <div className="flex items-center justify-between">
                    <label htmlFor={`lit-${t.id}`} className="text-[12px] font-semibold uppercase tracking-wider text-[#0d1c2e] dark:text-zinc-100">
                      3. Volume (litres) <span className="text-[#ba1a1a]">*</span>
                    </label>
                    {lit ? <SourceTag>Typed by you</SourceTag> : vol ? <SourceTag>From photo</SourceTag> : <NotRead />}
                  </div>
                  <div className="relative">
                    <input
                      id={`lit-${t.id}`}
                      inputMode="decimal"
                      value={liters}
                      onChange={(e) => setLiters(e.target.value)}
                      placeholder="0.00"
                      className="h-11 w-full rounded-xl bg-[#eff4ff] pl-4 pr-10 text-[15px] font-semibold tabular-nums text-[#0d1c2e] shadow-inner focus:bg-white focus:outline-none focus:ring-2 focus:ring-black dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-[15px] font-semibold text-[#47464c]">L</span>
                  </div>
                  {tot && lit ? (
                    <p className="text-[12px] font-semibold text-[#47464c] dark:text-zinc-400">{money(tot / lit)} a litre</p>
                  ) : vol ? (
                    <p className="text-[12px] font-semibold text-[#47464c] dark:text-zinc-400">Read from the photo: {vol} L</p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className={box}>
                    <span className={`${label} block`}>4. Fuel station</span>
                    {stationName ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[15px] font-medium text-[#0d1c2e] dark:text-zinc-100">
                        <span className="material-symbols-outlined text-[16px] text-[#006c4a]">local_gas_station</span> {stationName}
                      </div>
                    ) : null}
                    <span className="text-[12px] font-semibold text-[#47464c] dark:text-zinc-400">
                      {chosen ? 'Chosen by you' : noLocation ? 'No location from the phone' : 'From location'}
                    </span>
                    {noLocation ? (
                      <button
                        type="button"
                        onClick={() => setPicking(true)}
                        className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-white text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd] hover:bg-[#e6eeff]"
                      >
                        <span className="material-symbols-outlined text-[18px]">pin_drop</span>
                        {chosen ? 'Change station' : 'Choose station'}
                      </button>
                    ) : null}
                  </div>
                  <div className={box}>
                    <span className={`${label} block`}>5. Payment type</span>
                    <div className="mt-0.5 flex items-center gap-1 text-[15px] font-medium text-[#0d1c2e] dark:text-zinc-100">
                      <span className="material-symbols-outlined text-[16px] text-[#47464c]">{isCard ? 'credit_card' : 'payments'}</span>
                      {isCard ? 'Gas Card' : 'Cash'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {rate ? (
              <div className="mt-4 flex items-center justify-between pt-3 text-[12px] font-semibold text-[#47464c] dark:text-zinc-400">
                <span>
                  Rate: <span className="text-[15px] font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-100">{money(rate)} a litre</span>
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {picking ? (
          <StationPicker
            stations={stations}
            initial={stationId}
            onCancel={() => setPicking(false)}
            onUse={(id) => {
              setStationId(id);
              setPicking(false);
            }}
          />
        ) : null}

        {/* Bottom bar */}
        <div className="flex flex-col items-stretch justify-between gap-4 border-t border-[#e6eeff] bg-[#eff4ff] p-4 sm:flex-row sm:items-center sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
          {rejecting ? (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-[13px] font-medium text-[#0d1c2e] dark:text-zinc-100">
                Why reject this fill? The driver sees this.
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl bg-white px-4 text-[15px] shadow-sm ring-1 ring-[#c9c5cd] focus:outline-none focus:ring-2 focus:ring-black dark:bg-zinc-900"
                />
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setRejecting(false)} className="h-11 rounded-xl bg-white px-5 text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd]">
                  Keep it
                </button>
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onReject(t.id, reason.trim());
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="h-11 rounded-xl bg-[#ba1a1a] px-5 text-[13px] font-medium text-white shadow-sm disabled:opacity-40"
                >
                  Reject fill
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[13px] font-medium text-[#ba1a1a] shadow-sm ring-1 ring-[#ffdad6] hover:bg-[#ffdad6]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span> Reject
              </button>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={busy || !tot || !lit}
                  onClick={() => void save(false)}
                  className="h-11 rounded-xl bg-white px-5 text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd] hover:bg-[#e6eeff] disabled:opacity-40"
                >
                  Save numbers
                </button>
                <button
                  type="button"
                  disabled={busy || !tot || !lit}
                  onClick={() => void save(true)}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-6 text-[13px] font-medium text-white shadow-md disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#85f8c4]">check_circle</span> Save and approve
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function FuelNeedsLookPanel({
  transactions,
  driverNames,
  vehicles = {},
  onSaved,
  onApprove,
  onReject,
}: {
  transactions: FinancialTransaction[];
  driverNames: Record<string, string>;
  vehicles?: Record<string, VehicleLite>;
  onSaved: (t: FinancialTransaction) => void;
  onApprove: ApproveFn;
  onReject: (id: string, reason?: string) => Promise<void> | void;
}) {
  const needs = transactions.filter(isPhoneFillNeedingLook);
  const anyNoLocation = needs.some((t) => !((t.metadata || {}) as Meta).locationMetadata);
  const [stations, setStations] = useState<StationLite[]>([]);
  useEffect(() => {
    if (!anyNoLocation || stations.length) return;
    let live = true;
    fuelService
      .getStations()
      .then((all: any[]) => {
        if (!live) return;
        setStations(
          (all || [])
            .filter((s) => s?.status === 'verified')
            .map((s) => ({ id: String(s.id), name: String(s.name || ''), address: s.address ? String(s.address) : undefined })),
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [anyNoLocation, stations.length]);
  const reading = transactions.filter(isPhoneFillBeingRead).length;
  if (!needs.length && !reading) return null;
  return (
    <div className="mb-8 flex flex-col gap-4">
      {needs.length ? (
        <div className="pb-1">
          <h2 className="text-[17px] font-semibold leading-6 tracking-tight text-[#0d1c2e] dark:text-zinc-50">Fills needing a look ({needs.length})</h2>
          <p className="text-[15px] text-[#47464c] dark:text-zinc-400">Check the photos and type the missing numbers to approve.</p>
        </div>
      ) : null}
      {needs.map((t) => (
        <FillCard
          key={t.id}
          t={t}
          driverName={t.driverId ? driverNames[t.driverId] : undefined}
          vehicle={t.vehicleId ? vehicles[t.vehicleId] : undefined}
          onSaved={onSaved}
          onApprove={onApprove}
          onReject={onReject}
          stations={stations}
        />
      ))}
      {reading ? (
        <p className="flex items-center gap-2 text-[15px] text-[#47464c] dark:text-zinc-400">
          <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
          {reading} fill{reading === 1 ? ' is' : 's are'} being read from the photos. They show up here or as ready to approve.
        </p>
      ) : null}
    </div>
  );
}
