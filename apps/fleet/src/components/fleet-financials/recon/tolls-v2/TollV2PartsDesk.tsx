import React from 'react';
import { ArrowLeft, ArrowRight, Banknote, Car, Check, Lock } from 'lucide-react';
import type { TollV2Charge, TollV2Desk, TollV2KeptPayback, TollV2PartNo, TollV2Payback, TollV2Suggestion } from './types';
import {
  PART_META,
  PART_NOS,
  chargesInPart,
  part5Paybacks,
  pillFor,
  pillStatusLabel,
  splitMatches,
  topSuggestion,
} from './tollV2Parts';
import { chargeWhen, fmtTollMinor, formatTripWindow } from './tollV2Format';
import { TollV2Sections } from './TollV2Sections';
import { TollV2ChargeRow, type TollV2RowActions } from './TollV2ChargeRow';
import { TollV2PrimaryButton, TollV2SecondaryButton } from './TollV2Buttons';

/** The six-pill progress row (Stitch `tolls_part_3_disputes_with_uber_12_to_send` pill style for every part). */
export function TollV2PartsRow({
  desk,
  current,
  onGo,
}: {
  desk: TollV2Desk;
  current: TollV2PartNo;
  onGo: (p: TollV2PartNo) => void;
}) {
  return (
    <nav
      className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.04)] sm:p-5"
      aria-label="Toll parts"
      data-testid="toll-v2-parts-row"
    >
      <ol className="relative flex items-center justify-between gap-1 sm:gap-2">
        <span className="absolute left-4 right-4 top-1/2 z-0 h-0.5 -translate-y-1/2 bg-[#e5eeff]" aria-hidden />
        {PART_NOS.map((n) => {
          const pill = pillFor(desk, n);
          const on = n === current;
          const clear = pill?.status === 'clear' || pill?.status === 'sealed' || pill?.status === 'ready';
          const status = pillStatusLabel(pill, desk.disputes);
          const hot = pill?.status === 'todo' || pill?.status === 'blocked';
          return (
            <li key={n} className="relative z-10">
              <button
                type="button"
                onClick={() => onGo(n)}
                aria-current={on ? 'step' : undefined}
                aria-label={`Part ${n} ${PART_META[n].pill}: ${status}`}
                data-testid={`toll-v2-pill-${n}`}
                data-status={pill?.status ?? 'clear'}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium sm:px-3 ${
                  on
                    ? 'bg-[#030213] text-white shadow-md'
                    : clear
                      ? 'bg-white text-[#0b1c30] shadow-sm'
                      : 'bg-[#eff4ff] text-[#47464c]'
                }`}
              >
                {clear && !on ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#069669] text-white">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                ) : n === 6 && !on ? (
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                ) : null}
                <span className={`whitespace-nowrap ${on ? 'font-semibold' : ''}`}>
                  {n}
                  <span className="hidden sm:inline"> {PART_META[n].pill}</span>
                </span>
                {on && (hot || pill?.status === 'waiting') ? (
                  <span
                    className={`hidden whitespace-nowrap rounded-full px-1.5 text-[10px] font-bold md:inline ${
                      pill?.status === 'waiting' ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-amber-400 text-amber-950'
                    }`}
                  >
                    {status}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#e5eeff]">
        <div className="h-full rounded-full bg-[#030213] transition-all" style={{ width: `${(current / 6) * 100}%` }} />
      </div>
    </nav>
  );
}

/** The part card: title, subtitle, status chip, body, and the Back · "Part N of 6" · Next footer. Next is never blocked. */
export function TollV2PartCard({
  desk,
  part,
  onGo,
  children,
}: {
  desk: TollV2Desk;
  part: TollV2PartNo;
  onGo: (p: TollV2PartNo) => void;
  children: React.ReactNode;
}) {
  const meta = PART_META[part];
  const pill = pillFor(desk, part);
  const status = pillStatusLabel(pill, desk.disputes);
  const hot = pill?.status === 'todo' || pill?.status === 'blocked';
  const next = part < 6 ? ((part + 1) as TollV2PartNo) : null;
  const prev = part > 1 ? ((part - 1) as TollV2PartNo) : null;
  return (
    <section
      className="mt-4 flex flex-col gap-6 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.04)] sm:p-6"
      data-testid={`toll-v2-part-card-${part}`}
      aria-labelledby={`toll-v2-part-title-${part}`}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`toll-v2-part-title-${part}`} className="text-xl font-semibold tracking-tight text-[#0b1c30]">
            {meta.title}
          </h2>
          <p className="mt-1 text-sm text-[#47464c]">{meta.subtitle}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            hot ? 'bg-amber-100 text-amber-900' : pill?.status === 'waiting' ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-[#ecfdf5] text-[#069669]'
          }`}
          data-testid="toll-v2-part-chip"
        >
          {status}
        </span>
      </header>
      {children}
      <footer className="flex items-center justify-between gap-2 rounded-lg bg-[#f8f9ff] px-3 py-3 sm:px-4">
        <TollV2SecondaryButton
          type="button"
          className="w-auto"
          disabled={!prev}
          onClick={() => prev && onGo(prev)}
          data-testid="toll-v2-part-back"
        >
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Back
        </TollV2SecondaryButton>
        <span className="text-xs font-medium text-[#47464c]">Part {part} of 6</span>
        {next ? (
          <TollV2PrimaryButton type="button" className="w-auto" onClick={() => onGo(next)} data-testid="toll-v2-part-next">
            <span className="hidden sm:inline">Next: {PART_META[next].title}</span>
            <span className="sm:hidden">Next</span>
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </TollV2PrimaryButton>
        ) : (
          <span className="w-[72px]" aria-hidden />
        )}
      </footer>
    </section>
  );
}

export type TollV2RiderActions = {
  onRiderDriverPays: (c: TollV2Charge, s: TollV2Suggestion) => void;
  onRiderFleetPays: (c: TollV2Charge, s: TollV2Suggestion) => void;
  onConfirmAllRider: () => void;
};

/** Part 1: Uber paid it back (payback matches) + InDrive rider pays the driver (no payback, no score). */
export function TollV2MatchesPart({
  charges,
  rowActions,
  sureCount,
  onConfirmAllSure,
  rider,
  busy,
}: {
  charges: TollV2Charge[];
  rowActions: TollV2RowActions;
  sureCount: number;
  onConfirmAllSure?: () => void;
  rider: TollV2RiderActions;
  busy: boolean;
}) {
  const { payback, rider: riderRows } = splitMatches(charges);
  const sealed = !!rowActions.readOnly;
  return (
    <div className="flex flex-col gap-6" data-testid="toll-v2-part-matches">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[#0b1c30]">
            Uber paid it back
            <span className="rounded-full bg-[#eff4ff] px-2 py-0.5 text-xs font-medium text-[#47464c]">
              {payback.length} match{payback.length === 1 ? '' : 'es'}
            </span>
          </h3>
          {!sealed && sureCount > 0 && onConfirmAllSure ? (
            <TollV2PrimaryButton type="button" onClick={onConfirmAllSure} data-testid="toll-v2-confirm-all-open">
              <Check className="mr-1 h-4 w-4" aria-hidden /> Confirm all sure matches ({sureCount})
            </TollV2PrimaryButton>
          ) : null}
        </div>
        {payback.length === 0 ? (
          <EmptyRow text="Nothing to confirm" testId="toll-v2-empty-matches" />
        ) : (
          <ul className="overflow-hidden rounded-xl border border-[#eff4ff] bg-white">
            {payback.map((c) => (
              <TollV2ChargeRow key={c.id} charge={c} actions={rowActions} />
            ))}
          </ul>
        )}
      </section>

      {riderRows.length > 0 ? (
        <section className="flex flex-col gap-3" data-testid="toll-v2-rider-matches">
          <div className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-base font-semibold text-[#0b1c30]">
              InDrive: rider pays the driver
              <span className="rounded-full bg-[#eff4ff] px-2 py-0.5 text-xs font-medium text-[#47464c]">
                {riderRows.length} match{riderRows.length === 1 ? '' : 'es'}
              </span>
            </h3>
            <p className="text-sm text-[#47464c]">
              On an InDrive cash trip, the rider owes the toll and the driver collects it in cash.
            </p>
          </div>
          {!sealed ? (
            <TollV2PrimaryButton
              type="button"
              className="w-fit self-start"
              disabled={busy}
              onClick={rider.onConfirmAllRider}
              data-testid="toll-v2-rider-confirm-all"
            >
              <Check className="mr-1 h-4 w-4" aria-hidden /> Confirm all Driver pays ({riderRows.length})
            </TollV2PrimaryButton>
          ) : null}
          <ul className="overflow-hidden rounded-xl border border-[#eff4ff] bg-white">
            {riderRows.map((c) => (
              <RiderRow key={c.id} charge={c} sealed={sealed} busy={busy} rider={rider} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function RiderRow({
  charge,
  sealed,
  busy,
  rider,
}: {
  charge: TollV2Charge;
  sealed: boolean;
  busy: boolean;
  rider: TollV2RiderActions;
}) {
  const s = topSuggestion(charge)!;
  return (
    <li
      className="flex flex-col gap-3 border-t border-[#eff4ff] px-4 py-3 first:border-t-0 xl:flex-row xl:items-center xl:justify-between"
      data-testid={`toll-v2-rider-row-${charge.id}`}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e5eeff]">
          <Banknote className="h-[18px] w-[18px] text-[#47464c]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="whitespace-nowrap text-sm font-medium tabular-nums text-[#0b1c30]">{chargeWhen(charge.occurredAt)}</span>
            <span className="text-[#cbd5e1]">·</span>
            <span className="truncate text-sm font-medium text-[#0b1c30]">{charge.plazaName || 'Toll'}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {charge.plate ? (
              <span className="rounded bg-[#dce9ff] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#0b1c30]">{charge.plate}</span>
            ) : null}
            {charge.driverName ? <span className="truncate text-sm text-[#47464c]">{charge.driverName}</span> : null}
            <span className="text-base font-bold tabular-nums text-[#0b1c30]">{fmtTollMinor(charge.amountMinor)}</span>
          </div>
          <div className="flex max-w-lg items-start gap-2 rounded-lg border border-[#cbd5e1] bg-[#f8f9ff] px-2.5 py-2 text-xs text-[#0b1c30]">
            <Car className="mt-0.5 h-4 w-4 shrink-0 text-[#47464c]" aria-hidden />
            <span>InDrive trip {formatTripWindow(s.trip)}</span>
          </div>
          <p className="text-xs italic text-[#47464c]" data-testid="toll-v2-rider-reason">
            Rider owed it, driver collects in cash
          </p>
        </div>
      </div>
      {!sealed ? (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <TollV2PrimaryButton type="button" disabled={busy} onClick={() => rider.onRiderDriverPays(charge, s)} data-testid="toll-v2-rider-driver-pays">
            Confirm Driver pays
          </TollV2PrimaryButton>
          <TollV2SecondaryButton type="button" disabled={busy} onClick={() => rider.onRiderFleetPays(charge, s)} data-testid="toll-v2-rider-fleet-pays">
            Fleet pays
          </TollV2SecondaryButton>
        </div>
      ) : null}
    </li>
  );
}

function EmptyRow({ text, testId }: { text: string; testId: string }) {
  return (
    <p className="flex items-center gap-2 rounded-xl bg-[#f8f9ff] px-4 py-4 text-sm text-[#47464c]" data-testid={testId}>
      <Check className="h-4 w-4 shrink-0 text-[#069669]" aria-hidden />
      {text}
    </p>
  );
}

/** Parts 2, 4 and 5 reuse today's groups and rows unchanged (AD1), each with only the charges of its part. */
export function TollV2SectionsPart({
  part,
  desk,
  rowActions,
}: {
  part: 2 | 4 | 5;
  desk: TollV2Desk;
  rowActions: TollV2RowActions & {
    onLinkPayback?: (p: TollV2Payback) => void;
    onLeaveUnlinked?: (p: TollV2Payback) => void;
    onUndoKept?: (k: TollV2KeptPayback) => void;
  };
}) {
  const charges = chargesInPart(desk.charges, part);
  const only =
    part === 2 ? ['pick'] : part === 4 ? ['no_trip'] : ['receipts', 'awaiting_cash', 'part_paid', 'duplicates', 'paybacks'];
  return (
    <div data-testid={`toll-v2-part-sections-${part}`}>
      <TollV2Sections
        charges={charges}
        paybacks={part === 5 ? part5Paybacks(desk.paybacks ?? [], desk.blockers) : []}
        kept={part === 5 ? desk.kept ?? [] : []}
        rowActions={rowActions}
        sureCount={0}
        sealed={desk.sealed}
        only={only}
        bare={part !== 5}
      />
    </div>
  );
}
