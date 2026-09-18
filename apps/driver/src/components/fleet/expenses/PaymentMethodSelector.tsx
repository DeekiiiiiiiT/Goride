// cache-bust: force recompile — 2026-02-10
import React from 'react';
import { Button } from '@roam/ui';
import { CreditCard, Wallet, Combine } from 'lucide-react';
import { Label } from '@roam/ui';

export type FuelPaymentMethodSelect =
  | 'gas_card'
  | 'personal_cash'
  | 'rideshare_cash'
  | 'gas_card_and_cash';

interface PaymentMethodSelectorProps {
  /** personal_cash kept in type for older callers; UI no longer offers it. */
  onSelect: (method: FuelPaymentMethodSelect) => void;
  onCancel: () => void;
  /** Fleet drivers can log company gas card; independents cannot. */
  showGasCard?: boolean;
  /** Opt-in: Gas Card + Cash split fill. */
  showSplitPayment?: boolean;
}

export function PaymentMethodSelector({
  onSelect,
  onCancel,
  showGasCard = true,
  showSplitPayment = false,
}: PaymentMethodSelectorProps) {
  return (
    <div className="flex flex-col p-6 pb-8">
      <Label className="text-base font-semibold text-center block mb-4">How did you pay for fuel?</Label>
      <div className="grid grid-cols-1 gap-4">
        {showGasCard && (
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 border-2 hover:border-blue-500 hover:bg-blue-50 group transition-all"
            onClick={() => onSelect('gas_card')}
          >
            <CreditCard className="h-6 w-6 text-blue-500 group-hover:scale-110 transition-transform" />
            <div className="text-center">
              <p className="font-bold">Gas Card</p>
              <p className="text-[10px] text-slate-500">Company fuel card — odometer only (no pump photo)</p>
            </div>
          </Button>
        )}

        {/* Driver label "Cash"; still selects rideshare_cash for fleet books */}
        <Button
          variant="outline"
          className="h-24 flex flex-col items-center justify-center gap-2 border-2 hover:border-amber-500 hover:bg-amber-50 group transition-all"
          onClick={() => onSelect('rideshare_cash')}
        >
          <Wallet className="h-6 w-6 text-amber-500 group-hover:scale-110 transition-transform" />
          <div className="text-center">
            <p className="font-bold">Cash</p>
            <p className="text-[10px] text-slate-500">I paid with cash from fares</p>
          </div>
        </Button>

        {showGasCard && showSplitPayment && (
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center justify-center gap-2 border-2 hover:border-emerald-500 hover:bg-emerald-50 group transition-all"
            onClick={() => onSelect('gas_card_and_cash')}
          >
            <Combine className="h-6 w-6 text-emerald-600 group-hover:scale-110 transition-transform" />
            <div className="text-center">
              <p className="font-bold">Gas Card + Cash</p>
              <p className="text-[10px] text-slate-500">
                Card ran short or cash topped up — one pump stop
              </p>
            </div>
          </Button>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        className="mt-8 w-full text-slate-500 hover:text-slate-900"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}
