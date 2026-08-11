// cache-bust: force recompile — 2026-02-10
import React from 'react';
import { Button } from "../../ui/button";
import { CreditCard, Wallet } from "lucide-react";
import { Label } from "../../ui/label";

interface PaymentMethodSelectorProps {
  /** personal_cash kept in type for older callers; UI no longer offers it. */
  onSelect: (method: 'gas_card' | 'personal_cash' | 'rideshare_cash') => void;
  onCancel: () => void;
}

export function PaymentMethodSelector({ onSelect, onCancel }: PaymentMethodSelectorProps) {
  return (
    <div className="flex flex-col p-6 pb-8">
      <Label className="text-base font-semibold text-center block mb-4">How did you pay for fuel?</Label>
      <div className="grid grid-cols-1 gap-4">
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
