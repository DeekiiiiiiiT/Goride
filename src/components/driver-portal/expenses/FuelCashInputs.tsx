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
}

export function FuelCashInputs({ 
  pricePerLiter, 
  onPriceChange, 
  isFullTank, 
  onFullTankChange 
}: FuelCashInputsProps) {
  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 mb-2">
        <Fuel className="h-4 w-4 text-orange-500" />
        <h4 className="text-sm font-semibold text-slate-900">Fuel Price</h4>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Input 
            id="fuel-price"
            type="number" 
            inputMode="decimal"
            step="0.001" 
            placeholder="0.000" 
            value={pricePerLiter} 
            onChange={(e) => onPriceChange(e.target.value)} 
            required
          />
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
