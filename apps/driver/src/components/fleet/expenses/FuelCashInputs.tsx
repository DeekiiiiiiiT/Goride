import React from 'react';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { Fuel } from "lucide-react";

interface FuelCashInputsProps {
  /** Pump "This Sale" total ($) */
  totalSpent: string;
  onTotalSpentChange: (value: string) => void;
  /** Pump liters */
  liters: string;
  onLitersChange: (value: string) => void;
  tankStatus?: {
    currentCumulative: number;
    tankCapacity: number;
    progressPercent: number;
    status: string;
  };
}

/** Derive $/L from pump total ÷ liters (never typed from station board). */
export function derivePricePerLiter(totalSpent: string, liters: string): number | null {
  const total = parseFloat(totalSpent || '0');
  const vol = parseFloat(liters || '0');
  if (!(total > 0) || !(vol > 0)) return null;
  return Number((total / vol).toFixed(2));
}

export function FuelCashInputs({
  totalSpent,
  onTotalSpentChange,
  liters,
  onLitersChange,
  tankStatus
}: FuelCashInputsProps) {
  const currentVolume = parseFloat(liters || '0') || 0;
  const pricePerLiter = derivePricePerLiter(totalSpent, liters);
  const totalLitersAfter = (tankStatus?.currentCumulative || 0) + currentVolume;
  const newProgressPercent = tankStatus?.tankCapacity ? Math.min(100, (totalLitersAfter / tankStatus.tankCapacity) * 100) : 0;
  const isOverflow = tankStatus?.tankCapacity ? totalLitersAfter > (tankStatus.tankCapacity * 1.05) : false;
  const capacity = tankStatus?.tankCapacity || 0;
  const afterFill = Number(totalLitersAfter.toFixed(1));

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
      {tankStatus && tankStatus.tankCapacity > 0 && (
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-end">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cycle progress</Label>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              isOverflow ? 'bg-red-100 text-red-700' :
              newProgressPercent > 85 ? 'bg-orange-100 text-orange-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {isOverflow ? 'OVERFLOW' : tankStatus.status}
            </span>
          </div>
          <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
             <div
                className="h-full bg-slate-400 transition-all duration-500"
                style={{ width: `${Math.min(100, (tankStatus.currentCumulative / tankStatus.tankCapacity) * 100)}%` }}
             />
             <div
                className={`h-full animate-pulse transition-all duration-500 ${isOverflow ? 'bg-red-500' : 'bg-orange-400'}`}
                style={{ width: `${Math.min(100 - (tankStatus.currentCumulative / tankStatus.tankCapacity * 100), (currentVolume / tankStatus.tankCapacity) * 100)}%` }}
             />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-medium">
             <span>{tankStatus.currentCumulative.toFixed(1)} / {capacity} L toward next full cycle</span>
             <span>After this fill: {afterFill} L</span>
          </div>

          {isOverflow && (
             <p className="text-[11px] text-red-600 font-bold bg-red-50 p-2 rounded border border-red-100 mt-2">
              ERROR: Total volume ({totalLitersAfter.toFixed(1)}L) exceeds tank capacity! Please verify your inputs.
             </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <Fuel className="h-4 w-4 text-orange-500" />
        <h4 className="text-sm font-semibold text-slate-900">Pump Display</h4>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="pump-total" className="text-xs text-slate-500">This Sale — Total ($)</Label>
          <Input
            id="pump-total"
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="0.00"
            value={totalSpent}
            onChange={(e) => onTotalSpentChange(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pump-liters" className="text-xs text-slate-500">Liters</Label>
          <Input
            id="pump-liters"
            type="number"
            inputMode="decimal"
            step="0.001"
            placeholder="0.000"
            value={liters}
            onChange={(e) => onLitersChange(e.target.value)}
            required
          />
        </div>

        <div className="rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 flex justify-between items-center">
          <span className="text-xs font-medium text-indigo-700">Price per Liter (calculated)</span>
          <span className="text-sm font-bold text-indigo-900">
            {pricePerLiter != null ? `$${pricePerLiter.toFixed(2)}` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
