import { Fp3Screen } from "./screens/Fp3Screen";
import { StepBar } from "./StepBar";
import { fpButtonIs } from "./findPartsButton";
import { buildFindPartsScreenData } from "./findPartsScreenData";
import { usePartsBrowse, usePartsSymptoms, usePartsVehicleContext } from "./findPartsQueries";

export function PartStep({
  vehicleId,
  onBack,
  onPick,
  onSkip,
}: {
  vehicleId: string;
  onBack: () => void;
  onPick: (componentId: string, positionAware: boolean, name: string) => void;
  onSkip: () => void;
}) {
  const browse = usePartsBrowse(Boolean(vehicleId));
  const symptoms = usePartsSymptoms(Boolean(vehicleId));
  const ctx = usePartsVehicleContext(vehicleId);
  const data = buildFindPartsScreenData({
    plate: String((ctx.data as { plate?: string } | undefined)?.plate || "—"),
    vehicleLabel: String((ctx.data as { label?: string } | undefined)?.label || "Vehicle"),
  });

  function onButton(label: string) {
    if (fpButtonIs(label, "skip guided", "show everything")) {
      onSkip();
      return;
    }
    if (fpButtonIs(label, "continue to position")) {
      onPick("", true, "Part");
      return;
    }
    if (fpButtonIs(label, "back")) {
      onBack();
      return;
    }
    const hit = (symptoms.data as { problems?: Array<{ id: string; name: string; positionAware?: boolean }> } | undefined)?.problems?.[0];
    if (fpButtonIs(label, "select") && hit) {
      onPick(hit.id, Boolean(hit.positionAware), hit.name);
    }
  }

  const browseTotal = Number((browse.data as { total?: number }).total || 0);

  return (
    <div>
      <StepBar step={3} trail={[]} />
      <p className="sr-only">{browseTotal} browse items</p>
      <Fp3Screen actions={{ onButton }} data={data} />
    </div>
  );
}
