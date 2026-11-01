import { useState } from "react";
import { Fp4Screen } from "./screens/Fp4Screen";
import { buildFp4ViewModel } from "./findPartsViewModels";
import { usePartsVehicleContext } from "./findPartsQueries";

export function PositionStep({
  vehicleId,
  componentId,
  onBack,
  onPick,
}: {
  vehicleId: string;
  componentId: string;
  onBack: () => void;
  onPick: (position: string, side?: string) => void;
}) {
  const ctx = usePartsVehicleContext(vehicleId, componentId);
  const [selectedAxle, setSelectedAxle] = useState("front");
  const [selectedSide, setSelectedSide] = useState("both");
  const data = buildFp4ViewModel({
    ctx: (ctx.data as Record<string, unknown> | undefined) ?? null,
    selectedAxle,
    selectedSide,
  });

  return (
    <div>
      <Fp4Screen
        data={data}
        actions={{
          onBack,
          onEditPartCategory: onBack,
          onSelectAxle: setSelectedAxle,
          onSelectSide: setSelectedSide,
          onNext: () => onPick(selectedAxle, selectedSide),
        }}
      />
    </div>
  );
}
