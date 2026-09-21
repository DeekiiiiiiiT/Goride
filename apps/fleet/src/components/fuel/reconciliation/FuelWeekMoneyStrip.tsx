/**
 * Stitch B collapsed Weekly Fuel Cost + Stitch C Money Check rail.
 * Same strip.* fields only — no invented money actions.
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, HelpCircle, Wallet } from 'lucide-react';
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import {
  UNATTRIBUTED_FILL_LABEL,
  WINDOW_TIMING_LABEL,
  unexplainedLabel,
} from '../../../utils/fuelReconGlossary';
import {
  buildFuelPartyAllocation,
  type FuelPartyAllocationParty,
} from '../../../utils/buildFuelPartyAllocation';
import type { FuelScenario, WeeklyFuelReport } from '../../../types/fuel';
import { Button } from '../../ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';

export function FuelWeekMoneyStrip({
  gasCard,
  cashFromEarnings,
  totalSpend,
  company,
  driver,
  leakage,
  windowTiming = 0,
  unattributedFill = 0,
  driverFromUnexplained = 0,
  priorMedian,
  variant = 'collapsed',
  liveReports = [],
  scenarios = [],
}: {
  gasCard: number;
  cashFromEarnings: number;
  totalSpend: number;
  company: number;
  driver: number;
  leakage: number;
  windowTiming?: number;
  unattributedFill?: number;
  driverFromUnexplained?: number;
  priorMedian?: { totalSpend: number; unexplained: number };
  variant?: 'collapsed' | 'rail';
  /** Enables Driver charge / Company keeps category overlay. */
  liveReports?: WeeklyFuelReport[];
  scenarios?: FuelScenario[];
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [allocParty, setAllocParty] = useState<FuelPartyAllocationParty | null>(null);
  const sourcesTie = Math.abs(gasCard + cashFromEarnings - totalSpend) <= FUEL_SPEND_EPS;
  const overExplainedResidual = leakage < -FUEL_SPEND_EPS;
  const splitTie = overExplainedResidual
    ? Math.abs(company + driver + leakage - totalSpend) <= FUEL_SPEND_EPS
    : Math.abs(company + driver - totalSpend) <= FUEL_SPEND_EPS;
  const balanced = sourcesTie && splitTie;
  const showLeakage = Math.abs(leakage) > FUEL_SPEND_EPS;

  const alloc = useMemo(() => {
    if (!allocParty) return null;
    return buildFuelPartyAllocation(liveReports, scenarios, allocParty);
  }, [allocParty, liveReports, scenarios]);

  const frozenShare = allocParty === 'driver' ? driver : company;
  const allocMismatch =
    alloc != null && Math.abs(alloc.total - frozenShare) > FUEL_SPEND_EPS;

  useEffect(() => {
    if (!import.meta.env.DEV || !allocMismatch || !allocParty || !alloc) return;
    console.assert(
      false,
      `[FuelWeekMoneyStrip] ${allocParty} breakdown ${alloc.total} ≠ frozen share ${frozenShare}`,
    );
  }, [alloc, allocMismatch, allocParty, frozenShare]);

  const paAbsorb = useMemo(() => {
    let earnedCost = 0;
    let earnedKm = 0;
    for (const r of liveReports) {
      const pa = r.metadata?.personalAllowance;
      if (!pa) continue;
      earnedCost += Number(pa.earnedCost) || 0;
      earnedKm += Number(pa.earnedKm) || 0;
    }
    return { earnedCost, earnedKm };
  }, [liveReports]);

  const detailBody = (
    <div className="space-y-4 text-sm text-slate-700">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Where the money came from
        </p>
        <p>Gas card (company paid): {formatFuelMoney(gasCard)}</p>
        <p>Cash from earnings: {formatFuelMoney(cashFromEarnings)}</p>
        <p className="font-semibold">Total fuel bought: {formatFuelMoney(totalSpend)}</p>
        <p className={sourcesTie ? 'text-emerald-700' : 'text-rose-700'}>
          Gas card + Cash {sourcesTie ? '=' : '≠'} Total {sourcesTie ? '✓' : '— check attribution'}
        </p>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Who ends up paying
        </p>
        <p>Company keeps: {formatFuelMoney(company)}</p>
        <p>Driver’s fuel share: {formatFuelMoney(driver)}</p>
        {Math.abs(windowTiming) > FUEL_SPEND_EPS && (
          <p>
            {WINDOW_TIMING_LABEL}: {formatFuelMoney(windowTiming)}
          </p>
        )}
        {Math.abs(unattributedFill) > FUEL_SPEND_EPS && (
          <p>
            {UNATTRIBUTED_FILL_LABEL}: {formatFuelMoney(unattributedFill)}
          </p>
        )}
        {showLeakage && (
          <p>
            {unexplainedLabel(leakage)}: {formatFuelMoney(leakage)}
          </p>
        )}
        {Math.abs(driverFromUnexplained) > FUEL_SPEND_EPS ? (
          <p>Charged to driver from unexplained: {formatFuelMoney(driverFromUnexplained)}</p>
        ) : (
          <p>Unexplained fuel is company-held (never billed to driver)</p>
        )}
        {paAbsorb.earnedCost > FUEL_SPEND_EPS && (
          <p>
            Personal allowance absorbed by company: {formatFuelMoney(paAbsorb.earnedCost)}
            {paAbsorb.earnedKm > 0
              ? ` (${paAbsorb.earnedKm % 1 === 0 ? paAbsorb.earnedKm : paAbsorb.earnedKm.toFixed(1)} earned km)`
              : ''}
          </p>
        )}
        <p className={splitTie ? 'text-emerald-700' : 'text-rose-700'}>
          Company + Driver {splitTie ? '=' : '≠'} Total {splitTie ? '✓' : '— check split'}
        </p>
      </div>
      {priorMedian != null && (
        <p className="text-xs text-slate-500">
          vs 4-week median spend:{' '}
          {totalSpend - priorMedian.totalSpend >= 0 ? '+' : ''}
          {formatFuelMoney(totalSpend - priorMedian.totalSpend)}
        </p>
      )}
      <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
        Gas card is company-paid fuel. Cash from earnings is what drivers already paid from their
        pocket. Company keeps vs driver charge is who pays after policy rules. Timing and
        unexplained leftovers are carved out before settle-up — they are not a third payer.
      </p>
    </div>
  );

  const whySheet = (side: 'bottom' | 'right') => (
    <Sheet open={whyOpen} onOpenChange={setWhyOpen}>
      <SheetContent
        side={side}
        className={
          side === 'right'
            ? 'w-full overflow-y-auto sm:max-w-md'
            : 'max-h-[80vh] overflow-y-auto sm:max-w-lg'
        }
      >
        <SheetHeader>
          <SheetTitle>Why these numbers?</SheetTitle>
          <SheetDescription>Plain-English money check for this week.</SheetDescription>
        </SheetHeader>
        <div className="mt-4">{detailBody}</div>
      </SheetContent>
    </Sheet>
  );

  const allocSheet = (
    <Sheet
      open={allocParty != null}
      onOpenChange={(open) => {
        if (!open) setAllocParty(null);
      }}
    >
      <SheetContent side="right" className="z-[80] w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {allocParty === 'driver' ? 'Driver charge breakdown' : 'Company keeps breakdown'}
          </SheetTitle>
          <SheetDescription>
            {allocParty === 'driver'
              ? 'How this week’s driver deduction splits across fuel categories.'
              : 'How this week’s company fuel expense splits across categories.'}
          </SheetDescription>
        </SheetHeader>
        {alloc ? (
          <div className="mt-4 space-y-3">
            {allocMismatch ? (
              <p
                className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
                role="alert"
              >
                Breakdown disagrees with settlement by{' '}
                {formatFuelMoney(Math.abs(alloc.total - frozenShare))} — do not lock
              </p>
            ) : null}
            <ul className="space-y-2 rounded-md border border-slate-200 bg-white p-3 text-sm">
              {alloc.lines.map((line) => (
                <li
                  key={line.key}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex max-w-[70%] items-center gap-1 text-left text-slate-700 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-slate-900"
                      >
                        <span>{line.label}</span>
                        <HelpCircle className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[260px] text-xs leading-relaxed">
                      {line.tooltip}
                    </TooltipContent>
                  </Tooltip>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatFuelMoney(line.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatFuelMoney(alloc.total)}</span>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );

  if (variant === 'rail') {
    return (
      <aside className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[#3525cd]" aria-hidden />
            <h2 className="text-base font-bold text-slate-900">Money Check</h2>
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-[#3525cd] hover:underline"
            onClick={() => setWhyOpen(true)}
          >
            What does this mean?
            <HelpCircle className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div className="rounded border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total fuel bought
            </p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
              {formatFuelMoney(totalSpend)}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Settlement Allocation Split
            </p>
            <button
              type="button"
              onClick={() => setAllocParty('driver')}
              className="flex w-full min-h-11 cursor-pointer items-start justify-between gap-3 rounded border border-slate-200 bg-white p-3 text-left transition hover:border-[#3525cd]/50 hover:bg-slate-50"
              aria-label="Open driver charge category breakdown"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">Driver charge</p>
                <p className="text-xs text-slate-500">Tap for category breakdown</p>
              </div>
              <p className="text-lg font-bold tabular-nums text-slate-900">
                {formatFuelMoney(driver)}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setAllocParty('company')}
              className="flex w-full min-h-11 cursor-pointer items-start justify-between gap-3 rounded border border-slate-200 bg-white p-3 text-left transition hover:border-[#3525cd]/50 hover:bg-slate-50"
              aria-label="Open company keeps category breakdown"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">Company keeps</p>
                <p className="text-xs text-slate-500">Tap for category breakdown</p>
              </div>
              <p className="text-lg font-bold tabular-nums text-[#3525cd]">
                {formatFuelMoney(company)}
              </p>
            </button>
            {showLeakage && (
              <div className="flex items-start justify-between gap-3 rounded border border-rose-200 bg-rose-50/60 p-3">
                <div>
                  <p className="text-sm font-bold text-rose-700">{unexplainedLabel(leakage)}</p>
                  <p className="text-xs text-slate-500">Quarantined until reviewed</p>
                </div>
                <p className="text-lg font-extrabold tabular-nums text-rose-700">
                  {formatFuelMoney(leakage)}
                </p>
              </div>
            )}
          </div>

          <div className="h-px bg-slate-200" />

          <div className="overflow-hidden rounded border border-slate-200">
            <button
              type="button"
              className="flex w-full items-center justify-between bg-slate-50 px-3.5 py-2.5 text-left hover:bg-slate-100"
              onClick={() => setSourcesOpen((v) => !v)}
              aria-expanded={sourcesOpen}
            >
              <span className="text-sm font-bold text-slate-900">Payment Sources Breakdown</span>
              <ChevronDown
                className={`h-4 w-4 text-slate-500 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {sourcesOpen && (
              <div className="space-y-2 border-t border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-[#3525cd]" aria-hidden />
                    Gas card (company paid)
                  </span>
                  <span className="font-semibold tabular-nums">{formatFuelMoney(gasCard)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                    Cash from earnings (driver fronted)
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatFuelMoney(cashFromEarnings)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div
            className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
              balanced
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border border-rose-200 bg-rose-50 text-rose-800'
            }`}
            role="status"
          >
            {balanced
              ? 'Ledger balanced with your fleet cards'
              : 'Numbers don’t balance — check attribution'}
          </div>
        </div>
        {whySheet('right')}
        {allocSheet}
      </aside>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Weekly Fuel Cost
        </span>
        <span className="text-xs text-slate-400">JMD</span>
      </div>
      <div className="grid grid-cols-2 gap-3 pb-3 pt-3.5">
        <div className="border-r border-slate-200/70 pr-2">
          <p className="text-xs text-slate-500">Total fuel bought</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums text-slate-900">
            {formatFuelMoney(totalSpend)}
          </p>
        </div>
        <div className="pl-1">
          <p className="text-xs text-slate-500">Amount drivers will pay</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums text-slate-900">
            {formatFuelMoney(driver)}
          </p>
        </div>
      </div>
      <div
        className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 ${
          balanced
            ? 'border-slate-200 bg-slate-50 text-emerald-800'
            : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}
        role="status"
      >
        <CheckCircle2
          className={`h-[18px] w-[18px] shrink-0 ${balanced ? 'text-emerald-600' : 'text-rose-600'}`}
          aria-hidden
        />
        <span className="text-sm font-medium">
          {balanced
            ? 'Numbers balance with your fleet cards'
            : 'Numbers don’t balance — tap why'}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="link"
          className="h-10 min-h-10 gap-1 px-0 text-sm font-semibold text-[#3525cd]"
          onClick={() => setWhyOpen(true)}
        >
          See how we got this
          <span aria-hidden>→</span>
        </Button>
        <span className="text-xs text-slate-400">Auto-synced</span>
      </div>
      {whySheet('bottom')}
    </section>
  );
}
