/**
 * Gap attribution for Unexplained step — turn a number into next actions.
 */
import { unexplainedLabel } from '../../../utils/fuelReconGlossary';
import type { FuelEntry } from '../../../types/fuel';
import type { Trip } from '../../../types/data';
import { isEntryInInclusiveYmdRange } from '../../../utils/fuelWeekPeriod';

export type FuelGapAttributionProps = {
  vehicleId: string;
  plate: string;
  misc: number;
  weekStart: string;
  weekEnd: string;
  fuelEntries: FuelEntry[];
  trips?: Trip[];
  /** Optional liters / efficiency from live report for km estimate */
  estimateLiters?: number;
  estimateKmPerLiter?: number;
};

export function FuelGapAttribution({
  vehicleId,
  plate,
  misc,
  weekStart,
  weekEnd,
  fuelEntries,
  trips = [],
  estimateLiters,
  estimateKmPerLiter,
}: FuelGapAttributionProps) {
  const weekFills = fuelEntries.filter(
    (e) =>
      e.vehicleId === vehicleId && isEntryInInclusiveYmdRange(e.date, weekStart, weekEnd),
  );
  const missingOdoFills = weekFills.filter(
    (e) => e.odometer == null || Number(e.odometer) <= 0,
  ).length;
  const weekTrips = trips.filter(
    (t) =>
      t.vehicleId === vehicleId && isEntryInInclusiveYmdRange(t.date, weekStart, weekEnd),
  );
  const missingOdoTrips = weekTrips.filter(
    (t) => !(t as any).odometerEnd && !(t as any).endOdometer,
  ).length;

  const parts: string[] = [];
  if (missingOdoFills > 0) {
    parts.push(`${missingOdoFills} fill(s) missing odometer`);
  }
  if (missingOdoTrips > 0) {
    parts.push(`${missingOdoTrips} trip(s) missing odometer`);
  }
  if (
    estimateLiters &&
    estimateLiters > 0 &&
    estimateKmPerLiter &&
    estimateKmPerLiter > 0 &&
    misc > 0
  ) {
    const km = Math.round(estimateLiters * estimateKmPerLiter);
    parts.push(`≈ ${km} km at rolling efficiency`);
  }
  if (parts.length === 0) {
    parts.push('Review stop-to-stop gaps or accept on this device');
  }

  return (
    <p className="mt-1 text-xs text-slate-500">
      <span className="font-medium text-slate-700">
        {plate} · {unexplainedLabel(misc)}
      </span>
      {' — '}
      {parts.join('; ')}
    </p>
  );
}
