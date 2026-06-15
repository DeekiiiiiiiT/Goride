import React from 'react';
import { Banknote, CheckCircle2 } from 'lucide-react';
import type { CashSettlementResponse } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { resolveDriverCashSettlementDisplay } from './driverTripCompleteUtils';

type Props = {
  result: CashSettlementResponse;
  onDone: () => void;
};

function DetailRow({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'credit' | 'debt';
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 text-sm ${
        tone === 'credit'
          ? 'text-emerald-700 dark:text-emerald-400'
          : tone === 'debt'
            ? 'text-amber-800 dark:text-amber-300'
            : 'text-slate-700 dark:text-slate-200'
      }`}
    >
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function DriverCashTripCompleteView({ result, onDone }: Props) {
  const display = resolveDriverCashSettlementDisplay(result);
  const {
    currency,
    outcome,
    fareMinor,
    receivedMinor,
    changeMinor,
    arrearsMinor,
    debtOpenedMinor,
    digitalDebitMinor,
  } = display;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Cash trip complete</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{outcome}</p>
          </div>
        </div>

        <section
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          aria-label="Cash settlement outcome"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Banknote className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment outcome</p>
          </div>

          {outcome === 'overpay' && changeMinor > 0 ? (
            <div className="mb-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Change to return
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                {formatMoneyMinor(changeMinor, currency)}
              </p>
              {debtOpenedMinor > 0 ? (
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Could not return change — {formatMoneyMinor(debtOpenedMinor, currency)} added to your
                  Debt wallet. Fund Digital to auto-repay.
                  {digitalDebitMinor > 0 && (
                    <>
                      {' '}
                      {formatMoneyMinor(digitalDebitMinor, currency)} was paid from Digital now.
                    </>
                  )}
                </p>
              ) : digitalDebitMinor > 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Paid from your Digital change fund.
                </p>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Return this amount to the rider from the cash you collected.
                </p>
              )}
            </div>
          ) : outcome === 'exact' ? (
            <div className="mb-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Change to return
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                {formatMoneyMinor(0, currency)}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Exact fare — no change due</p>
            </div>
          ) : outcome === 'underpay' ? (
            <div className="mb-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Rider still owes
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-amber-900 dark:text-amber-200">
                {formatMoneyMinor(arrearsMinor, currency)}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                You received {formatMoneyMinor(receivedMinor, currency)} of{' '}
                {formatMoneyMinor(fareMinor, currency)}. Your trip earnings are unchanged.
              </p>
            </div>
          ) : outcome === 'unpaid' ? (
            <div className="mb-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                No payment received
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Fare recorded as unpaid — {formatMoneyMinor(fareMinor, currency)} trip earnings unchanged.
              </p>
            </div>
          ) : null}

          <div className="space-y-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <DetailRow label="Trip earnings" value={formatMoneyMinor(fareMinor, currency)} />
            <DetailRow label="Cash in hand" value={formatMoneyMinor(receivedMinor, currency)} tone="credit" />
            {outcome === 'overpay' && changeMinor > 0 && (
              <DetailRow label="Change due" value={formatMoneyMinor(changeMinor, currency)} tone="debt" />
            )}
            {(outcome === 'underpay' || outcome === 'unpaid') && arrearsMinor > 0 && (
              <DetailRow label="Rider owes" value={formatMoneyMinor(arrearsMinor, currency)} tone="debt" />
            )}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-800">
        <button
          type="button"
          onClick={onDone}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
