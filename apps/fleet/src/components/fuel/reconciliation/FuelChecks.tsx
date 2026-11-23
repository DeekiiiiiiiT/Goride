/**
 * Step 5 → "Fuel checks" (fuel audit Part J screens 4–8).
 * Look = the Stitch export (roam_fleet_fuel_checks_*, add_a_missed_fill, close_with_a_note,
 * car_economy_8_week); content = fuelChecksModel + GET /fuel/periods/:id/checks.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  History,
  Info,
  Plus,
  Route,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { fuelService } from '../../../services/fuelService';
import type { FuelCard } from '../../../types/fuel';
import { findActiveFuelCardForSession } from '../../../utils/fuelCardMatch';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import {
  AWAITING_GROUP_AT,
  CLOSE_NOTE_MIN,
  FLAG_POSSIBLE_FILL,
  buildMissedFillEntry,
  checkMissedFill,
  closedLine,
  dayLabel,
  daysWaitingText,
  diffText,
  economyChip,
  economyNeedsMoreWeeks,
  km,
  kmL,
  missedFillReady,
  odo,
  openPossibleFills,
  shortDay,
  stretchBars,
  type AwaitingCardFill,
  type EconomyChip,
  type FuelWeekChecksResponse,
  type MissedFillDraft,
  type PaidWith,
  type PossibleFillCheck,
  type VehicleEconomyResponse,
} from '../../../utils/fuelChecksModel';

export type FuelChecksCar = {
  vehicleId: string;
  plate: string;
  makeModel?: string;
  driverId?: string;
  driverName?: string;
};

const money = (n: number) => formatFuelMoney(n, 2);

function PlateBox({ plate }: { plate: string }) {
  return (
    <span className="rounded bg-[#e6e8ea] px-2 py-0.5 font-mono text-[12px] font-semibold tracking-wider text-[#191c1e]">
      {plate}
    </span>
  );
}

// ---------------------------------------------------------------- screen 4

function AwaitingRow({ fill, plate }: { fill: AwaitingCardFill; plate: string }) {
  return (
    <li
      className="flex flex-col justify-between gap-2 rounded-xl bg-white p-4 shadow-sm md:flex-row md:items-center"
      data-testid="checks-awaiting-row"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[14px] font-semibold text-[#191c1e]">{dayLabel(fill.dateYmd)}</span>
        <PlateBox plate={plate} />
        <span className="text-[13px] text-[#47464c]">
          {fill.odometer != null ? `odometer ${odo(fill.odometer)} km` : 'no odometer'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 md:justify-end">
        <span className="whitespace-nowrap text-[16px] font-semibold tabular-nums text-[#191c1e]">
          {money(fill.amountSoFar)} <span className="text-[13px] font-normal text-[#47464c]">so far</span>
        </span>
        <span className="rounded-full bg-[#fff8eb] px-2.5 py-1 text-[12px] font-medium text-[#b45309]">
          Waiting for card statement
        </span>
        <span className="whitespace-nowrap text-[13px] text-[#47464c]">{daysWaitingText(fill.daysWaiting)}</span>
      </div>
    </li>
  );
}

function AwaitingCard({
  fills,
  plateOf,
  driverFirstName,
  onUpload,
  locked,
}: {
  fills: AwaitingCardFill[];
  plateOf: (vehicleId: string) => string;
  driverFirstName: string | null;
  onUpload?: () => void;
  locked: boolean;
}) {
  const grouped = fills.length >= AWAITING_GROUP_AT;
  const [open, setOpen] = useState(!grouped);
  const n = fills.length;
  return (
    <section
      className="relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-[#fffbeb]/60 p-5 shadow-sm sm:p-6"
      data-testid="checks-awaiting"
    >
      <span className="absolute bottom-0 left-0 top-0 w-1.5 bg-[#d97706]" aria-hidden />
      <div className="flex flex-col justify-between gap-3 pl-2 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[#b45309]" aria-hidden />
            <h3 className="text-[18px] font-semibold leading-[26px] text-[#191c1e]">
              {n === 1
                ? '1 gas-card fill is waiting for the card statement'
                : `${n} gas-card fills are waiting for the card statement`}
            </h3>
          </div>
          <p className="pl-7 text-[14px] leading-5 text-[#47464c]">
            {driverFirstName ? `${driverFirstName} scanned` : 'The driver scanned'}{' '}
            {n === 1 ? 'this' : 'these'} at the pump. {n === 1 ? 'Its' : 'Their'} amount comes from the gas card
            statement.
          </p>
        </div>
        {onUpload && !locked ? (
          <button
            type="button"
            onClick={onUpload}
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#030213] px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-[#213145]"
          >
            <Upload className="h-4 w-4" aria-hidden /> Upload card statement
          </button>
        ) : null}
      </div>
      {grouped ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-2 flex items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm hover:bg-[#f7f9fb]"
          data-testid="checks-awaiting-group"
        >
          <span className="text-[14px] font-semibold text-[#191c1e]">
            {n} card fills waiting for the statement
          </span>
          <ChevronDown className={`h-5 w-5 text-[#47464c] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      ) : null}
      {open ? (
        <ul className="flex flex-col gap-2 pl-2">
          {fills.map((f) => (
            <AwaitingRow key={f.entryId || `${f.vehicleId}-${f.dateYmd}`} fill={f} plate={plateOf(f.vehicleId)} />
          ))}
        </ul>
      ) : null}
      <p className="ml-2 flex items-center gap-2 rounded-lg bg-[#ffdad6]/40 px-3 py-2 text-[14px] font-medium text-[#ba1a1a]">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        The week can't lock until {n === 1 ? 'this is' : 'these are'} priced.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- screen 5

function StretchChart({ bars, averageKm }: ReturnType<typeof stretchBars>) {
  if (!bars.length) return null;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid="checks-stretch-chart">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#47464c]">
          Km between fills this week
        </p>
        {averageKm != null ? (
          <p className="text-[13px] text-[#47464c]">Average: {averageKm.toLocaleString('en-US')} km / fill</p>
        ) : null}
      </div>
      <div className="flex h-28 items-end gap-2">
        {bars.map((b) => (
          <div key={b.key} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-24 w-full flex-col justify-end">
              {b.flagged ? (
                <span className="mx-auto mb-1 rounded bg-[#ba1a1a] px-1.5 text-[10px] font-semibold text-white">
                  {Math.round(b.km)}
                </span>
              ) : null}
              <div
                className={`w-full rounded-md ${b.flagged ? 'bg-[#ba1a1a]' : 'bg-[#e6e8ea]'}`}
                style={{ height: `${b.heightPct}%` }}
                title={km(b.km)}
              />
            </div>
            <span className={`text-[11px] ${b.flagged ? 'font-semibold text-[#ba1a1a]' : 'text-[#47464c]'}`}>
              {b.label}
              {b.flagged ? ' !' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PossibleFillCard({
  check,
  plate,
  driverName,
  locked,
  onAddFill,
  onClose,
}: {
  check: PossibleFillCheck;
  plate: string;
  driverName?: string;
  locked: boolean;
  onAddFill: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className="relative flex flex-col justify-between gap-5 overflow-hidden rounded-2xl bg-white p-5 shadow-sm sm:p-6 md:flex-row md:items-center"
      data-testid="checks-possible-fill"
    >
      <span className="absolute bottom-0 left-0 top-0 w-1.5 bg-[#ba1a1a]" aria-hidden />
      <div className="flex min-w-0 flex-col gap-2 pl-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ffdad6]">
            <AlertTriangle className="h-4 w-4 text-[#ba1a1a]" aria-hidden />
          </span>
          <h3 className="text-[18px] font-semibold text-[#191c1e]">Possible fill not scanned</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlateBox plate={plate} />
          {driverName ? <span className="text-[15px] text-[#191c1e]">{driverName}</span> : null}
        </div>
        <Route className="h-4 w-4 text-[#47464c]" aria-hidden />
        <p className="text-[17px] font-medium leading-6 text-[#191c1e]">
          {dayLabel(check.startDate)} at {km(check.startOdometer)} → {dayLabel(check.endDate)} at{' '}
          {km(check.endOdometer)}
        </p>
        <p className="text-[17px] font-semibold text-[#ba1a1a]">· {km(check.stretchKm)} with no fill</p>
        <p className="text-[14px] leading-5 text-[#47464c]">
          That is much longer than this car usually goes between fills (usually up to {km(check.p90Km)}).
        </p>
        <p className="text-[14px] leading-5 text-[#78767d]">
          Nothing is charged for it. Add the fill if one was missed, or close this with a note.
        </p>
      </div>
      {!locked ? (
        <div className="flex shrink-0 flex-wrap gap-2 pl-2 md:pl-0">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl border border-[#c6c6cd] bg-white px-4 text-[14px] font-semibold text-[#191c1e] hover:bg-[#f7f9fb]"
          >
            Close with a note
          </button>
          <button
            type="button"
            onClick={onAddFill}
            className="flex h-11 items-center gap-2 rounded-xl bg-[#030213] px-4 text-[14px] font-semibold text-white hover:bg-[#213145]"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add fill
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ClosedRow({
  check,
  plate,
  text,
  locked,
  busy,
  onReopen,
}: {
  check: PossibleFillCheck;
  plate: string;
  text: string;
  locked: boolean;
  busy: boolean;
  onReopen: () => void;
}) {
  return (
    <div
      className="flex flex-col justify-between gap-3 rounded-2xl bg-[#f2f4f6] p-4 sm:flex-row sm:items-center"
      data-testid="checks-closed-row"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[14px] text-[#47464c]">
        <PlateBox plate={plate} />
        <span>
          {shortDay(check.startDate)} → {shortDay(check.endDate)} · {km(check.stretchKm)}
        </span>
        <span className="min-w-0 break-words text-[#191c1e]">{text}</span>
      </div>
      {!locked ? (
        <button
          type="button"
          disabled={busy}
          onClick={onReopen}
          className="h-10 shrink-0 rounded-xl border border-[#c6c6cd] bg-white px-4 text-[14px] font-semibold text-[#191c1e] hover:bg-white/70 disabled:opacity-50"
        >
          Reopen
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- screen 6

function Field({ label, children, hint, error }: { label: string; children: React.ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-[15px] font-medium text-[#191c1e]">{label}</span>
      {children}
      {error ? (
        <span className="block text-[13px] text-[#ba1a1a]">{error}</span>
      ) : hint ? (
        <span className="block text-[13px] text-[#47464c]">{hint}</span>
      ) : null}
    </label>
  );
}

const inputCls =
  'h-12 w-full rounded-xl border border-[#e0e3e5] bg-white px-4 text-[15px] text-[#191c1e] shadow-sm outline-none focus:border-[#0051d5]';

export function AddMissedFillSheet({
  check,
  car,
  cardId,
  open,
  onOpenChange,
  onSave,
}: {
  check: PossibleFillCheck | null;
  car: FuelChecksCar | null;
  cardId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: MissedFillDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MissedFillDraft>({
    date: '',
    amount: '',
    liters: '',
    odometer: '',
    paidWith: 'gas_card',
    note: '',
  });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && check) {
      setDraft({ date: check.startDate, amount: '', liters: '', odometer: '', paidWith: cardId ? 'gas_card' : 'cash', note: '' });
      setTouched(false);
    }
  }, [open, check, cardId]);
  if (!check) return null;
  const problems = checkMissedFill(draft, check, { hasGasCard: Boolean(cardId) });
  const ready = missedFillReady(problems);
  const show = (k: keyof typeof problems) => (touched ? problems[k] : undefined);
  const set = (patch: Partial<MissedFillDraft>) => {
    setTouched(true);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const odoOk = !problems.odometer && draft.odometer !== '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideCloseButton
        className="flex w-full flex-col overflow-y-auto bg-white p-0 sm:max-w-[600px]"
        data-testid="add-missed-fill"
      >
        <div className="flex-1 space-y-6 p-6 sm:p-10">
          <SheetHeader className="flex flex-row items-start justify-between space-y-0 p-0">
            <SheetTitle className="text-[28px] font-semibold leading-9 text-[#191c1e]">Add a missed fill</SheetTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f4f6] hover:bg-[#e6e8ea]"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </SheetHeader>
          <SheetDescription asChild>
            <div className="space-y-3 rounded-2xl bg-[#f7f9fb] p-4 text-[15px] text-[#191c1e]">
              <PlateBox plate={car?.plate || check.vehicleId} />
              <p>
                Between <strong>{dayLabel(check.startDate)}</strong> ({odo(check.startOdometer)} km) and{' '}
                <strong>{dayLabel(check.endDate)}</strong> ({odo(check.endOdometer)} km)
              </p>
            </div>
          </SheetDescription>

          <Field label="Date" error={show('date')}>
            <input
              type="date"
              className={inputCls}
              value={draft.date}
              min={check.startDate}
              max={check.endDate}
              onChange={(e) => set({ date: e.target.value })}
            />
          </Field>

          {draft.paidWith === 'cash' ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Amount" error={show('amount')}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-[#47464c]">J$</span>
                  <input
                    inputMode="decimal"
                    className={`${inputCls} pl-11`}
                    value={draft.amount}
                    onChange={(e) => set({ amount: e.target.value })}
                    aria-label="Amount"
                  />
                </div>
              </Field>
              <Field label="Litres" error={show('liters')}>
                <input
                  inputMode="decimal"
                  className={inputCls}
                  value={draft.liters}
                  onChange={(e) => set({ liters: e.target.value })}
                  aria-label="Litres"
                />
              </Field>
            </div>
          ) : (
            <p className="rounded-xl bg-[#f7f9fb] px-4 py-3 text-[14px] text-[#47464c]" data-testid="missed-fill-card-amount">
              The amount comes from the gas card statement.
            </p>
          )}

          <Field
            label="Odometer"
            error={show('odometer')}
            hint={`Must be between ${odo(check.startOdometer)} and ${odo(check.endOdometer)} km`}
          >
            <div className="relative">
              <input
                inputMode="numeric"
                className={`${inputCls} pr-12`}
                value={draft.odometer}
                onChange={(e) => set({ odometer: e.target.value })}
                aria-label="Odometer"
              />
              {odoOk ? (
                <CheckCircle2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#079669]" aria-hidden />
              ) : null}
            </div>
          </Field>

          <Field label="Paid with" error={draft.paidWith === 'gas_card' ? problems.card : undefined}>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f2f4f6] p-1" role="radiogroup" aria-label="Paid with">
              {(['gas_card', 'cash'] as PaidWith[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={draft.paidWith === p}
                  onClick={() => set({ paidWith: p })}
                  className={`h-11 rounded-lg text-[15px] font-medium ${
                    draft.paidWith === p ? 'bg-white text-[#191c1e] shadow-sm' : 'text-[#47464c]'
                  }`}
                >
                  {p === 'gas_card' ? 'Gas card' : 'Cash from earnings'}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Note">
            <textarea
              className="min-h-[72px] w-full rounded-xl border border-[#e0e3e5] bg-white px-4 py-3 text-[15px] text-[#191c1e] shadow-sm outline-none focus:border-[#0051d5]"
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
              aria-label="Note"
            />
          </Field>

          <p className="flex items-center gap-3 rounded-2xl bg-[#eef4ff] px-4 py-4 text-[15px] text-[#0051d5]">
            <Info className="h-5 w-5 shrink-0" aria-hidden /> The week is worked out again with this fill.
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-[#eceef0] p-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-12 rounded-xl px-6 text-[15px] font-medium text-[#191c1e] hover:bg-[#f2f4f6]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft);
                onOpenChange(false);
              } catch {
                /* the error is shown; the panel stays open */
              } finally {
                setSaving(false);
              }
            }}
            className="flex h-12 items-center gap-2 rounded-xl bg-[#030213] px-6 text-[15px] font-semibold text-white hover:bg-[#213145] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-4 w-4" aria-hidden /> Add fill
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------- screen 7

export function CloseWithNoteDialog({
  check,
  plate,
  open,
  onOpenChange,
  onSave,
}: {
  check: PossibleFillCheck | null;
  plate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setNote('');
  }, [open]);
  if (!check) return null;
  const ok = note.trim().length >= CLOSE_NOTE_MIN;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] rounded-3xl bg-white p-8" data-testid="close-with-note">
        <DialogHeader className="space-y-4 text-left">
          <DialogTitle className="text-[24px] font-semibold text-[#191c1e]">Close this without adding a fill?</DialogTitle>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#f7f9fb] p-4 text-[16px] text-[#191c1e]">
            <PlateBox plate={plate} />
            <span>
              {shortDay(check.startDate)} → {shortDay(check.endDate)} · {km(check.stretchKm)} with no fill
            </span>
          </div>
          <DialogDescription className="text-[16px] text-[#47464c]">
            Nothing is charged for it either way. Your note is kept with the week.
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#47464c]">Why</span>
          <textarea
            className="min-h-[96px] w-full rounded-xl border border-[#e0e3e5] px-4 py-3 text-[16px] text-[#191c1e] outline-none focus:border-[#0051d5]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Why"
          />
          <span className="block text-[13px] text-[#78767d]">At least {CLOSE_NOTE_MIN} characters</span>
        </label>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-12 rounded-xl px-5 text-[16px] font-medium text-[#191c1e] hover:bg-[#f2f4f6]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ok || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(note.trim());
                onOpenChange(false);
              } catch {
                /* the error is shown; the dialog stays open */
              } finally {
                setSaving(false);
              }
            }}
            className="h-12 rounded-xl bg-[#030213] px-6 text-[16px] font-semibold text-white hover:bg-[#213145] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Close with note
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- screen 8

const CHIP_CLS: Record<EconomyChip['tone'], string> = {
  amber: 'bg-[#fff4d6] text-[#8a5300]',
  green: 'bg-[#d5f5e6] text-[#006c49]',
  orange: 'bg-[#ffe7d1] text-[#9a4a00]',
  red: 'bg-[#ffdad6] text-[#ba1a1a]',
};

function EconomyChart({ data }: { data: VehicleEconomyResponse }) {
  const ref = data.referenceKmPerLiter;
  const pts = data.weeks.map((w, i) => ({ i, v: w.kmPerLiter, chip: economyChip(w) }));
  const vals = pts.map((p) => p.v).filter((v): v is number => v != null && v > 0);
  if (!vals.length || ref == null) return null;
  const lo = Math.min(...vals, ref * 0.85) * 0.97;
  const hi = Math.max(...vals, ref * 1.15) * 1.03;
  const W = 480;
  const H = 140;
  const x = (i: number) => 16 + (i * (W - 32)) / Math.max(1, pts.length - 1);
  const y = (v: number) => H - 10 - ((v - lo) / (hi - lo)) * (H - 20);
  const segs: string[] = [];
  let cur = '';
  for (const p of pts) {
    if (p.v == null || !(p.v > 0)) {
      if (cur) segs.push(cur);
      cur = '';
      continue;
    }
    cur += `${cur ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`;
  }
  if (cur) segs.push(cur);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label="Km per litre, last 8 weeks">
      <rect x={0} y={y(ref * 1.15)} width={W} height={y(ref * 0.85) - y(ref * 1.15)} fill="#eef4ff" />
      <line x1={0} x2={W} y1={y(ref)} y2={y(ref)} stroke="#78767d" strokeDasharray="5 4" strokeWidth={1} />
      {segs.map((d, k) => (
        <path key={k} d={d} fill="none" stroke="#0051d5" strokeWidth={2.5} strokeLinejoin="round" />
      ))}
      {pts.map((p) =>
        p.v != null && p.v > 0 ? (
          <circle
            key={p.i}
            cx={x(p.i)}
            cy={y(p.v)}
            r={p.chip && p.chip.text !== 'Normal' ? 6 : 4}
            fill={p.chip && p.chip.text !== 'Normal' ? '#fff' : '#0051d5'}
            stroke={p.chip && p.chip.text !== 'Normal' ? '#c2410c' : 'none'}
            strokeWidth={2.5}
          />
        ) : null,
      )}
    </svg>
  );
}

export function CarEconomySheet({
  car,
  data,
  loading,
  open,
  onOpenChange,
  onOpenCar,
}: {
  car: FuelChecksCar | null;
  data: VehicleEconomyResponse | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCar?: (vehicleId: string) => void;
}) {
  const rows = data ? [...data.weeks].reverse() : [];
  const ref = data?.referenceKmPerLiter ?? null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" hideCloseButton className="w-full overflow-y-auto bg-white p-0 sm:max-w-[600px]" data-testid="car-economy">
        <div className="space-y-5 p-6">
          <SheetHeader className="flex flex-row items-start justify-between space-y-0 p-0">
            <div className="space-y-2">
              <SheetTitle className="text-[28px] font-semibold leading-9 text-[#191c1e]">Car economy</SheetTitle>
              <SheetDescription asChild>
                <div className="flex items-center gap-2 text-[16px] text-[#47464c]">
                  {car ? <PlateBox plate={car.plate} /> : null}
                  {car?.makeModel ? <span>{car.makeModel}</span> : null}
                </div>
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f4f6] hover:bg-[#e6e8ea]"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </SheetHeader>

          {loading ? (
            <p className="text-[14px] text-[#47464c]">Loading…</p>
          ) : !data || economyNeedsMoreWeeks(data.weeks) ? (
            <p className="rounded-2xl bg-[#f7f9fb] p-4 text-[15px] text-[#47464c]" data-testid="car-economy-empty">
              Needs two weeks of odometer readings.
            </p>
          ) : (
            <>
              {data.economyDriftAlert ? (
                <p className="flex items-start gap-2 rounded-2xl bg-[#ffdad6]/50 p-4 text-[14px] font-medium text-[#ba1a1a]" data-testid="car-economy-drift">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {car?.plate || 'This car'} outside ±15% for 3 weeks running
                </p>
              ) : null}
              <div className="rounded-2xl bg-[#f2f4f6] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#47464c]">8-week km per litre</p>
                  <p className="text-[12px] font-semibold text-[#0051d5]">Km / litre</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <EconomyChart data={data} />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#47464c]">
                    <span>— Usual: {kmL(ref)} km/L</span>
                    <span>
                      Band: {kmL(ref != null ? ref * 0.85 : null)} – {kmL(ref != null ? ref * 1.15 : null)} km/L
                    </span>
                  </div>
                </div>
              </div>
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="bg-[#f2f4f6] text-[12px] uppercase tracking-[0.06em] text-[#47464c]">
                    <th className="px-3 py-3 text-left font-semibold">Week</th>
                    <th className="px-3 py-3 text-right font-semibold">Km per litre</th>
                    <th className="px-3 py-3 text-right font-semibold">Usual</th>
                    <th className="px-3 py-3 text-right font-semibold">Difference</th>
                    <th className="px-3 py-3 text-right font-semibold">
                      <span className="sr-only">Status</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => {
                    const chip = economyChip(w);
                    const hot = chip && chip.text !== 'Normal';
                    return (
                      <tr key={w.weekStart} className={hot ? 'bg-[#fffbeb]' : ''} data-testid="car-economy-row">
                        <td className={`px-3 py-3 ${hot ? 'font-semibold' : ''}`}>{shortDay(w.weekStart)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{kmL(w.kmPerLiter)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{kmL(w.referenceKmPerLiter)}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${hot ? 'text-[#c2410c]' : ''}`}>
                          {w.kmPerLiter == null ? '—' : diffText(w.pctVsUsual)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {chip ? (
                            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${CHIP_CLS[chip.tone]}`}>{chip.text}</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="flex items-start gap-2 rounded-2xl bg-[#fffbeb] p-4 text-[14px] text-[#8a5300]">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                A week much better than usual often means a fill was not scanned or an odometer was misread.
              </p>
            </>
          )}
          {car && onOpenCar ? (
            <button
              type="button"
              onClick={() => onOpenCar(car.vehicleId)}
              className="h-11 rounded-xl border border-[#c6c6cd] bg-white px-4 text-[14px] font-semibold text-[#191c1e] hover:bg-[#f7f9fb]"
            >
              Open car
            </button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------- the part

export function FuelChecksSection({
  periodId,
  weekStart,
  locked,
  cars,
  otherFills,
  reloadKey = 0,
  fuelCards,
  actorId,
  onUploadCardStatement,
  onOpenCar,
  onChanged,
  onChecksLoaded,
  children,
}: {
  periodId: string;
  weekStart: string;
  locked: boolean;
  cars: FuelChecksCar[];
  /** Priced fills in the week and what they cost (the Money Check total). */
  otherFills: { count: number; total: number };
  reloadKey?: number;
  fuelCards?: FuelCard[];
  actorId?: string | null;
  onUploadCardStatement?: () => void;
  onOpenCar?: (vehicleId: string) => void;
  /** After a fill is added or a check closed/reopened: work the week out again. */
  onChanged?: () => void;
  onChecksLoaded?: (checks: FuelWeekChecksResponse | null) => void;
  /** The other check panels (exceptions, review queue, cars to review) — unchanged. */
  children?: React.ReactNode;
}) {
  const [checks, setChecks] = useState<FuelWeekChecksResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cards, setCards] = useState<FuelCard[] | null>(fuelCards ?? null);
  const [addFor, setAddFor] = useState<PossibleFillCheck | null>(null);
  const [closeFor, setCloseFor] = useState<PossibleFillCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [econCar, setEconCar] = useState<FuelChecksCar | null>(null);
  const [econ, setEcon] = useState<Record<string, VehicleEconomyResponse | null>>({});
  const [econLoading, setEconLoading] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const body = await api.getFuelWeekChecks(periodId);
      setChecks(body);
      setLoadError(null);
      onChecksLoaded?.(body);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the fuel checks');
      onChecksLoaded?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (fuelCards) setCards(fuelCards);
  }, [fuelCards]);

  const carIds = useMemo(() => cars.map((c) => c.vehicleId).join(','), [cars]);
  useEffect(() => {
    let alive = true;
    for (const c of cars) {
      setEconLoading((m) => ({ ...m, [c.vehicleId]: true }));
      api
        .getVehicleEconomyWeeks(c.vehicleId, weekStart)
        .then((d) => alive && setEcon((m) => ({ ...m, [c.vehicleId]: d })))
        .catch(() => alive && setEcon((m) => ({ ...m, [c.vehicleId]: null })))
        .finally(() => alive && setEconLoading((m) => ({ ...m, [c.vehicleId]: false })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carIds, weekStart, reloadKey]);

  const carOf = (vehicleId: string): FuelChecksCar =>
    cars.find((c) => c.vehicleId === vehicleId) || { vehicleId, plate: vehicleId };
  const plateOf = (vehicleId: string) => carOf(vehicleId).plate;

  const awaiting = checks?.awaiting || [];
  const open = openPossibleFills(checks?.possibleFills || []);
  const closed = (checks?.possibleFills || []).filter((p) => p.closed);
  const driverNames = [...new Set(awaiting.map((a) => carOf(a.vehicleId).driverName).filter(Boolean))] as string[];
  const driverFirst = driverNames.length === 1 ? driverNames[0].split(/\s+/)[0] : null;
  const openCount = awaiting.length + open.length;

  const ensureCards = async (): Promise<FuelCard[]> => {
    if (cards) return cards;
    try {
      const list = await fuelService.getFuelCards();
      setCards(list);
      return list;
    } catch {
      setCards([]);
      return [];
    }
  };
  const cardFor = (car: FuelChecksCar | null) =>
    car && cards ? findActiveFuelCardForSession(cards, { vehicleId: car.vehicleId, driverId: car.driverId })?.id : undefined;

  const addCar = addFor ? carOf(addFor.vehicleId) : null;
  const chartVehicle = open[0]?.vehicleId;

  return (
    <div className="space-y-4" data-testid="fuel-checks">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold text-[#191c1e]">Fuel checks</h2>
          <p className="text-[14px] text-[#47464c]">Fills that need a look before the week can lock.</p>
        </div>
        {open.length > 0 ? (
          <span className="rounded-full bg-[#ffdad6]/60 px-3 py-1 text-[12px] font-semibold text-[#ba1a1a]">
            {open.length} to fix
          </span>
        ) : awaiting.length > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-[#fff8eb] px-3 py-1 text-[12px] font-semibold text-[#b45309] shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#d97706]" aria-hidden /> {awaiting.length} waiting
          </span>
        ) : null}
      </div>

      {loadError ? (
        <p className="rounded-xl bg-[#ffdad6]/40 px-4 py-3 text-[14px] text-[#ba1a1a]" role="alert">
          The fuel checks didn't load: {loadError}
        </p>
      ) : null}

      {awaiting.length > 0 ? (
        <AwaitingCard
          fills={awaiting}
          plateOf={plateOf}
          driverFirstName={driverFirst}
          onUpload={onUploadCardStatement}
          locked={locked}
        />
      ) : null}

      {open.map((p) => (
        <PossibleFillCard
          key={p.flagId}
          check={p}
          plate={plateOf(p.vehicleId)}
          driverName={carOf(p.vehicleId).driverName}
          locked={locked}
          onAddFill={() => {
            void ensureCards().then(() => setAddFor(p));
          }}
          onClose={() => setCloseFor(p)}
        />
      ))}

      {closed.map((p) => (
        <ClosedRow
          key={p.flagId}
          check={p}
          plate={plateOf(p.vehicleId)}
          text={closedLine(p, checks?.actorNames || {})}
          locked={locked}
          busy={busy === p.flagId}
          onReopen={async () => {
            setBusy(p.flagId);
            try {
              await api.reopenFuelFlagDisposition({ entryId: p.flagId, flagCode: FLAG_POSSIBLE_FILL, periodId });
              await load();
              onChanged?.();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not reopen this check');
            } finally {
              setBusy(null);
            }
          }}
        />
      ))}

      {children}

      {checks && otherFills.count > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f2f4f6] p-4 shadow-sm" data-testid="checks-other-fills">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d5f5e6] text-[#006c49]">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </span>
            <p className="flex flex-wrap items-center gap-x-2 text-[14px] text-[#47464c]">
              <span className="font-semibold text-[#191c1e]">{openCount > 0 ? 'Other fills' : 'All fills'}</span>
              <span>· {otherFills.count === 1 ? '1 fill' : `${otherFills.count} fills`}</span>
              <span className="font-semibold tabular-nums text-[#191c1e]">· {money(otherFills.total)}</span>
              <span>· all checked</span>
            </p>
          </div>
        </div>
      ) : null}

      {open.length > 0 && chartVehicle ? <StretchChart {...stretchBars(checks?.stretches || [], chartVehicle)} /> : null}

      {cars.length > 0 ? (
        <div className="space-y-3" data-testid="checks-car-economy">
          <h3 className="text-[17px] font-semibold text-[#191c1e]">Car economy</h3>
          {cars.map((c) => {
            const d = econ[c.vehicleId];
            const thisWeek = d?.weeks.find((w) => w.weekStart === weekStart) || d?.weeks[d.weeks.length - 1];
            const chip = thisWeek ? economyChip(thisWeek) : null;
            const waitingHere = awaiting.filter((a) => a.vehicleId === c.vehicleId).length;
            return (
              <div key={c.vehicleId} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] text-[#191c1e]">
                    <PlateBox plate={c.plate} />
                    <span>
                      this week{' '}
                      {econLoading[c.vehicleId] ? '…' : thisWeek?.kmPerLiter ? `${kmL(thisWeek.kmPerLiter)} km per litre` : '—'}
                    </span>
                    {chip ? (
                      <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${CHIP_CLS[chip.tone]}`}>{chip.text}</span>
                    ) : null}
                  </p>
                  {!thisWeek?.kmPerLiter && waitingHere > 0 ? (
                    <p className="text-[13px] text-[#47464c]">
                      Shown once the {waitingHere === 1 ? 'card fill is' : `${waitingHere} card fills are`} priced
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setEconCar(c)}
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#f2f4f6] px-4 text-[14px] font-semibold text-[#191c1e] hover:bg-[#e6e8ea]"
                >
                  <History className="h-4 w-4" aria-hidden /> See 8 weeks
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <AddMissedFillSheet
        check={addFor}
        car={addCar}
        cardId={cardFor(addCar)}
        open={addFor != null}
        onOpenChange={(o) => !o && setAddFor(null)}
        onSave={async (draft) => {
          if (!addFor || !addCar) return;
          try {
            const entry = buildMissedFillEntry({
              draft,
              vehicleId: addCar.vehicleId,
              driverId: String(addCar.driverId || ''),
              driverName: addCar.driverName,
              cardId: cardFor(addCar),
              flagId: addFor.flagId,
              actorId,
            });
            await fuelService.saveFuelEntry(entry);
            toast.success('Fill added. The week is worked out again.');
            await load();
            onChanged?.();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not add the fill');
            throw e;
          }
        }}
      />

      <CloseWithNoteDialog
        check={closeFor}
        plate={closeFor ? plateOf(closeFor.vehicleId) : ''}
        open={closeFor != null}
        onOpenChange={(o) => !o && setCloseFor(null)}
        onSave={async (note) => {
          if (!closeFor) return;
          try {
            await api.upsertFuelFlagDisposition({
              entryId: closeFor.flagId,
              flagCode: FLAG_POSSIBLE_FILL,
              action: 'accepted',
              note,
              periodId,
            });
            await load();
            onChanged?.();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not close this check');
            throw e;
          }
        }}
      />

      <CarEconomySheet
        car={econCar}
        data={econCar ? econ[econCar.vehicleId] ?? null : null}
        loading={econCar ? Boolean(econLoading[econCar.vehicleId]) : false}
        open={econCar != null}
        onOpenChange={(o) => !o && setEconCar(null)}
        onOpenCar={onOpenCar}
      />
    </div>
  );
}
