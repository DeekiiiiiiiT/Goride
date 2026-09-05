import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { Separator } from '../../ui/separator';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import type { FuelEntry, FuelEntryCorrection } from '../../../types/fuel';

/**
 * Read-only detail view for a single fuel entry, including its correction history.
 * Presentational only — the parent supplies the entry, resolved labels, and the
 * correction rows (fetched via fuelService.getFuelEntryCorrections).
 */

export type FuelEntryDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: FuelEntry | null;
  /** Resolved display labels (parent already knows the maps). */
  vehicleLabel?: string;
  driverLabel?: string;
  stationLabel?: string;
  /** Append-only edit history for sealed rows. */
  corrections?: FuelEntryCorrection[];
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right text-sm text-slate-900">{value ?? '—'}</span>
    </div>
  );
}

export function FuelEntryDetailSheet({
  open,
  onOpenChange,
  entry,
  vehicleLabel,
  driverLabel,
  stationLabel,
  corrections = [],
}: FuelEntryDetailSheetProps) {
  if (!entry) return null;

  const liters = typeof entry.liters === 'number' ? entry.liters : undefined;
  const dateLabel = entry.time ? `${entry.date} ${entry.time}` : entry.date;
  const isSealed = !!entry.signature || entry.isLocked === true || entry.status === 'Finalized';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Fuel entry
            {isSealed ? (
              <Badge variant="outline" className="text-emerald-600">
                Sealed
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>{dateLabel}</DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <Row label="Vehicle" value={vehicleLabel || entry.vehicleId} />
          <Row label="Driver" value={driverLabel || entry.driverId} />
          <Row label="Station" value={stationLabel || entry.location || entry.stationAddress} />
          <Row label="Liters" value={liters != null ? `${liters.toFixed(2)} L` : '—'} />
          <Row label="Amount" value={formatFuelMoney(entry.amount)} />
          <Row
            label="Price / L"
            value={entry.pricePerLiter ? formatFuelMoney(entry.pricePerLiter) : '—'}
          />
          <Row label="Odometer" value={entry.odometer != null ? `${entry.odometer}` : '—'} />
          <Row label="Payment" value={entry.paymentSource} />
          {entry.notes ? <Row label="Notes" value={entry.notes} /> : null}
        </div>

        <Separator className="my-3" />

        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Audit</div>
          <div className="mt-1 space-y-0.5 text-sm text-slate-700">
            <div>Status: {entry.status || 'Draft'}</div>
            {entry.signedAt ? <div>Signed: {entry.signedAt}</div> : null}
            {entry.lockedAt ? <div>Locked: {entry.lockedAt}</div> : null}
            {entry.auditStatus ? <div>Audit: {entry.auditStatus}</div> : null}
          </div>
        </div>

        {corrections.length > 0 ? (
          <>
            <Separator className="my-3" />
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Correction history ({corrections.length})
              </div>
              <ul className="mt-2 space-y-2">
                {corrections.map((corr) => (
                  <li key={corr.id} className="rounded-md border border-slate-200 p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{corr.reason}</span>
                      <span className="text-[11px] text-slate-400">
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
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default FuelEntryDetailSheet;
