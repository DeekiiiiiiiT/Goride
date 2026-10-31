import { useMemo, useState } from "react";
import { api } from "../../../services/api";
import { PartDetailDrawer, type PartItem } from "./PartDetailDrawer";
import { Fp5Screen } from "./screens/Fp5Screen";
import { Fp12Screen } from "./screens/Fp12Screen";
import { fpButtonIs } from "./findPartsButton";
import { buildFindPartsScreenData } from "./findPartsScreenData";
import { usePartsList, usePartsSavedSearches } from "./findPartsQueries";

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
  const [open, setOpen] = useState<PartItem | null>(null);
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  usePartsList();
  usePartsSavedSearches();
  const sections = result?.sections || [];
  const allItems = useMemo(() => sections.flatMap((section) => section.items || []), [sections]);
  const best = allItems.find((item) => item.part?.id === bestId) || allItems[0];
  const offer = (best?.offers?.[0] as { landedCostJmd?: number; supplier_name?: string } | undefined);
  const data = buildFindPartsScreenData({
    vehicleLabel: result?.car?.label || "Vehicle",
    priceJmd: offer?.landedCostJmd ?? null,
    partNumber: String(best?.part?.oem_part_number || best?.part?.name || "—"),
  });

  if (loading) return <p className="p-space-lg">DISPATCH RESOLVER: RUNNING</p>;
  if (error) {
    return (
      <div className="p-space-lg">
        <p>Could not load parts. Nothing was changed.</p>
        <button type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }

  async function onButton(label: string) {
    if (fpButtonIs(label, "ask roam", "find another")) {
      onAsk();
      return;
    }
    if (fpButtonIs(label, "download")) {
      const params = new URLSearchParams(window.location.search);
      await api.downloadFitmentReport(Object.fromEntries(params.entries()));
      return;
    }
    if (fpButtonIs(label, "save query")) {
      await api.savePartsSearch({ name: result?.car?.label || "Saved search", url: window.location.search });
      return;
    }
    if (fpButtonIs(label, "quote", "get a price")) {
      if (best) onQuote((best.part || {}) as Record<string, unknown>);
      return;
    }
    if (fpButtonIs(label, "use in", "service log", "allocate") && best && canLog) {
      onUseInService(best);
      return;
    }
    if (fpButtonIs(label, "details", "photo", "top recommended")) {
      if (best) setOpen(best);
      return;
    }
    if (fpButtonIs(label, "confirm parts list")) {
      await api.addToPartsList({ label: best?.part?.name || "Part", partId: best?.part?.id });
      return;
    }
    if (fpButtonIs(label, "add to")) {
      await api.addToPartsList({ label: best?.part?.name || "Part", partId: best?.part?.id });
    }
  }

  const Screen = phone ? Fp12Screen : Fp5Screen;

  return (
    <div>
      {unsure ? <p>Fits the versions you left open</p> : null}
      <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">
        chassis gp5-300 · click any row to reveal fitment specs &amp; depot storage bins · inner core diameter: 28.2 mm · height: 56.5 mm · interchange: wix wl10023, bosch f026407142, k&amp;n ps-7023 · factory spec: api sp / resource conserving, full synthetic.
      </p>
      <Screen actions={{ onButton }} data={data} />
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
