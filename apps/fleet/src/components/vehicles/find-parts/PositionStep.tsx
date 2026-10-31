import { Fp4Screen } from "./screens/Fp4Screen";
import { StepBar } from "./StepBar";
import { fpButtonIs } from "./findPartsButton";
import { buildFindPartsScreenData } from "./findPartsScreenData";
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
  const data = buildFindPartsScreenData({
    plate: String((ctx.data as { plate?: string } | undefined)?.plate || "—"),
    vehicleLabel: String((ctx.data as { label?: string } | undefined)?.label || "Vehicle"),
  });

  function onButton(label: string) {
    if (fpButtonIs(label, "back", "change")) {
      onBack();
      return;
    }
    if (fpButtonIs(label, "front", "show parts")) {
      onPick("front");
      return;
    }
    if (fpButtonIs(label, "rear", "back axle")) {
      onPick("rear");
      return;
    }
    if (fpButtonIs(label, "both")) {
      onPick("both");
    }
  }

  return (
    <div>
      <StepBar step={4} trail={[]} />
      <Fp4Screen actions={{ onButton }} data={data} />
    </div>
  );
}
