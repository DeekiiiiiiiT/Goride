// Stitch: dominion-redesign/S42
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthContext";
import { parseQuickCar } from "../../../../../../../packages/types/src/findPartsParse";
import { fetchVehicleOptions } from "../partsDatabaseApi";
import { writeCatalogSearch } from "../partsCatalogUrl";
import { CarNotInCatalog, PartsError, PartsLoading } from "../PartsDatabaseStates";
import { AllPartsView } from "./AllPartsView";
import { CarStep, type RecentSearch } from "./CarStep";
import { ChoiceTrail, type TrailChip } from "./ChoiceTrail";
import { MissingPart } from "./MissingPart";
import { PartDetailDrawer } from "./PartDetailDrawer";
import { PartStep } from "./PartStep";
import { PositionStep } from "./PositionStep";
import { ResultsView } from "./ResultsView";
import { StepBar } from "./StepBar";
import { VariantStep } from "./VariantStep";
import {
  fetchFindParts,
  fetchFindPartsCoverage,
  fetchPartTerm,
  fetchPartsBrowse,
  fetchSymptoms,
  type FindPartsResult,
  type FoundPartRow,
} from "./findPartsApi";

const RECENT_KEY = "dominion-find-parts-recent";

type Step = "car" | "version" | "part" | "position" | "results" | "missing" | "all";

function loadRecent(): RecentSearch[] {
  try {
    const rows = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as RecentSearch[];
    return Array.isArray(rows) ? rows.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveRecent(rows: RecentSearch[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(rows));
  } catch {
    /* Private windows can block storage. The search still works. */
  }
}

function clearStoredRecent() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* Same as save: ignore a blocked store. */
  }
}

function readQuick(text: string, makes: string[]) {
  const direct = parseQuickCar(text, makes);
  if (direct) return direct;
  const moved = text.trim().replace(/^((?:19|20)\d{2})\s+(.+)$/, "$2 $1");
  return moved === text ? null : parseQuickCar(moved, makes);
}

function sectionCount(result: FindPartsResult) {
  if (result.plainSections) return result.plainSections.reduce((sum, section) => sum + section.items.length, 0);
  return (result.sections ?? []).reduce((sum, section) => sum + (section.items?.length ?? 0), 0);
}

function initialFindPartsSearch(initialVariantId?: string) {
  const params = new URLSearchParams(window.location.search);
  const car = params.get("car") || "";
  let make = "";
  let model = "";
  let year = "";
  let variantId = initialVariantId ?? "";
  if (car.includes(",")) {
    const [carMake, carModel, carYear] = car.split(",");
    make = carMake || "";
    model = carModel || "";
    year = carYear || "";
  } else if (car) {
    variantId = car;
  }
  return {
    make,
    model,
    year,
    variantId,
    componentId: params.get("part") || "",
    position: params.get("pos") || "",
    side: params.get("side") || "",
  };
}

export function FindPartsFlow({
  initialVariantId,
  onOpenVehicle,
  onAdd,
}: {
  initialVariantId?: string;
  onOpenVehicle?: (variantId: string) => void;
  onAdd: (variantId: string) => void;
}) {
  const { role } = useAuth();
  const owner = role === "platform_owner";
  const seeded = useState(() => initialFindPartsSearch(initialVariantId))[0];
  const [step, setStep] = useState<Step>("car");
  const [make, setMake] = useState(seeded.make);
  const [model, setModel] = useState(seeded.model);
  const [year, setYear] = useState(seeded.year);
  const [quick, setQuick] = useState("");
  const [variantId, setVariantId] = useState(seeded.variantId);
  const [componentId, setComponentId] = useState(seeded.componentId);
  const [partName, setPartName] = useState("");
  const [positionAware, setPositionAware] = useState(false);
  const [position, setPosition] = useState(seeded.position);
  const [side, setSide] = useState(seeded.side);
  const [recent, setRecent] = useState<RecentSearch[]>(loadRecent);
  const [detail, setDetail] = useState<FoundPartRow | null>(null);
  const [partQuery, setPartQuery] = useState("");
  const [termQuery, setTermQuery] = useState("");
  const [addAfterVersion, setAddAfterVersion] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTermQuery(partQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [partQuery]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const car = params.get("car") || "";
    const part = params.get("part") || "";
    const pos = params.get("pos") || "";
    const sideParam = params.get("side") || "";
    if (car.includes(",")) {
      const [carMake, carModel, carYear] = car.split(",");
      if (carMake) setMake(carMake);
      if (carModel) setModel(carModel);
      if (carYear) setYear(carYear);
    } else if (car) {
      setVariantId(car);
    }
    if (part) setComponentId(part);
    if (pos) setPosition(pos);
    if (sideParam) setSide(sideParam);
  }, []);

  useEffect(() => {
    const car = variantId && variantId !== "any" ? variantId : (make && model && year ? `${make},${model},${year}` : "");
    writeCatalogSearch({
      car: car || null,
      part: componentId || null,
      pos: position || null,
      side: side || null,
    }, "replace");
  }, [make, model, year, variantId, componentId, position, side]);

  const options = useQuery({
    queryKey: ["vehicle-options", make, model],
    queryFn: () => fetchVehicleOptions({ make, model }),
  });

  const preview = useQuery({
    queryKey: ["find-parts-preview", make, model, year],
    queryFn: () => fetchFindParts({ make, model, year }),
    enabled: Boolean(make && model && year),
  });

  const chosenId = variantId && variantId !== "any" ? variantId : "";

  const browse = useQuery({
    queryKey: ["parts-browse"],
    queryFn: fetchPartsBrowse,
    enabled: step === "part" || step === "position" || step === "all",
  });

  const symptoms = useQuery({
    queryKey: ["parts-symptoms"],
    queryFn: fetchSymptoms,
    enabled: step === "part",
  });

  const terms = useQuery({
    queryKey: ["part-term", termQuery],
    queryFn: () => fetchPartTerm(termQuery),
    enabled: step === "part" && termQuery.length >= 2,
  });

  const search = useQuery({
    queryKey: ["find-parts-search", make, model, year, variantId, componentId, position, side, step],
    queryFn: () => fetchFindParts({
      make,
      model,
      year,
      variantId: variantId || undefined,
      componentId: step === "all" ? undefined : componentId || undefined,
      position: position || undefined,
      side: side || undefined,
    }),
    enabled: step === "results" || step === "missing" || step === "all",
  });

  const variants = preview.data?.variants ?? [];
  const coverageVariantId = chosenId || variants[0]?.id || "";
  const coverage = useQuery({
    queryKey: ["find-parts-coverage", coverageVariantId],
    queryFn: () => fetchFindPartsCoverage(coverageVariantId),
    enabled: Boolean(coverageVariantId) && (step === "part" || step === "position" || step === "all"),
  });
  const candidates = useMemo(() => {
    if (preview.data?.candidates?.length) return preview.data.candidates;
    return variants.map((row) => ({
      id: row.id,
      plainLabel: row.chassis_code || row.model,
      codeLine: [row.chassis_code, row.engine_code].filter(Boolean).join(" · "),
    }));
  }, [preview.data?.candidates, variants]);
  const picked = candidates.find((row) => row.id === variantId);
  const versionLabel = variantId === "any" ? `Fits every ${[year, make, model].filter(Boolean).join(" ")}` : (picked?.plainLabel || "");
  const codes = picked?.codeLine ? [picked.codeLine] : [];
  const years = options.data?.years ?? [];
  const spanYears = variants.flatMap((row) => [row.production_start_year, row.production_end_year].filter((value): value is number => typeof value === "number"));
  const yearSpan = spanYears.length > 0 ? `${Math.min(...spanYears)}–${Math.max(...spanYears)}` : "";
  const carCoverage = useQuery({
    queryKey: ["find-parts-coverage-sum", variants.map((row) => row.id)],
    queryFn: async () => {
      const rows = await Promise.all(variants.map((row) => fetchFindPartsCoverage(row.id)));
      return rows.reduce((sum, row) => sum + row.areas.reduce((areaSum, area) => areaSum + area.count, 0), 0);
    },
    enabled: variants.length > 0,
  });
  const partCount = carCoverage.data ?? null;

  function remember() {
    if (!make || !model || !year) return;
    const next = [{ make, model, year }, ...recent.filter((row) => !(row.make === make && row.model === model && row.year === year))].slice(0, 8);
    setRecent(next);
    saveRecent(next);
  }

  function continueCar() {
    if (!make || !model || !year || preview.isLoading || variants.length === 0) return;
    remember();
    if (preview.data?.askVariant || (preview.data?.candidates?.length || variants.length) > 1) {
      setVariantId("");
      setStep("version");
      return;
    }
    setVariantId(preview.data?.pickedVariantId || variants[0]?.id || "");
    setStep("part");
  }

  function pickPart(id: string, name: string, aware: boolean) {
    setComponentId(id);
    setPartName(name);
    setPositionAware(aware);
    setPosition("");
    setSide("");
    if (aware) setStep("position");
    else setStep("results");
  }

  function openPartHit(part: FoundPartRow) {
    setDetail(part);
  }

  function requestAdd() {
    if (!owner) return;
    if (!variantId || variantId === "any") {
      setAddAfterVersion(true);
      setStep("version");
      return;
    }
    onAdd(variantId);
  }

  const counts = new Map((coverage.data?.areas ?? []).map((row) => [row.id, row.count]));
  const areas = (browse.data?.systems ?? []).map((system) => ({
    ...system,
    components: system.components.map((row) => ({ ...row, count: counts.get(row.id) ?? 0 })),
  }));
  const common = (browse.data?.common ?? []).map((row) => {
    const match = areas.flatMap((area) => area.components).find((item) => item.id === row.id);
    return { ...row, positionAware: match?.positionAware ?? false };
  });
  const hits = (terms.data?.hits ?? []).map((row) => {
    const componentId = row.componentId ?? (row.kind !== "part" ? row.id : null);
    const matchArea = componentId
      ? areas.find((area) => area.components.some((item) => item.id === componentId))
      : undefined;
    const synonymTerm = row.kind === "synonym"
      ? terms.data?.synonyms?.find((syn) => syn.componentId === componentId)?.term
      : undefined;
    return {
      id: row.id,
      plainName: row.plainName,
      kind: row.kind,
      note: synonymTerm,
      tag: matchArea?.plainName,
    };
  }).filter((row) => row.id && row.plainName);
  const problems = (symptoms.data?.symptoms ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    hint: row.hint,
    parts: row.components.map((link) => {
      const match = areas.flatMap((area) => area.components).find((item) => item.id === link.componentId);
      return match ? { id: match.id, plainName: match.plainName, positionAware: match.positionAware } : null;
    }).filter((item): item is { id: string; plainName: string; positionAware: boolean } => Boolean(item)),
  }));
  const carLabel = [year, make, model].filter(Boolean).join(" ");
  const sideLabel = side === "left" ? "Left" : side === "right" ? "Right" : position === "front" ? "Front" : position === "rear" ? "Back" : position === "both" ? "Both" : "";
  const active = step === "car" ? 1 : step === "version" ? 2 : step === "part" ? 3 : step === "position" ? 4 : 5;
  const result = search.data;
  const drawerCrossRefs = useMemo(() => {
    if (!detail) return [];
    const rows = (result?.plainSections ?? []).flatMap((section) => section.items);
    return rows.filter((row) => row.tier === 4 && row.partId !== detail.partId).slice(0, 8);
  }, [detail, result?.plainSections]);
  const emptyResult = result ? sectionCount(result) === 0 : false;
  const title = partName
    ? `${partName} for the ${carLabel}${versionLabel && variantId !== "any" ? ` ${versionLabel}` : ""}${sideLabel ? ` · ${sideLabel}` : ""}`
    : `Everything on file for the ${carLabel}`;
  const trail: TrailChip[] = [
    { label: carLabel || "Car", step: "car" },
    ...(versionLabel ? [{ label: versionLabel, step: "version" as const }] : []),
    ...(partName ? [{ label: partName, step: "part" as const }] : []),
    ...(sideLabel ? [{ label: sideLabel, step: "position" as const }] : []),
  ];

  const engines = [...new Set(variants.map((row) => row.engine_code).filter((code): code is string => Boolean(code)))];
  return (
    <div className="find-parts-flow">
      <StepBar
        kind={step === "version" ? "pills" : step === "part" ? "route" : step === "position" ? "axle" : step === "results" || step === "missing" || step === "all" ? "progress" : "boxes"}
        partLabel={partName}
        active={active}
        carLabel={carLabel}
        versionAnswer={step !== "car" && step !== "version" ? versionLabel : ""}
        sideAnswer={step === "results" || step === "missing" || step === "all" ? sideLabel : ""}
        resultsOnFile={step === "results" && result && emptyResult ? 0 : step === "results" && result ? sectionCount(result) : undefined}
        onOpen={(next) => {
          const name = next === 1 ? "car" : next === 2 ? "version" : next === 3 ? "part" : next === 4 ? "position" : "results";
          setStep(name);
        }}
      />
      {step === "results" || step === "missing" ? (
        <ChoiceTrail chips={trail} gapDetected={Boolean(result && emptyResult)} onOpen={(next) => setStep(next)} />
      ) : null}
      {step === "car" && options.isLoading ? <PartsLoading /> : null}
      {step === "car" && options.isError ? (
        <PartsError message="Could not load parts. Nothing was changed." onRetry={() => { void options.refetch(); }} />
      ) : null}
      {step === "car" && !options.isLoading && !options.isError ? (
        <>
          <CarStep
            makes={options.data?.makes ?? []}
            models={options.data?.models ?? []}
            years={years}
            make={make}
            model={model}
            year={year}
            quick={quick}
            codes={variants.map((row) => row.chassis_code).filter((code): code is string => Boolean(code))}
            engines={engines}
            yearSpan={model ? yearSpan : ""}
            partCount={partCount}
            ready={Boolean(make && model && year && variants.length > 0 && !preview.isLoading)}
            owner={owner}
            recent={recent}
            onMake={(value) => { setMake(value); setModel(""); setYear(""); setVariantId(""); }}
            onModel={(value) => { setModel(value); setYear(""); setVariantId(""); }}
            onYear={(value) => { setYear(value); setVariantId(""); }}
            onQuick={(value) => {
              setQuick(value);
              const parsed = readQuick(value, options.data?.makes ?? []);
              if (!parsed) return;
              setMake(parsed.make);
              setModel(parsed.model);
              setYear(String(parsed.year));
            }}
            onClearQuick={() => setQuick("")}
            onContinue={continueCar}
            onRecent={(row) => { setMake(row.make); setModel(row.model); setYear(row.year); setQuick(`${row.make} ${row.model} ${row.year}`); }}
            onClearRecent={() => { setRecent([]); clearStoredRecent(); }}
          />
          {make && model && year && preview.isSuccess && variants.length === 0 ? (
            <div className="max-w-4xl mx-auto mt-4">
              <CarNotInCatalog
                carLabel={carLabel}
                make={make}
                modelYearHint={yearSpan ? `Known catalog span for ${make} ${model}: ${yearSpan}. Your year (${year}) may fall outside that range.` : undefined}
                onAddCar={() => { window.location.search = "?page=motor-vehicles"; }}
                onBrowseMake={() => { setModel(""); setYear(""); }}
              />
            </div>
          ) : null}
        </>
      ) : null}
      {step === "version" ? (
        <VariantStep
          carLabel={carLabel}
          candidates={candidates}
          pickedId={variantId}
          onPick={setVariantId}
          onNotSure={() => { setVariantId("any"); setAddAfterVersion(false); setStep("part"); }}
          onBack={() => { setAddAfterVersion(false); setStep("car"); }}
          onContinue={() => {
            if (addAfterVersion) {
              if (variantId && variantId !== "any") onAdd(variantId);
              return;
            }
            if (variantId === "any" || variantId) setStep("part");
          }}
        />
      ) : null}
      {step === "part" && browse.isLoading ? <PartsLoading /> : null}
      {step === "part" && browse.isError ? (
        <PartsError message="Could not load parts. Nothing was changed." onRetry={() => { void browse.refetch(); }} />
      ) : null}
      {step === "part" && browse.data ? (
        <PartStep
          query={partQuery}
          areas={areas}
          common={common}
          partTotal={[...counts.values()].reduce((sum, count) => sum + count, 0)}
          hits={hits}
          problems={problems}
          carLabel={carLabel}
          onQuery={setPartQuery}
          onPick={pickPart}
          onPartHit={openPartHit}
          onSkip={() => { setComponentId(""); setPartName(""); setPosition(""); setSide(""); setStep("all"); }}
          onBack={() => setStep((preview.data?.candidates?.length || variants.length) > 1 ? "version" : "car")}
        />
      ) : null}
      {step === "position" ? (
        <PositionStep
          partName={partName}
          partCount={counts.get(componentId) ?? null}
          geometryTitle={[
            make,
            model,
            (() => {
              const chassis = picked?.codeLine?.split(" · ")[0]?.trim();
              return chassis ? `(${chassis})` : picked?.plainLabel ? `(${picked.plainLabel})` : "";
            })(),
          ].filter(Boolean).join(" ")}
          onChoose={(nextPosition, nextSide) => {
            setPosition(nextPosition === "both" ? "" : nextPosition);
            setSide(nextSide === "both" ? "" : nextSide);
            setStep("results");
          }}
          onBack={() => setStep("part")}
        />
      ) : null}
      {(step === "results" || step === "missing" || step === "all") && search.isLoading ? <PartsLoading /> : null}
      {(step === "results" || step === "missing" || step === "all") && search.isError ? (
        <PartsError message="Could not load parts. Nothing was changed." onRetry={() => { void search.refetch(); }} />
      ) : null}
      {step === "results" && result && !emptyResult ? (
        <ResultsView
          title={title}
          codeLine={codes.join(" · ")}
          fitsEvery={variantId === "any" ? versionLabel : ""}
          candidates={candidates}
          result={result}
          owner={owner}
          onAdd={requestAdd}
          onBack={() => setStep(positionAware ? "position" : "part")}
          onOpen={setDetail}
          onOpenDatabase={() => { if (chosenId) onOpenVehicle?.(chosenId); }}
        />
      ) : null}
      {step === "all" && result ? (
        <AllPartsView
          carLabel={carLabel}
          versionLabel={variantId !== "any" ? (picked?.plainLabel || versionLabel) : versionLabel}
          chassisCode={String(variants.find((row) => row.id === (chosenId || variants[0]?.id))?.chassis_code ?? "").trim()}
          engineCode={String(variants.find((row) => row.id === (chosenId || variants[0]?.id))?.engine_code ?? "").trim()}
          areas={areas}
          result={result}
          owner={owner}
          onAdd={requestAdd}
          onOpen={setDetail}
          onBack={() => setStep("part")}
          onOpenStep={(next) => setStep(next)}
          onOpenDatabase={() => {
            const id = chosenId || variants[0]?.id || "";
            if (id) onOpenVehicle?.(id);
          }}
        />
      ) : null}
      {(step === "missing" || (step === "results" && result && emptyResult)) && result ? (
        <MissingPart
          headline={`We don't have ${sideLabel ? `${sideLabel.toLowerCase()} ` : position ? `${position === "rear" ? "rear" : "front"} ` : ""}${partName.toLowerCase()} for the ${carLabel}${versionLabel && variantId !== "any" ? ` ${versionLabel}` : ""} yet.`}
          partName={partName}
          carLabel={carLabel}
          versionLabel={variantId !== "any" ? versionLabel : ""}
          sideLabel={sideLabel}
          position={position}
          side={side}
          vehicleChip={[make, model, picked?.codeLine?.split(" · ")[0]].filter(Boolean).join(" ")}
          chassisLabel={picked?.codeLine?.split(" · ")[0] ?? ""}
          variantId={chosenId}
          componentId={componentId}
          owner={owner}
          onAdd={requestAdd}
          onSearch={() => setStep("part")}
        />
      ) : null}
      {detail ? (
        <PartDetailDrawer
          part={detail}
          candidates={candidates}
          owner={owner}
          componentId={componentId}
          onClose={() => setDetail(null)}
          onEdit={requestAdd}
          onConfirmed={() => { void search.refetch(); }}
          crossReferences={drawerCrossRefs}
        />
      ) : null}
    </div>
  );
}
