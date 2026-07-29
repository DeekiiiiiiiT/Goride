import React from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ReceiptUploader } from './ReceiptUploader';
import { PumpNumbersConfirm } from './PumpNumbersConfirm';

export type FuelPumpStep = 'photo' | 'confirm' | 'submit';

interface GasCardSummaryProps {
  odometer: number;
  date: Date;
  time: string;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  totalSpent: string;
  onTotalSpentChange: (value: string) => void;
  liters: string;
  onLitersChange: (value: string) => void;
  pumpPreviewUrl: string | null;
  isScanningPump: boolean;
  onPumpFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPumpClear: () => void;
  pumpFileName?: string;
  pumpStep: FuelPumpStep;
  pumpFromOcr: boolean;
  onConfirmPumpNumbers: () => void;
  onRetakePumpPhoto: () => void;
}

export function GasCardSummary({
  odometer,
  date,
  time,
  isSubmitting,
  onSubmit,
  totalSpent,
  onTotalSpentChange,
  liters,
  onLitersChange,
  pumpPreviewUrl,
  isScanningPump,
  onPumpFileSelect,
  onPumpClear,
  pumpFileName,
  pumpStep,
  pumpFromOcr,
  onConfirmPumpNumbers,
  onRetakePumpPhoto,
}: GasCardSummaryProps) {
  return (
    <form onSubmit={onSubmit} className="p-6 space-y-6" noValidate>
      <div className="flex flex-col items-center justify-center space-y-2 text-center">
        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-2">
           <CheckCircle2 className="h-6 w-6 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Gas Card Fill</h3>
        <p className="text-sm text-slate-500 max-w-xs">
           {pumpStep === 'photo' && 'Photo the pump display (required).'}
           {pumpStep === 'confirm' && 'Confirm the numbers from the pump.'}
           {pumpStep === 'submit' && 'Numbers confirmed — finish and submit.'}
        </p>
      </div>

      <Card className="bg-slate-50 border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
           <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 flex items-center gap-2">
                 <Clock className="h-4 w-4" /> Date/Time
              </span>
              <span className="font-medium text-slate-900">
                 {format(date, 'MMM d, yyyy')} • {time}
              </span>
           </div>

           <div className="h-px bg-slate-200" />

           <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 flex items-center gap-2">
                 <CheckCircle2 className="h-4 w-4" /> Verified Odometer
              </span>
              <span className="font-medium text-slate-900">
                 {odometer.toLocaleString()} km
              </span>
           </div>
        </CardContent>
      </Card>

      {pumpStep === 'photo' && (
        <ReceiptUploader
          label="Pump Display Photo (required)"
          hint="This Sale + Liters — photo is mandatory"
          previewUrl={pumpPreviewUrl}
          isScanning={isScanningPump}
          onFileSelect={onPumpFileSelect}
          onClear={onPumpClear}
          fileName={pumpFileName}
        />
      )}

      {pumpStep === 'confirm' && (
        <PumpNumbersConfirm
          totalSpent={totalSpent}
          onTotalSpentChange={onTotalSpentChange}
          liters={liters}
          onLitersChange={onLitersChange}
          fromOcr={pumpFromOcr}
          onConfirm={onConfirmPumpNumbers}
          onRetakePhoto={onRetakePumpPhoto}
        />
      )}

      {pumpStep === 'submit' && (
        <>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
            <p className="text-[10px] font-bold uppercase text-emerald-700 tracking-wider">Confirmed</p>
            <p className="font-semibold text-slate-900">
              ${parseFloat(totalSpent || '0').toFixed(2)} · {parseFloat(liters || '0').toFixed(3)} L
            </p>
          </div>

          <div className="space-y-3">
            <Button className="w-full bg-blue-600 hover:bg-blue-700" size="lg" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit Log
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 text-base font-semibold border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
              disabled={isSubmitting}
              onClick={onRetakePumpPhoto}
            >
              Reject
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
