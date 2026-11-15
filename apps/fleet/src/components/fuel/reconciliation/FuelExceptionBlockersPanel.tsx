import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { Button } from '../../ui/button';
import type { FuelExceptionBlocker } from '../../../utils/fuelFinalizeGating';
import { FuelExceptionResolveDialog } from './FuelExceptionResolveDialog';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

function formatFillDate(ymd: string): string {
  try {
    return format(parseISO(ymd), 'd MMM');
  } catch {
    return ymd;
  }
}

/** "High Fuel Consumption" → "High fuel consumption" (title-case codes read as plain words). */
export function sentenceCase(text: string): string {
  const s = String(text || '').trim();
  if (!s || !/^([A-Z][a-z]+)( [A-Z][a-z]+)+$/.test(s)) return s;
  return s.charAt(0) + s.slice(1).toLowerCase();
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
      <div className="space-y-3" role="alert" data-testid="fuel-exception-blockers">
        <p className="sr-only">
          {blockers.length === 1 ? '1 fill is blocking Finalize' : `${blockers.length} fills are blocking Finalize`}
        </p>
        <ul className="space-y-3">
          {blockers.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-4 rounded-2xl bg-[#fff1f2]/70 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ffdad6]">
                  <AlertTriangle className="h-5 w-5 text-[#ba1a1a]" aria-hidden />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-lg font-semibold text-[#0b1c30]">
                    {formatFillDate(b.dateYmd)} · {formatFuelMoney(b.amount)} · {b.paymentLabel}
                  </p>
                  <p className="text-sm text-[#47464c]">
                    {plateFor(b)} · {b.location}
                  </p>
                  <p className="text-sm font-semibold text-[#ba1a1a]">! {sentenceCase(b.reason)}</p>
                </div>
              </div>
              <Button
                type="button"
                className="h-11 min-h-11 shrink-0 rounded-xl bg-[#030213] px-5 text-white hover:bg-[#213145]"
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
