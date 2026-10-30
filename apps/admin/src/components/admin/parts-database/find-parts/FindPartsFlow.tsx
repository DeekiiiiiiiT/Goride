// Stitch: dominion-redesign/S42
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthContext";
import { parseQuickCar } from "../../../../../../../packages/types/src/findPartsParse";
import { fetchVehicleOptions } from "../partsDatabaseApi";
import { PartsError, PartsLoading } from "../PartsDatabaseStates";
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

export function FindPartsFlow({
  initialVariantId,
  onAdd,
}: {
  initialVariantId?: string;
  onAdd: (variantId: string) => void;
}) {
  const { role } = useAuth();
  const owner = role === "platform_owner";
  const [step, setStep] = useState<Step>("car");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [quick, setQuick] = useState("");
  const [variantId, setVariantId] = useState(initialVariantId ?? "");
  const [componentId, setComponentId] = useState("");
  const [partName, setPartName] = useState("");
  const [positionAware, setPositionAware] = useState(false);
  const [position, setPosition] = useState("");
  const [side, setSide] = useState("");
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
    const params = new URLSearchParams(window.location.search);
    const car = variantId && variantId !== "any" ? variantId : (make && model && year ? `${make},${model},${year}` : "");
    if (car) params.set("car", car);
    else params.delete("car");
    if (componentId) params.set("part", componentId);
    else params.delete("part");
    if (position) params.set("pos", position);
    else params.delete("pos");
    if (side) params.set("side", side);
    else params.delete("side");
    const next = `${window.location.pathname}?${params.toString()}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState({}, "", next);
    }
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

  const coverage = useQuery({
    queryKey: ["find-parts-coverage", chosenId],
    queryFn: () => fetchFindPartsCoverage(chosenId),
    enabled: Boolean(chosenId),
  });

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
  const yearSpan = years.length > 0 ? `Series: ${Math.min(...years)}–${Math.max(...years)}` : "";
  const partCount = coverage.data ? coverage.data.areas.reduce((sum, row) => sum + row.count, 0) : null;

  function remember() {
    if (!make || !model || !year) return;
    const next = [{ make, model, year }, ...recent.filter((row) => !(row.make === make && row.model === model && row.year === year))].slice(0, 8);
    setRecent(next);
    saveRecent(next);
  }

  function continueCar() {
    remember();
    if (preview.data?.askVariant) {
      setVariantId("");
      setStep("version");
      return;
    }
    if ((preview.data?.candidates?.length || variants.length) > 1) {
      setVariantId("any");
      setStep("part");
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
  const hits = (terms.data?.hits ?? []).map((row) => ({
    id: row.id,
    plainName: row.plainName,
    kind: row.kind,
    note: row.kind === "synonym" ? "search word" : undefined,
  })).filter((row) => row.id && row.plainName);
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

  return (
    <div className="find-parts-flow">
      <StepBar
        active={active}
        versionAnswer={step !== "car" && step !== "version" ? versionLabel : ""}
        sideAnswer={step === "results" || step === "missing" || step === "all" ? sideLabel : ""}
      />
      {step !== "car" ? <ChoiceTrail chips={trail} onOpen={(next) => setStep(next)} /> : null}
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
            <div className="max-w-4xl mx-auto mt-4 rounded-xl bg-surface-container-lowest p-space-md">
              <h2 className="font-headline-md text-headline-md font-bold text-on-surface">This car is not in the catalog.</h2>
              <div className="flex flex-wrap gap-3 mt-3">
                <button type="button" className="h-12 px-4 rounded-xl bg-primary-container text-on-primary" onClick={() => { window.location.search = "?page=motor-vehicles"; }}>+ Add this car</button>
                <button type="button" className="h-12 px-4 rounded-xl bg-surface-container-low" aria-label="Browse all Honda models" onClick={() => { setModel(""); setYear(""); }}>Browse all {make || "Honda"} models</button>
              </div>
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
          onQuery={setPartQuery}
          onPick={pickPart}
          onPartHit={openPartHit}
          onSkip={() => { setComponentId(""); setPartName(""); setPosition(""); setSide(""); setStep("all"); }}
          onBack={() => setStep(preview.data?.askVariant ? "version" : "car")}
        />
      ) : null}
      {step === "position" ? (
        <PositionStep
          partName={partName}
          partCount={counts.get(componentId) ?? null}
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
        />
      ) : null}
      {step === "all" && result ? (
        <AllPartsView areas={areas} result={result} owner={owner} onAdd={requestAdd} onOpen={setDetail} onBack={() => setStep("part")} />
      ) : null}
      {(step === "missing" || (step === "results" && result && emptyResult)) && result ? (
        <MissingPart
          partName={partName}
          carLabel={`${carLabel}${versionLabel && variantId !== "any" ? ` ${versionLabel}` : ""}`}
          variantId={chosenId}
          componentId={componentId}
          owner={owner}
          onAdd={requestAdd}
          onSearch={() => setStep("part")}
        />
      ) : null}
      <p className="font-body-sm text-body-sm text-secondary px-1">Ingestion rules & aliases</p>
      {detail ? (
        <PartDetailDrawer
          part={detail}
          candidates={candidates}
          owner={owner}
          componentId={componentId}
          onClose={() => setDetail(null)}
          onEdit={requestAdd}
        />
      ) : null}
    </div>
  );
}
