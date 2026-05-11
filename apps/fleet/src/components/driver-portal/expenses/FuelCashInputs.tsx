import React from 'react';
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Checkbox } from "../../ui/checkbox";
import { Fuel } from "lucide-react";

interface FuelCashInputsProps {
  pricePerLiter: string;
  onPriceChange: (value: string) => void;
  isFullTank: boolean;
  onFullTankChange: (checked: boolean) => void;
  currentVolume?: number;
  tankStatus?: {
    currentCumulative: number;
    tankCapacity: number;
    progressPercent: number;
    status: string;
  };
}

export function FuelCashInputs({ 
  pricePerLiter, 
  onPriceChange, 
  isFullTank, 
  onFullTankChange,
  currentVolume = 0,
  tankStatus
}: FuelCashInputsProps) {
  const totalLitersAfter = (tankStatus?.currentCumulative || 0) + currentVolume;
  const newProgressPercent = tankStatus?.tankCapacity ? Math.min(100, (totalLitersAfter / tankStatus.tankCapacity) * 100) : 0;
  const isOverflow = tankStatus?.tankCapacity ? totalLitersAfter > (tankStatus.tankCapacity * 1.05) : false;

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
      {/* Tank Progress Bar (Step 4.1) */}
      {tankStatus && tankStatus.tankCapacity > 0 && (
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-end">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tank Progress</Label>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              isOverflow ? 'bg-red-100 text-red-700' : 
              newProgressPercent > 85 ? 'bg-orange-100 text-orange-700' : 
              'bg-blue-100 text-blue-700'
            }`}>
              {isOverflow ? 'OVERFLOW' : tankStatus.status}
            </span>
          </div>
          <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
             {/* Existing Cumulative */}
             <div 
                className="h-full bg-slate-400 transition-all duration-500" 
                style={{ width: `${Math.min(100, (tankStatus.currentCumulative / tankStatus.tankCapacity) * 100)}%` }}
             />
             {/* Potential New Volume */}
             <div 
                className={`h-full animate-pulse transition-all duration-500 ${isOverflow ? 'bg-red-500' : 'bg-orange-400'}`}
                style={{ width: `${Math.min(100 - (tankStatus.currentCumulative / tankStatus.tankCapacity * 100), (currentVolume / tankStatus.tankCapacity) * 100)}%` }}
             />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-medium">
             <span>{tankStatus.currentCumulative.toFixed(1)}L used</span>
             <span>Capacity: {tankStatus.tankCapacity}L</span>
          </div>
          
          {newProgressPercent > 80 && !isFullTank && !isOverflow && (
            <p className="text-[11px] text-orange-600 font-medium bg-orange-50 p-2 rounded border border-orange-100 mt-2">
              ⚠️ Your tank is nearly full. Please check "Full Tank" for accurate reconciliation.
            </p>
          )}

          {isOverflow && (
             <p className="text-[11px] text-red-600 font-bold bg-red-50 p-2 rounded border border-red-100 mt-2">
              🚨 ERROR: Total volume ({totalLitersAfter.toFixed(1)}L) exceeds tank capacity! Please verify your inputs.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <Fuel className="h-4 w-4 text-orange-500" />
        <h4 className="text-sm font-semibold text-slate-900">Fuel Price</h4>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fuel-price" className="text-xs text-slate-500">Price per Liter ($)</Label>
          <div className="relative">
            <Input 
              id="fuel-price"
              type="number" 
              inputMode="decimal"
              step="0.001" 
              placeholder="0.000" 
              value={pricePerLiter} 
              onChange={(e) => onPriceChange(e.target.value)} 
              required
              className="pr-20"
            />
            {currentVolume > 0 && (
               <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                  {currentVolume} Liters
               </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="full-tank" 
            checked={isFullTank}
            onCheckedChange={(checked) => onFullTankChange(checked as boolean)}
          />
          <Label 
            htmlFor="full-tank" 
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Did you fill the tank completely?
          </Label>
        </div>
      </div>
    </div>
  );
}
