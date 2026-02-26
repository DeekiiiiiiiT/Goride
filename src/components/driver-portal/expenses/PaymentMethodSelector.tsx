// cache-bust: force recompile — 2026-02-10
import React from 'react';
import { Button } from "../../ui/button";
import { CreditCard, Banknote, Car } from "lucide-react";
import { Label } from "../../ui/label";

interface PaymentMethodSelectorProps {
  onSelect: (method: 'gas_card' | 'personal_cash' | 'rideshare_cash') => void;
}

export function PaymentMethodSelector({ onSelect }: PaymentMethodSelectorProps) {
  return (
    <div className="p-6 space-y-4">
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
            <p className="text-[10px] text-slate-500">I used the GoRide company fuel card</p>
          </div>
        </Button>

        <Button 
          variant="outline" 
          className="h-24 flex flex-col items-center justify-center gap-2 border-2 hover:border-amber-500 hover:bg-amber-50 group transition-all"
          onClick={() => onSelect('rideshare_cash')}
        >
          <Car className="h-6 w-6 text-amber-500 group-hover:scale-110 transition-transform" />
          <div className="text-center">
            <p className="font-bold">RideShare Cash</p>
            <p className="text-[10px] text-slate-500">I used cash collected from customers / fares</p>
          </div>
        </Button>
      </div>

      <p className="text-[11px] text-slate-400 text-center italic mt-2">
        If you paid with personal cash, select RideShare Cash above. Fleet admin will review and reclassify if needed.
      </p>
    </div>
  );
}