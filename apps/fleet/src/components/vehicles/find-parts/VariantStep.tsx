import { useEffect, useRef } from "react";
import { api } from "../../../services/api";
import { Fp2Markup } from "./markup/Fp2Markup";
import { StepBar } from "./StepBar";
import { labelFromFpClick } from "./findPartsDomFill";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const options = usePartsVehicleOptions(make, model);
  usePartsMyVehicles();
  useWrongFitCount();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const title = [year, make, model].filter(Boolean).join(" ");
    if (title) root.querySelectorAll("h2, .font-headline-lg").forEach((el) => {
      if (el.textContent?.includes("Fit")) el.textContent = title;
    });
  }, [make, model, year]);

  function handleFpClick(detail: { label?: string; card?: boolean }) {
    const label = labelFromFpClick(detail);
    if (label.includes("change car") || (label.includes("back") && !label.includes("axle"))) {
      onBack();
      return;
    }
    if (label.includes("continue to categories") || label.includes("continue")) {
      const versions = (options.data as { versions?: Array<{ id: string }> } | undefined)?.versions;
      onPick(versions?.[0]?.id || "any");
      return;
    }
    if (label.includes("universal catalog")) {
      onPick("any");
      return;
    }
    if (label.includes("lookup chassis")) {
      void api.requestFindPart({ kind: "chassis_lookup", make, model, year }).catch(() => undefined);
      return;
    }
    if (label.includes("ask roam")) {
      void onAskAdd();
    }
  }

  return (
    <div ref={rootRef}>
      <StepBar step={2} trail={[{ label: [year, make, model].filter(Boolean).join(" "), onPick: onBack }]} />
      <Fp2Markup onFpClick={handleFpClick} />
      <p className="font-body-sm text-caption text-on-surface-variant">{cars.length} in fleet · catalog v4.88 · jm spec</p>
    </div>
  );
}
