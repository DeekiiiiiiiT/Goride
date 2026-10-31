import { api } from "../../../services/api";
import { Fp2Screen } from "./screens/Fp2Screen";
import { StepBar } from "./StepBar";
import { fpButtonIs } from "./findPartsButton";
import { buildFindPartsScreenData } from "./findPartsScreenData";
import { usePartsMyVehicles, usePartsVehicleOptions, useWrongFitCount } from "./findPartsQueries";
import type { FleetCar } from "./CarStep";

export function VariantStep({
  make,
  model,
  year,
  cars,
  onBack,
  onPick,
  onAskAdd,
}: {
  make: string;
  model: string;
  year: number | null;
  cars: FleetCar[];
  onBack: () => void;
  onPick: (variantId: string) => void;
  onAskAdd: () => Promise<void>;
}) {
  const options = usePartsVehicleOptions(make, model);
  usePartsMyVehicles();
  useWrongFitCount();
  const title = [year, make, model].filter(Boolean).join(" ");
  const data = buildFindPartsScreenData({ vehicleLabel: title || "Vehicle" });

  function onButton(label: string) {
    if (fpButtonIs(label, "change car", "back")) {
      onBack();
      return;
    }
    if (fpButtonIs(label, "continue to categories", "continue")) {
      const versions = (options.data as { versions?: Array<{ id: string }> } | undefined)?.versions;
      onPick(versions?.[0]?.id || "any");
      return;
    }
    if (fpButtonIs(label, "universal catalog", "universal mode")) {
      onPick("any");
      return;
    }
    if (fpButtonIs(label, "lookup chassis")) {
      void api.requestFindPart({ kind: "chassis_lookup", make, model, year: year || undefined }).catch(() => undefined);
      return;
    }
    if (fpButtonIs(label, "ask roam")) {
      void onAskAdd();
    }
  }

  return (
    <div>
      <StepBar step={2} trail={[{ label: title || "Vehicle", onPick: onBack }]} />
      <Fp2Screen actions={{ onButton }} data={data} />
      <p className="font-body-sm text-caption text-on-surface-variant">{cars.length} in fleet · catalog v4.88 · jm spec</p>
      <p className="font-body-sm text-caption text-on-surface-variant">
        Registered in the local Roam fleet inventory. Orders placed via verified trim matching include free dispatch exchange if parts fail mechanical fit verification during depot install.
      </p>
    </div>
  );
}
