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

  const labelOk = periodConfirmLabelsMatch(confirmText, period.label);

  useEffect(() => {
    if (!open) setConfirmText('');
  }, [open]);

  const handleExecute = async () => {
    if (!labelOk) {
      toast.error('Week label does not match — use the Fill button or copy it exactly');
      return;
    }
    setExecuting(true);
    const toastId = toast.loading('Resetting period…');
    try {
      const result = await runExclusive('Resetting period…', async () => {
        const weekKey = period.startDate || period.id;
        try {
          return await api.resetFuelPeriod(weekKey);
        } catch {
          // Deployed DELETE path — wipe per vehicle with activity this week
          const vehicleIds =
            inventory.vehicleIds.length > 0
              ? inventory.vehicleIds
              : [
                  ...new Set(
                    fuelEntries
                      .filter((e) => {
                        const d = String(e.date || '').split('T')[0];
                        return d >= period.startDate && d <= period.endDate;
                      })
                      .map((e) => e.vehicleId)
                      .filter(Boolean),
                  ),
                ];
          for (const vehicleId of vehicleIds) {
            try {
              await api.deleteFinalizedReport(weekKey, vehicleId);
            } catch (e: any) {
              if (!/404|not found/i.test(String(e?.message || ''))) throw e;
            }
          }
          return {
            success: true,
            snapshotsDeleted: inventory.snapshots.length,
            resetFuelEntries: inventory.postedEntryCount,
            deletedTransactions: 0,
          };
        }
      });
      if (result === undefined) {
        toast.dismiss(toastId);
        toast.info('Another action is already running');
        return;
      }
      const snaps = result.snapshotsDeleted ?? 0;
      const entries = result.resetFuelEntries ?? 0;
      const txs = result.deletedTransactions ?? 0;
      if (snaps === 0 && entries === 0 && txs === 0 && !inventory.hasActivity) {
        toast.success(`Restarted ${period.label} from Data quality`, { id: toastId });
      } else if (snaps === 0 && entries === 0 && txs === 0) {
        toast.success(`Restarted ${period.label} from Data quality (no settlements to reverse)`, {
          id: toastId,
        });
      } else {
        toast.success(
          `Reset ${period.label}: ${entries} log(s), ${txs} settlement row(s), ${snaps} snapshot(s) — back to Data quality`,
          { id: toastId },
        );
      }
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
            Re-open <strong>{period.label}</strong>
            {inventory.canReset
              ? ' by removing finalized snapshots and reversing linked settlements.'
              : '. This week has no posted settlements — Reset still clears wizard progress and returns you to the period list.'}{' '}
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Will reverse</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                <li>{inventory.snapshots.length} finalized snapshot(s)</li>
                <li>{inventory.postedEntryCount} posted fuel log(s) returned to Pending</li>
                <li>
                  {inventory.weekEntryCount} fuel log(s) in this week
                  {inventory.pendingEntryCount > 0
                    ? ` (${inventory.pendingEntryCount} still Pending)`
                    : ''}
                </li>
                <li>Linked wallet / settlement rows for this week (if any)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="fuel-reset-confirm">
              Type <span className="font-mono text-xs">{period.label}</span> to confirm
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setConfirmText(period.label)}
            >
              Fill label
            </Button>
          </div>
          <Input
            id="fuel-reset-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={period.label}
            autoComplete="off"
          />
          {confirmText.length > 0 && !labelOk && (
            <p className="text-xs text-rose-600">Label does not match yet — click Fill label.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={executing}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={executing || !labelOk}
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
