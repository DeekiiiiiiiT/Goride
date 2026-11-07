import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../services/api";
import { BrakesFlowStates, BrakesErrorBanner, BrakesListSkeleton, BrakesUnknownSetupCard } from "./BrakesFlowStates";
import { BrakesPartDetailSheet } from "./BrakesPartDetailSheet";
import { BrakesPartResultCard } from "./BrakesPartResultCard";
import { PartsActivityPanel } from "./PartsActivityPanel";
import { defaultAxleForBrakeSection } from "./brakesFindPartsConstants";
import { usePartsActivity, usePartsVehicleContext } from "./findPartsQueries";

type BrakeTypeRow = {
  id: string;
  name: string;
  opCode: string;
  description: string;
  section: "front" | "rear" | "whole";
  onFile: boolean;
  onFileCount: number;
};

type BrandNumber = { partId: string; brand: string; number: string; trust: string };
type AlsoFitRow = {
  variantId: string;
  make: string;
  model: string;
  chassis: string;
  engine: string;
  years: string;
  trust: string;
  trustReason: string | null;
  isYourCar: boolean;
};

type FlowView = "list" | "results" | "empty" | "detail";

function sectionChip(section: "front" | "rear" | "whole") {
  return section === "front" ? "FRONT" : section === "rear" ? "REAR" : "SYSTEM";
}

function positionWord(section: "front" | "rear" | "whole") {
  return section === "front" ? "Front" : section === "rear" ? "Rear" : "System";
}

export function BrakesFindPartsFlow({
  vehicleId,
  onBack,
  onAskRoam,
  onUseInService,
  initialTypeId,
}: {
  vehicleId: string;
  onBack: () => void;
  onAskRoam: (componentId: string, name: string) => void;
  onUseInService?: (componentId: string, partName: string) => void;
  initialTypeId?: string;
}) {
  const ctxQ = usePartsVehicleContext(vehicleId);
  const activityQ = usePartsActivity();
  const variantId = String((ctxQ.data as { variantId?: string } | undefined)?.variantId || "");
  const ctx = (ctxQ.data as Record<string, unknown> | undefined) ?? {};
  const plate = String(ctx.plate || "");
  const vehicleLabel = String(ctx.label || "");
  const year = Number(ctx.year ?? (ctx as { specs?: { year?: number } }).specs) || undefined;

  const [view, setView] = useState<FlowView>(initialTypeId ? "results" : "list");
  const [selectedType, setSelectedType] = useState<BrakeTypeRow | null>(null);
  const [detailPartId, setDetailPartId] = useState<string | null>(null);
  const [trustFilter, setTrustFilter] = useState<"all" | "confirmed" | "needs">("all");
  const [requestSent, setRequestSent] = useState(false);

  const overview = useQuery({
    queryKey: ["brakes-overview", variantId, year],
    queryFn: () => api.partsBrakesOverview(variantId, year ?? null),
    enabled: Boolean(variantId),
  });

  const findQ = useQuery({
    queryKey: ["brakes-find", vehicleId, variantId, selectedType?.id, selectedType?.section],
    queryFn: async () => {
      if (!selectedType) return null;
      const pos = defaultAxleForBrakeSection(selectedType.section);
      return api.findParts({
        vehicleId,
        variantId,
        componentId: selectedType.id,
        position: pos,
      });
    },
    enabled: Boolean(vehicleId && variantId && selectedType && view === "results"),
  });

  const lookupQ = useQuery({
    queryKey: ["parts-lookup", detailPartId, variantId],
    queryFn: () => api.partsLookup(detailPartId!, variantId),
    enabled: Boolean(detailPartId && view === "detail"),
  });

  const partCards = useMemo(() => {
    const result = findQ.data as { sections?: Array<{ items?: Array<Record<string, unknown>> }> } | undefined;
    const cards: Array<{ key: string; part: { id?: string; name?: string; manufacturer?: string; oem_part_number?: string; catalog_decision?: string }; brandNumbers: BrandNumber[] }> = [];
    for (const section of result?.sections || []) {
      for (const item of section.items || []) {
        const part = (item.part || {}) as { id?: string; name?: string; manufacturer?: string; oem_part_number?: string; catalog_decision?: string };
        const brandNumbers = Array.isArray(item.brandNumbers)
          ? item.brandNumbers as BrandNumber[]
          : [{
            partId: String(part.id ?? ""),
            brand: String(part.manufacturer ?? ""),
            number: String(part.oem_part_number ?? ""),
            trust: String(part.catalog_decision ?? "") === "confirmed" ? "Confirmed" : "Needs checking",
          } as BrandNumber];
        cards.push({ key: String(item.groupId ?? part.id ?? cards.length), part, brandNumbers });
      }
    }
    return cards;
  }, [findQ.data]);

  const leadPartId = partCards[0]
    ? String(partCards[0].part.id || partCards[0].brandNumbers[0]?.partId || "")
    : "";

  const previewLookupQ = useQuery({
    queryKey: ["parts-lookup-preview", leadPartId, variantId],
    queryFn: () => api.partsLookup(leadPartId, variantId),
    enabled: Boolean(leadPartId && view === "results"),
  });

  const alsoFitsSummary = useMemo(() => {
    const fits = (previewLookupQ.data as { alsoFits?: AlsoFitRow[] } | undefined)?.alsoFits || [];
    const others = fits.filter((r) => !r.isYourCar);
    if (!others.length) return null;
    const makers = [...new Set(others.map((o) => o.make).filter(Boolean))];
    return `Also fits ${others.length} other car${others.length === 1 ? "" : "s"}${makers.length ? ` — ${makers.join(", ")}` : ""}`;
  }, [previewLookupQ.data]);

  const requestMut = useMutation({
    mutationFn: async () => {
      if (!selectedType) return;
      await api.requestFindPart({
        vehicleId,
        maintenanceComponentId: selectedType.id,
        needText: selectedType.name,
        kind: "add_part_info",
      });
    },
    onSuccess: () => setRequestSent(true),
  });

  const types = useMemo(() => {
    const body = overview.data as { types?: BrakeTypeRow[]; groups?: Record<string, { setup: string; types: BrakeTypeRow[] }> } | undefined;
    return body?.types || [];
  }, [overview.data]);

  const groups = (overview.data as { groups?: Record<string, { setup: string; componentCount: number; types: BrakeTypeRow[] }>; hasBrakeSpecs?: boolean } | undefined)?.groups;

  function openType(row: BrakeTypeRow) {
    setSelectedType(row);
    setRequestSent(false);
    if (row.onFile) setView("results");
    else setView("empty");
  }

  useEffect(() => {
    if (!initialTypeId || !types.length) return;
    const row = types.find((t) => t.id === initialTypeId);
    if (row) openType(row);
  }, [initialTypeId, types]);

  const specs = (ctx.specs || {}) as Record<string, unknown>;
  const specLine = [
    specs.brake_front_type ? `Front: ${String(specs.brake_front_type).toLowerCase()}` : "",
    specs.brake_rear_type ? `Rear: ${String(specs.brake_rear_type).toLowerCase()}` : "",
    specs.chassis_code ? `Chassis: ${specs.chassis_code}` : "",
    specs.brake_size_mm ? `${String(specs.brake_size_mm)} mm` : "",
  ].filter(Boolean).join(" · ");

  const lookup = lookupQ.data as {
    reference?: { brand: string; number: string; name: string; trust: string; position?: string };
    brandNumbers?: BrandNumber[];
    alsoFits?: AlsoFitRow[];
    sources?: Array<{ label: string; url: string }>;
  } | undefined;

  const canLog = Boolean(onUseInService && selectedType);

  function renderTypeRow(row: BrakeTypeRow) {
    return (
      <button
        key={row.id}
        type="button"
        className="group flex w-full items-center justify-between rounded-lg p-space-md transition-all hover:bg-surface-container-low text-left"
        onClick={() => openType(row)}
      >
        <div className="flex min-w-0 items-center gap-space-md">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface group-hover:bg-primary group-hover:text-on-primary transition-colors">
            <span className="material-symbols-outlined text-[22px]">disc_full</span>
          </div>
          <div className="min-w-0">
            <span className="font-body-md text-body-md font-semibold text-on-surface">{row.name}</span>
            {row.description ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant truncate">{row.description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-space-md">
          <span className={`px-space-sm py-0.5 rounded-full font-label-code text-caption font-bold ${row.onFile ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"}`}>
            {row.onFile ? `${row.onFileCount} part${row.onFileCount === 1 ? "" : "s"}` : "Not on file yet"}
          </span>
          <span className="material-symbols-outlined text-[20px] text-outline">chevron_right</span>
        </div>
      </button>
    );
  }

  function renderGroup(key: "front" | "rear" | "whole", title: string, dotClass: string) {
    const g = groups?.[key];
    if (!g?.types?.length) return null;
    return (
      <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm flex flex-col gap-space-xs">
        <div className="flex items-center justify-between pb-space-md">
          <div className="flex items-center gap-space-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
            <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">{title}</h3>
            <span className="font-caption text-caption text-on-surface-variant">{g.setup}</span>
          </div>
          <span className="font-label-code text-caption text-on-surface-variant">{g.componentCount} components</span>
        </div>
        {g.types.map(renderTypeRow)}
      </div>
    );
  }

  if (overview.isLoading && view === "list") {
    return <BrakesListSkeleton plate={plate || undefined} />;
  }

  if (overview.isError || (!overview.data && !overview.isLoading)) {
    return (
      <div className="find-parts-screen-root p-space-xl">
        <BrakesErrorBanner onRetry={() => { void overview.refetch(); }} />
      </div>
    );
  }

  if (overview.data?.hasBrakeSpecs === false && view === "list") {
    return <BrakesUnknownSetupCard onAsk={() => onAskRoam("", "Brakes")} />;
  }

  const resultsTitle = selectedType
    ? `${selectedType.name} · ${vehicleLabel}${plate ? ` · ${plate}` : ""}`
    : "";

  return (
    <div className="find-parts-screen-root brakes-find-parts-flow">
      <div className="flex flex-col gap-space-lg pb-16">
        <div className="flex flex-col gap-space-sm">
          <div className="flex items-center gap-space-md">
            <button
              type="button"
              aria-label="Back"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container hover:bg-surface-container-high"
              onClick={() => {
                if (view === "list") onBack();
                else if (view === "detail") setView("results");
                else setView("list");
              }}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-space-sm">
                <h2 className="font-headline-lg text-headline-lg font-semibold text-on-surface">
                  {view === "list" ? `Brakes for ${vehicleLabel}` : view === "results" ? resultsTitle : selectedType?.name || "Brakes"}
                </h2>
                {view === "list" && plate ? (
                  <span className="font-label-plate text-label-plate rounded bg-surface-container-high px-space-xs py-0.5 tracking-wider">{plate}</span>
                ) : null}
                {view === "results" && selectedType ? (
                  <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-caption font-bold uppercase tracking-wider text-on-surface-variant">
                    {sectionChip(selectedType.section)}
                  </span>
                ) : null}
              </div>
              {specLine && view === "list" ? <p className="font-caption text-caption text-on-surface-variant mt-0.5">{specLine}</p> : null}
            </div>
          </div>
          {view === "results" && partCards.length === 1 ? (
            <p className="font-body-md text-body-md text-on-surface-variant pl-12">
              1 part fits your car. It is sold under {partCards[0].brandNumbers.length} brand number{partCards[0].brandNumbers.length === 1 ? "" : "s"}.
            </p>
          ) : null}
          {view === "results" && partCards.length > 1 ? (
            <p className="font-body-md text-body-md text-on-surface-variant pl-12">
              {partCards.length} parts fit your car.
            </p>
          ) : null}
        </div>

        {view === "list" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            <div className="lg:col-span-8 flex flex-col gap-space-lg">
              <div className="rounded-xl bg-surface-container-lowest p-space-md shadow-sm flex gap-space-md">
                <span className="material-symbols-outlined text-on-surface-variant">menu_book</span>
                <div>
                  <div className="font-headline-sm font-semibold text-on-surface">Parts encyclopedia for your car</div>
                  <p className="font-body-sm text-on-surface-variant">Every brake component your vehicle uses is listed here. Tell us which part you need and Roam will add it.</p>
                </div>
              </div>
              {renderGroup("front", "Front brakes", "bg-primary")}
              {renderGroup("rear", "Rear brakes", "bg-secondary")}
              {renderGroup("whole", "Whole system", "bg-outline")}
            </div>
            <div className="lg:col-span-4">
              <PartsActivityPanel activity={activityQ.data ?? null} onSeeAll={() => undefined} onAsk={() => onAskRoam("", "Brake part")} />
            </div>
          </div>
        ) : null}

        {view === "empty" && selectedType ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            <div className="lg:col-span-8">
              <div className="rounded-xl bg-surface-container-lowest p-space-xl text-center shadow-sm flex flex-col items-center gap-space-md">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant">inventory_2</span>
                <h3 className="font-headline-sm font-semibold text-on-surface">Not in our database yet</h3>
                <p className="font-body-md text-on-surface-variant max-w-md">
                  Your car uses {selectedType.name.toLowerCase()} but we have not catalogued a matching part yet.
                </p>
                {requestSent ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600/15 px-space-md py-2 font-body-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    Request sent
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-space-xl py-2.5 font-body-md font-semibold text-on-primary"
                    onClick={() => requestMut.mutate()}
                  >
                    Ask Roam to find it
                  </button>
                )}
                <p className="font-caption text-on-surface-variant">We&apos;ll add it and tell you when it&apos;s here.</p>
              </div>
            </div>
            <div className="lg:col-span-4">
              <PartsActivityPanel activity={activityQ.data ?? null} onSeeAll={() => undefined} onAsk={() => onAskRoam(selectedType.id, selectedType.name)} />
            </div>
          </div>
        ) : null}

        {view === "results" && selectedType ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg brakes-type-results">
            <div className="lg:col-span-8 flex flex-col gap-space-lg">
              {findQ.isLoading ? <BrakesListSkeleton plate={plate || undefined} /> : null}
              {findQ.isError ? (
                <BrakesErrorBanner onRetry={() => { void findQ.refetch(); }} />
              ) : null}
              {partCards.map(({ key, part: primaryPart, brandNumbers }) => (
                <BrakesPartResultCard
                  key={key}
                  partName={String(primaryPart.name || selectedType.name)}
                  primaryPart={primaryPart}
                  brandNumbers={brandNumbers}
                  positionLabel={positionWord(selectedType.section)}
                  sizeLine={specs.brake_size_mm ? `${String(specs.brake_size_mm)} mm` : null}
                  alsoFitsSummary={partCards.length === 1 ? alsoFitsSummary : null}
                  canUseInService={canLog}
                  onUseInService={() => onUseInService?.(selectedType.id, String(primaryPart.name || selectedType.name))}
                  onViewDetails={() => {
                    const pid = String(primaryPart.id || brandNumbers[0]?.partId || "");
                    if (pid) {
                      setDetailPartId(pid);
                      setTrustFilter("all");
                      setView("detail");
                    }
                  }}
                />
              ))}
              {!findQ.isLoading && !findQ.isError && partCards.length === 0 ? (
                <p className="text-on-surface-variant">No parts on file for this yet.</p>
              ) : null}
            </div>
            <div className="lg:col-span-4">
              <PartsActivityPanel activity={activityQ.data ?? null} onSeeAll={() => undefined} onAsk={() => onAskRoam(selectedType.id, selectedType.name)} />
            </div>
          </div>
        ) : null}

        {view === "detail" && detailPartId ? (
          lookupQ.isLoading || !lookup ? (
            <div className="brakes-part-detail-overlay fixed inset-0 z-[60] flex justify-end bg-inverse-surface/30">
              <aside className="brakes-part-detail-sheet w-full max-w-[520px] bg-surface-container-lowest p-space-xl animate-pulse h-full">
                <div className="h-6 w-2/3 bg-surface-container-high rounded mb-4" />
                <div className="h-32 bg-surface-container-high rounded" />
              </aside>
            </div>
          ) : (
            <BrakesPartDetailSheet
              typeName={selectedType?.name || "Brakes"}
              lookup={lookup}
              trustFilter={trustFilter}
              onTrustFilter={setTrustFilter}
              vehicleLabel={vehicleLabel}
              canUseInService={canLog}
              onUseInService={() => selectedType && onUseInService?.(selectedType.id, lookup.reference?.name || selectedType.name)}
              onClose={() => setView("results")}
              onBack={() => setView("results")}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
