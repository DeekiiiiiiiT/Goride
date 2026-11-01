import { useMemo, useState } from "react";
import { PartDetailDrawer, type PartItem } from "./PartDetailDrawer";
import { Fp5Screen } from "./screens/Fp5Screen";
import { Fp12Screen } from "./screens/Fp12Screen";
import { Fp11Screen } from "./screens/Fp11Screen";
import { buildFp5ViewModel, buildFp11ViewModel } from "./findPartsViewModels";
import { usePartsSavedSearches, usePartsVehicleContext } from "./findPartsQueries";
import {
  downloadCurrentFitmentReport,
  saveCurrentPartsSearch,
  type TrimScopeTab,
} from "./findPartsActions";
import {
  findPartsConnectionLatencyMs,
  fleetCoreErrorDetails,
  formatFindPartsVehicleChip,
} from "./findPartsErrors";

type Result = {
  linked?: boolean;
  sections?: Array<{ tier?: number; label?: string; items?: PartItem[] }>;
  car?: { label?: string; year?: number | string; plate?: string };
  askVariant?: boolean;
  chassis?: string;
  trimBadge?: string;
};

function fp11ErrorProps(input: {
  err: unknown;
  attempts: number;
  vehicleLabel: string;
  plate?: string;
  sectionLabel?: string;
}) {
  const { status, message } = fleetCoreErrorDetails(input.err);
  const vehicleChip = formatFindPartsVehicleChip(input.vehicleLabel, input.plate);
  const defaultBody = "The parts database did not respond in time. Your vehicle selection and entered notes are preserved.";
  return buildFp11ViewModel({
    state: "error",
    attempts: input.attempts,
    httpStatus: status,
    errorMessage: message || defaultBody,
    errorCode: status ? String(status) : "TIMEOUT",
    vehicleLabel: input.vehicleLabel,
    vehicleChip,
    sectionLabel: input.sectionLabel || "Part section",
    latencyMs: findPartsConnectionLatencyMs(),
  });
}

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
  onAskForTier,
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
  onAskForTier?: (matchType: string) => void;
  onUseInService: (item: PartItem) => void;
  onBackToPartSelection: () => void;
  onChangeCar: () => void;
  onEditPartCategory: () => void;
  canLog: boolean;
}) {
  const [open, setOpen] = useState<PartItem | null>(null);
  const [trimScope, setTrimScope] = useState<TrimScopeTab>("specific");
  const [filterTab, setFilterTab] = useState<"all" | "oem">("all");
  const [contextAttempts, setContextAttempts] = useState(0);
  const [searchAttempts, setSearchAttempts] = useState(0);
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  const vehicleContext = usePartsVehicleContext(vehicleId, componentId, Boolean(vehicleId));
  usePartsSavedSearches();

  const vehicleLabel = String(result?.car?.label || plate || "Vehicle");
  const fp11Actions = {
    onAskRoam: onAsk,
    onRequestAccess: () => undefined,
    onBack: onChangeCar,
    onSelectVehicle: onChangeCar,
    onCheckConnection: () => { void vehicleContext.refetch(); },
    onRetry: () => undefined,
  };

  const best = useMemo(() => {
    const sections = result?.sections || [];
    const allItems = sections.flatMap((section) => section.items || []);
    return allItems.find((item) => item.part?.id === bestId) || allItems[0];
  }, [result, bestId]);

  if (loading) {
    return (
      <Fp11Screen
        data={buildFp11ViewModel({ state: "loading" })}
        actions={{ ...fp11Actions, onRetry: onRetry }}
      />
    );
  }

  if (error) {
    const attempts = searchAttempts + 1;
    return (
      <Fp11Screen
        data={fp11ErrorProps({
          err: new Error(error),
          attempts,
          vehicleLabel,
          plate: plate || result?.car?.plate,
          sectionLabel: partName,
        })}
        actions={{
          ...fp11Actions,
          onRetry: () => {
            setSearchAttempts((n) => Math.min(3, n + 1));
            onRetry();
          },
        }}
      />
    );
  }

  if (vehicleContext.isLoading) {
    return (
      <Fp11Screen
        data={buildFp11ViewModel({ state: "loading" })}
        actions={{ ...fp11Actions, onRetry: () => { void vehicleContext.refetch(); } }}
      />
    );
  }

  if (vehicleContext.isError) {
    const attempts = contextAttempts + 1;
    return (
      <Fp11Screen
        data={fp11ErrorProps({
          err: vehicleContext.error,
          attempts,
          vehicleLabel,
          plate: plate || result?.car?.plate,
          sectionLabel: partName,
        })}
        actions={{
          ...fp11Actions,
          onRetry: () => {
            setContextAttempts((n) => Math.min(3, n + 1));
            void vehicleContext.refetch();
          },
        }}
      />
    );
  }

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

  const actions = {
    onAskRoam: onAsk,
    onAskForTier,
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
