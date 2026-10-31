import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { pickBestPart } from "@roam/types/partsBestPick";
import { api } from "../../../services/api";
import { usePermissions } from "../../../hooks/usePermissions";
import { CarStep, type FleetCar } from "./CarStep";
import { LinkCarPanel } from "./LinkCarPanel";
import { PartStep } from "./PartStep";
import { PositionStep } from "./PositionStep";
import { QuoteDialog } from "./QuoteDialog";
import { RequestPartPanel } from "./RequestPartPanel";
import { ResultsView } from "./ResultsView";
import type { PartItem } from "./PartDetailDrawer";
import { StepBar } from "./StepBar";
import { VariantStep } from "./VariantStep";
import { ActivityView } from "./ActivityView";
import type { PartsActivity } from "./PartsActivityPanel";
import "./findParts.css";

type Step = "car" | "version" | "part" | "position" | "results" | "request" | "link" | "missing";

export function FindPartsTab({
  cars,
  canView,
  onUseInService,
}: {
  cars: FleetCar[];
  canView: boolean;
  onUseInService?: (vehicleId: string, componentId: string, partName: string) => void;
}) {
  const { can } = usePermissions();
  const params = new URLSearchParams(window.location.search);
  const [step, setStep] = useState<Step>(() => {
    if (params.get("view") === "activity") return "car";
    if (params.get("part")) return "results";
    if (params.get("vehicle")) return "part";
    return "car";
  });
  const [view, setView] = useState(params.get("view") === "activity" ? "activity" : "search");
  const [vehicleId, setVehicleId] = useState(params.get("vehicle") || "");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [variantId, setVariantId] = useState("");
  const [componentId, setComponentId] = useState(params.get("part") || "");
  const [partName, setPartName] = useState("");
  const [position, setPosition] = useState(params.get("pos") || "");
  const [error, setError] = useState("");
  const [quotePart, setQuotePart] = useState<Record<string, unknown> | null>(null);
  const [linkMeta, setLinkMeta] = useState({ make: "", model: "", year: "", plate: "" });

  const activity = useQuery({
    queryKey: ["parts-activity"],
    queryFn: () => api.partsActivity() as Promise<PartsActivity>,
    enabled: canView,
    staleTime: 60_000,
  });

  const search = useQuery({
    queryKey: ["parts-find", vehicleId, make, model, year, variantId, componentId, position],
    queryFn: () => api.findParts({
      ...(vehicleId ? { vehicleId } : { make, model, year: String(year) }),
      ...(variantId ? { variantId } : {}),
      ...(componentId ? { componentId } : {}),
      ...(position ? { position } : {}),
    }),
    enabled: canView && step === "results" && Boolean(vehicleId || (make && model && year)),
  });

  const stepNumber = step === "car" || step === "link" ? 1 : step === "version" ? 2 : step === "part" || step === "request" ? 3 : step === "position" || position ? 4 : 3;
  const car = cars.find((row) => row.vehicleId === vehicleId);
  const trail = useMemo(() => {
    const chips = [];
    if (car) chips.push({ label: [car.make, car.model, car.year].filter(Boolean).join(" "), onPick: () => setStep("car") });
    else if (make) chips.push({ label: [year, make, model].filter(Boolean).join(" "), onPick: () => setStep("car") });
    if (componentId) chips.push({ label: partName || "Part", onPick: () => setStep("part") });
    if (position) chips.push({ label: position === "rear" ? "Back" : "Front", onPick: () => setStep("position") });
    return chips;
  }, [car, make, model, year, componentId, partName, position]);

  function writeUrl(next: { vehicle?: string; part?: string; pos?: string; view?: string }) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "find-parts");
    if (next.vehicle) url.searchParams.set("vehicle", next.vehicle);
    if (next.part) url.searchParams.set("part", next.part);
    if (next.pos) url.searchParams.set("pos", next.pos);
    if (next.view) url.searchParams.set("view", next.view);
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }

  if (!canView) {
    return (
      <div className="fleet-find-parts-stitch p-space-xl">
        <h2 className="text-headline-lg">You don't have access to vehicle parts. Ask your fleet admin.</h2>
        <p>Back to Fleet maintenance</p>
      </div>
    );
  }

  return (
    <div className="fleet-find-parts-stitch">
      {error ? (
        <div className="mb-space-md">
          <p>Could not load parts. Nothing was changed.</p>
          <button type="button" onClick={() => setError("")}>Retry</button>
        </div>
      ) : null}
      {view === "activity" ? (
        <ActivityView activity={activity.data ?? null} onBack={() => { setView("search"); writeUrl({}); }} />
      ) : (
        <>
          <StepBar
            step={stepNumber}
            trail={step === "car" ? [] : trail}
            title={step === "results" ? `Parts for ${car ? [car.year, car.make, car.model].filter(Boolean).join(" ") : "this car"}` : undefined}
            hint={step === "results" ? (partName || "Matches for this car") : undefined}
          />
          {step === "car" ? (
            <CarStep
              cars={cars}
              activity={activity.data ?? null}
              onSeeAll={() => { setView("activity"); writeUrl({ view: "activity" }); }}
              onAsk={() => setStep("request")}
              onPickCar={(picked) => {
                setVehicleId(picked.vehicleId);
                writeUrl({ vehicle: picked.vehicleId });
                void api.findParts({ vehicleId: picked.vehicleId }).then((res) => {
                  const body = res as { linked?: boolean; askVariant?: boolean; make?: string; model?: string; year?: number; vehicle?: { plate?: string; label?: string } };
                  if (body.linked === false) {
                    setLinkMeta({
                      make: body.make || picked.make || "",
                      model: body.model || picked.model || "",
                      year: String(body.year || picked.year || ""),
                      plate: body.vehicle?.plate || picked.licensePlate || "",
                    });
                    setMake(body.make || picked.make || "");
                    setModel(body.model || picked.model || "");
                    setYear(body.year || Number(picked.year) || null);
                    setStep("link");
                  } else if (body.askVariant) {
                    setMake(picked.make || "");
                    setModel(picked.model || "");
                    setYear(Number(picked.year) || null);
                    setStep("version");
                  } else setStep("part");
                }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load parts"));
              }}
              onContinueOther={(choice) => {
                const plate = cars.find((row) => (row.licensePlate || "").toLowerCase() === choice.typed.trim().toLowerCase());
                if (plate) {
                  setVehicleId(plate.vehicleId);
                  setStep("part");
                  return;
                }
                setVehicleId("");
                setMake(choice.make);
                setModel(choice.model);
                setYear(choice.year || null);
                setStep(choice.make ? "version" : "car");
              }}
            />
          ) : null}
          {step === "version" ? (
            <VariantStep
              make={make}
              model={model}
              year={year}
              cars={cars}
              onBack={() => setStep("car")}
              onPick={(id) => { setVariantId(id); setStep("part"); }}
              onAskAdd={() => api.requestCatalogAddition({ make, model, year: year || 0, vehicleId: vehicleId || null }).then(() => undefined).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Could not ask Roam to add this car");
                throw err;
              })}
            />
          ) : null}
          {step === "part" ? (
            <PartStep
              vehicleId={vehicleId}
              onBack={() => setStep(vehicleId ? "car" : "version")}
              onPick={(id, positionAware, name) => {
                setComponentId(id);
                setPartName(name);
                writeUrl({ vehicle: vehicleId, part: id });
                setStep(positionAware ? "position" : "results");
              }}
              onSkip={() => setStep("results")}
            />
          ) : null}
          {step === "position" ? (
            <PositionStep
              vehicleId={vehicleId}
              componentId={componentId}
              onBack={() => setStep("part")}
              onPick={(side) => { setPosition(side); writeUrl({ pos: side }); setStep("results"); }}
            />
          ) : null}
          {step === "results" ? (
            <ResultsView
              loading={search.isLoading}
              error={search.error instanceof Error ? search.error.message : ""}
              result={search.data}
              onRetry={() => search.refetch()}
              onQuote={(part) => setQuotePart(part)}
              onAsk={() => setStep("request")}
              bestId={bestId(search.data)}
              unsure={variantId === "any"}
              canLog={Boolean(vehicleId && onUseInService)}
              onUseInService={(item: PartItem) => {
                if (!vehicleId || !onUseInService) return;
                onUseInService(vehicleId, componentId || String(item.part?.maintenance_component_id || ""), String(item.part?.name || "Part"));
              }}
            />
          ) : null}
          {step === "link" ? (
            <LinkCarPanel
              canEdit={can("vehicles.edit")}
              onBack={() => setStep("car")}
              onLinked={() => setStep("part")}
              vehicleId={vehicleId}
              make={linkMeta.make || make}
              model={linkMeta.model || model}
              year={linkMeta.year || String(year || "")}
              plate={linkMeta.plate || car?.licensePlate || ""}
            />
          ) : null}
          {step === "request" || step === "missing" ? (
            <RequestPartPanel
              vehicleId={vehicleId || null}
              carLabel={car ? [car.year, car.make, car.model].filter(Boolean).join(" ") : [year, make, model].filter(Boolean).join(" ")}
              plate={car?.licensePlate || ""}
              componentId={componentId}
              partName={partName}
              onBack={() => setStep("part")}
              onViewActivity={() => { setView("activity"); writeUrl({ view: "activity" }); }}
            />
          ) : null}
          {quotePart ? (
            <QuoteDialog
              part={quotePart}
              vehicleId={vehicleId || null}
              cars={cars}
              onClose={() => setQuotePart(null)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function bestId(result: { sections?: Array<{ items?: Array<{ part?: { id?: string }; stockQty?: number; tier?: number; offers?: unknown[] }> }> } | undefined) {
  const sections = (result?.sections || []).map((section, index) => ({
    tier: index + 1,
    items: (section.items || []).map((item) => ({
      id: String(item.part?.id || ""),
      tier: Number(item.tier || index + 1),
      stockQty: Number(item.stockQty || 0),
      landedJmd: Number((item.offers?.[0] as { landedCostJmd?: number } | undefined)?.landedCostJmd || 0) || null,
      status: "verified" as const,
    })),
  }));
  return pickBestPart(sections, { useStock: true, usePrice: true })?.id ?? "";
}
