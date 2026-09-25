import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import type { FuelEntry } from '../../../types/fuel';
import { fuelService } from '../../../services/fuelService';
import { toast } from 'sonner';
import { isJaaStatementLedgerRow } from '../../../utils/jaaFuelStatementMatcher';

export type UnlinkedChargeAction = 'adopt' | 'link' | 'dismiss' | 'request_driver';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: UnlinkedChargeAction | null;
  statement: FuelEntry | null;
  /** Candidate ops logs for Link action (same week, gas card, unmatched). */
  linkCandidates: FuelEntry[];
  drivers: { id: string; name: string }[];
  onDone: () => void | Promise<void>;
};

export function UnlinkedCardChargeActionDialog({
  open,
  onOpenChange,
  action,
  statement,
  linkCandidates,
  drivers,
  onDone,
}: Props) {
  const [reason, setReason] = useState('');
  const [odometer, setOdometer] = useState('');
  const [driverId, setDriverId] = useState('');
  const [linkEntryId, setLinkEntryId] = useState('');
  const [busy, setBusy] = useState(false);

  const title = useMemo(() => {
    switch (action) {
      case 'adopt':
        return 'Adopt into Transaction Logs';
      case 'link':
        return 'Link to existing log';
      case 'dismiss':
        return 'Dismiss card charge';
      case 'request_driver':
        return 'Request driver log';
      default:
        return 'Unlinked card charge';
    }
  }, [action]);

  const reset = () => {
    setReason('');
    setOdometer('');
    setDriverId('');
    setLinkEntryId('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    if (!statement?.id || !action) return;
    if (action !== 'request_driver' && !reason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setBusy(true);
    try {
      if (action === 'adopt') {
        await fuelService.adoptJaaStatement({
          statementId: statement.id,
          reason: reason.trim(),
          driverId: driverId || statement.driverId || undefined,
          vehicleId: statement.vehicleId || undefined,
          odometer: odometer.trim() ? Number(odometer) : null,
        });
        toast.success('Charge adopted into Transaction Logs');
      } else if (action === 'link') {
        if (!linkEntryId) {
          toast.error('Pick a log to link');
          setBusy(false);
          return;
        }
        await fuelService.linkJaaStatement({
          statementId: statement.id,
          driverEntryId: linkEntryId,
          reason: reason.trim(),
        });
        toast.success('Statement linked to log');
      } else if (action === 'dismiss') {
        await fuelService.dismissJaaStatement({
          statementId: statement.id,
          reason: reason.trim(),
        });
        toast.success('Charge dismissed (kept for audit)');
      } else if (action === 'request_driver') {
        await fuelService.requestDriverLogForJaaStatement({
          statementId: statement.id,
          message: reason.trim() || undefined,
        });
        toast.success('Driver notified to log this fill');
      }
      reset();
      onOpenChange(false);
      await onDone();
    } catch (e: any) {
      toast.error(e?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const amount = Number(statement?.amount) || 0;
  const needsDriverPick = action === 'adopt' && !statement?.driverId;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {statement
              ? `$${amount.toFixed(2)} · ${String(statement.date || '').slice(0, 10)}`
              : null}
            {statement && isJaaStatementLedgerRow(statement)
              ? ' · statement charge'
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {needsDriverPick ? (
            <div className="space-y-1.5">
              <Label>Driver</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {action === 'adopt' ? (
            <div className="space-y-1.5">
              <Label>Odometer (optional)</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Leave blank if unknown"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">
                Without an odometer this fill stays Floating and spend lands in unattributed fill
                cost.
              </p>
            </div>
          ) : null}

          {action === 'link' ? (
            <div className="space-y-1.5">
              <Label>Existing gas-card log</Label>
              <Select value={linkEntryId} onValueChange={setLinkEntryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select log" />
                </SelectTrigger>
                <SelectContent>
                  {linkCandidates.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {String(e.date || '').slice(0, 10)} ·{' '}
                      {e.odometer != null ? `odo ${e.odometer}` : 'no odo'} ·{' '}
                      {e.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkCandidates.length === 0 ? (
                <p className="text-[11px] text-amber-800">
                  No unmatched gas-card logs in this period. Adopt instead.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>
              {action === 'request_driver' ? 'Message (optional)' : 'Reason'}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                action === 'dismiss'
                  ? 'Non-fuel, wrong card, disputed with issuer…'
                  : action === 'request_driver'
                    ? 'Optional note for the driver'
                    : 'Why this action is correct'
              }
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
