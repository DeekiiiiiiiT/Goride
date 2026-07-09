import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { FinancialTransaction, Trip } from '../../../types/data';
import { MatchResult } from '../../../utils/tollReconciliation';
import { MatchAlternatesPanel } from './MatchAlternatesPanel';
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';

interface CompetingTripsPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: FinancialTransaction | null;
  matches: MatchResult[];
  onSelectTrip: (trip: Trip) => void;
}

/** Overlay for ambiguous tolls — lists all competing trip matches for manual pick. */
export function CompetingTripsPickerDialog({
  isOpen,
  onClose,
  transaction,
  matches,
  onSelectTrip,
}: CompetingTripsPickerDialogProps) {
  const fleetTz = useFleetTimezone();

  if (!transaction) return null;

  const tollWhen = (() => {
    try {
      const timeStr = transaction.time || '12:00:00';
      const cleanTime = timeStr.length >= 5 ? timeStr : '12:00:00';
      const localDate = new Date(`${transaction.date}T${cleanTime}`);
      const d = !isNaN(localDate.getTime()) ? localDate : new Date(transaction.date);
      return formatInFleetTz(d, fleetTz, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return transaction.date;
    }
  })();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b bg-white shrink-0">
          <DialogTitle className="text-lg">Pick the correct trip</DialogTitle>
          <DialogDescription className="text-sm text-slate-600 mt-1">
            Toll <strong className="text-slate-900">${Math.abs(transaction.amount).toFixed(2)}</strong>
            {' '}on {tollWhen} — multiple trips compete. Select the trip that explains this charge.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">
          <MatchAlternatesPanel
            matches={matches}
            showAll
            inDialog
            onSelectTrip={(trip) => {
              onSelectTrip(trip);
              onClose();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
