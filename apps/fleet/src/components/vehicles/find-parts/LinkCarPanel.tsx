import { useEffect, useRef } from "react";
import { api } from "../../../services/api";
import { Fp9Markup } from "./markup/Fp9Markup";
import { labelFromFpClick } from "./findPartsDomFill";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const options = usePartsVehicleOptions(make, model);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const title = [year, make, model].filter(Boolean).join(" ");
    if (title) root.querySelectorAll("h2").forEach((el) => { el.textContent = title; });
    if (plate) root.querySelectorAll(".font-label-plate").forEach((el) => { el.textContent = plate; });
  }, [make, model, year, plate]);

  async function linkVariant(variantId: string) {
    if (!canEdit || !vehicleId) return;
    await api.saveVehicle({ id: vehicleId, vehicleId, variantId, catalogVariantId: variantId });
    onLinked();
  }

  function handleFpClick(detail: { label?: string }) {
    const label = labelFromFpClick(detail);
    if (label.includes("switch unit") || label.includes("back")) {
      onBack();
      return;
    }
    if (label.includes("send notification")) {
      void api.notifyPartsAdmin({ kind: "link_vehicle", body: `Link ${make} ${model} ${year} (${plate})` }).catch(() => undefined);
      return;
    }
    if (label.includes("confirm & map")) {
      const versions = (options.data as { versions?: Array<{ id: string }> } | undefined)?.versions;
      void linkVariant(versions?.[0]?.id || "").catch(() => undefined);
    }
  }

  return (
    <div ref={rootRef}>
      <Fp9Markup onFpClick={handleFpClick} />
    </div>
  );
}
