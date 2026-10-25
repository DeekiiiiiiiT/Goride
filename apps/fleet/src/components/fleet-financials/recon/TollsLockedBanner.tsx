import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';

/** Shown when the lock check itself failed. Reopen stays hidden until the check says locked. */
export function TollsCheckFailedBanner({
  onRetry,
  busy,
}: {
  onRetry: () => void;
  busy?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Couldn't check tolls</p>
        <p className="mt-1 text-amber-900">
          We couldn't tell whether tolls are locked for this week. Retry before changing a charge.
        </p>
      </div>
      <Button type="button" className="h-11 shrink-0" disabled={busy} onClick={onRetry}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Retry
      </Button>
    </div>
  );
}

/** Shown on Week Reconciliation → Tolls when a closed toll statement still seals the week. */
export function TollsLockedBanner({
  weekKey,
  serviceLine = 'rideshare',
  onReopened,
}: {
  weekKey: string;
  serviceLine?: 'rideshare' | 'rush_delivery';
  onReopened: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await api.reopenTollReconciliationPeriod(weekKey, trimmed, serviceLine);
      toast.success('Tolls reopened. You can change charges on this week.');
      setOpen(false);
      setReason('');
      onReopened();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reopen tolls');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Tolls locked</p>
          <p className="mt-1 text-amber-900">
            An earlier close locked tolls for this week. Reopen them before changing a charge. The week itself can stay open.
          </p>
        </div>
        <Button type="button" className="h-11 shrink-0" onClick={() => setOpen(true)}>
          Reopen tolls
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reopen tolls?</DialogTitle>
            <DialogDescription>
              Toll changes, including Charge Driver, will be allowed again. A short reason is kept with the week.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why tolls need to be reopened"
            rows={3}
            className="resize-none"
            aria-label="Reason for reopening tolls"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="h-11" disabled={busy || !reason.trim()} onClick={() => void submit()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reopen tolls
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
