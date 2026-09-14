import { AlertTriangle, MapPin } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { Button } from '../../ui/button';
import type { FuelUnapprovedTxBlocker } from '../../../utils/fuelFinalizeGating';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

function formatFillDate(ymd: string): string {
  try {
    return format(parseISO(ymd), 'MMM d, yyyy');
  } catch {
    return ymd;
  }
}

function holdLabel(reason: FuelUnapprovedTxBlocker['holdReason']): string {
  if (reason === 'log_review') return 'Needs odometer (Log Review)';
  if (reason === 'station_hold') return 'Awaiting station match';
  return 'Awaiting approval';
}

function BlockerList({ blockers }: { blockers: FuelUnapprovedTxBlocker[] }) {
  return (
    <ul className="divide-y divide-rose-200/80 overflow-hidden rounded-md border border-rose-200 bg-white">
      {blockers.map((b) => (
        <li
          key={b.id}
          className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm font-semibold text-slate-900">
              {formatFillDate(b.dateYmd)} · {formatFuelMoney(Math.abs(b.amount))}
            </div>
            <div className="text-xs text-slate-600">
              {b.driverName || b.driverId || 'Driver'}
              {b.vehiclePlate ? ` · ${b.vehiclePlate}` : b.vehicleId ? ` · ${b.vehicleId}` : ''}
            </div>
            <div className="text-xs text-rose-800">{holdLabel(b.holdReason)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Hard-block panel — Pending fuel reimbursements in the week being closed.
 * Splits actionable Review Queue work from station holds (R2).
 */
export function FuelUnapprovedTxBlockersPanel({
  blockers,
  onOpenReviewQueue,
}: {
  blockers: FuelUnapprovedTxBlocker[];
  onOpenReviewQueue?: () => void;
}) {
  if (!blockers.length) return null;

  const actionable = blockers.filter((b) => b.holdReason !== 'station_hold');
  const stationHolds = blockers.filter((b) => b.holdReason === 'station_hold');

  return (
    <div
      className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-4"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-rose-900">
            {blockers.length === 1
              ? '1 fuel receipt is blocking Finalize'
              : `${blockers.length} fuel receipts are blocking Finalize`}
          </p>
          <p className="text-sm text-rose-800">
            Resolve every Pending reimbursement in this week before locking. They have no posted
            fill-up yet.
          </p>
        </div>
      </div>

      {actionable.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-900">
            Needs your action ({actionable.length})
          </p>
          <BlockerList blockers={actionable} />
          {onOpenReviewQueue ? (
            <Button
              type="button"
              className="min-h-11 w-full bg-[#3525cd] text-white hover:bg-[#2a1ea4] sm:w-auto"
              onClick={onOpenReviewQueue}
            >
              Open Review Queue
            </Button>
          ) : null}
        </div>
      )}

      {stationHolds.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-900 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Awaiting station match ({stationHolds.length})
          </p>
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Approve/reject stay disabled until Roam matches these to a verified station in{' '}
            <span className="font-semibold">Station Database</span>. Review Queue cannot clear them.
          </div>
          <BlockerList blockers={stationHolds} />
        </div>
      )}
    </div>
  );
}
