import { useMemo, useState } from "react";
import { formatPartsFitParam } from "@roam/types/partsFitParam";
import { Fp4Screen } from "./screens/Fp4Screen";
import { buildFp4ViewModel } from "./findPartsViewModels";
import { usePartsBrowse, usePartsComponentFitHints, usePartsVehicleContext } from "./findPartsQueries";
import { partNameForComponent } from "./findPartsRoute";
import type { ComponentFitHints } from "./findPartsFitHints";

export function PositionStep({
  vehicleId,
  componentId,
  partName,
  onBack,
  onPick,
}: {
  vehicleId: string;
  componentId: string;
  partName?: string;
  onBack: () => void;
  onPick: (position: string, side?: string, fit?: string) => void;
}) {
  const ctx = usePartsVehicleContext(vehicleId, componentId);
  const variantId = String((ctx.data as { variantId?: string | null } | undefined)?.variantId || "");
  const browse = usePartsBrowse(variantId || undefined, Boolean(variantId));
  const hintsQuery = usePartsComponentFitHints(variantId, componentId, Boolean(variantId && componentId));
  const [selectedAxle, setSelectedAxle] = useState("both");
  const [selectedSide, setSelectedSide] = useState("both");
  const [selectedFrontSide, setSelectedFrontSide] = useState("both");
  const [selectedRearSide, setSelectedRearSide] = useState("both");

  const resolvedPartName = useMemo(() => {
    if (partName?.trim()) return partName;
    return partNameForComponent(browse.data as Parameters<typeof partNameForComponent>[0], componentId);
  }, [partName, browse.data, componentId]);

  const fitHints = (hintsQuery.data || null) as ComponentFitHints | null;

  const data = buildFp4ViewModel({
    ctx: (ctx.data as Record<string, unknown> | undefined) ?? null,
    partName: resolvedPartName,
    fitHints,
    selectedAxle,
    selectedSide,
    selectedFrontSide,
    selectedRearSide,
  });

  function buildFitParam(): string {
    if (selectedAxle === "both") {
      return formatPartsFitParam([
        { axle: "front", side: selectedFrontSide as "left" | "right" | "both" },
        { axle: "rear", side: selectedRearSide as "left" | "right" | "both" },
      ]);
    }
    return formatPartsFitParam([{
      axle: selectedAxle === "rear" ? "rear" : "front",
      side: selectedSide as "left" | "right" | "both",
    }]);
  }

  function advance() {
    const fit = buildFitParam();
    if (selectedAxle === "both") {
      onPick("both", "both", fit);
      return;
    }
    onPick(selectedAxle, selectedSide, fit);
  }

  return (
    <div>
      <Fp4Screen
        data={data}
        actions={{
          onBack,
          onEditPartCategory: onBack,
          onSelectAxle: (id) => setSelectedAxle(id),
          onSelectSide: (id) => setSelectedSide(id),
          onSelectFrontSide: setSelectedFrontSide,
          onSelectRearSide: setSelectedRearSide,
          onNext: advance,
        }}
      />
    </div>
  );
}
