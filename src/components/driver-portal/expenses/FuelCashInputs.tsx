import React from 'react';
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Checkbox } from "../../ui/checkbox";
import { Fuel } from "lucide-react";

interface FuelCashInputsProps {
  volume: string;
  onVolumeChange: (value: string) => void;
  isFullTank: boolean;
  onFullTankChange: (checked: boolean) => void;
}

export function FuelCashInputs({ 
  volume, 
  onVolumeChange, 
  isFullTank, 
  onFullTankChange 
}: FuelCashInputsProps) {
  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 mb-2">
        <Fuel className="h-4 w-4 text-orange-500" />
        <h4 className="text-sm font-semibold text-slate-900">Fuel Specifics</h4>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fuel-volume">Volume (Liters)</Label>
          <Input 
            id="fuel-volume"
            type="number" 
            step="0.01" 
            placeholder="0.00" 
            value={volume} 
            onChange={(e) => onVolumeChange(e.target.value)} 
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
