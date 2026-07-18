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
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { api } from '../../../services/api';
import { toast } from 'sonner@2.0.3';
import type { ReconciliationPeriod } from '../../../hooks/useTollReconciliationPeriods';

interface PeriodResetInventory {
  unlinkedApplyTripIds: string[];
  disputeRefundIds: string[];
  claimIds: string[];
  tollIds: string[];
  refundResolutionTripIds: string[];
  chargeDriverClaimIds: string[];
}

interface AggregatedPreview {
  byPeriod: Array<{ period: ReconciliationPeriod; inventory: PeriodResetInventory; items: number }>;
  totals: PeriodResetInventory;
  totalItems: number;
}

function emptyInventory(): PeriodResetInventory {
  return {
    unlinkedApplyTripIds: [],
    disputeRefundIds: [],
    claimIds: [],
    tollIds: [],
    refundResolutionTripIds: [],
    chargeDriverClaimIds: [],
  };
}

function mergeInventory(into: PeriodResetInventory, add: PeriodResetInventory): PeriodResetInventory {
  return {
    unlinkedApplyTripIds: [...into.unlinkedApplyTripIds, ...add.unlinkedApplyTripIds],
    disputeRefundIds: [...into.disputeRefundIds, ...add.disputeRefundIds],
    claimIds: [...into.claimIds, ...add.claimIds],
    tollIds: [...into.tollIds, ...add.tollIds],
    refundResolutionTripIds: [...into.refundResolutionTripIds, ...add.refundResolutionTripIds],
    chargeDriverClaimIds: [...into.chargeDriverClaimIds, ...add.chargeDriverClaimIds],
  };
}

function inventoryItemCount(inv: PeriodResetInventory): number {
  return (
    inv.unlinkedApplyTripIds.length +
    inv.disputeRefundIds.length +
    inv.claimIds.length +
    inv.tollIds.length +
    inv.refundResolutionTripIds.length
  );
}

function confirmPhrase(count: number): string {
  return `RESET ${count} PERIODS`;
}

interface BulkPeriodResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All periods the user can pick from (outstanding + completed). */
  periods: ReconciliationPeriod[];
  drivers: Array<{ id: string; name: string }>;
  preselectedDriverId?: string;
  onComplete: () => void;
}

export function BulkPeriodResetDialog({
  open,
  onOpenChange,
  periods,
  drivers,
  preselectedDriverId,
  onComplete,
}: BulkPeriodResetDialogProps) {
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<Set<string>>(new Set());
  const [allDrivers, setAllDrivers] = useState(!preselectedDriverId);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(
    () => new Set(preselectedDriverId ? [preselectedDriverId] : []),
  );
  const [preview, setPreview] = useState<AggregatedPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [confirmText, setConfirmText] = useState('');

  // Fresh selection each time the overlay opens
  useEffect(() => {
    if (!open) return;
    setSelectedPeriodIds(new Set());
    setPreview(null);
    setConfirmText('');
    setProgressLabel('');
    setAllDrivers(!preselectedDriverId);
    setSelectedDriverIds(new Set(preselectedDriverId ? [preselectedDriverId] : []));
  }, [open, preselectedDriverId]);

  const selectedPeriods = useMemo(
    () => periods.filter((p) => selectedPeriodIds.has(p.id)),
    [periods, selectedPeriodIds],
  );

  const outstanding = useMemo(
    () => periods.filter((p) => p.status === 'outstanding'),
    [periods],
  );
  const completed = useMemo(
    () => periods.filter((p) => p.status === 'reconciled'),
    [periods],
  );

  const driverIdsForRequest = useMemo(
    () => (allDrivers ? undefined : [...selectedDriverIds]),
    [allDrivers, selectedDriverIds],
  );

  const expectedConfirm = confirmPhrase(selectedPeriods.length);
  const allSelected = periods.length > 0 && selectedPeriodIds.size === periods.length;

  const togglePeriod = (id: string) => {
    setSelectedPeriodIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
    setConfirmText('');
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelectedPeriodIds(new Set());
    else setSelectedPeriodIds(new Set(periods.map((p) => p.id)));
    setPreview(null);
    setConfirmText('');
  };

  const toggleDriver = (id: string) => {
    setAllDrivers(false);
    setSelectedDriverIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
  };

  const handlePreview = async () => {
    if (selectedPeriods.length === 0) {
      toast.error('Select at least one period');
      return;
    }
    if (!allDrivers && selectedDriverIds.size === 0) {
      toast.error('Select at least one driver, or choose All drivers');
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const byPeriod: AggregatedPreview['byPeriod'] = [];
      let totals = emptyInventory();
      for (const period of selectedPeriods) {
        const res = await api.previewPeriodReset(
          period.startDate,
          period.endDate,
          period.label,
          driverIdsForRequest,
        );
        const inventory = res.inventory as PeriodResetInventory;
        const items = inventoryItemCount(inventory);
        byPeriod.push({ period, inventory, items });
        totals = mergeInventory(totals, inventory);
      }
      const totalItems = inventoryItemCount(totals);
      setPreview({ byPeriod, totals, totalItems });
      if (totalItems === 0) {
        toast.info('Nothing to reset for the selected periods');
      }
    } catch (e: any) {
      const msg = e?.message || 'Preview failed';
      toast.error(msg.includes('reset') ? msg : `Preview failed: ${msg}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    if (selectedPeriods.length === 0) {
      toast.error('Select at least one period');
      return;
    }
    if (confirmText.trim().toUpperCase() !== expectedConfirm) {
      toast.error(`Type ${expectedConfirm} exactly to confirm`);
      return;
    }
    setExecuting(true);
    const toastId = toast.loading(`Resetting ${selectedPeriods.length} periods…`);
    const errors: string[] = [];
    let done = 0;
    try {
      for (const period of selectedPeriods) {
        setProgressLabel(`${period.label} (${done + 1}/${selectedPeriods.length})`);
        try {
          const res = await api.executePeriodReset(
            period.startDate,
            period.endDate,
            period.label,
            driverIdsForRequest,
          );
          if (res.errors?.length) {
            errors.push(`${period.label}: ${res.errors.slice(0, 2).join('; ')}`);
          }
        } catch (e: any) {
          errors.push(`${period.label}: ${e?.message || 'failed'}`);
        }
        done += 1;
      }
      toast.dismiss(toastId);
      if (errors.length === selectedPeriods.length) {
        toast.error('All period resets failed', { description: errors.slice(0, 3).join(' · ') });
      } else if (errors.length > 0) {
        toast.warning(`Reset finished with ${errors.length} issue(s)`, {
          description: errors.slice(0, 3).join(' · '),
        });
        onOpenChange(false);
        onComplete();
      } else {
        toast.success(
          `${selectedPeriods.length} period${selectedPeriods.length === 1 ? '' : 's'} reset`,
        );
        onOpenChange(false);
        onComplete();
      }
    } finally {
      setExecuting(false);
      setProgressLabel('');
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (executing) return;
    onOpenChange(next);
  };

  const renderPeriodGroup = (label: string, group: ReconciliationPeriod[]) => {
    if (group.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {group.map((p) => (
          <label
            key={p.id}
            className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors ${
              selectedPeriodIds.has(p.id)
                ? 'border-indigo-300 bg-indigo-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <Checkbox
              checked={selectedPeriodIds.has(p.id)}
              onCheckedChange={() => togglePeriod(p.id)}
            />
            <span className="min-w-0 flex-1 font-medium text-slate-900">{p.label}</span>
            {p.status === 'outstanding' ? (
              <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {p.actionableTotal} open
              </span>
            ) : (
              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                Done
              </span>
            )}
          </label>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-red-600" />
            Reset periods
          </DialogTitle>
          <DialogDescription>
            Pick the weeks to undo. Reconciliation work in those weeks goes back to Needs Review —
            toll charges and trips are kept.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Resets run one week at a time. Claims, dispute matches, unlinked applies, and driver
              charges in those weeks are reversed for the driver scope below.
            </span>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Periods to reset</Label>
              <button
                type="button"
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                onClick={toggleSelectAll}
                disabled={periods.length === 0 || executing}
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/80 p-2">
              {periods.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500">No periods available</p>
              ) : (
                <>
                  {renderPeriodGroup('Outstanding', outstanding)}
                  {renderPeriodGroup('Completed', completed)}
                </>
              )}
            </div>
            {selectedPeriods.length > 0 && (
              <p className="mt-1.5 text-xs text-slate-500">
                {selectedPeriods.length} period{selectedPeriods.length === 1 ? '' : 's'} selected
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium">Drivers to reset</Label>
            <div className="mt-2 space-y-2 max-h-36 overflow-y-auto border rounded-md p-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                  checked={allDrivers}
                  onCheckedChange={(v) => {
                    setAllDrivers(!!v);
                    if (v) setSelectedDriverIds(new Set());
                    setPreview(null);
                  }}
                />
                All drivers
              </label>
              {drivers.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!allDrivers && selectedDriverIds.has(d.id)}
                    disabled={allDrivers}
                    onCheckedChange={() => toggleDriver(d.id)}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={previewLoading || executing || selectedPeriods.length === 0}
            onClick={handlePreview}
          >
            {previewLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading preview…
              </>
            ) : (
              'Preview what will be reset'
            )}
          </Button>

          {preview && (
            <div className="rounded-md border bg-slate-50 p-3 text-sm space-y-2">
              <p className="font-medium text-slate-800">
                Preview ({preview.totalItems} items across {preview.byPeriod.length} weeks)
              </p>
              <ul className="text-slate-600 space-y-0.5">
                <li>Unlinked applies: {preview.totals.unlinkedApplyTripIds.length}</li>
                <li>Dispute matches: {preview.totals.disputeRefundIds.length}</li>
                <li>Claims: {preview.totals.claimIds.length}</li>
                <li>Tolls to reset: {preview.totals.tollIds.length}</li>
                <li>Refund resolutions: {preview.totals.refundResolutionTripIds.length}</li>
                {preview.totals.chargeDriverClaimIds.length > 0 && (
                  <li className="text-orange-700">
                    Charge-driver reversals: {preview.totals.chargeDriverClaimIds.length}
                  </li>
                )}
              </ul>
              <div className="max-h-24 overflow-y-auto border-t pt-2 text-xs text-slate-500 space-y-0.5">
                {preview.byPeriod.map(({ period, items }) => (
                  <div key={period.id} className="flex justify-between gap-2">
                    <span>{period.label}</span>
                    <span className="tabular-nums">{items} items</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview && preview.totalItems > 0 && (
            <div>
              <Label htmlFor="bulk-period-reset-confirm" className="text-sm">
                Type <span className="font-mono font-medium">{expectedConfirm}</span> to confirm
              </Label>
              <Input
                id="bulk-period-reset-confirm"
                className="mt-1.5"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expectedConfirm}
                disabled={executing}
              />
            </div>
          )}

          {executing && progressLabel && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Resetting {progressLabel}…
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={executing}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={
              executing ||
              selectedPeriods.length === 0 ||
              !preview ||
              preview.totalItems === 0 ||
              confirmText.trim().toUpperCase() !== expectedConfirm
            }
            onClick={handleExecute}
          >
            {executing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resetting…
              </>
            ) : selectedPeriods.length === 0 ? (
              'Reset periods'
            ) : (
              `Reset ${selectedPeriods.length} period${selectedPeriods.length === 1 ? '' : 's'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
