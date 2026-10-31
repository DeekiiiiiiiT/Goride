import { useState } from "react";
import { api } from "../../../services/api";
import { Fp9Screen } from "./screens/Fp9Screen";
import { buildFp9ViewModel } from "./findPartsViewModels";
import { usePartsVehicleOptions } from "./findPartsQueries";

export function LinkCarPanel({
  canEdit,
  onBack,
  onLinked,
  onSearchByMmy,
  vehicleId,
  make,
  model,
  year,
  plate,
}: {
  canEdit: boolean;
  onBack: () => void;
  onLinked: () => void;
  onSearchByMmy: () => void;
  vehicleId: string;
  make: string;
  model: string;
  year: string;
  plate: string;
}) {
  const options = usePartsVehicleOptions(make, model);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pickedTrimId, setPickedTrimId] = useState("");
  const data = buildFp9ViewModel({ make, model, year, plate, options: options.data ?? null, selectedTrimId: pickedTrimId || undefined });

  async function linkVariant(variantId: string) {
    if (!canEdit || !vehicleId || !variantId) return;
    await api.saveVehicle({ id: vehicleId, vehicleId, variantId, catalogVariantId: variantId });
    onLinked();
  }

  const defaultTrimId = String((options.data as { versions?: Array<{ id: string }> } | undefined)?.versions?.[0]?.id || data.trims[0]?.id || "");

  return (
    <div>
      <Fp9Screen
        data={data}
        linkModalOpen={linkOpen}
        actions={{
          onBack,
          onSwitchUnit: onBack,
          onLinkNow: () => setLinkOpen(true),
          onSearchByMmy,
          onNotifyAdmin: () => {
            void api.notifyPartsAdmin({ kind: "link_vehicle", body: `Link ${make} ${model} ${year} (${plate})` }).catch(() => undefined);
          },
          onConfirmMap: () => {
            void linkVariant(pickedTrimId || defaultTrimId).catch(() => undefined);
            setLinkOpen(false);
          },
          onPickTrim: (id) => setPickedTrimId(id),
          onCloseLinkModal: () => setLinkOpen(false),
        }}
      />
    </div>
  );
}
