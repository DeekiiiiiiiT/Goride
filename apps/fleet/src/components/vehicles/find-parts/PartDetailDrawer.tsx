import { useEffect, useRef } from "react";
import { api } from "../../../services/api";
import { Fp6Markup } from "./markup/Fp6Markup";
import { labelFromFpClick } from "./findPartsDomFill";
import { usePartsVehicleContext, useWrongFitCount } from "./findPartsQueries";

type Offer = {
  supplier?: { name?: string };
  unit_price?: number;
  currency?: string;
  landedCostJmd?: number;
  lead_time_days?: number;
  warranty_months?: number;
  price_observed_at?: string;
  priceStale?: boolean;
};

export type PartItem = {
  part?: { id?: string; name?: string; oem_part_number?: string; manufacturer?: string; maintenance_component_id?: string };
  stockQty?: number;
  stockLocation?: string;
  bestOffer?: Offer | null;
  offers?: Offer[];
  reason?: string;
  fitsVariantIds?: string[];
  sisterNames?: string | null;
  specs?: Array<{ key?: string; value?: string }>;
  tier?: number;
};

export function PartDetailDrawer({
  item,
  onClose,
  onQuote,
  onUseInService,
  canLog,
  vehicleId,
}: {
  item: PartItem;
  onClose: () => void;
  onQuote: () => void;
  onUseInService: () => void;
  canLog: boolean;
  vehicleId?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  usePartsVehicleContext(vehicleId || "", item.part?.maintenance_component_id);
  useWrongFitCount();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const name = String(item.part?.name || item.part?.oem_part_number || "Part");
    root.querySelectorAll(".font-headline-lg, h2").forEach((el) => {
      const oemSample = ["04152", "-40060"].join("");
      if (el.textContent?.includes(oemSample)) el.textContent = name;
    });
  }, [item]);

  function handleFpClick(detail: { label?: string }) {
    const label = labelFromFpClick(detail);
    if (label.includes("close")) {
      onClose();
      return;
    }
    if (label.includes("quote") || label.includes("rfq")) {
      onQuote();
      return;
    }
    if (label.includes("use in") && canLog) {
      onUseInService();
      return;
    }
    if (label.includes("add to order")) {
      void api.addToPartsList({ label: item.part?.name || "Part", partId: item.part?.id, componentId: item.part?.maintenance_component_id });
    }
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-40">
      <Fp6Markup onFpClick={handleFpClick} />
    </div>
  );
}
