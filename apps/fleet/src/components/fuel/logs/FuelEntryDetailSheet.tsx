import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Separator } from '../../ui/separator';
import { Skeleton } from '../../ui/skeleton';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import type { FuelEntry, FuelEntryCorrection } from '../../../types/fuel';
import { Pencil } from 'lucide-react';

/**
 * Read-only detail view for a single fuel entry, including its correction history.
 * Presentational only — the parent supplies the entry, resolved labels, and the
 * correction rows (fetched via fuelService.getFuelEntryCorrections).
 */

export type FuelEntryDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: FuelEntry | null;
  vehicleLabel?: string;
  driverLabel?: string;
  stationLabel?: string;
  paymentLabel?: string;
  corrections?: FuelEntryCorrection[];
  correctionsLoading?: boolean;
  correctionsError?: string | null;
  canEdit?: boolean;
  onEdit?: (entry: FuelEntry) => void;
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right text-sm text-slate-900">{value ?? '—'}</span>
    </div>
  );
}

function humanizeEntryType(type?: string): string {
  if (!type) return '—';
  const map: Record<string, string> = {
    Fuel_Manual_Entry: 'Manual entry',
    Manual_Entry: 'Manual entry',
    Card_Transaction: 'Card transaction',
    Reimbursement: 'Reimbursement',
  };
  return map[type] || type.replace(/_/g, ' ');
}

export function FuelEntryDetailSheet({
  open,
  onOpenChange,
  entry,
  vehicleLabel,
  driverLabel,
  stationLabel,
  paymentLabel,
  corrections = [],
  correctionsLoading = false,
  correctionsError = null,
  canEdit = false,
  onEdit,
}: FuelEntryDetailSheetProps) {
  if (!entry) return null;

  const liters = typeof entry.liters === 'number' ? entry.liters : undefined;
  const dateLabel = entry.time ? `${entry.date} ${entry.time}` : entry.date;
  const isSealed = !!entry.signature || entry.isLocked === true || entry.status === 'Finalized';
  const editBlocked = isSealed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" aria-describedby="fuel-entry-detail-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Fuel entry
            {isSealed ? (
              <Badge variant="outline" className="text-emerald-600">
                Sealed
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription id="fuel-entry-detail-desc">{dateLabel}</DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <Row label="Vehicle" value={vehicleLabel || entry.vehicleId} />
          <Row label="Driver" value={driverLabel || entry.driverId} />
          <Row label="Station" value={stationLabel || entry.location || entry.vendor || entry.stationAddress} />
          <Row label="Liters" value={liters != null ? `${liters.toFixed(2)} L` : '—'} />
          <Row label="Amount" value={formatFuelMoney(entry.amount ?? 0)} />
          <Row
            label="Price / L"
            value={
              entry.pricePerLiter
                ? formatFuelMoney(entry.pricePerLiter)
                : entry.amount && entry.liters
                  ? formatFuelMoney(entry.amount / entry.liters)
                  : '—'
            }
          />
          <Row label="Odometer" value={entry.odometer != null ? `${Number(entry.odometer).toLocaleString()} km` : '—'} />
          <Row label="Payment" value={paymentLabel || entry.paymentSource || '—'} />
          <Row label="Entry type" value={humanizeEntryType(entry.type)} />
          {entry.notes ? <Row label="Notes" value={entry.notes} /> : null}
          {entry.metadata?.cycleId ? (
            <Row label="Full Tank id" value={String(entry.metadata.cycleId)} />
          ) : null}
        </div>

        <Separator className="my-3" />

        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Audit</div>
          <div className="mt-1 space-y-0.5 text-sm text-slate-700">
            <div>Status: {entry.status || 'Draft'}</div>
            {entry.signedAt ? <div>Signed: {entry.signedAt}</div> : null}
            {entry.lockedAt ? <div>Locked: {entry.lockedAt}</div> : null}
            {entry.metadata?.auditConfidenceScore != null ? (
              <div>Confidence: {entry.metadata.auditConfidenceScore}%</div>
            ) : null}
          </div>
        </div>

        <Separator className="my-3" />
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Correction history
            {!correctionsLoading && corrections.length > 0 ? ` (${corrections.length})` : ''}
          </div>
          {correctionsLoading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : correctionsError ? (
            <p className="mt-2 text-sm text-rose-600">{correctionsError}</p>
          ) : corrections.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No corrections recorded for this entry.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {corrections.map((corr) => (
                <li key={corr.id} className="rounded-md border border-slate-200 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{corr.reason}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {new Date(corr.created_at).toLocaleString()}
                    </span>
                  </div>
                  {corr.field_diffs && Object.keys(corr.field_diffs).length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {Object.entries(corr.field_diffs).map(([field, diff]) => (
                        <li key={field}>
                          <span className="font-medium">{field}:</span>{' '}
                          {String(diff.from ?? '—')} → {String(diff.to ?? '—')}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          {canEdit && onEdit ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={editBlocked}
              title={editBlocked ? 'Locked seal — edit disabled' : undefined}
              onClick={() => {
                onOpenChange(false);
                onEdit(entry);
              }}
            >
              <Pencil className="h-3 w-3" /> Edit this log
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FuelEntryDetailSheet;
