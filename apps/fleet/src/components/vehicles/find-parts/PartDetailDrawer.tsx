import { Fp6Screen } from "./screens/Fp6Screen";
import { addPartToOrgStock, addPartToPartsList, copyTextToClipboard } from "./findPartsActions";
import { buildFp6ViewModel } from "./findPartsViewModels";
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
  const ctx = usePartsVehicleContext(vehicleId || "", item.part?.maintenance_component_id);
  useWrongFitCount();
  const data = buildFp6ViewModel({ item, ctx: (ctx.data as Record<string, unknown> | undefined) ?? null });

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" className="absolute inset-0 bg-inverse-surface/30" aria-label="Close part details" onClick={onClose} />
      <Fp6Screen
        data={data}
        actions={{
          onClose,
          onPingRfq: onQuote,
          onAddToOrder: () => {
            void addPartToPartsList({ label: item.part?.name || "Part", partId: item.part?.id, componentId: item.part?.maintenance_component_id });
          },
          onAddToStock: () => {
            void addPartToOrgStock(item.part?.id, 1);
          },
          onUseInService: () => { if (canLog) onUseInService(); },
          onCopyCrossRef: (partNumber) => { void copyTextToClipboard(partNumber); },
        }}
      />
    </div>
  );
}
