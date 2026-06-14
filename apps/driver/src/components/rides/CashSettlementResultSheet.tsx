import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { CashSettlementResponse } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

type Props = {
  result: CashSettlementResponse;
  onDone: () => void;
};

export function CashSettlementResultSheet({ result, onDone }: Props) {
  const currency = result.ride.currency ?? 'JMD';
  const deltas = result.wallet_deltas;
  const debtOpened = deltas?.driver_debt_opened_minor ?? 0;
  const digitalDebit = deltas?.driver_digital_debit_minor ?? 0;
  const cashCredit = deltas?.driver_cash_credit_minor ?? 0;
  const changeMinor = result.change_credit_minor ?? 0;

  if (result.settlement_version !== 2 || !deltas) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-600" aria-hidden />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Payment recorded</h2>
        <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
          {result.outcome === 'exact'
            ? 'Fare confirmed — you can accept new trips.'
            : `Outcome: ${result.outcome}`}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-8 w-full max-w-sm rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Settlement complete</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{result.outcome}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900">
          {cashCredit > 0 && (
            <p className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {formatMoneyMinor(cashCredit, currency)}
              </span>{' '}
              added to your Cash wallet
            </p>
          )}
          {changeMinor > 0 && digitalDebit > 0 && debtOpened === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {formatMoneyMinor(changeMinor, currency)} change owed to rider — deducted from Digital wallet
            </p>
          )}
          {changeMinor > 0 && debtOpened > 0 && (
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {formatMoneyMinor(debtOpened, currency)} change owed to rider — added to Debt (auto-repay when
              Digital is funded)
              {digitalDebit > 0 && (
                <>
                  {' '}
                  · {formatMoneyMinor(digitalDebit, currency)} paid from Digital now
                </>
              )}
            </p>
          )}
          {result.outcome === 'underpay' || result.outcome === 'unpaid' ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Rider balance updated — fare earnings unchanged
            </p>
          ) : null}
        </div>
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

export function CashSettlementResultSheetLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden />
    </div>
  );
}
