/**
 * Vehicle evidence for Data quality — flagged fills only (deal-with list).
 */
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet';
import { Badge } from '../../ui/badge';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import type { FuelEntry } from '../../../types/fuel';
import type { FuelFlagDeskRow } from '../../../utils/fuelFillFlagClassify';
import {
  fuelEntrySortMs,
  formatFuelEntryTime,
  formatFuelLogDate,
  humanizeEntryType,
} from '../logs/fuelLogDisplay';

export function isPendingFuelLog(e: FuelEntry): boolean {
  return e.reconciliationStatus === 'Pending';
}

export function pendingFuelLogsForVehicle(
  entries: FuelEntry[],
  vehicleId: string,
): FuelEntry[] {
  const forVehicle = entries.filter((e) => e.vehicleId === vehicleId);
  const pending = forVehicle.filter(isPendingFuelLog);
  const list = pending.length > 0 ? pending : forVehicle;
  return [...list].sort((a, b) => fuelEntrySortMs(b) - fuelEntrySortMs(a));
}

export function FuelVehicleEvidenceSheet({
  open,
  onOpenChange,
  plate,
  driverName,
  flaggedRows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plate: string;
  driverName: string;
  flaggedRows: FuelFlagDeskRow[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Evidence · {plate || 'Vehicle'}</SheetTitle>
          <SheetDescription>
            {flaggedRows.length > 0
              ? `${flaggedRows.length} flagged fill${flaggedRows.length === 1 ? '' : 's'} for ${driverName}`
              : `No flagged fills for ${driverName}`}
            . Close this panel to stay on reconciliation.
          </SheetDescription>
        </SheetHeader>

        {flaggedRows.length === 0 ? (
          <p className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            No flagged fills for this vehicle in the week window.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Flagged fills
              </h4>
              <ul className="space-y-3">
                {flaggedRows.map((r) => (
                  <li
                    key={r.entryId}
                    className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatFuelLogDate(r.dateYmd)}
                          {formatFuelEntryTime(r.entry) ? (
                            <span className="ml-1 font-normal text-slate-500">
                              · {formatFuelEntryTime(r.entry)}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {humanizeEntryType(r.entry.type)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">
                        {formatFuelMoney(Number(r.entry.amount) || 0)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.reasons.map((reason) => (
                        <Badge
                          key={`${reason.code}|${reason.label}`}
                          variant="outline"
                          className={`text-[10px] font-medium ${
                            reason.resolved
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : reason.severity === 'critical'
                                ? 'border-rose-200 bg-rose-50 text-rose-800'
                                : 'border-amber-200 bg-amber-50 text-amber-900'
                          }`}
                        >
                          {reason.label}
                          {reason.resolved ? ' · resolved' : ''}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** @deprecated use FuelVehicleEvidenceSheet */
export const FuelPendingLogsSheet = FuelVehicleEvidenceSheet;
