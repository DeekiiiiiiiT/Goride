/**
 * Review Queue — fills from drivers' phones that need a look (Stitch Fleet screen 2, round 2:
 * an inline open row, not a side panel). docs/fuel-log-offline-first-audit.md S6, S9, S10.
 *
 * Shows both photos, what was read and from where, and boxes for the missing numbers.
 * Save numbers → POST /fuel/fill/:id/numbers. Save and approve → that, then the normal approve
 * (approval is the one step that posts a fill). Reject → the normal reject, with a reason.
 */
import React, { useEffect, useState } from 'react';
import { Eye, MapPin, MapPinOff, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FinancialTransaction } from '../../../types/data';
import { fuelService } from '../../../services/fuelService';

type Meta = Record<string, unknown>;
type StationLite = { id: string; name: string; address?: string };
type ApproveFn = (id: string, stationOpts?: { matchedStationId?: string; stationLocation?: string }) => Promise<void> | void;

export function isPhoneFillNeedingLook(t: FinancialTransaction): boolean {
  const m = (t.metadata || {}) as Meta;
  return String(t.status) === 'Pending' && typeof m.captureId === 'string' && m.photoReadStatus === 'needs_look';
}

export function isPhoneFillBeingRead(t: FinancialTransaction): boolean {
  const m = (t.metadata || {}) as Meta;
  return String(t.status) === 'Pending' && typeof m.captureId === 'string' && m.photoReadStatus === 'waiting';
}

function money(n: number) {
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

function Photo({ url, label }: { url?: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="overflow-hidden rounded-xl bg-slate-900">
        {url ? <img src={url} alt={label} className="h-[220px] w-full object-cover" /> : <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">No photo</div>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">{label}</span>
        {url ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-[#0b1c30] dark:border-zinc-600 dark:text-zinc-100"
          >
            View full size
          </button>
        ) : null}
      </div>
      {open && url ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" role="dialog" aria-label={label}>
          <img src={url} alt={label} className="max-h-full max-w-full rounded-xl object-contain" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-6 top-6 inline-flex h-11 items-center gap-1 rounded-xl border border-white/40 bg-white px-4 text-sm font-semibold text-[#0b1c30]"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{children}</span>;
}

function FillCard({
  t,
  driverName,
  onSaved,
  onApprove,
  onReject,
  stations,
}: {
  t: FinancialTransaction;
  driverName?: string;
  onSaved: (t: FinancialTransaction) => void;
  onApprove: ApproveFn;
  onReject: (id: string, reason?: string) => Promise<void> | void;
  stations: StationLite[];
}) {
  const m = (t.metadata || {}) as Meta;
  const [stationSearch, setStationSearch] = useState('');
  const [stationId, setStationId] = useState<string | null>(null);
  const [total, setTotal] = useState('');
  const [liters, setLiters] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const tot = parseNumber(total);
  const lit = parseNumber(liters);
  const amount = Math.abs(Number(t.amount) || 0);
  const vol = Number(m.fuelVolume) || 0;
  const odo = Number((t as { odometer?: number }).odometer) || 0;
  const fromPhoto = Array.isArray(m.readFromPhoto) ? (m.readFromPhoto as string[]) : [];
  const station = String(m.stationName || (t as { vendor?: string }).vendor || '');
  const noLocation = !m.locationMetadata;
  const refused = typeof m.refusedCode === 'string';

  const save = async (andApprove: boolean) => {
    if (!tot || !lit) return;
    setBusy(true);
    try {
      const updated = await fuelService.saveFillNumbers(t.id, { total: tot, liters: lit });
      onSaved(updated);
      const st = stations.find((x) => x.id === stationId);
      if (andApprove) await onApprove(t.id, st ? { matchedStationId: st.id, stationLocation: st.address || st.name } : undefined);
      else toast.success('Numbers saved — ready to approve');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the numbers');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-[#3a3a3d] dark:bg-[#2a2a2d]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[15px] text-[#47464c] dark:text-zinc-400">{when(t)}</span>
        <span className="font-semibold text-[#0b1c30] dark:text-zinc-50">{driverName || t.driverName || 'Driver'}</span>
        {t.vehicleId ? <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-zinc-700 dark:text-zinc-200">{t.vehicleId}</span> : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#47464c]">Total</p>
          <p className={`text-lg font-semibold tabular-nums ${amount ? 'text-[#0b1c30] dark:text-zinc-50' : 'text-red-700'}`}>
            {amount ? money(amount) : 'Total not read'}
            {amount && fromPhoto.includes('amount') ? <Tag>From photo</Tag> : null}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#47464c]">Litres</p>
          <p className={`text-lg font-semibold tabular-nums ${vol ? 'text-[#0b1c30] dark:text-zinc-50' : 'text-red-700'}`}>
            {vol ? `${vol} L` : 'Litres not read'}
            {vol && fromPhoto.includes('liters') ? <Tag>From photo</Tag> : null}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#47464c]">Odometer</p>
          <p className="text-lg font-semibold tabular-nums text-[#0b1c30] dark:text-zinc-50">
            {odo ? `${odo.toLocaleString('en-US')} km` : '—'}
            {odo && fromPhoto.includes('odometer') ? <Tag>From photo</Tag> : null}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <Eye className="h-3.5 w-3.5" /> Needs a look
        </span>
        {m.needsLookReason ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-200">{String(m.needsLookReason)}</span>
        ) : null}
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-200">
          {String(t.paymentMethod || '').toLowerCase().includes('card') ? 'Gas Card' : 'Cash'}
        </span>
        {station ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-200">{station}</span> : null}
        {noLocation ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-200">
            <MapPinOff className="h-3.5 w-3.5" /> No location from the phone
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <Photo url={typeof m.odometerProofUrl === 'string' ? m.odometerProofUrl : undefined} label="Odometer" />
          <Photo url={t.receiptUrl || undefined} label="Pump" />
        </div>

        <div className="rounded-xl bg-slate-50 p-4 dark:bg-zinc-800/50">
          <p className="mb-3 font-semibold text-[#0b1c30] dark:text-zinc-50">Missing numbers</p>
          {refused ? (
            <p className="mb-3 text-sm text-[#47464c] dark:text-zinc-400">The fill couldn't be saved the normal way. Check it, then approve or reject.</p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">
              Total (J$)
              <input
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="1,000.00"
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">
              Litres
              <input
                inputMode="decimal"
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
                placeholder="4.59"
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
          </div>
          {tot && lit ? (
            <p className="mt-2 text-sm text-[#47464c] dark:text-zinc-400">
              J${(tot / lit).toFixed(2)} a litre <Tag>Typed by you</Tag>
            </p>
          ) : null}

          {noLocation ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <p className="font-semibold text-[#0b1c30] dark:text-zinc-50">Where was this fill?</p>
              <p className="text-sm text-[#47464c] dark:text-zinc-400">The phone didn't send a location for this fill.</p>
              <input
                value={stationSearch}
                onChange={(e) => setStationSearch(e.target.value)}
                placeholder="Search stations…"
                className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 dark:border-zinc-600 dark:bg-zinc-900"
              />
              <div className="mt-2 space-y-1.5">
                {stations
                  .filter((s) => !stationSearch.trim() || s.name.toLowerCase().includes(stationSearch.trim().toLowerCase()))
                  .slice(0, 5)
                  .map((s) => {
                    const on = stationId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setStationId(on ? null : s.id)}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${on ? 'border-[#030213] bg-slate-50 dark:border-zinc-50 dark:bg-zinc-800' : 'border-slate-200 dark:border-zinc-700'}`}
                      >
                        <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="flex-1">
                          <span className="block font-semibold text-[#0b1c30] dark:text-zinc-100">{s.name}</span>
                          {s.address ? <span className="block text-xs text-[#47464c] dark:text-zinc-400">{s.address}</span> : null}
                        </span>
                        <span className={`h-4 w-4 rounded-full border-2 ${on ? 'border-[#030213] bg-[#030213] dark:border-zinc-50 dark:bg-zinc-50' : 'border-slate-300'}`} />
                      </button>
                    );
                  })}
              </div>
              {stationId ? <p className="mt-2 text-xs text-[#47464c] dark:text-zinc-400">Approving links this fill to the station you chose.</p> : null}
            </div>
          ) : null}

          {rejecting ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-white p-3 dark:border-red-900 dark:bg-zinc-900">
              <label className="block text-sm font-semibold text-[#0b1c30] dark:text-zinc-100">
                Why reject this fill?
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 dark:border-zinc-600 dark:bg-zinc-900"
                />
              </label>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setRejecting(false)} className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold dark:border-zinc-600">
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
                  className="h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Reject fill
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="inline-flex h-11 items-center gap-1 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-600"
              >
                <X className="h-4 w-4" /> Reject
              </button>
              <button
                type="button"
                disabled={busy || !tot || !lit}
                onClick={() => void save(false)}
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-[#0b1c30] disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                Save numbers
              </button>
              <button
                type="button"
                disabled={busy || !tot || !lit}
                onClick={() => void save(true)}
                className="h-11 rounded-xl bg-[#030213] px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-[#030213]"
              >
                Save and approve
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FuelNeedsLookPanel({
  transactions,
  driverNames,
  onSaved,
  onApprove,
  onReject,
}: {
  transactions: FinancialTransaction[];
  driverNames: Record<string, string>;
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
    <div className="mb-4 space-y-3">
      {needs.length ? (
        <div>
          <h3 className="text-lg font-semibold text-[#0b1c30] dark:text-zinc-50">Fills needing a look ({needs.length})</h3>
          <p className="text-sm text-[#47464c] dark:text-zinc-400">Check the photos and type the missing numbers to approve.</p>
        </div>
      ) : null}
      {needs.map((t) => (
        <FillCard
          key={t.id}
          t={t}
          driverName={t.driverId ? driverNames[t.driverId] : undefined}
          onSaved={onSaved}
          onApprove={onApprove}
          onReject={onReject}
          stations={stations}
        />
      ))}
      {reading ? (
        <p className="text-sm text-[#47464c] dark:text-zinc-400">
          {reading} fill{reading === 1 ? ' is' : 's are'} being read from the photos. They show up here or as ready to approve.
        </p>
      ) : null}
    </div>
  );
}
