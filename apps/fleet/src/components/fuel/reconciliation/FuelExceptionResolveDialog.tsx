import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Pencil } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import type { FuelExceptionBlocker } from '../../../utils/fuelFinalizeGating';
import { FUEL_FLAG_GLOSSARY } from '../analytics/fuelFlagGlossary';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

function formatFillDate(ymd: string): string {
  try {
    return format(parseISO(ymd), 'MMM d, yyyy');
  } catch {
    return ymd;
  }
}

function plainEnglishForReason(reason: string): string {
  const needle = reason.trim().toLowerCase();
  for (const group of FUEL_FLAG_GLOSSARY) {
    for (const item of group.items) {
      if (item.title.toLowerCase() === needle || needle.includes(item.title.toLowerCase())) {
        return item.meaning;
      }
    }
  }
  return 'The system flagged this fill as a serious tank-cycle / leakage issue. Confirm it is OK to lock the week, or fix the fill numbers.';
}

export type FuelExceptionResolveAction = 'accept' | 'edit';

/**
 * In-recon overlay — resolve exception fills without leaving Consumption Reconciliation.
 */
export function FuelExceptionResolveDialog({
  open,
  blocker,
  plate,
  busy,
  onOpenChange,
  onAccept,
  onEditFill,
}: {
  open: boolean;
  blocker: FuelExceptionBlocker | null;
  plate?: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: (blocker: FuelExceptionBlocker, note: string) => void | Promise<void>;
  onEditFill?: (blocker: FuelExceptionBlocker) => void;
}) {
  const [note, setNote] = useState('');
  const meaning = useMemo(
    () => (blocker ? plainEnglishForReason(blocker.reason) : ''),
    [blocker],
  );

  if (!blocker) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) setNote('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-900">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            Resolve exception fill
          </DialogTitle>
          <DialogDescription className="text-left text-slate-600">
            Stay in this week — pick how to handle the flag so Finalize can continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="text-sm font-semibold text-slate-900">
            {formatFillDate(blocker.dateYmd)} · {formatFuelMoney(blocker.amount)} · {blocker.paymentLabel}
          </div>
          <div className="text-xs text-slate-600">
            {plate || blocker.vehicleId || 'Vehicle'} · {blocker.location}
          </div>
          <div className="text-xs font-medium text-rose-800">{blocker.reason}</div>
          <p className="text-sm text-slate-700">{meaning}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="exception-resolve-note" className="text-xs font-medium text-slate-600">
            Optional note (saved on the fill)
          </label>
          <Textarea
            id="exception-resolve-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Reviewed — short trips that day, numbers look right"
            className="min-h-[72px] resize-y"
            disabled={busy}
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="min-h-11 w-full bg-[#3525cd] text-white hover:bg-[#2a1ea4]"
            disabled={busy}
            onClick={() => void onAccept(blocker, note.trim())}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {busy ? 'Saving…' : 'Looks correct — accept & unlock Finalize'}
          </Button>
          {onEditFill && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              disabled={busy}
              onClick={() => {
                onEditFill(blocker);
                onOpenChange(false);
                setNote('');
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Numbers look wrong — edit this fill
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
