import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../ui/utils';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { resolveFuelEntrySource } from '../../../utils/fuelEntrySource';
import type { FuelEntry, FuelEntryCorrection } from '../../../types/fuel';
import {
  AlertTriangle,
  Banknote,
  Clock,
  CreditCard,
  FileText,
  Fuel,
  Gauge,
  Hash,
  History,
  HelpCircle,
  Link2,
  MapPin,
  Pencil,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  entrySourceLabel,
  formatFuelEntryTime,
  formatFuelLogDate,
  humanizeEntryType,
} from './fuelLogDisplay';

/**
 * Read-only detail view for a single fuel entry (classic Fuel Log Details overlay),
 * including correction history. Presentational only — parent supplies labels + data.
 */

export type FuelEntryDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: FuelEntry | null;
  vehicleLabel?: string;
  driverLabel?: string;
  stationLabel?: string;
  paymentLabel?: string;
  prevOdometer?: number | null;
  tankCapacity?: number;
  corrections?: FuelEntryCorrection[];
  correctionsLoading?: boolean;
  correctionsError?: string | null;
  canEdit?: boolean;
  onEdit?: (entry: FuelEntry) => void;
};

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {icon}
      <span className="w-20 shrink-0 text-xs text-slate-500">{label}</span>
      <div className="flex-1 text-sm">{value}</div>
    </div>
  );
}

function paymentTypeIcon(label: string) {
  switch (label) {
    case 'Gas Card':
      return <CreditCard className="h-4 w-4 text-indigo-500" />;
    case 'Driver Cash':
      return <Banknote className="h-4 w-4 text-emerald-500" />;
    case 'RideShare Cash':
      return <Banknote className="h-4 w-4 text-orange-500" />;
    case 'Petty Cash':
      return <Banknote className="h-4 w-4 text-amber-500" />;
    case 'Reimbursement':
      return <HelpCircle className="h-4 w-4 text-slate-400" />;
    default:
      return <Fuel className="h-4 w-4 text-slate-500" />;
  }
}

export function FuelEntryDetailSheet({
  open,
  onOpenChange,
  entry,
  vehicleLabel,
  driverLabel,
  stationLabel,
  paymentLabel,
  prevOdometer = null,
  tankCapacity = 40,
  corrections = [],
  correctionsLoading = false,
  correctionsError = null,
  canEdit = false,
  onEdit,
}: FuelEntryDetailSheetProps) {
  if (!entry) return null;

  const liters = typeof entry.liters === 'number' ? entry.liters : 0;
  const amount = entry.amount ?? 0;
  const pricePerLiter =
    entry.pricePerLiter || (liters > 0 && amount ? amount / liters : 0);
  const fillPct = Math.min(100, (liters / (tankCapacity || 40)) * 100);
  const confidenceScore = entry.metadata?.auditConfidenceScore;
  const locationStatus = entry.metadata?.locationStatus || entry.locationStatus;
  const src = resolveFuelEntrySource(entry);
  const srcLabel = entrySourceLabel(src);
  const curOdo = Number(entry.odometer) || 0;
  const delta = prevOdometer != null ? Math.abs(curOdo - prevOdometer) : null;
  const isRegression = prevOdometer != null ? curOdo < prevOdometer : false;
  const paidBy = paymentLabel || '—';
  const stationName =
    stationLabel ||
    entry.vendor ||
    entry.metadata?.stationName ||
    'Unknown';
  const entryTime = formatFuelEntryTime(entry);
  const isSealed = !!entry.signature || entry.isLocked === true || entry.status === 'Finalized';
  const editBlocked = isSealed;
  const fuelType =
    entry.fuelType ||
    (entry.metadata as { jaaFuelType?: string } | undefined)?.jaaFuelType ||
    '—';

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-h-[90vh] gap-0 overflow-hidden border-0 p-0 sm:max-w-lg"
        aria-describedby="fuel-entry-detail-desc"
      >
        <DialogTitle className="sr-only">Fuel Log Details</DialogTitle>
        <DialogDescription id="fuel-entry-detail-desc" className="sr-only">
          {formatFuelLogDate(entry.date)}
          {entryTime ? ` at ${entryTime}` : ''}
        </DialogDescription>

        {/* Header — classic dark navy strip */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2">
                <Fuel className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Fuel Log Details</h3>
                <p className="text-xs text-slate-300">
                  {formatFuelLogDate(entry.date)}
                  {entryTime ? ` at ${entryTime}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {src !== 'driver-portal' && (
                <Badge
                  variant="outline"
                  className={cn('border text-[9px] font-bold', srcLabel.color)}
                >
                  {srcLabel.label}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/70 hover:bg-white/10 hover:text-white"
                onClick={close}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto p-5">
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                Amount
              </p>
              <p className="text-lg font-bold text-emerald-700">{formatFuelMoney(amount)}</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                Volume
              </p>
              <p className="text-lg font-bold text-blue-700">{liters.toFixed(2)} L</p>
              <p className="text-[9px] text-blue-500">{fillPct.toFixed(0)}% of tank</p>
            </div>
            <div className="rounded-lg border border-violet-100 bg-violet-50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">
                Price/L
              </p>
              <p className="text-lg font-bold text-violet-700">
                {formatFuelMoney(pricePerLiter)}
              </p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Fuel type
              </p>
              <p className="break-words text-sm font-bold leading-tight text-amber-900">
                {String(fuelType)}
              </p>
            </div>
          </div>

          {/* Detail rows */}
          <div className="space-y-1 divide-y divide-slate-100">
            <DetailRow
              icon={<MapPin className="h-3.5 w-3.5 text-slate-400" />}
              label="Station"
              value={
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-800">{stationName}</span>
                  {locationStatus === 'verified' && (
                    <ShieldCheck className="h-3 w-3 text-blue-500" />
                  )}
                  {locationStatus === 'learnt' && (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                </div>
              }
            />
            {entry.location ? (
              <DetailRow
                icon={<MapPin className="h-3.5 w-3.5 text-slate-400" />}
                label="Address"
                value={<span className="text-xs text-slate-600">{entry.location}</span>}
              />
            ) : null}
            <DetailRow
              icon={<Fuel className="h-3.5 w-3.5 text-slate-400" />}
              label="Vehicle"
              value={
                <span className="font-medium">{vehicleLabel || entry.vehicleId || '—'}</span>
              }
            />
            <DetailRow
              icon={<Hash className="h-3.5 w-3.5 text-slate-400" />}
              label="Driver"
              value={
                <span className="font-medium">{driverLabel || entry.driverId || '—'}</span>
              }
            />
            <DetailRow
              icon={<CreditCard className="h-3.5 w-3.5 text-slate-400" />}
              label="Paid By"
              value={
                <div className="flex items-center gap-2">
                  {paymentTypeIcon(paidBy)}
                  <span className="text-xs">{paidBy}</span>
                </div>
              }
            />
            <DetailRow
              icon={<Gauge className="h-3.5 w-3.5 text-slate-400" />}
              label="Odometer"
              value={
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">
                    {curOdo > 0 ? curOdo.toLocaleString() : '—'} km
                  </span>
                  {delta != null ? (
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        isRegression
                          ? 'bg-red-50 text-red-600'
                          : 'bg-green-50 text-green-600',
                      )}
                    >
                      {isRegression ? `↓ ${delta.toLocaleString()}` : `↑ +${delta.toLocaleString()}`}
                    </span>
                  ) : null}
                </div>
              }
            />
            {prevOdometer != null ? (
              <DetailRow
                icon={<History className="h-3.5 w-3.5 text-slate-400" />}
                label="Prev Odo"
                value={
                  <span className="font-mono text-xs text-slate-500">
                    {prevOdometer.toLocaleString()} km
                  </span>
                }
              />
            ) : null}
            <DetailRow
              icon={<Clock className="h-3.5 w-3.5 text-slate-400" />}
              label="Entry Type"
              value={
                <span className="text-xs">
                  {humanizeEntryType(entry.type) || entry.type || 'Unknown'}
                </span>
              }
            />
            {entry.entryMode ? (
              <DetailRow
                icon={<Link2 className="h-3.5 w-3.5 text-slate-400" />}
                label="Entry Mode"
                value={
                  <Badge variant="outline" className="text-[9px]">
                    {entry.entryMode}
                  </Badge>
                }
              />
            ) : null}
            {entry.metadata?.cycleId ? (
              <DetailRow
                icon={<Link2 className="h-3.5 w-3.5 text-slate-400" />}
                label="Full Tank"
                value={
                  <span className="font-mono text-[10px] text-slate-600">
                    {String(entry.metadata.cycleId)}
                  </span>
                }
              />
            ) : null}
          </div>

          {/* Audit confidence */}
          {confidenceScore !== undefined && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Audit Confidence
                </span>
                <Badge
                  className={cn(
                    'border-none text-[9px]',
                    confidenceScore >= 90
                      ? 'bg-emerald-500 text-white'
                      : confidenceScore >= 70
                        ? 'bg-blue-500 text-white'
                        : 'bg-amber-500 text-white',
                  )}
                >
                  {confidenceScore}%
                </Badge>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    confidenceScore >= 90
                      ? 'bg-emerald-500'
                      : confidenceScore >= 70
                        ? 'bg-blue-500'
                        : 'bg-amber-500',
                  )}
                  style={{ width: `${confidenceScore}%` }}
                />
              </div>
              {entry.metadata?.auditConfidenceBreakdown && (
                <div className="mt-2 grid grid-cols-5 gap-2 text-center">
                  {[
                    {
                      label: 'GPS',
                      val: entry.metadata.auditConfidenceBreakdown.gps,
                      max: 30,
                    },
                    {
                      label: 'Prox',
                      val: entry.metadata.auditConfidenceBreakdown.gps_bonus,
                      max: 5,
                    },
                    {
                      label: 'Crypto',
                      val: entry.metadata.auditConfidenceBreakdown.crypto,
                      max: 25,
                    },
                    {
                      label: 'Phys',
                      val: entry.metadata.auditConfidenceBreakdown.physical,
                      max: 25,
                    },
                    {
                      label: 'Behav',
                      val: entry.metadata.auditConfidenceBreakdown.behavioral,
                      max: 20,
                    },
                  ].map((b) => (
                    <div key={b.label} className="text-[9px]">
                      <span className="text-slate-400">{b.label}</span>
                      <p className="font-bold text-slate-700">
                        {b.val ?? 0}/{b.max}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {entry.notes ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                  Notes
                </span>
              </div>
              <p className="text-xs text-slate-700">{entry.notes}</p>
            </div>
          ) : null}

          {/* Correction history (kept from newer sheet) */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Correction history
              {!correctionsLoading && corrections.length > 0
                ? ` (${corrections.length})`
                : ''}
            </div>
            {correctionsLoading ? (
              <div className="mt-2 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : correctionsError ? (
              <p className="mt-2 text-sm text-rose-600">{correctionsError}</p>
            ) : corrections.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No corrections recorded for this entry.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {corrections.map((corr) => (
                  <li
                    key={corr.id}
                    className="rounded-md border border-slate-200 p-2 text-sm"
                  >
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

          {/* ID footer */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="max-w-[240px] truncate font-mono text-[9px] text-slate-400">
              ID: {entry.id}
            </span>
            {entry.isLocked ? (
              <div className="flex items-center gap-1 text-emerald-600">
                <ShieldCheck className="h-3 w-3" />
                <span className="text-[9px] font-bold">LOCKED</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 p-4">
          {canEdit && onEdit ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={editBlocked}
              title={editBlocked ? 'Locked seal — edit disabled' : undefined}
              onClick={() => {
                close();
                onEdit(entry);
              }}
            >
              <Pencil className="h-3 w-3" /> Edit This Log
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" size="sm" className="text-xs" onClick={close}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FuelEntryDetailSheet;
