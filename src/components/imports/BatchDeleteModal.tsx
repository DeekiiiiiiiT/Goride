import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
  FileText,
  HardDrive,
  Users,
  Car,
  BookOpen,
  CreditCard,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface BatchDeletePreview {
  batch: {
    id: string;
    fileName: string;
    uploadDate: string;
    status: string;
    recordCount: number;
    type: string;
    processedBy?: string;
  };
  trips: number;
  transactions: number;
  ledgerEntries: number;
  disputeRefunds?: number;
  driverMetrics: {
    affected: number;
    safeToDelete: number;
    shared: number;
    details: any[];
  };
  vehicleMetrics: {
    affected: number;
    safeToDelete: number;
    shared: number;
    details: any[];
  };
}

interface DeleteResult {
  success: boolean;
  deletedTrips: number;
  deletedTransactions: number;
  deletedLedgerEntries: number;
  deletedDisputeRefundKeys?: number;
  deletedDisputeRefundDedupKeys?: number;
  deletedDriverMetrics: number;
  skippedDriverMetrics: number;
  deletedVehicleMetrics: number;
  skippedVehicleMetrics: number;
  deletedBatch: string;
}

interface BatchDeleteModalProps {
  isOpen: boolean;
  batchId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function BatchDeleteModal({ isOpen, batchId, onClose, onSuccess }: BatchDeleteModalProps) {
  const [preview, setPreview] = useState<BatchDeletePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<DeleteResult | null>(null);

  const CONFIRM_WORD = 'DELETE';

  // ─── Fetch preview when modal opens ─────────────────────────────────
  useEffect(() => {
    if (!isOpen || !batchId) {
      setPreview(null);
      setError(null);
      setConfirmText('');
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getBatchDeletePreview(batchId)
      .then(data => {
        if (!cancelled) setPreview(data);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load preview');
        console.error('[BatchDeleteModal] Preview fetch error:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, batchId]);

  // ─── Execute delete ─────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!batchId || confirmText !== CONFIRM_WORD) return;
    setDeleting(true);
    try {
      const res = await api.deleteBatch(batchId);
      setResult(res);
      toast.success(
        `Batch deleted: ${res.deletedTrips} trips, ${res.deletedTransactions} txns, ${res.deletedLedgerEntries} ledger, ${res.deletedDisputeRefundKeys ?? 0} dispute refunds`,
        { duration: 6000 }
      );
      onSuccess();
    } catch (err: any) {
      console.error('[BatchDeleteModal] Delete error:', err);
      toast.error(`Batch delete failed: ${err.message}`);
      setError(err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Total impact count ─────────────────────────────────────────────
  const totalImpact = preview
    ? preview.trips + preview.transactions + preview.ledgerEntries +
      (preview.disputeRefunds ?? 0) +
      preview.driverMetrics.safeToDelete + preview.vehicleMetrics.safeToDelete
    : 0;

  // ─── Format type label ──────────────────────────────────────────────
  const formatType = (type: string) => {
    const map: Record<string, string> = {
      uber_trip: 'Uber Trips',
      uber_payment: 'Uber Payments',
      indrive_trip: 'InDrive Trips',
      roam_trip: 'Roam Trips',
      merged: 'Merged',
      fuel: 'Fuel',
      transactions: 'Transactions',
    };
    return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !deleting) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <Trash2 className="h-5 w-5" />
            Delete Import Batch
          </DialogTitle>
          <DialogDescription>
            This will cascade-delete all records created by this import.
          </DialogDescription>
        </DialogHeader>

        {/* ─── Loading ─── */}
        {loading && (
          <div className="text-center py-8 text-slate-400">
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin opacity-60" />
            <p className="text-sm">Analyzing cascade impact…</p>
          </div>
        )}

        {/* ─── Error ─── */}
        {error && !result && (
          <div className="text-center py-6">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
            <p className="text-sm font-medium text-slate-700">Preview failed</p>
            <p className="text-xs text-slate-500 mt-1">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        {/* ─── Success result ─── */}
        {result && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-900">Batch deleted successfully</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatRow icon={<FileText className="h-3.5 w-3.5" />} label="Trips deleted" value={result.deletedTrips} />
              <StatRow icon={<CreditCard className="h-3.5 w-3.5" />} label="Transactions deleted" value={result.deletedTransactions} />
              <StatRow icon={<BookOpen className="h-3.5 w-3.5" />} label="Ledger entries deleted" value={result.deletedLedgerEntries} />
              <StatRow icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Dispute refunds removed" value={result.deletedDisputeRefundKeys ?? 0} />
              <StatRow icon={<Users className="h-3.5 w-3.5" />} label="Driver metrics deleted" value={result.deletedDriverMetrics} />
              <StatRow icon={<Users className="h-3.5 w-3.5" />} label="Driver metrics kept" value={result.skippedDriverMetrics} color="text-emerald-600" />
              <StatRow icon={<Car className="h-3.5 w-3.5" />} label="Vehicle metrics deleted" value={result.deletedVehicleMetrics} />
              <StatRow icon={<Car className="h-3.5 w-3.5" />} label="Vehicle metrics kept" value={result.skippedVehicleMetrics} color="text-emerald-600" />
            </div>
            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={onClose}>Done</Button>
            </div>
          </div>
        )}

        {/* ─── Preview + Confirm ─── */}
        {preview && !result && !loading && !error && (
          <div className="space-y-4">
            {/* Batch info header */}
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex items-start gap-2 mb-1 min-w-0">
                <HardDrive className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                <span className="text-sm font-semibold text-slate-800 break-all line-clamp-2" title={preview.batch.fileName}>
                  {preview.batch.fileName}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto shrink-0">
                  {formatType(preview.batch.type)}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span>Imported {new Date(preview.batch.uploadDate).toLocaleDateString()}</span>
                <span>{preview.batch.recordCount.toLocaleString()} records</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-1">ID: {preview.batch.id}</p>
            </div>

            {/* Cascade impact grid */}
            <div>
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Cascade Impact
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <ImpactCard
                  icon={<FileText className="h-4 w-4" />}
                  label="Trips"
                  count={preview.trips}
                  color="rose"
                />
                <ImpactCard
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Transactions"
                  count={preview.transactions}
                  color="rose"
                />
                <ImpactCard
                  icon={<BookOpen className="h-4 w-4" />}
                  label="Ledger Entries"
                  count={preview.ledgerEntries}
                  color="rose"
                />
                <ImpactCard
                  icon={<ShieldAlert className="h-4 w-4" />}
                  label="Dispute refunds"
                  count={preview.disputeRefunds ?? 0}
                  color="rose"
                />
                <ImpactCard
                  icon={<HardDrive className="h-4 w-4" />}
                  label="Total Records"
                  count={totalImpact}
                  color="red"
                  bold
                />
              </div>
            </div>

            {/* Driver & Vehicle metrics — orphan-safe breakdown */}
            {(preview.driverMetrics.affected > 0 || preview.vehicleMetrics.affected > 0) && (
              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Metrics Cleanup (Orphan-Safe)
                </h4>
                <div className="space-y-2">
                  {preview.driverMetrics.affected > 0 && (
                    <MetricsRow
                      icon={<Users className="h-3.5 w-3.5" />}
                      label="Driver Metrics"
                      safeToDelete={preview.driverMetrics.safeToDelete}
                      shared={preview.driverMetrics.shared}
                      total={preview.driverMetrics.affected}
                    />
                  )}
                  {preview.vehicleMetrics.affected > 0 && (
                    <MetricsRow
                      icon={<Car className="h-3.5 w-3.5" />}
                      label="Vehicle Metrics"
                      safeToDelete={preview.vehicleMetrics.safeToDelete}
                      shared={preview.vehicleMetrics.shared}
                      total={preview.vehicleMetrics.affected}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Danger warning */}
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-700">
                <p className="font-semibold">This action is irreversible.</p>
                <p className="mt-0.5">
                  All {totalImpact.toLocaleString()} records will be permanently deleted.
                  Metrics for drivers/vehicles with trips in other batches will be preserved.
                </p>
              </div>
            </div>

            {/* Confirmation input */}
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5">
                Type <span className="font-mono font-bold text-rose-600">{CONFIRM_WORD}</span> to confirm
              </label>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                className="text-sm h-9"
                disabled={deleting}
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={onClose} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={confirmText !== CONFIRM_WORD || deleting}
                onClick={handleDelete}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete Batch
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function ImpactCard({
  icon,
  label,
  count,
  color,
  bold,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: 'rose' | 'red';
  bold?: boolean;
}) {
  const bgClass = color === 'red' ? 'bg-red-50 border-red-200' : 'bg-rose-50/50 border-rose-100';
  const textClass = color === 'red' ? 'text-red-700' : 'text-rose-700';
  return (
    <div className={`rounded-lg border p-2.5 ${bgClass}`}>
      <div className={`flex items-center gap-1.5 text-xs ${textClass} opacity-80`}>
        {icon}
        <span>{label}</span>
      </div>
      <p className={`text-lg mt-0.5 ${textClass} ${bold ? 'font-bold' : 'font-semibold'}`}>
        {count.toLocaleString()}
      </p>
    </div>
  );
}

function MetricsRow({
  icon,
  label,
  safeToDelete,
  shared,
  total,
}: {
  icon: React.ReactNode;
  label: string;
  safeToDelete: number;
  shared: number;
  total: number;
}) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-1.5">
        {icon}
        <span className="font-medium">{label}</span>
        <span className="text-slate-400 ml-auto">{total} affected</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1 text-rose-600">
          <ShieldAlert className="h-3 w-3" />
          {safeToDelete} will be deleted
        </span>
        {shared > 0 && (
          <span className="flex items-center gap-1 text-emerald-600">
            <ShieldCheck className="h-3 w-3" />
            {shared} kept (shared)
          </span>
        )}
      </div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
  color = 'text-slate-700',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 rounded-md border border-slate-100 px-2.5 py-1.5">
      <span className="text-slate-400">{icon}</span>
      <span className="text-slate-500 flex-1">{label}</span>
      <span className={`font-semibold ${color}`}>{value.toLocaleString()}</span>
    </div>
  );
}