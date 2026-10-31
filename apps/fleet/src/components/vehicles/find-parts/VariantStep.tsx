import { api } from "../../../services/api";
import { Fp2Screen } from "./screens/Fp2Screen";
import { buildFp2ViewModel } from "./findPartsViewModels";
import { usePartsMyVehicles, usePartsVehicleOptions } from "./findPartsQueries";
import type { FleetCar } from "./CarStep";
import type { PartsMyVehicleRow } from "./findPartsTypes";

export function VariantStep({
  make,
  model,
  year,
  cars,
  plate,
  onBack,
  onPick,
  onAskAdd,
}: {
  make: string;
  model: string;
  year: number | null;
  cars: FleetCar[];
  plate?: string;
  onBack: () => void;
  onPick: (variantId: string) => void;
  onAskAdd: () => Promise<void>;
}) {
  const options = usePartsVehicleOptions(make, model);
  const myVehicles = usePartsMyVehicles();
  const title = [year, make, model].filter(Boolean).join(" ");
  const fleetRows = (myVehicles.data?.items || []) as PartsMyVehicleRow[];
  const matchedRow = fleetRows.find(
    (row) =>
      String(row.make || "").toLowerCase() === make.toLowerCase()
      && String(row.model || "").toLowerCase() === model.toLowerCase(),
  );
  const vehiclePhotoUrl =
    String((matchedRow as { photo_url?: string; vehicle_photo_url?: string } | undefined)?.photo_url
      || (matchedRow as { vehicle_photo_url?: string } | undefined)?.vehicle_photo_url
      || "");
  const data = buildFp2ViewModel({
    make,
    model,
    year,
    plate: plate || cars[0]?.licensePlate,
    options: options.data ?? null,
    fleetRows,
    vehiclePhotoUrl: vehiclePhotoUrl || null,
  });

  return (
    <div>
      <Fp2Screen
        data={data}
        actions={{
          onBack,
          onContinue: () => {
            const versions = (options.data as { versions?: Array<{ id: string }> } | undefined)?.versions;
            onPick(versions?.[0]?.id || "any");
          },
          onPickVersion: (id) => onPick(id),
          onUniversalMode: () => onPick("any"),
          onLookupChassis: () => {
            void api.requestFindPart({ kind: "chassis_lookup", make, model, year: year || undefined }).catch(() => undefined);
          },
          onChangeCar: onBack,
          onAskRoam: () => { void onAskAdd(); },
        }}
      />
      <p className="font-body-sm text-caption text-on-surface-variant">{cars.length} in fleet · catalog v4.88 · jm spec</p>
      <p className="font-body-sm text-caption text-on-surface-variant">
        Registered in the local Roam fleet inventory. Orders placed via verified trim matching include free dispatch exchange if parts fail mechanical fit verification during depot install.
      </p>
    </div>
  );
}
