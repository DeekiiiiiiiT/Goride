/**
 * Fuel Integrity → Telematics tab — Amber Connect (and other GPS providers) later.
 * v1 is a ready home; no live provider wired yet.
 */
import type { Vehicle } from '../../../types/vehicle';

export type FuelTelematicsPanelProps = {
  vehicles: Vehicle[];
  preferredVehicleId?: string | null;
  weekStart?: string | null;
  weekEnd?: string | null;
};

export function FuelTelematicsPanel({
  vehicles,
  preferredVehicleId = null,
  weekStart = null,
  weekEnd = null,
}: FuelTelematicsPanelProps) {
  const vehicle =
    (preferredVehicleId && vehicles.find((v) => v.id === preferredVehicleId)) ||
    vehicles[0] ||
    null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Telematics</h3>
      <p className="mt-1 text-sm text-slate-600">
        GPS distance, idle time, and route gaps from Amber Connect (or another provider) will
        show here for the selected week. This does not change fill flags or stop-to-stop money
        math — it backs up distance and attribution confidence.
      </p>
      <dl className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Vehicle
          </dt>
          <dd className="mt-0.5 font-medium text-slate-900">
            {vehicle ? vehicle.licensePlate || vehicle.id : 'None in scope'}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Week
          </dt>
          <dd className="mt-0.5 font-medium text-slate-900">
            {weekStart && weekEnd ? `${weekStart} – ${weekEnd}` : 'Select a period'}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:col-span-2">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Provider
          </dt>
          <dd className="mt-0.5 font-medium text-slate-900">Not connected yet</dd>
          <p className="mt-1 text-xs text-slate-500">
            Connect Amber Connect (or another telematics API) to load GPS evidence for this
            week.
          </p>
        </div>
      </dl>
    </div>
  );
}
