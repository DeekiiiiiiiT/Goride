import React from 'react';
import { Button } from '@roam/ui';
import { Card, CardContent } from '@roam/ui';
import { CheckCircle2, Clock, CreditCard, Loader2 } from "lucide-react";
import { format } from "date-fns";

/** Cash fuel flows use this step type elsewhere; Gas Card never uses pump steps. */
export type FuelPumpStep = 'photo' | 'confirm' | 'submit';

interface GasCardSummaryProps {
  odometer: number;
  date: Date;
  time: string;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  /** Display label for assigned Roam inventory card (CARD_CODE) */
  cardLabel?: string;
  cardMissing?: boolean;
}

/**
 * Gas Card = odometer proof only.
 * Amount / liters come from the Roam Fuels CSV match in Roam Dominion later.
 */
export function GasCardSummary({
  odometer,
  date,
  time,
  isSubmitting,
  onSubmit,
  cardLabel,
  cardMissing,
}: GasCardSummaryProps) {
  return (
    <form onSubmit={onSubmit} className="p-6 space-y-6" noValidate>
      <div className="flex flex-col items-center justify-center space-y-2 text-center">
        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-2">
           <CheckCircle2 className="h-6 w-6 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Gas Card Fill</h3>
        <p className="text-sm text-slate-500 max-w-xs">
           Odometer confirmed. No pump photo — sale amount and liters come from the Roam Fuels statement.
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

           <div className="h-px bg-slate-200" />

           <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 flex items-center gap-2">
                 <CreditCard className="h-4 w-4" /> Gas Card
              </span>
              <span className={`font-mono text-xs font-medium ${cardMissing ? 'text-rose-600' : 'text-slate-900'}`}>
                 {cardMissing ? 'No active card on vehicle' : (cardLabel || '—')}
              </span>
           </div>
        </CardContent>
      </Card>

      {cardMissing ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Ask your fleet manager to assign an Active Roam Fuels card to this vehicle in Card Inventory before logging a Gas Card fill.
        </div>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Use your card PIN at the station. Submit this log — admin will match the statement CSV later.
        </div>
      )}

      <Button
        className="w-full bg-blue-600 hover:bg-blue-700"
        size="lg"
        type="submit"
        disabled={isSubmitting || cardMissing}
      >
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Submit Odometer Log
      </Button>
    </form>
  );
}
