/**
 * Cash Wallet — fleet pays driver for a company_owes Settlement Week.
 * Never writes Payment_Received / Cash Collection (would inflate cash returned).
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { toast } from 'sonner@2.0.3';
import { Loader2, Banknote } from 'lucide-react';
import { format } from 'date-fns';

export type RecordPayoutSavePayload = {
  amount: number;
  date: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  workPeriodStart: string;
  workPeriodEnd: string;
};

interface RecordPayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: RecordPayoutSavePayload) => Promise<void>;
  driverName: string;
  /** Max payable = company-owes outstanding for the locked week. */
  maxAmount: number;
  workPeriodStart: string;
  workPeriodEnd: string;
  weekLabel?: string;
}

export function RecordPayoutModal({
  isOpen,
  onClose,
  onSave,
  driverName,
  maxAmount,
  workPeriodStart,
  workPeriodEnd,
  weekLabel,
}: RecordPayoutModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('Cash');
    setReferenceNumber('');
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

  const needsReference =
    paymentMethod === 'Bank Transfer' || paymentMethod === 'Mobile Money' || paymentMethod === 'Check';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Math.round((Number(amount) || 0) * 100) / 100;
    if (!(parsed > 0.005)) {
      toast.error('Enter a payout amount greater than zero');
      return;
    }
    if (parsed > cap + 0.005) {
      toast.error(`Cannot pay more than fleet owes (${cap.toFixed(2)})`);
      return;
    }
    if (!workPeriodStart || !workPeriodEnd) {
      toast.error('Settlement Week is required');
      return;
    }
    if (needsReference && !referenceNumber.trim()) {
      toast.error('Reference number is required for bank / mobile payouts');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        amount: parsed,
        date,
        paymentMethod,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        workPeriodStart: workPeriodStart.slice(0, 10),
        workPeriodEnd: workPeriodEnd.slice(0, 10),
      });
      toast.success(
        paymentMethod === 'Cash'
          ? 'Payout recorded'
          : 'Payout logged — awaiting bank clear',
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save payout');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-700" />
            Pay driver
          </DialogTitle>
          <DialogDescription>
            Record a fleet payout to {driverName} for this Settlement Week. Does not count as cash
            collected from the driver.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm">
            <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/70">
              Settlement Week
            </p>
            <p className="font-medium text-slate-800 mt-0.5">{periodDisplay}</p>
            <p className="text-xs text-slate-500 mt-1">
              Fleet owes:{' '}
              <span className="font-semibold tabular-nums text-emerald-800">{cap.toFixed(2)}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payout-amount">Amount</Label>
            <Input
              id="payout-amount"
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
            <Label htmlFor="payout-method">Payment method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="payout-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                <SelectItem value="Check">Check</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsReference && (
            <div className="space-y-2">
              <Label htmlFor="payout-ref">Reference number</Label>
              <Input
                id="payout-ref"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Transfer / mobile reference"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="payout-date">Effective date</Label>
            <Input
              id="payout-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payout-notes">Notes (optional)</Label>
            <Textarea
              id="payout-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Audit trail notes"
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
              className="bg-emerald-700 hover:bg-emerald-800"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Record payout'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
