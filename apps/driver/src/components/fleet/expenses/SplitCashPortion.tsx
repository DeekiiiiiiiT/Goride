import React from 'react';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { deriveSplitCardAmount, validateSplitCashAmounts } from '@roam/fuel-core';

interface SplitCashPortionProps {
  pumpTotal: string;
  cashAmount: string;
  onCashAmountChange: (value: string) => void;
}

/** Typed cash + live derived gas-card coverage for split fills. */
export function SplitCashPortion({
  pumpTotal,
  cashAmount,
  onCashAmountChange,
}: SplitCashPortionProps) {
  const validation = validateSplitCashAmounts(pumpTotal, cashAmount || '0');
  const card =
    validation.ok
      ? validation.card
      : deriveSplitCardAmount(parseFloat(pumpTotal || '0') || 0, parseFloat(cashAmount || '0') || 0);
  const showDerived = parseFloat(pumpTotal || '0') > 0 && parseFloat(cashAmount || '0') > 0;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="split-cash" className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Cash paid ($)
        </Label>
        <Input
          id="split-cash"
          type="number"
          inputMode="decimal"
          step="0.01"
          className="h-14 text-2xl font-bold text-slate-900"
          placeholder="0.00"
          value={cashAmount}
          onChange={(e) => onCashAmountChange(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          Enter only the cash portion. The rest is covered by the gas card.
        </p>
      </div>
      {showDerived && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            validation.ok
              ? 'border-blue-200 bg-blue-50 text-blue-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {validation.ok ? (
            <>
              Gas card covered: <span className="font-bold">${card.toFixed(2)}</span>
            </>
          ) : (
            <span>{validation.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
