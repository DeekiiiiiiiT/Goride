import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { Button } from '../../ui/button';
import type { FuelExceptionBlocker } from '../../../utils/fuelFinalizeGating';
import { FuelExceptionResolveDialog } from './FuelExceptionResolveDialog';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

function formatFillDate(ymd: string): string {
  try {
    return format(parseISO(ymd), 'MMM d, yyyy');
  } catch {
    return ymd;
  }
}

/**
 * Hard-block panel for Finalize / Data quality — lists the exact fills to fix in-place.
 */
export function FuelExceptionBlockersPanel({
  blockers,
  plateByVehicleId,
  busyId,
  onAcceptException,
  onEditFill,
}: {
  blockers: FuelExceptionBlocker[];
  plateByVehicleId?: Record<string, string>;
  busyId?: string | null;
  onAcceptException: (blocker: FuelExceptionBlocker, note: string) => void | Promise<void>;
  onEditFill?: (blocker: FuelExceptionBlocker) => void;
}) {
  const [active, setActive] = useState<FuelExceptionBlocker | null>(null);

  if (!blockers.length) return null;

  const plateFor = (b: FuelExceptionBlocker) =>
    (b.vehicleId && plateByVehicleId?.[b.vehicleId]) || b.vehicleId || 'Vehicle';

  return (
    <>
      <div
        className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-4"
        role="alert"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-rose-900">
              {blockers.length === 1
                ? '1 fill is blocking Finalize'
                : `${blockers.length} fills are blocking Finalize`}
            </p>
            <p className="text-sm text-rose-800">
              Resolve each flag here — you do not need to leave this week. Accept if the fill is
              fine, or edit the numbers if something is wrong.
            </p>
          </div>
        </div>

        <ul className="divide-y divide-rose-200/80 overflow-hidden rounded-md border border-rose-200 bg-white">
          {blockers.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="text-sm font-semibold text-slate-900">
                  {formatFillDate(b.dateYmd)} · {formatFuelMoney(b.amount)} · {b.paymentLabel}
                </div>
                <div className="text-xs text-slate-600">
                  {plateFor(b)} · {b.location}
                </div>
                <div className="text-xs text-rose-800">{b.reason}</div>
              </div>
              <Button
                type="button"
                className="min-h-11 shrink-0 bg-[#3525cd] text-white hover:bg-[#2a1ea4]"
                disabled={busyId === b.id}
                onClick={() => setActive(b)}
              >
                Resolve
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <FuelExceptionResolveDialog
        open={!!active}
        blocker={active}
        plate={active ? plateFor(active) : undefined}
        busy={!!active && busyId === active.id}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
        onAccept={async (blocker, note) => {
          await onAcceptException(blocker, note);
          setActive(null);
        }}
        onEditFill={onEditFill}
      />
    </>
  );
}
