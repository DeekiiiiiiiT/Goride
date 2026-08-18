import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { toast } from 'sonner@2.0.3';
import { useLockedDialog } from '../../shared/useLockedDialog';
import { useFuelReconBusy } from './fuelReconBusyLock';

export type BulkWeekActionResult = {
  id: string;
  label: string;
  status: 'ok' | 'skipped' | 'failed';
  message?: string;
};

export function BulkWeekActionDialog<T extends { id: string; label: string }>({
  open,
  onOpenChange,
  items,
  title,
  description,
  confirmPhrase,
  maxItems,
  emptyLabel,
  executeLabel,
  executingLabel,
  busyMessage,
  extraAck,
  extraAckLabel,
  destructive,
  renderSelectionHint,
  renderItemMeta,
  execute,
  icon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: T[];
  title: string;
  description: string;
  confirmPhrase: (count: number) => string;
  maxItems: number;
  emptyLabel: string;
  executeLabel: (count: number) => string;
  executingLabel: string;
  busyMessage: string;
  extraAck?: boolean;
  extraAckLabel?: string;
  destructive?: boolean;
  renderSelectionHint?: (selected: T[]) => React.ReactNode;
  renderItemMeta: (item: T) => React.ReactNode;
  execute: (
    selected: T[],
    onProgress: (label: string) => void,
  ) => Promise<BulkWeekActionResult[]>;
  icon?: React.ReactNode;
}) {
  const { runExclusive, setMessage, busy: fleetBusy } = useFuelReconBusy();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState('');
  const [executing, setExecuting] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [results, setResults] = useState<BulkWeekActionResult[] | null>(null);
  const [ack, setAck] = useState(false);

  const lockBusy = executing || fleetBusy;
  const { onOpenChange: lockedOpenChange, contentProps: lockedContentProps } = useLockedDialog(
    open,
    onOpenChange,
    lockBusy,
  );

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setConfirmText('');
    setProgressLabel('');
    setResults(null);
    setAck(false);
  }, [open]);

  const selected = useMemo(
    () => items.filter((p) => selectedIds.has(p.id)),
    [items, selectedIds],
  );
  const overCap = selected.length > maxItems;
  const phrase = confirmPhrase(selected.length);
  const confirmOk =
    selected.length > 0 &&
    !overCap &&
    confirmText.trim().toUpperCase() === phrase &&
    (!extraAck || ack);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async () => {
    if (!confirmOk || executing) return;
    const weeks = [...selected];
    setExecuting(true);
    setResults(null);
    const outcome = await runExclusive(busyMessage, async () =>
      execute(weeks, (label) => {
        setProgressLabel(label);
        setMessage(label);
      }),
    );
    setExecuting(false);
    setProgressLabel('');
    if (outcome === undefined) {
      toast.message('Another action is still running — try again when it finishes.');
      return;
    }
    setResults(outcome);
  };

  return (
    <Dialog open={open} onOpenChange={lockedOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" {...lockedContentProps}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {results ? (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-slate-800">Results</p>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{r.label}</span>
                  <span
                    className={
                      r.status === 'ok' ? 'text-emerald-700' : r.status === 'failed' ? 'text-rose-700' : 'text-slate-500'
                    }
                  >
                    {r.status}
                    {r.message ? ` — ${r.message}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button type="button" onClick={() => lockedOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Weeks ({items.length})
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set(items.slice(0, maxItems).map((p) => p.id)))}
                  disabled={executing}
                >
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} disabled={executing}>
                  Clear
                </Button>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                {emptyLabel}
              </p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {items.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
                      <Checkbox checked={selectedIds.has(p.id)} disabled={executing} onCheckedChange={() => toggle(p.id)} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{p.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{renderItemMeta(p)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {overCap && (
              <p className="text-xs text-amber-700">Select at most {maxItems} weeks. Run again for the rest.</p>
            )}
            {selected.length > 0 && renderSelectionHint?.(selected)}
            {extraAck && selected.length > 0 && extraAckLabel && (
              <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <Checkbox checked={ack} disabled={executing} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
                {extraAckLabel}
              </label>
            )}
            {executing && (
              <div className="flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{progressLabel || 'Working…'}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm">
                Type <span className="font-mono font-semibold">{phrase}</span> to confirm
              </Label>
              <Input
                value={confirmText}
                disabled={executing || selected.length === 0}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={phrase}
                autoComplete="off"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={executing} onClick={() => lockedOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={!confirmOk || executing} onClick={run}>
                {executing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {executingLabel}
                  </>
                ) : (
                  executeLabel(selected.length)
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
