import { Fp6Screen } from "./screens/Fp6Screen";
import { copyTextToClipboard } from "./findPartsActions";
import { buildFp6ViewModel } from "./findPartsViewModels";
import { usePartsVehicleContext } from "./findPartsQueries";
import { api } from "../../../services/api";

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
  onUseInService,
  canLog,
  vehicleId,
}: {
  item: PartItem;
  onClose: () => void;
  onUseInService: () => void;
  canLog: boolean;
  vehicleId?: string;
}) {
  const ctx = usePartsVehicleContext(vehicleId || "", item.part?.maintenance_component_id);
  const data = buildFp6ViewModel({ item, ctx: (ctx.data as Record<string, unknown> | undefined) ?? null });

  function reportNoFit() {
    const partId = item.part?.id;
    if (!partId) return;
    void api.submitPartFitFeedback({
      partId,
      outcome: "no_fit",
      vehicleId: vehicleId || undefined,
    }).catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" className="absolute inset-0 bg-inverse-surface/30" aria-label="Close part details" onClick={onClose} />
      <Fp6Screen
        data={data}
        actions={{
          onClose: () => onClose(),
          onReportNoFit: reportNoFit,
          onUseInService: () => { if (canLog) onUseInService(); },
          onCopyCrossRef: (partNumber) => { void copyTextToClipboard(partNumber); },
        }}
      />
    </div>
  );
}
