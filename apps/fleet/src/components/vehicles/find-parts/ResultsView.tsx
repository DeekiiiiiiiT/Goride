import { useMemo, useState } from "react";
import { PART_MATCH_TIERS } from "@roam/types/partsResolution";
import { PartDetailDrawer, type PartItem } from "./PartDetailDrawer";

type Result = {
  linked?: boolean;
  sections?: Array<{ tier?: number; label?: string; items?: PartItem[] }>;
  car?: { label?: string };
  askVariant?: boolean;
};

export function ResultsView({
  loading,
  error,
  result,
  bestId,
  unsure,
  onRetry,
  onQuote,
  onAsk,
  onUseInService,
  canLog,
}: {
  loading: boolean;
  error: string;
  result: Result | null | undefined;
  bestId: string;
  unsure: boolean;
  onRetry: () => void;
  onQuote: (part: Record<string, unknown>) => void;
  onAsk: () => void;
  onUseInService: (item: PartItem) => void;
  canLog: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "shelf" | "made">("all");
  const [open, setOpen] = useState<PartItem | null>(null);
  const sections = result?.sections || [];
  const allItems = useMemo(() => sections.flatMap((section) => section.items || []), [sections]);
  const shelfCount = allItems.filter((item) => Number(item.stockQty || 0) > 0).length;
  const madeCount = (sections.find((row) => row.tier === 1)?.items || sections[0]?.items || []).length;

  if (loading) return <p>Finding parts…</p>;
  if (error) {
    return (
      <div>
        <p>Could not load parts. Nothing was changed.</p>
        <button type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (result && result.linked === false) return <p>Not linked</p>;

  const best = allItems.find((item) => item.part?.id === bestId);

  return (
    <div>
      <h2 className="font-headline-lg text-headline-lg text-on-surface">Parts for {result?.car?.label || "this car"}</h2>
      <div className="flex flex-wrap gap-space-sm my-space-md">
        <button type="button" className={chip(filter === "all")} onClick={() => setFilter("all")}>All matches ({allItems.length})</button>
        <button type="button" className={chip(filter === "shelf")} onClick={() => setFilter("shelf")}>On your shelf ({shelfCount})</button>
        <button type="button" className={chip(filter === "made")} onClick={() => setFilter("made")}>Made for your car only ({madeCount})</button>
      </div>
      {unsure ? <p className="font-body-sm text-caption text-on-surface-variant">Fits the versions you left open</p> : null}
      {best && filter !== "shelf" ? (
        <div className="bg-primary text-on-primary rounded-xl p-space-lg mb-space-lg">
          <div className="font-caption text-caption">Best match</div>
          <div className="font-headline-sm text-headline-sm">{best.part?.name}</div>
          <Price item={best} />
          <div className="flex flex-wrap gap-space-sm mt-space-md">
            <button type="button" className="bg-surface-container-lowest text-primary px-space-md py-2 rounded-lg" onClick={() => setOpen(best)}>Details</button>
            <button type="button" className="bg-surface-container-highest/20 px-space-md py-2 rounded-lg" onClick={() => onQuote((best.part || {}) as Record<string, unknown>)}>Get a price</button>
            {canLog ? <button type="button" className="bg-surface-container-highest/20 px-space-md py-2 rounded-lg" onClick={() => onUseInService(best)}>Use in a service log</button> : null}
          </div>
        </div>
      ) : null}
      {PART_MATCH_TIERS.map((tier) => {
        if (filter === "made" && tier.tier !== 1) return null;
        const section = sections.find((row) => row.tier === tier.tier) || sections[tier.tier - 1];
        const items = (section?.items || []).filter((item) => filter !== "shelf" || Number(item.stockQty || 0) > 0);
        return (
          <section key={tier.tier} className="mb-space-lg">
            <h3 className="font-headline-sm text-headline-sm">{tier.plainLabel}</h3>
            {items.length === 0 ? <p className="text-on-surface-variant">Nothing on file.</p> : items.map((item) => (
              <div key={item.part?.id || item.part?.name} className="py-space-md flex flex-col md:flex-row md:items-center md:justify-between gap-space-sm border-b border-surface-container-high">
                <div>
                  <div className="font-semibold">{item.part?.name}</div>
                  <div className="font-label-code text-caption text-on-surface-variant">{item.part?.oem_part_number}</div>
                  {item.stockQty ? <div>On your shelf — {item.stockQty}{item.stockLocation ? ` · ${item.stockLocation}` : ""}</div> : null}
                  {item.sisterNames ? <div className="text-caption">Interchange {item.sisterNames}</div> : null}
                </div>
                <div className="flex flex-wrap gap-space-sm items-center">
                  <Price item={item} />
                  <button type="button" onClick={() => setOpen(item)}>Details</button>
                  <button type="button" onClick={() => onQuote((item.part || {}) as Record<string, unknown>)}>Get a price</button>
                  {canLog ? <button type="button" onClick={() => onUseInService(item)}>Use in a service log</button> : null}
                  <button type="button" onClick={() => setOpen(item)}>Add to stock</button>
                </div>
              </div>
            ))}
          </section>
        );
      })}
      <button type="button" className="mt-space-md bg-surface-container px-space-lg py-2 rounded-lg" onClick={onAsk}>Ask Roam to find it</button>
      {open ? (
        <PartDetailDrawer
          item={open}
          canLog={canLog}
          onClose={() => setOpen(null)}
          onQuote={() => { onQuote((open.part || {}) as Record<string, unknown>); setOpen(null); }}
          onUseInService={() => { onUseInService(open); setOpen(null); }}
        />
      ) : null}
    </div>
  );
}

function chip(on: boolean) {
  return on
    ? "px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm"
    : "px-space-md py-1.5 rounded-lg bg-surface-container-low text-on-surface-variant font-body-sm text-body-sm";
}

function Price({ item }: { item: PartItem }) {
  const offer = item.bestOffer;
  if (!offer || !offer.landedCostJmd) return <span>No price yet</span>;
  return (
    <span className={offer.priceStale ? "text-on-surface-variant" : "font-label-price"}>
      J$ {Number(offer.landedCostJmd).toLocaleString()} landed · {offer.lead_time_days ?? "—"} days
      {offer.priceStale ? " Price may be old" : ""}
    </span>
  );
}
