/**
 * Step 5 → "Distance and who pays" (fuel audit Part J screens 1, 2, 3, 9, 12, 17).
 * Look = the Stitch export (roam_fleet_distance_and_who_pays_*); content = fuelWhoPaysModel.
 */
import React, { useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Car,
  CheckCheck,
  CheckCircle2,
  Info,
  Scale,
  X,
  XCircle,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../ui/sheet';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import type {
  WhoPaysCar,
  WhoPaysComparison,
  WhoPaysDriverWeek,
  WhoPaysPurpose,
  WhoPaysRow,
} from '../../../utils/fuelWhoPaysModel';

const money = (n: number) => formatFuelMoney(n, 2);
const kmText = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('en-US')} km`;
const odo = (n: number) => Math.round(n).toLocaleString('en-US');
const pctText = (n: number) => `${Math.round((Number(n) || 0) * 100) / 100}%`;

const DOT: Record<WhoPaysPurpose, string> = {
  uber_trips: 'bg-[#079669]',
  to_pickups: 'bg-[#0051d5]',
  company_errands: 'bg-[#346cef]',
  personal: 'bg-[#b4c5ff]',
  personal_allowance: 'bg-[#68dba9]',
  commute: 'bg-[#84819a]',
  unexplained_km: 'bg-[#ba1a1a]',
  no_odometer_fills: 'bg-[#78767d]',
};

export type WhoPaysStopToStop = { windows: number; open: number; summary: string; onFix?: () => void };

export type WhoPaysReview = {
  /** True when this part still needs a decision (the review below). */
  needed: boolean;
  onMarkReviewed: () => void;
};

export type WhoPaysChainReview = {
  needed: boolean;
  onMarkReadingsReviewed: () => void;
};

function StateChip({ state }: { state: WhoPaysDriverWeek['state'] }) {
  if (state === 'charged') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[#f2f4f6] px-3 py-1 text-[11px] font-semibold leading-4 tracking-[0.04em] text-[#079669]"
        data-testid="who-pays-chip"
      >
        <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Charged
      </span>
    );
  }
  if (state === 'preview') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-[#eceef0] px-3 py-1 text-[11px] font-semibold leading-4 tracking-[0.04em] text-[#47464c]"
        data-testid="who-pays-chip"
      >
        Preview — not charged
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-[#eceef0] px-3 py-1 text-[11px] font-semibold leading-4 tracking-[0.04em] text-[#47464c]"
      data-testid="who-pays-chip"
    >
      Priced the old way
    </span>
  );
}

function DriverPctChip({ pct }: { pct: number }) {
  const zero = !(pct > 0);
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-4 tracking-[0.04em] ${
        zero ? 'bg-[#eceef0] text-[#47464c]' : 'bg-[#dbe1ff] text-[#00174b]'
      }`}
    >
      Driver {pctText(pct)}
    </span>
  );
}

function PurposeRow({ row, preview }: { row: WhoPaysRow; preview: boolean }) {
  return (
    <div
      className="flex flex-col justify-between gap-2 p-4 transition-colors hover:bg-[#f2f4f6]/50 sm:flex-row sm:items-center sm:p-5"
      data-testid={`who-pays-row-${row.purpose}`}
    >
      <div className="flex items-start gap-3 sm:items-center">
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full sm:mt-0 ${DOT[row.purpose]}`} aria-hidden />
        <div className="flex flex-col">
          <span className="flex items-center gap-2 text-[15px] font-semibold leading-[22px] text-[#191c1e]">
            {row.label}
            {preview ? (
              <span className="rounded-full bg-[#eceef0] px-2 py-0.5 text-[11px] font-semibold text-[#47464c]">Preview</span>
            ) : null}
          </span>
          <span className="text-[13px] font-medium leading-[18px] tabular-nums text-[#47464c]">
            {row.costPerKm != null && row.km > 0
              ? `${kmText(row.km)} × ${money(row.costPerKm)} = ${money(row.cost)}`
              : money(row.cost)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 self-end sm:self-auto">
        <DriverPctChip pct={row.driverPct} />
        <div className="text-right">
          <div className="text-[15px] font-semibold leading-[22px] tabular-nums text-[#0051d5]">Driver pays {money(row.driver)}</div>
          <div className="text-[12px] leading-[18px] tabular-nums text-[#191c1e]">Company keeps {money(row.company)}</div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-[#f2f4f6] p-3">
      <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-[#47464c]">{label}</span>
      <div className="my-1">
        <span className={`text-[22px] font-bold leading-7 tabular-nums ${accent ? 'text-[#0051d5]' : 'text-[#191c1e]'}`}>{value}</span>
      </div>
      <span className="text-[12px] leading-snug text-[#47464c]">{sub}</span>
    </div>
  );
}

function AddsUpLine({ car }: { car: WhoPaysCar }) {
  const ok = Math.abs(car.difference) < 0.005;
  if (ok) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-[#f2f4f6] p-4" data-testid="who-pays-adds-up">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[#079669]" aria-hidden />
        <p className="text-[12px] leading-relaxed text-[#005137]">
          <span className="font-semibold">
            Driver {money(car.driver)} + company {money(car.company)} = {money(car.total)} fuel bought.
          </span>
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#ffdad6] p-4" data-testid="who-pays-adds-up">
      <XCircle className="h-5 w-5 shrink-0 text-[#ba1a1a]" aria-hidden />
      <p className="text-[12px] leading-relaxed text-[#93000a]">
        <span className="font-semibold">
          Driver {money(car.driver)} + company {money(car.company)} is {money(Math.abs(car.difference))}{' '}
          {car.difference > 0 ? 'more' : 'less'} than the {money(car.total)} fuel bought.
        </span>
      </p>
    </div>
  );
}

function ComparisonCard({ comparison }: { comparison: WhoPaysComparison }) {
  const less = comparison.change < 0;
  return (
    <div className="space-y-3" data-testid="who-pays-comparison">
      <div className="flex gap-3 rounded-2xl bg-[#f2f4f6] p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#47464c]" aria-hidden />
        <div>
          <p className="text-[15px] font-semibold text-[#191c1e]">New pricing preview</p>
          <p className="text-[12px] leading-[18px] text-[#47464c]">
            This week is still charged the old way. Here is what the new way would charge, so you can compare before it
            is switched on.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-[#f2f4f6] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#47464c]">Charged now (old way)</p>
          <p className="mt-2 text-[24px] font-semibold leading-8 text-[#191c1e]">Driver pays</p>
          <p className="text-[24px] font-semibold leading-8 tabular-nums text-[#191c1e]">{money(comparison.oldDriver)}</p>
          <p className="mt-2 text-[12px] text-[#47464c]">
            {comparison.usualKmPerLiter
              ? `Priced at the car's usual ${comparison.usualKmPerLiter.toFixed(1)} km per litre`
              : "Priced at the car's usual km per litre"}
          </p>
        </div>
        <div className="rounded-2xl bg-[#f2f4f6] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#47464c]">New way</p>
          <p className="mt-2 text-[24px] font-semibold leading-8 text-[#191c1e]">Driver pays</p>
          <p className="text-[24px] font-semibold leading-8 tabular-nums text-[#0051d5]">{money(comparison.newDriver)}</p>
          <p className="mt-2 text-[12px] text-[#47464c]">Priced per km from the fuel bought</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#f2f4f6] px-4 py-3">
        {Math.abs(comparison.change) >= 0.005 ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
              less ? 'bg-[#85f8c4] text-[#002114]' : 'bg-[#ffdad6] text-[#93000a]'
            }`}
          >
            {money(Math.abs(comparison.change))} {less ? 'less' : 'more'} for the driver
          </span>
        ) : (
          <span className="rounded-full bg-[#eceef0] px-2.5 py-1 text-[12px] font-semibold text-[#47464c]">
            Same for the driver
          </span>
        )}
        {comparison.movedMost ? (
          <span className="text-[13px] text-[#191c1e]">
            {comparison.movedMost.label} moved most: <s className="text-[#78767d]">{money(comparison.movedMost.from)}</s> →{' '}
            {money(comparison.movedMost.to)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CarCard({
  car,
  review,
  chainReview,
  stopToStop,
  onWhy,
}: {
  car: WhoPaysCar;
  review: WhoPaysReview | null;
  chainReview: WhoPaysChainReview | null;
  stopToStop: WhoPaysStopToStop | null;
  onWhy: () => void;
}) {
  const preview = car.state === 'preview' || car.previewOnly;
  const chainless = car.pricing === 'km_share_fallback';
  const oldWay = car.state === 'old_way';
  const purposeKm = car.rows.reduce((s, r) => s + (r.purpose === 'unexplained_km' ? 0 : r.km), 0);
  const noTrips = chainless && car.rows.every((r) => r.purpose === 'unexplained_km' && !(r.km > 0));
  return (
    <section className="space-y-4" data-testid={`who-pays-car-${car.vehicleId}`}>
      <div className="flex flex-col justify-between gap-3 rounded-2xl bg-[#f2f4f6] p-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black shadow-sm">
            <Car className="h-6 w-6" aria-hidden />
          </div>
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              {car.makeModel ? <span className="text-[15px] font-semibold text-[#191c1e]">{car.makeModel}</span> : null}
              <span className="rounded bg-[#e0e3e5] px-2 py-0.5 text-[13px] font-bold tabular-nums tracking-wider text-[#191c1e]">
                {car.plate}
              </span>
              <span className="hidden text-[13px] text-[#47464c] sm:inline">•</span>
              <span className="text-[13px] font-medium text-[#191c1e]">{car.driverName}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {car.ruleName ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#47464c]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0051d5]" aria-hidden />
                  {car.ruleName}
                  {car.ruleFrom ? ` · from ${car.ruleFrom}` : ''}
                </span>
              ) : null}
              {chainless ? (
                <span className="rounded-full bg-[#fff3d6] px-2 py-0.5 text-[11px] font-semibold text-[#7a4b00]" data-testid="who-pays-km-share">
                  Priced by share of km
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {!oldWay ? (
          <button
            type="button"
            onClick={onWhy}
            className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#c9c5cd] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#191c1e] shadow-sm hover:bg-[#f7f9fb] sm:w-auto sm:self-auto"
          >
            <Info className="h-4 w-4 text-[#0051d5]" aria-hidden />
            Why this charge
          </button>
        ) : null}
      </div>

      {chainless && chainReview?.needed ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#f5c46b] bg-[#fff8e6] p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="who-pays-chain-card">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#7a4b00]" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold text-[#191c1e]">Not enough odometer readings</p>
              <p className="text-[12px] text-[#47464c]">
                This car has fewer than 3 fills with an odometer this week, so the cost per km can&apos;t come from the
                odometer. It is priced by share of km instead — a preview until you mark the readings reviewed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={chainReview.onMarkReadingsReviewed}
            className="h-10 shrink-0 rounded-xl bg-black px-4 text-[13px] font-semibold text-white hover:bg-[#1b192e]"
          >
            Mark readings reviewed
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tile
          label="Fuel bought"
          value={money(car.fuelBought)}
          sub={
            car.gasCard != null && car.cash != null
              ? `Gas card ${money(car.gasCard)} · Cash ${money(car.cash)}`
              : 'All fills this week'
          }
        />
        <Tile
          label="Kilometres"
          value={kmText(chainless ? purposeKm : car.km)}
          sub={
            chainless
              ? 'From trips and pickups'
              : car.odoFrom != null && car.odoTo != null
                ? `Odometer ${odo(car.odoFrom)} → ${odo(car.odoTo)}`
                : 'On the odometer'
          }
        />
        {oldWay ? (
          <Tile label="Worked out with" value="Old pricing" sub={car.engineVersion ? `Engine ${car.engineVersion}` : 'Saved when locked'} />
        ) : (
          <Tile
            label="Cost per km"
            value={car.costPerKm != null ? money(car.costPerKm) : '—'}
            accent
            sub={
              car.costPerKm != null
                ? `${money(chainless ? car.total : car.fuelBought)} ÷ ${kmText(chainless ? purposeKm : car.km)}${chainless ? ' of driving' : ' on odometer'}`
                : 'No distance to price by'
            }
          />
        )}
      </div>
      {car.capNote ? (
        <p className="rounded-xl bg-[#f2f4f6] px-4 py-2 text-[12px] text-[#47464c]" data-testid="who-pays-cap-note">
          {car.capNote}
        </p>
      ) : null}

      {oldWay ? (
        <div className="space-y-3 rounded-2xl bg-[#f2f4f6] p-5" data-testid="who-pays-old-way">
          <p className="text-[13px] text-[#47464c]">
            Worked out with the old pricing{car.engineVersion ? ` (${car.engineVersion})` : ''}. It keeps the numbers it was
            locked with.
          </p>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-[24px] font-bold leading-8 tabular-nums text-[#0051d5]">Driver pays {money(car.driver)}</span>
            <span className="hidden text-[15px] text-[#c9c5cd] sm:inline">•</span>
            <span className="text-[18px] font-bold leading-[26px] tabular-nums text-[#191c1e]">Company keeps {money(car.company)}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex items-center justify-between bg-[#f2f4f6] px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#47464c]">
              <span>Kind of driving</span>
              <span className="hidden sm:inline">Who pays</span>
            </div>
            {noTrips ? (
              <p className="px-5 py-4 text-[13px] text-[#47464c]">
                No trips this week — the whole {money(car.total)} goes to the leftover rule.
              </p>
            ) : null}
            {car.rows.map((r) => (
              <PurposeRow key={r.purpose} row={r} preview={preview} />
            ))}
            {car.personalAllowance ? (
              <div className="flex items-center justify-between gap-3 px-5 py-3 text-[12px] text-[#005137]" data-testid="who-pays-allowance">
                <span>
                  Personal Allowance — earned {kmText(car.personalAllowance.km)}, company pays
                </span>
                <span className="tabular-nums">{money(car.personalAllowance.company)}</span>
              </div>
            ) : null}
            {car.noOdometer ? (
              <div className="flex items-center justify-between gap-3 px-5 py-3 text-[12px] text-[#191c1e]" data-testid="who-pays-no-odometer">
                <span>No-odometer fills: {money(car.noOdometer.cost)} split by the leftover rule</span>
                <span className="tabular-nums">
                  Driver {money(car.noOdometer.driver)} · Company {money(car.noOdometer.company)}
                </span>
              </div>
            ) : null}
            {car.mutedRows.map((label) => (
              <div
                key={label}
                className="flex items-center justify-between bg-[#f2f4f6]/40 px-5 py-3 text-[12px] text-[#47464c]"
              >
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#c9c5cd]" aria-hidden />
                  <span>{label}</span>
                </div>
                <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-[#78767d]">0 km · nothing to split</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-2xl bg-[#f2f4f6] p-5 shadow-sm sm:flex-row sm:items-center">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#47464c]">
                {preview ? 'Total (preview)' : 'Total'}
              </span>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="text-[24px] font-bold leading-8 tabular-nums text-[#0051d5]">Driver pays {money(car.driver)}</span>
                <span className="hidden text-[15px] text-[#c9c5cd] sm:inline">•</span>
                <span className="text-[18px] font-bold leading-[26px] tabular-nums text-[#191c1e]">
                  Company keeps {money(car.company)}
                </span>
              </div>
            </div>
            {review ? (
              review.needed ? (
                <button
                  type="button"
                  onClick={review.onMarkReviewed}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-5 py-2.5 text-[13px] font-semibold text-white shadow hover:bg-[#1b192e] sm:w-auto"
                  data-testid="who-pays-mark-reviewed"
                >
                  <BadgeCheck className="h-[18px] w-[18px]" aria-hidden />
                  Mark reviewed
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-[#079669]">
                  <CheckCheck className="h-4 w-4" aria-hidden /> Nothing to review
                </span>
              )
            ) : null}
          </div>
        </>
      )}

      <AddsUpLine car={car} />

      {stopToStop && stopToStop.windows > 0 ? (
        stopToStop.open === 0 ? (
          <div className="flex items-center justify-between rounded-xl bg-[#eceef0] p-3.5 text-[#191c1e]" data-testid="who-pays-s2s">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <CheckCheck className="h-[18px] w-[18px] text-[#079669]" aria-hidden />
              <span>All fill windows on {car.plate} add up.</span>
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-[#47464c]">
              {stopToStop.windows} / {stopToStop.windows} checked
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-[#f5c46b] bg-[#fff8e6] p-3.5 sm:flex-row sm:items-center sm:justify-between" data-testid="who-pays-s2s">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[#191c1e]">
              <AlertTriangle className="h-[18px] w-[18px] text-[#7a4b00]" aria-hidden />
              <span>{stopToStop.summary}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold tabular-nums text-[#47464c]">
                {stopToStop.windows - stopToStop.open} / {stopToStop.windows} add up
              </span>
              {stopToStop.onFix ? (
                <button
                  type="button"
                  onClick={stopToStop.onFix}
                  className="h-9 rounded-xl border border-[#c9c5cd] bg-white px-3 text-[13px] font-semibold text-[#191c1e] hover:bg-[#f7f9fb]"
                >
                  Fix fill windows
                </button>
              ) : null}
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}

export function FuelWhyThisChargeSheet({
  car,
  open,
  onOpenChange,
}: {
  car: WhoPaysCar | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!car) return null;
  const preview = car.state === 'preview' || car.previewOnly;
  const chainless = car.pricing === 'km_share_fallback';
  const kmRows = car.rows.filter((r) => r.km > 0);
  const kmTotal = kmRows.reduce((s, r) => s + r.km, 0) + (car.personalAllowance?.km || 0);
  const kmRef = chainless ? kmTotal : car.km;
  const charged = [...car.rows, ...(car.noOdometer ? [car.noOdometer] : [])].filter((r) => r.driver > 0);
  const companyAll = [...car.rows, ...(car.personalAllowance ? [car.personalAllowance] : [])].filter(
    (r) => !(r.driver > 0) && r.cost > 0,
  );
  const first = car.driverName.split(' ')[0] || car.driverName;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" hideCloseButton className="w-full overflow-y-auto bg-white p-0 sm:max-w-[560px]" data-testid="why-this-charge">
        <div className="flex flex-col gap-4 p-8">
          <SheetHeader className="space-y-2 p-0">
            <div className="flex items-start justify-between gap-3">
              <SheetTitle className="text-[18px] font-semibold leading-[26px] text-[#191c1e]">
                Why {first} pays {money(car.driver)}
              </SheetTitle>
              <button
                type="button"
                aria-label="Close panel"
                onClick={() => onOpenChange(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#c9c5cd] bg-[#eceef0] text-[#47464c] hover:bg-[#e6e8ea]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <SheetDescription asChild>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#47464c]">
                <span className="rounded bg-[#e0e3e5] px-2 py-0.5 font-bold tabular-nums text-[#191c1e]">{car.plate}</span>
                {car.makeModel ? <span>{car.makeModel}</span> : null}
                {preview ? (
                  <span className="rounded-full bg-[#eceef0] px-2 py-0.5 text-[11px] font-semibold text-[#47464c]">
                    Preview — not charged
                  </span>
                ) : null}
              </div>
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-1 rounded-xl bg-[#f2f4f6] p-4">
            <StepTitle n={1} title="What the car cost to run" />
            <div className="rounded-lg bg-white p-3 text-[13px] font-semibold leading-relaxed tabular-nums text-[#191c1e]">
              {car.costPerKm != null ? (
                <>
                  {money(chainless ? car.total : car.fuelBought)} fuel bought ÷ {kmText(kmRef)}
                  {chainless ? ' of driving' : ' on the odometer'} ={' '}
                  <span className="font-bold text-[#0051d5]">{money(car.costPerKm)} per km</span>
                </>
              ) : (
                <>No distance to price by — the whole {money(car.total)} goes to the leftover rule.</>
              )}
            </div>
            {car.capNote ? <p className="text-[12px] text-[#47464c]">{car.capNote}</p> : null}
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-[#f2f4f6] p-4">
            <div className="flex items-center justify-between">
              <StepTitle n={2} title="How the km were used" />
              <span className="text-[13px] font-semibold tabular-nums text-[#191c1e]">{kmText(kmTotal)} total</span>
            </div>
            {kmTotal > 0 ? (
              <div className="mt-1 flex h-4 w-full overflow-hidden rounded-full bg-[#e0e3e5]" aria-hidden>
                {[...kmRows, ...(car.personalAllowance ? [car.personalAllowance] : [])].map((r) => (
                  <div key={r.purpose} className={`h-full ${DOT[r.purpose]}`} style={{ width: `${(r.km / kmTotal) * 100}%` }} />
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[...kmRows, ...(car.personalAllowance ? [car.personalAllowance] : [])].map((r) => (
                <div key={r.purpose} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[r.purpose]}`} aria-hidden />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium leading-tight text-[#47464c]">{r.label}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-[#191c1e]">{kmText(r.km)}</span>
                  </div>
                </div>
              ))}
            </div>
            {!chainless && car.km > 0 ? (
              <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[#079669]">
                <CheckCircle2 className="h-[18px] w-[18px]" aria-hidden />
                <span className="text-[13px] font-medium">
                  Adds up to {kmText(kmTotal)}
                  {Math.round(kmTotal) === Math.round(car.km) ? ', the same as the odometer.' : '.'}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-[#f2f4f6] p-4">
            <StepTitle n={3} title="What the rule says the driver pays" />
            <div className="flex flex-col gap-2 rounded-lg bg-white p-3">
              {charged.map((r, i) => (
                <React.Fragment key={r.purpose}>
                  {i > 0 ? <div className="h-px bg-[#eceef0]" /> : null}
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="font-medium text-[#47464c]">{r.label}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-[#191c1e]">
                      {money(r.cost)} × {pctText(r.driverPct)} = <span className="font-bold">{money(r.driver)}</span>
                    </span>
                  </div>
                </React.Fragment>
              ))}
              {companyAll.map((r) => (
                <div key={`co-${r.purpose}`} className="flex items-center justify-between gap-3 text-[12px] text-[#47464c]">
                  <span>{r.label}</span>
                  <span className="rounded bg-[#e6e8ea] px-2 py-0.5 text-[11px] font-semibold">The company pays all of it</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-[#dbe1ff]/50 p-5 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#00174b]">{first} pays total</span>
            <span className="text-[24px] font-bold leading-8 tabular-nums text-[#0051d5]">{money(car.driver)}</span>
            <span className="text-[12px] tabular-nums text-[#47464c]">
              {charged.map((r) => money(r.driver)).join(' + ') || money(0)}
            </span>
          </div>

          {car.ruleName ? (
            <p className="flex items-center gap-2 text-[13px] text-[#47464c]">
              <Scale className="h-4 w-4" aria-hidden />
              {car.ruleName}
              {car.ruleFrom ? ` • applies from ${car.ruleFrom}` : ''}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-12 w-full rounded-xl border border-[#c9c5cd] bg-[#eceef0] text-[14px] font-semibold text-[#191c1e] hover:bg-[#e6e8ea]"
          >
            Close
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-[11px] font-bold text-white">{n}</span>
      <h3 className="text-[15px] font-semibold text-[#191c1e]">{title}</h3>
    </div>
  );
}

/** The whole "Distance and who pays" body: state chip, preview comparison, one card per car. */
export function FuelWhoPaysSection({
  weeks,
  review,
  chainReview,
  stopToStopFor,
}: {
  weeks: WhoPaysDriverWeek[];
  review: WhoPaysReview | null;
  chainReview: WhoPaysChainReview | null;
  stopToStopFor: (vehicleId: string, plate: string) => WhoPaysStopToStop | null;
}) {
  const [why, setWhy] = useState<WhoPaysCar | null>(null);
  if (!weeks.length) {
    return (
      <p className="rounded-2xl bg-[#f2f4f6] p-5 text-[13px] text-[#47464c]" data-testid="who-pays-empty">
        No fuel this week.
      </p>
    );
  }
  const state = weeks.some((w) => w.state === 'charged')
    ? 'charged'
    : weeks.some((w) => w.state === 'preview')
      ? 'preview'
      : 'old_way';
  return (
    <div className="space-y-5" data-testid="who-pays">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-[18px] font-semibold leading-[26px] text-[#191c1e]">Distance and who pays</h2>
          <p className="text-[12px] text-[#47464c]">How the car was driven this week, and how the fuel cost is split.</p>
        </div>
        <div className="self-start sm:self-auto">
          <StateChip state={state} />
        </div>
      </div>
      {weeks.map((w) => (
        <div key={w.driverId} className="space-y-5">
          {w.comparison ? <ComparisonCard comparison={w.comparison} /> : null}
          {w.cars.map((car) => (
            <CarCard
              key={car.key}
              car={car}
              review={car.state === 'old_way' ? null : review}
              chainReview={chainReview}
              stopToStop={stopToStopFor(car.vehicleId, car.plate)}
              onWhy={() => setWhy(car)}
            />
          ))}
        </div>
      ))}
      <FuelWhyThisChargeSheet car={why} open={why != null} onOpenChange={(o) => !o && setWhy(null)} />
    </div>
  );
}
