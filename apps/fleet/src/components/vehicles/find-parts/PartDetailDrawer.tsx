import { useState } from "react";
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
  onQuote,
  onUseInService,
  canLog,
}: {
  item: PartItem;
  onClose: () => void;
  onQuote: () => void;
  onUseInService: () => void;
  canLog: boolean;
}) {
  const [qty, setQty] = useState(1);
  const [stockNote, setStockNote] = useState("");
  const offers = item.offers?.length ? item.offers : item.bestOffer ? [item.bestOffer] : [];
  const newest = offers.map((row) => row.price_observed_at).filter(Boolean).sort().at(-1);

  async function addStock() {
    if (!item.part?.id || qty < 1) return;
    await api.setOrgPartStock({ partId: item.part.id, qty });
    setStockNote(`On your shelf: ${qty}`);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-inverse-surface/30">
      <aside className="find-parts-sheet bg-surface-container-lowest w-full max-w-lg h-full overflow-y-auto p-space-xl shadow-sm">
        <div className="flex items-start justify-between gap-space-md">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">{item.part?.name || item.part?.oem_part_number}</h2>
            <p className="font-label-code text-caption text-on-surface-variant">{item.part?.oem_part_number}</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        {item.stockQty ? <p className="mt-space-md">On your shelf — {item.stockQty}{item.stockLocation ? ` · ${item.stockLocation}` : ""}</p> : null}
        {item.reason ? (
          <div className="mt-space-lg">
            <h3 className="font-headline-sm text-headline-sm">Why it fits this chassis</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{item.reason}</p>
          </div>
        ) : null}
        <h3 className="font-headline-sm text-headline-sm mt-space-lg">Prices from suppliers</h3>
        {newest ? <p className="font-caption text-caption text-on-surface-variant">Updated {newest}</p> : null}
        <div className="mt-space-sm overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="font-caption text-caption text-on-surface-variant">
                <th className="py-2">Supplier</th>
                <th>Raw</th>
                <th>Landed</th>
                <th>Lead / Wty</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer, index) => (
                <tr key={`${offer.supplier?.name || "offer"}-${index}`}>
                  <td className="py-2">{offer.supplier?.name || "Supplier"}</td>
                  <td>{offer.unit_price != null ? `${offer.currency || ""} ${offer.unit_price}` : "—"}</td>
                  <td>{offer.landedCostJmd ? `J$ ${Number(offer.landedCostJmd).toLocaleString()}` : "No price yet"}</td>
                  <td>{offer.lead_time_days ?? "—"} days{offer.warranty_months != null ? ` · ${offer.warranty_months} mo` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="mt-space-sm underline" onClick={onQuote}>Request quote</button>
        {item.fitsVariantIds?.length ? (
          <div className="mt-space-lg">
            <h3 className="font-headline-sm text-headline-sm">Fits these versions</h3>
            <p className="font-body-sm text-caption">{item.fitsVariantIds.length} versions</p>
          </div>
        ) : null}
        {item.sisterNames ? (
          <div className="mt-space-lg">
            <h3 className="font-headline-sm text-headline-sm">Same part, other numbers</h3>
            <p>{item.sisterNames}</p>
          </div>
        ) : null}
        <div className="mt-space-lg flex items-center gap-space-sm">
          <span>Add to stock</span>
          <button type="button" className="w-9 h-9 rounded-lg bg-surface-container" onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
          <span>{qty}</span>
          <button type="button" className="w-9 h-9 rounded-lg bg-surface-container" onClick={() => setQty((n) => n + 1)}>+</button>
          <button type="button" className="bg-surface-container px-space-md py-2 rounded-lg" onClick={() => void addStock()}>Confirm</button>
        </div>
        {stockNote ? <p className="mt-space-sm">{stockNote}</p> : null}
        <div className="mt-space-lg flex flex-col gap-space-sm">
          <button type="button" className="bg-primary text-on-primary h-11 rounded-lg font-semibold" onClick={onQuote}>Request quote</button>
          {canLog ? <button type="button" className="h-11 rounded-lg bg-surface-container" onClick={onUseInService}>Use in a service log</button> : null}
        </div>
      </aside>
    </div>
  );
}
