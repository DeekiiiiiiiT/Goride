import React from 'react';
import { Loader2 } from 'lucide-react';
import type { CashSettlementResponse } from '@roam/types/rides';
import { DriverCashTripCompleteView } from './DriverCashTripCompleteView';

type Props = {
  result: CashSettlementResponse;
  onDone: () => void;
};

/** Post-settlement screen for cash trips (driver). */
export function CashSettlementResultSheet({ result, onDone }: Props) {
  return <DriverCashTripCompleteView result={result} onDone={onDone} />;
}

export function CashSettlementResultSheetLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden />
    </div>
  );
}
