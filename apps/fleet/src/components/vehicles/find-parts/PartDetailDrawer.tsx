import { api } from "../../../services/api";
import { Fp6Screen } from "./screens/Fp6Screen";
import { fpButtonIs } from "./findPartsButton";
import { buildFindPartsScreenData } from "./findPartsScreenData";
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
  usePartsVehicleContext(vehicleId || "", item.part?.maintenance_component_id);
  useWrongFitCount();
  const offer = item.bestOffer || item.offers?.[0];
  const data = buildFindPartsScreenData({
    partNumber: String(item.part?.oem_part_number || item.part?.name || "—"),
    priceJmd: offer?.landedCostJmd ?? null,
    vehicleLabel: String(item.part?.name || "Part"),
  });

  function onButton(label: string) {
    if (fpButtonIs(label, "close")) {
      onClose();
      return;
    }
    if (fpButtonIs(label, "quote", "rfq", "ping rfq")) {
      onQuote();
      return;
    }
    if (fpButtonIs(label, "use in") && canLog) {
      onUseInService();
      return;
    }
    if (fpButtonIs(label, "add to order")) {
      void api.addToPartsList({ label: item.part?.name || "Part", partId: item.part?.id, componentId: item.part?.maintenance_component_id });
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <Fp6Screen actions={{ onButton }} data={data} />
    </div>
  );
}
