import { api } from "../../../services/api";
import { Fp9Screen } from "./screens/Fp9Screen";
import { fpButtonIs } from "./findPartsButton";
import { buildFindPartsScreenData } from "./findPartsScreenData";
import { usePartsVehicleOptions } from "./findPartsQueries";

export function LinkCarPanel({
  canEdit,
  onBack,
  onLinked,
  vehicleId,
  make,
  model,
  year,
  plate,
}: {
  canEdit: boolean;
  onBack: () => void;
  onLinked: () => void;
  vehicleId: string;
  make: string;
  model: string;
  year: string;
  plate: string;
}) {
  const options = usePartsVehicleOptions(make, model);
  const data = buildFindPartsScreenData({
    plate,
    vehicleLabel: [year, make, model].filter(Boolean).join(" ") || "Vehicle",
  });

  async function linkVariant(variantId: string) {
    if (!canEdit || !vehicleId) return;
    await api.saveVehicle({ id: vehicleId, vehicleId, variantId, catalogVariantId: variantId });
    onLinked();
  }

  function onButton(label: string) {
    if (fpButtonIs(label, "switch unit", "back")) {
      onBack();
      return;
    }
    if (fpButtonIs(label, "send notification")) {
      void api.notifyPartsAdmin({ kind: "link_vehicle", body: `Link ${make} ${model} ${year} (${plate})` }).catch(() => undefined);
      return;
    }
    if (fpButtonIs(label, "confirm & map", "select")) {
      const versions = (options.data as { versions?: Array<{ id: string }> } | undefined)?.versions;
      void linkVariant(versions?.[0]?.id || "").catch(() => undefined);
    }
  }

  return (
    <div>
      <Fp9Screen actions={{ onButton }} data={data} />
    </div>
  );
}
