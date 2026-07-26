import React from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Card, CardContent } from '../../ui/card';
import { CheckCircle2, Pencil } from 'lucide-react';
import { derivePricePerLiter } from './FuelCashInputs';

interface PumpNumbersConfirmProps {
  totalSpent: string;
  onTotalSpentChange: (value: string) => void;
  liters: string;
  onLitersChange: (value: string) => void;
  /** OCR succeeded and prefilled values */
  fromOcr: boolean;
  onConfirm: () => void;
  onRetakePhoto: () => void;
}

/** Clear confirm step: review This Sale + Liters before continuing to submit. */
export function PumpNumbersConfirm({
  totalSpent,
  onTotalSpentChange,
  liters,
  onLitersChange,
  fromOcr,
  onConfirm,
  onRetakePhoto,
}: PumpNumbersConfirmProps) {
  const price = derivePricePerLiter(totalSpent, liters);
  const totalOk = parseFloat(totalSpent || '0') > 0;
  const litersOk = parseFloat(liters || '0') > 0;
  const canConfirm = totalOk && litersOk && price != null && price >= 0.5;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Confirm pump numbers</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          {fromOcr
            ? 'We read these from your photo. Check they match the pump before continuing.'
            : 'Enter the exact numbers from the pump display, then confirm.'}
        </p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="confirm-sale" className="text-xs font-bold uppercase tracking-wider text-slate-500">
              This Sale ($)
            </Label>
            <Input
              id="confirm-sale"
              type="number"
              inputMode="decimal"
              step="0.01"
              className="h-14 text-2xl font-bold text-slate-900"
              value={totalSpent}
              onChange={(e) => onTotalSpentChange(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-liters" className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Liters
            </Label>
            <Input
              id="confirm-liters"
              type="number"
              inputMode="decimal"
              step="0.001"
              className="h-14 text-2xl font-bold text-slate-900"
              value={liters}
              onChange={(e) => onLitersChange(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-white border border-emerald-100 px-4 py-3 flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Price / Liter</span>
            <span className="text-xl font-bold text-indigo-900">
              {price != null ? `$${price.toFixed(2)}` : '—'}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Button
          type="button"
          className="w-full h-14 text-base font-bold bg-emerald-600 hover:bg-emerald-700"
          disabled={!canConfirm}
          onClick={onConfirm}
        >
          Numbers look correct — Continue
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 gap-2"
          onClick={onRetakePhoto}
        >
          <Pencil className="h-4 w-4" />
          Retake pump photo
        </Button>
      </div>
    </div>
  );
}
