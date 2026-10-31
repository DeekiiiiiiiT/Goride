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
  onPick: (side: string) => void;
}) {
  const ctx = usePartsVehicleContext(vehicleId, componentId);
  const data = buildFp4ViewModel({
    ctx: (ctx.data as Record<string, unknown> | undefined) ?? null,
  });

  return (
    <div>
      <Fp4Screen
        data={data}
        actions={{
          onBack,
          onPickFront: () => onPick("front"),
          onPickRear: () => onPick("rear"),
          onPickBoth: () => onPick("both"),
          onShowParts: (side) => onPick(side),
          onEditPartCategory: onBack,
        }}
      />
    </div>
  );
}
