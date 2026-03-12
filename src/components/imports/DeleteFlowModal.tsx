import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { logAuditEntry } from '../../services/audit-log';
import { api } from '../../services/api';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface DeleteConfig {
  startDate?: string;
  endDate?: string;
  isAllTime: boolean;
  driverId?: string;
  platform?: string;
}

export interface DeletePreviewItem {
  key: string;
  [field: string]: any;
}

export interface DeletePreviewColumn {
  key: string;
  label: string;
  render?: (value: any, item: DeletePreviewItem) => React.ReactNode;
}

export interface DeleteFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (deletedCount: number) => void;
  title: string;
  entityLabel: string;
  /** Fetch function: returns array of deletable items */
  fetchItems: (config: DeleteConfig) => Promise<DeletePreviewItem[]>;
  /** Delete function: takes array of keys, returns count deleted */
  deleteItems: (keys: string[]) => Promise<number>;
  /** Column definitions for the preview table */
  columns: DeletePreviewColumn[];
  /** Show date range filter (default: true) */
  showDateFilter?: boolean;
  /** Show driver filter dropdown (default: false) */
  showDriverFilter?: boolean;
  /** Show platform filter dropdown (default: false) */
  showPlatformFilter?: boolean;
  /** If item count exceeds this, require type-to-confirm (default: 50) */
  dangerThreshold?: number;
  /** Optional informational note shown in the configure step */
  configNote?: React.ReactNode;
  /** Skip the preview table step — go directly from configure to confirm (default: false) */
  skipPreview?: boolean;
  /** Custom word to type for confirmation (default: "DELETE") */
  confirmWord?: string;
}

type Step = 'configure' | 'preview' | 'confirm' | 'processing' | 'success';

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function DeleteFlowModal({
  isOpen,
  onClose,
  onSuccess,
  title,
  entityLabel,
  fetchItems,
  deleteItems,
  columns,
  showDateFilter = true,
  showDriverFilter = false,
  showPlatformFilter = false,
  dangerThreshold = 50,
  configNote,
  skipPreview = false,
  confirmWord = 'DELETE',
}: DeleteFlowModalProps) {
  // Step state
  const [step, setStep] = useState<Step>('configure');

  // Configure state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isAllTime, setIsAllTime] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [platform, setPlatform] = useState('');
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);

  // Preview state
  const [previewItems, setPreviewItems] = useState<DeletePreviewItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Confirm state
  const [confirmText, setConfirmText] = useState('');

  // Processing state
  const [deletedCount, setDeletedCount] = useState(0);

  // Timing for audit
  const startTimeRef = useRef(0);

  // ─── Load drivers when needed ────────────────────────────────────────
  useEffect(() => {
    if (isOpen && showDriverFilter) {
      api.getDrivers()
        .then((d: any[]) => setDrivers(d.map(dr => ({ id: dr.id, name: dr.name || 'Unknown' }))))
        .catch(console.error);
    }
  }, [isOpen, showDriverFilter]);

  // ─── Reset all state when modal opens/closes ─────────────────────────
  useEffect(() => {
    if (isOpen) {
      setStep('configure');
      setStartDate('');
      setEndDate('');
      setIsAllTime(false);
      setDriverId('');
      setPlatform('');
      setPreviewItems([]);
      setSelectedKeys([]);
      setConfirmText('');
      setDeletedCount(0);
      setIsLoadingPreview(false);
    }
  }, [isOpen]);

  // ─── Handle modal close (block during processing) ───────────────────
  const handleOpenChange = (open: boolean) => {
    if (!open && step === 'processing') return; // block close during processing
    if (!open) onClose();
  };

  // ─── Step 1 → 2: Fetch preview ──────────────────────────────────────
  const handleFetchPreview = async () => {
    // Validate: need dates or All Time (if date filter shown)
    if (showDateFilter && !isAllTime && (!startDate || !endDate)) {
      toast.error('Please select start and end dates, or check "All Time".');
      return;
    }

    setIsLoadingPreview(true);
    startTimeRef.current = Date.now();

    try {
      const config: DeleteConfig = {
        startDate: isAllTime ? '1970-01-01' : startDate || undefined,
        endDate: isAllTime ? '2100-01-01' : endDate || undefined,
        isAllTime,
        driverId: driverId || undefined,
        platform: platform || undefined,
      };

      const items = await fetchItems(config);
      setPreviewItems(items);
      setSelectedKeys(items.map(i => i.key));

      if (items.length === 0) {
        toast.info(`No ${entityLabel} found for the selected criteria.`);
      }

      // skipPreview: jump directly to confirm step
      if (skipPreview && items.length > 0) {
        setConfirmText('');
        setStep('confirm');
      } else {
        setStep('preview');
      }
    } catch (err: any) {
      console.error(`Preview fetch failed for ${entityLabel}:`, err);
      toast.error(`Failed to load preview: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // ─── Step 2 → 3: Move to confirm ───────────────────────────────────
  const handleProceedToConfirm = () => {
    if (selectedKeys.length === 0) {
      toast.error('No items selected for deletion.');
      return;
    }
    setConfirmText('');
    setStep('confirm');
  };

  // ─── Step 3 → 4 → 5: Execute deletion ──────────────────────────────
  const handleConfirmDeletion = async () => {
    // Validate type-to-confirm
    if (requiresTypeConfirm && confirmText.toUpperCase() !== confirmWord) {
      toast.error(`Please type ${confirmWord} to confirm.`);
      return;
    }

    setStep('processing');
    const operationStart = startTimeRef.current || Date.now();

    try {
      const count = await deleteItems(selectedKeys);
      setDeletedCount(count);
      setStep('success');
      toast.success(`Successfully deleted ${count.toLocaleString()} ${entityLabel}.`);

      logAuditEntry({
        operation: 'import', // closest match in AuditOperation type — represents a data mutation
        category: `delete:${entityLabel}`,
        recordCount: count,
        status: 'success',
        format: 'csv',
        durationMs: Date.now() - operationStart,
      });

      onSuccess?.(count);
    } catch (err: any) {
      console.error(`Deletion failed for ${entityLabel}:`, err);
      toast.error(`Deletion failed: ${err.message || 'Unknown error'}. Some items may still exist.`);

      logAuditEntry({
        operation: 'import',
        category: `delete:${entityLabel}`,
        recordCount: 0,
        status: 'failed',
        errors: [err.message || 'Unknown error'],
        durationMs: Date.now() - operationStart,
      });

      setStep('preview');
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────
  const toggleKeySelection = (key: string) => {
    setSelectedKeys(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const toggleSelectAll = () => {
    if (selectedKeys.length === previewItems.length) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(previewItems.map(i => i.key));
    }
  };

  const requiresTypeConfirm = selectedKeys.length > dangerThreshold;

  const canProceedFromConfigure = () => {
    if (showDateFilter) {
      return isAllTime || (!!startDate && !!endDate);
    }
    // If no date filter, always allow (e.g. deleting all drivers)
    return true;
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[800px] w-full overflow-hidden max-h-[85vh] flex flex-col"
        onInteractOutside={(e) => { if (step === 'processing') e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (step === 'processing') e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {step === 'configure' && 'Configure filters to find records to delete.'}
            {step === 'preview' && 'Review the data that will be permanently deleted.'}
            {step === 'confirm' && 'Confirm permanent deletion of selected records.'}
            {step === 'processing' && 'Deletion in progress — please do not close this window.'}
            {step === 'success' && 'Deletion completed successfully.'}
          </DialogDescription>
        </DialogHeader>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 1: CONFIGURE                                             */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 'configure' && (
          <div className="py-4 space-y-5">
            {configNote && (
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-amber-800 text-xs">
                <strong>Note:</strong> {configNote}
              </div>
            )}

            {/* Date range filter */}
            {showDateFilter && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Start Date</Label>
                    <Input
                      type="date"
                      disabled={isAllTime}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">End Date</Label>
                    <Input
                      type="date"
                      disabled={isAllTime}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="delete-all-time"
                    checked={isAllTime}
                    onCheckedChange={(c) => setIsAllTime(!!c)}
                  />
                  <label
                    htmlFor="delete-all-time"
                    className="text-sm font-medium leading-none cursor-pointer text-rose-600"
                  >
                    Delete entire history (All Time)
                  </label>
                </div>
              </>
            )}

            {/* Driver filter */}
            {showDriverFilter && (
              <div className="space-y-2">
                <Label className="text-sm">Filter by Driver (optional)</Label>
                <Select value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All drivers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Drivers</SelectItem>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Platform filter */}
            {showPlatformFilter && (
              <div className="space-y-2">
                <Label className="text-sm">Filter by Platform (optional)</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
                    <SelectValue placeholder="All platforms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Platforms</SelectItem>
                    <SelectItem value="Uber">Uber</SelectItem>
                    <SelectItem value="InDrive">InDrive</SelectItem>
                    <SelectItem value="Roam">Roam</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* No filters needed */}
            {!showDateFilter && !showDriverFilter && !showPlatformFilter && !skipPreview && (
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-lg text-rose-800 text-sm">
                <strong>Warning:</strong> This will load <em>all</em> {entityLabel} for review. Click &ldquo;Preview Deletion&rdquo; to see what will be deleted.
              </div>
            )}

            {/* Footer */}
            <div className="pt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleFetchPreview}
                disabled={!canProceedFromConfigure() || isLoadingPreview}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isLoadingPreview ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {skipPreview ? 'Scanning...' : 'Loading...'}
                  </>
                ) : (
                  <>
                    {skipPreview ? <Trash2 className="h-4 w-4 mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                    {skipPreview ? 'Proceed' : 'Preview Deletion'}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 2: PREVIEW                                               */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 'preview' && (
          <div className="flex flex-col flex-1 min-h-0 py-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-sm text-slate-600">
                Found <strong className="text-rose-700">{previewItems.length.toLocaleString()}</strong> {entityLabel} to delete.
                {previewItems.length > 0 && (
                  <>
                    <br />
                    <span className="text-xs text-slate-400">
                      {selectedKeys.length === previewItems.length
                        ? 'All items selected.'
                        : `${selectedKeys.length.toLocaleString()} of ${previewItems.length.toLocaleString()} selected.`
                      }
                      {' '}Uncheck items you want to keep.
                    </span>
                  </>
                )}
              </div>
              {previewItems.length > 0 && (
                <Button size="sm" variant="outline" onClick={toggleSelectAll}>
                  {selectedKeys.length === previewItems.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>

            {/* Table */}
            {previewItems.length > 0 ? (
              <div className="border rounded-md flex-1 min-h-0 overflow-hidden">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        {columns.map(col => (
                          <TableHead key={col.key}>{col.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewItems.map((item) => {
                        const isSelected = selectedKeys.includes(item.key);
                        return (
                          <TableRow
                            key={item.key}
                            className={!isSelected ? 'bg-slate-50/50 opacity-60' : ''}
                          >
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleKeySelection(item.key)}
                              />
                            </TableCell>
                            {columns.map(col => (
                              <TableCell key={col.key} className="text-xs">
                                {col.render
                                  ? col.render(item[col.key], item)
                                  : (item[col.key] ?? '—')
                                }
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
                <Search className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">No {entityLabel} found</p>
                <p className="text-xs mt-1">
                  {isAllTime
                    ? 'There are no records matching your filters.'
                    : 'Try expanding your date range or selecting "All Time".'}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 flex justify-between">
              <Button variant="ghost" onClick={() => setStep('configure')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleProceedToConfirm}
                disabled={selectedKeys.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Proceed to Delete ({selectedKeys.length.toLocaleString()})
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 3: CONFIRM                                               */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 'confirm' && (
          <div className="py-6 space-y-5">
            {/* Warning box */}
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-lg text-rose-800 text-sm">
              <strong>Warning:</strong> This action is irreversible.{' '}
              <strong>{selectedKeys.length.toLocaleString()}</strong> {entityLabel} will be permanently deleted.
            </div>

            {/* Type-to-confirm (for large batches) */}
            {requiresTypeConfirm && (
              <div className="space-y-2">
                <Label className="text-sm text-slate-700">
                  Type <strong className="text-rose-600 font-mono">{confirmWord}</strong> to confirm:
                </Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`Type ${confirmWord} here...`}
                  className="font-mono border-rose-200 focus:border-rose-400 focus:ring-rose-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && confirmText.toUpperCase() === confirmWord) {
                      handleConfirmDeletion();
                    }
                  }}
                  autoFocus
                />
              </div>
            )}

            {/* Standard confirm (small batches) */}
            {!requiresTypeConfirm && (
              <p className="text-center text-slate-600 text-sm">
                Are you absolutely sure you want to proceed?
              </p>
            )}

            {/* Footer */}
            <div className="pt-2 flex justify-center gap-4">
              <Button variant="outline" onClick={() => setStep(skipPreview ? 'configure' : 'preview')}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDeletion}
                disabled={requiresTypeConfirm && confirmText.toUpperCase() !== confirmWord}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Yes, Permanently Delete
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 4: PROCESSING                                            */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 'processing' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <div className="h-12 w-12 border-4 border-slate-200 border-t-rose-600 rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">
              Deleting {entityLabel}...
            </p>
            <p className="text-xs text-slate-400">
              Please do not close this window.
            </p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* STEP 5: SUCCESS                                               */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 'success' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="h-12 w-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900">Deletion Complete</h3>
              <p className="text-slate-500 max-w-xs mx-auto mt-1 text-sm">
                Successfully deleted <strong>{deletedCount.toLocaleString()}</strong> {entityLabel}.
              </p>
            </div>
            <Button className="mt-4" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}