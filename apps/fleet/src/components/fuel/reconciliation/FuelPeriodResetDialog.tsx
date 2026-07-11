import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
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
import { toast } from 'sonner@2.0.3';
import { api } from '../../../services/api';
import type { FuelEntry, FinalizedFuelReport } from '../../../types/fuel';
import { buildFuelPeriodResetInventory } from '../../../utils/fuelPeriodStatus';
import { periodConfirmLabelsMatch } from '../../../utils/fuelWeekPeriod';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import { useFuelReconBusy } from './fuelReconBusyLock';

interface FuelPeriodResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: FuelReconciliationPeriod;
  finalizedReports: FinalizedFuelReport[];
  fuelEntries: FuelEntry[];
  onComplete: () => void;
}

export function FuelPeriodResetDialog({
  open,
  onOpenChange,
  period,
  finalizedReports,
  fuelEntries,
  onComplete,
}: FuelPeriodResetDialogProps) {
  const { runExclusive } = useFuelReconBusy();
  const [confirmText, setConfirmText] = useState('');
  const [executing, setExecuting] = useState(false);

  const inventory = useMemo(
    () => buildFuelPeriodResetInventory(period.id, finalizedReports, fuelEntries),
    [period.id, finalizedReports, fuelEntries],
  );

  useEffect(() => {
    if (!open) setConfirmText('');
  }, [open]);

  const handleExecute = async () => {
    if (!periodConfirmLabelsMatch(confirmText, period.label)) {
      toast.error('Week label does not match — copy it exactly from above');
      return;
    }
    setExecuting(true);
    const toastId = toast.loading('Resetting period…');
    try {
      const result = await runExclusive('Resetting period…', async () => {
        for (const snap of inventory.snapshots) {
          await api.deleteFinalizedReport(String(snap.weekStart), snap.vehicleId);
        }
        return inventory.snapshots.length;
      });
      if (result === undefined) {
        toast.dismiss(toastId);
        toast.info('Another action is already running');
        return;
      }
      toast.success(`Reset ${result} snapshot${result === 1 ? '' : 's'} for ${period.label}`, {
        id: toastId,
      });
      onOpenChange(false);
      onComplete();
    } catch (e: any) {
      toast.error(e?.message || 'Reset failed', { id: toastId });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <RotateCcw className="h-5 w-5" />
            Reset Period
          </DialogTitle>
          <DialogDescription>
            Re-open <strong>{period.label}</strong> by removing finalized snapshots and reversing linked
            settlements. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Will reverse</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                <li>{inventory.snapshots.length} finalized snapshot(s)</li>
                <li>{inventory.postedEntryCount} posted fuel log(s) returned toward Pending via cascade</li>
                <li>Linked wallet / settlement rows for those snapshots</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fuel-reset-confirm">
            Type <span className="font-mono text-xs">{period.label}</span> to confirm
          </Label>
          <Input
            id="fuel-reset-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={period.label}
            autoComplete="off"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={executing}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={executing || inventory.snapshots.length === 0}
            onClick={handleExecute}
          >
            {executing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting…
              </>
            ) : (
              'Reset Period'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
