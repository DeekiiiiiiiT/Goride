/**
 * Cash Wallet write-off — company forgives driver cash still owed for a Settlement Week.
 * Never writes Payment_Received / Cash Collection (would inflate cash returned / BF money-in).
 */
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { Loader2, Ban } from 'lucide-react';
import { format } from 'date-fns';

export type CashWriteOffSavePayload = {
  amount: number;
  date: string;
  reason: string;
  notes?: string;
  workPeriodStart: string;
  workPeriodEnd: string;
};

interface CashWriteOffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CashWriteOffSavePayload) => Promise<void>;
  driverName: string;
  /** Max writable amount = cash still owed for the locked week. */
  maxAmount: number;
  workPeriodStart: string;
  workPeriodEnd: string;
  weekLabel?: string;
}

export function CashWriteOffModal({
  isOpen,
  onClose,
  onSave,
  driverName,
  maxAmount,
  workPeriodStart,
  workPeriodEnd,
  weekLabel,
}: CashWriteOffModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDate(new Date().toISOString().split('T')[0]);
    setReason('');
    setNotes('');
    const cap = Math.max(0, Number(maxAmount) || 0);
    setAmount(cap > 0.005 ? cap.toFixed(2) : '');
  }, [isOpen, maxAmount, workPeriodStart]);

  const cap = Math.max(0, Number(maxAmount) || 0);
  const periodDisplay =
    weekLabel ||
    (workPeriodStart && workPeriodEnd
      ? `${format(new Date(`${workPeriodStart.slice(0, 10)}T12:00:00`), 'MMM d')} – ${format(new Date(`${workPeriodEnd.slice(0, 10)}T12:00:00`), 'MMM d, yyyy')}`
      : '—');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Math.round((Number(amount) || 0) * 100) / 100;
    if (!(parsed > 0.005)) {
      toast.error('Enter a write-off amount greater than zero');
      return;
    }
    if (parsed > cap + 0.005) {
      toast.error(`Cannot write off more than cash still owed (${cap.toFixed(2)})`);
      return;
    }
    if (!workPeriodStart || !workPeriodEnd) {
      toast.error('Settlement Week is required');
      return;
    }
    const reasonTrim = reason.trim();
    if (!reasonTrim) {
      toast.error('A reason is required for write-offs');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        amount: parsed,
        date,
        reason: reasonTrim,
        notes: notes.trim() || undefined,
        workPeriodStart: workPeriodStart.slice(0, 10),
        workPeriodEnd: workPeriodEnd.slice(0, 10),
      });
      toast.success('Cash balance written off');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save write-off');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-slate-600" />
            Write off cash
          </DialogTitle>
          <DialogDescription>
            Forgive cash still owed by {driverName}. This is a company loss — it does not count as cash collected.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Settlement Week</p>
            <p className="font-medium text-slate-800 mt-0.5">{periodDisplay}</p>
            <p className="text-xs text-slate-500 mt-1">
              Max writable: <span className="font-semibold tabular-nums">{cap.toFixed(2)}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="writeoff-amount">Amount</Label>
            <Input
              id="writeoff-amount"
              type="number"
              step="0.01"
              min="0"
              max={cap > 0 ? cap : undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="writeoff-date">Effective date</Label>
            <Input
              id="writeoff-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="writeoff-reason">Reason (required)</Label>
            <Textarea
              id="writeoff-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this balance being written off?"
              rows={2}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="writeoff-notes">Notes (optional)</Label>
            <Textarea
              id="writeoff-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Extra context for the audit trail"
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || cap < 0.005}
              className="bg-slate-800 hover:bg-slate-900"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Write off'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
