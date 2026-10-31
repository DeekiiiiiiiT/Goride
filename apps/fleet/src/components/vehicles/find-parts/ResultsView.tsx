import { useMemo, useState } from "react";
import { PartDetailDrawer, type PartItem } from "./PartDetailDrawer";
import { Fp5Screen } from "./screens/Fp5Screen";
import { Fp12Screen } from "./screens/Fp12Screen";
import { buildFp5ViewModel } from "./findPartsViewModels";
import { usePartsSavedSearches, usePartsVehicleContext } from "./findPartsQueries";
import {
  downloadCurrentFitmentReport,
  saveCurrentPartsSearch,
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
  componentId,
  onRetry,
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
  componentId?: string;
  onRetry: () => void;
  onAsk: () => void;
  onUseInService: (item: PartItem) => void;
  onBackToPartSelection: () => void;
  onChangeCar: () => void;
  onEditPartCategory: () => void;
  canLog: boolean;
}) {
  const [open, setOpen] = useState<PartItem | null>(null);
  const [trimScope, setTrimScope] = useState<TrimScopeTab>("specific");
  const [filterTab, setFilterTab] = useState<"all" | "oem">("all");
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  const vehicleContext = usePartsVehicleContext(vehicleId, componentId, Boolean(vehicleId));
  usePartsSavedSearches();
  const ctxData = (vehicleContext.data as Record<string, unknown> | undefined) ?? null;
  const variantCount = Number((ctxData?.variant_count as number | undefined) ?? (ctxData?.version_count as number | undefined) ?? 0);
  const data = buildFp5ViewModel({
    result,
    bestId,
    trimScope,
    filterTab,
    plate,
    partName,
    vehicleContext: ctxData,
    variantCount,
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
    onUseInService: () => {
      if (best && canLog) onUseInService(best);
    },
    onOpenRow: (id: string) => {
      const sections = result?.sections || [];
      const item = sections.flatMap((s) => s.items || []).find((row) => row.part?.id === id);
      if (item) setOpen(item);
    },
    onOpenBest: () => {
      if (best) setOpen(best);
    },
    onTrimScope: setTrimScope,
    onFilterTab: setFilterTab,
    onBackToPartSelection,
    onChangeCar,
    onEditPartCategory,
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
          onUseInService={() => { onUseInService(open); setOpen(null); }}
        />
      ) : null}
    </div>
  );
}
