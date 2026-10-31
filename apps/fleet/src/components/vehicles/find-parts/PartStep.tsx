import { useEffect, useRef } from "react";
import { Fp3Markup } from "./markup/Fp3Markup";
import { StepBar } from "./StepBar";
import { labelFromFpClick } from "./findPartsDomFill";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const browse = usePartsBrowse(Boolean(vehicleId));
  const symptoms = usePartsSymptoms(Boolean(vehicleId));
  usePartsVehicleContext(vehicleId);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !browse.data) return;
    const count = Number((browse.data as { total?: number }).total || 0);
    root.querySelectorAll("span, button").forEach((el) => {
      if (el.textContent?.includes("show everything")) {
        el.textContent = el.textContent.replace(/\(\d+\)/, `(${count})`);
      }
    });
  }, [browse.data]);

  function handleFpClick(detail: { label?: string }) {
    const label = labelFromFpClick(detail);
    if (label.includes("skip guided") || label.includes("show everything")) {
      onSkip();
      return;
    }
    if (label.includes("continue to position")) {
      onPick("", true, "Part");
      return;
    }
    if (label.includes("back")) {
      onBack();
      return;
    }
    const hit = (symptoms.data as { problems?: Array<{ id: string; name: string; positionAware?: boolean }> } | undefined)?.problems?.[0];
    if (label.includes("select") && hit) {
      onPick(hit.id, Boolean(hit.positionAware), hit.name);
    }
  }

  return (
    <div ref={rootRef}>
      <StepBar step={3} trail={[]} />
      <Fp3Markup onFpClick={handleFpClick} />
    </div>
  );
}
