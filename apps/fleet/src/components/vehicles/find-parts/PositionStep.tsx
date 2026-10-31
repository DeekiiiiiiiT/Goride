import { useEffect, useRef } from "react";
import { Fp4Markup } from "./markup/Fp4Markup";
import { StepBar } from "./StepBar";
import { labelFromFpClick } from "./findPartsDomFill";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const ctx = usePartsVehicleContext(vehicleId, componentId);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !ctx.data) return;
    const odo = String((ctx.data as { odometer?: number }).odometer ?? "None yet");
    root.querySelectorAll("span, div").forEach((el) => {
      if (el.textContent?.includes("Current ODO")) {
        el.textContent = el.textContent.replace(/[\d,]+ km/, `${odo} km`);
      }
    });
  }, [ctx.data]);

  function handleFpClick(detail: { label?: string }) {
    const label = labelFromFpClick(detail);
    if (label.includes("back") && !label.includes("axle")) {
      onBack();
      return;
    }
    if (label.includes("front")) onPick("front");
    else if (label.includes("rear") || label.includes("back axle")) onPick("rear");
    else if (label.includes("show parts")) onPick("front");
  }

  return (
    <div ref={rootRef}>
      <StepBar step={4} trail={[]} />
      <Fp4Markup onFpClick={handleFpClick} />
    </div>
  );
}
