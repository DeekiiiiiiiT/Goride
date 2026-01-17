import React from 'react';
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface GasCardSummaryProps {
  odometer: number;
  date: Date;
  time: string;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function GasCardSummary({ odometer, date, time, isSubmitting, onSubmit }: GasCardSummaryProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col items-center justify-center space-y-2 text-center">
        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-2">
           <CheckCircle2 className="h-6 w-6 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Ready to Submit</h3>
        <p className="text-sm text-slate-500 max-w-xs">
           Your odometer reading has been verified. Transaction details will be imported automatically from the fuel card provider.
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

      <Button className="w-full bg-blue-600 hover:bg-blue-700" size="lg" onClick={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Submit Log
      </Button>
    </div>
  );
}
