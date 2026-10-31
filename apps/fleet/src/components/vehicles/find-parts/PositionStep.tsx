import { useQuery } from "@tanstack/react-query";
import { api } from "../../../services/api";

export function PositionStep({
  vehicleId,
  componentId,
  onBack,
  onPick,
}: {
  vehicleId: string;
  componentId: string;
  onBack: () => void;
  onPick: (position: "front" | "rear" | "both") => void;
}) {
  const context = useQuery({
    queryKey: ["parts-vehicle-context", vehicleId, componentId],
    queryFn: () => api.partsVehicleContext(vehicleId, componentId),
    enabled: Boolean(vehicleId),
  });
  const odometer = context.data?.odometer as number | null | undefined;
  const last = context.data?.lastService as { date?: string | null; km?: number | null } | null | undefined;

  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm">
      <h2 className="font-headline-lg text-headline-lg text-on-surface">Which brakes?</h2>
      <p className="font-body-sm text-caption text-on-surface-variant mt-1">Front of vehicle</p>
      {vehicleId && (odometer != null || last?.date || last?.km != null) ? (
        <div className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
          {odometer != null ? <p>Odometer {Number(odometer).toLocaleString()} km</p> : null}
          {last?.km != null || last?.date ? <p>Last service {last?.date || ""} {last?.km != null ? `${Number(last.km).toLocaleString()} km` : ""}</p> : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md mt-space-lg">
        <button type="button" className="p-space-lg rounded-xl bg-surface-container-low text-left" onClick={() => onPick("front")}>
          <div className="font-headline-sm">Front</div>
        </button>
        <button type="button" className="p-space-lg rounded-xl bg-surface-container-low text-left" onClick={() => onPick("rear")}>
          <div className="font-headline-sm">Back (rear)</div>
        </button>
        <button type="button" className="p-space-lg rounded-xl bg-surface-container-low text-left" onClick={() => onPick("both")}>
          <div className="font-headline-sm">Both (front & back)</div>
        </button>
      </div>
      <div className="mt-space-lg flex gap-space-md">
        <button type="button" onClick={onBack}>Back to Categories</button>
      </div>
    </div>
  );
}
