import { useMemo, useState } from "react";
import { PartDetailDrawer, type PartItem } from "./PartDetailDrawer";
import { Fp5Screen } from "./screens/Fp5Screen";
import { Fp12Screen } from "./screens/Fp12Screen";
import { buildFp5ViewModel } from "./findPartsViewModels";
import { usePartsList, usePartsSavedSearches } from "./findPartsQueries";
import {
  addPartToPartsList,
  downloadCurrentFitmentReport,
  logBulkConsumableStockOut,
  navigateFleetMaintenanceTab,
  saveCurrentPartsSearch,
  type ResultsFilterTab,
  type TrimScopeTab,
} from "./findPartsActions";

type Result = {
  linked?: boolean;
  sections?: Array<{ tier?: number; label?: string; items?: PartItem[] }>;
  car?: { label?: string; year?: number | string; plate?: string };
  askVariant?: boolean;
  chassis?: string;
  trimBadge?: string;
};

export function ResultsView({
  loading,
  error,
  result,
  bestId,
  unsure,
  vehicleId,
  plate,
  partName,
  onRetry,
  onQuote,
  onAsk,
  onUseInService,
  onBackToPartSelection,
  onChangeCar,
  onEditPartCategory,
  canLog,
}: {
  loading: boolean;
  error: string;
  result: Result | null | undefined;
  bestId: string;
  unsure: boolean;
  vehicleId: string;
  plate?: string;
  partName?: string;
  onRetry: () => void;
  onQuote: (part: Record<string, unknown>) => void;
  onAsk: () => void;
  onUseInService: (item: PartItem) => void;
  onBackToPartSelection: () => void;
  onChangeCar: () => void;
  onEditPartCategory: () => void;
  canLog: boolean;
}) {
  const [open, setOpen] = useState<PartItem | null>(null);
  const [filterTab, setFilterTab] = useState<ResultsFilterTab>("all");
  const [trimScope, setTrimScope] = useState<TrimScopeTab>("specific");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  usePartsList();
  usePartsSavedSearches();
  const data = buildFp5ViewModel({
    result,
    bestId,
    filterTab,
    trimScope,
    plate,
  });
  const best = useMemo(() => {
    const sections = result?.sections || [];
    const allItems = sections.flatMap((section) => section.items || []);
    return allItems.find((item) => item.part?.id === bestId) || allItems[0];
  }, [result, bestId]);

  if (loading) return <p className="p-space-lg">DISPATCH RESOLVER: RUNNING</p>;
  if (error) {
    return (
      <div className="p-space-lg">
        <p>Could not load parts. Nothing was changed.</p>
        <button type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }

  const actions = {
    onAskRoam: onAsk,
    onDownloadReport: () => { void downloadCurrentFitmentReport(); },
    onSaveQuery: () => {
      void saveCurrentPartsSearch(result?.car?.label || partName || "Saved search");
    },
    onQuote: () => {
      if (best) onQuote({ ...(best.part || {}), stockQty: best.stockQty, offers: best.offers });
    },
    onUseInService: () => {
      if (best && canLog) onUseInService(best);
    },
    onOpenRow: (id: string) => {
      if (expandedRowId === id) {
        const sections = result?.sections || [];
        const item = sections.flatMap((s) => s.items || []).find((row) => row.part?.id === id);
        if (item) setOpen(item);
        return;
      }
      setExpandedRowId(id);
    },
    onOpenBest: () => {
      if (best) setOpen(best);
    },
    onConfirmPartsList: () => {
      void addPartToPartsList({ label: best?.part?.name || "Part", partId: best?.part?.id });
    },
    onAddToList: () => {
      void addPartToPartsList({ label: best?.part?.name || "Part", partId: best?.part?.id });
    },
    onFreshQuote: () => {
      if (best) onQuote({ ...(best.part || {}), stockQty: best.stockQty, offers: best.offers });
    },
    onBulkConsumable: () => {
      void logBulkConsumableStockOut(best?.part?.id, 1);
    },
    onAllocate: () => {
      if (best && canLog) onUseInService(best);
    },
    onFilterTab: setFilterTab,
    onTrimScope: setTrimScope,
    onBackToPartSelection,
    onChangeCar,
    onEditPartCategory,
    onNavigateVehicles: () => navigateFleetMaintenanceTab("vehicles"),
    onNavigateLedger: () => navigateFleetMaintenanceTab("ledger"),
    onNavigateFindParts: () => navigateFleetMaintenanceTab("find-parts"),
    onSendQuickRfq: () => {
      if (best) onQuote({ ...(best.part || {}), stockQty: best.stockQty, offers: best.offers });
    },
    expandedRowId,
  };

  const Screen = phone ? Fp12Screen : Fp5Screen;

  return (
    <div>
      {unsure ? <p>Fits the versions you left open</p> : null}
      <Screen data={data} actions={actions} partName={partName} />
      {open ? (
        <PartDetailDrawer
          item={open}
          vehicleId={vehicleId}
          canLog={canLog}
          onClose={() => setOpen(null)}
          onQuote={() => { onQuote((open.part || {}) as Record<string, unknown>); setOpen(null); }}
          onUseInService={() => { onUseInService(open); setOpen(null); }}
        />
      ) : null}
    </div>
  );
}
