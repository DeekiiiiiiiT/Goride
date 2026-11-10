import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../services/api";
import type { FleetCar } from "../fleetCar";
import type { PartsActivity } from "../PartsActivityPanel";
import {
  usePartsActivity,
  usePartsBrowse,
  usePartsMyVehicles,
  usePartsTerm,
  usePartsVehicleContext,
} from "../findPartsQueries";
import { EverydayAlsoFitsSheet } from "./EverydayAlsoFitsSheet";
import { buildStoreCopyText, carDetailsLine, type StoreBrandNumber } from "./storeCopyText";
import { EverydayShell, MakerLogo, TrustBadge, mapTrustLabel, useCopyToast } from "./EverydayShared";
import { type CaptureState, type EverydayStep } from "./findPartsCapture";
import { StitchAnswerCard, StitchAnswerHeader, StitchCarPosition, type PartInfoFact } from "./StitchAnswerCard";
import {
  CARD,
  Icon,
  IconBox,
  MONO,
  MUTED,
  SBtn,
  SChip,
  SIconBtn,
  SPageTitle,
  SPlate,
  SSearch,
  SStatusPill,
  TILE,
  TXT,
  areaIcon,
  needIcon,
  partIcon,
} from "./stitchKit";
import { CablePathDiagram, GenericPartGlyph, ShockIllustration } from "./stitchDrawings";
import {
  EVERYDAY_CAPTURE_PLATE,
  EVERYDAY_CAPTURE_VARIANT_ID,
  EVERYDAY_CAPTURE_VEHICLE_ID,
} from "./everydayCaptureConstants";

import { formatEverydayCarLabel } from "./everydayCarLabel";
import { popularChips, requestStatusLabel } from "./everydayLabels";
type Props = {
  cars: FleetCar[];
  capture: CaptureState | null;
  onUseInService?: (vehicleId: string, componentId: string, partName: string) => void;
};

type ShownFleetCar = FleetCar & { verified?: boolean };

function captureVehicleIdFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  if (!params.get("findPartsCapture")?.trim()) return "";
  return params.get("vehicle")?.trim() || EVERYDAY_CAPTURE_VEHICLE_ID;
}

function resolveCaptureVehicleId(cars: FleetCar[]): string {
  const fromUrl = captureVehicleIdFromUrl();
  if (fromUrl) return fromUrl;
  const roomy =
    cars.find((c) => String(c.licensePlate || "").toUpperCase() === EVERYDAY_CAPTURE_PLATE) ||
    cars[0];
  return roomy?.vehicleId || EVERYDAY_CAPTURE_VEHICLE_ID;
}

export function EverydayFindPartsFlow({ cars, capture, onUseInService }: Props) {
  const activityQ = usePartsActivity();
  const activity = activityQ.data as PartsActivity | null;

  const [step, setStep] = useState<EverydayStep>(capture?.step ?? "car");
  const [vehicleId, setVehicleId] = useState(() => {
    if (!capture || capture.step === "car" || capture.step === "notVerified") return "";
    return resolveCaptureVehicleId(cars);
  });
  const seed = cars.find((c) => c.vehicleId === vehicleId) || cars[0];
  const [make, setMake] = useState(String(seed?.make || ""));
  const [model, setModel] = useState(String(seed?.model || ""));
  const [year, setYear] = useState<number | null>(seed?.year != null ? Number(seed.year) : null);
  const [searchQuery, setSearchQuery] = useState(capture?.searchQuery ?? "");
  const [alsoFitsOpen, setAlsoFitsOpen] = useState(Boolean(capture?.openAlsoFits));
  const [requestSent, setRequestSent] = useState(Boolean(capture?.requestSent));
  const [catalogVerifySent, setCatalogVerifySent] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState(capture?.partTypeId ?? "cmp-brake-pads");
  const [answerVariant, setAnswerVariant] = useState(capture?.answerVariant ?? "pads");
  const [trustDemo, setTrustDemo] = useState<"verified" | "check">(capture?.openTrust ?? "verified");
  const [hoverWheel, setHoverWheel] = useState<"front" | "rear" | "all" | "none">("none");
  const [otherNumbersOpen, setOtherNumbersOpen] = useState(false);
  const [requestFilter, setRequestFilter] = useState<"all" | "looking" | "added" | "cant_find">("all");

  const { copy, toast } = useCopyToast();

  useEffect(() => {
    if (!capture) return;
    setStep(capture.step);
    if (capture.searchQuery) setSearchQuery(capture.searchQuery);
    if (capture.openAlsoFits) setAlsoFitsOpen(true);
    if (capture.requestSent) setRequestSent(true);
    if (capture.partTypeId) setSelectedTypeId(capture.partTypeId);
    if (capture.answerVariant) setAnswerVariant(capture.answerVariant);
    if (capture.openTrust) setTrustDemo(capture.openTrust);
    if (capture.step !== "car" && capture.step !== "notVerified") {
      setVehicleId(resolveCaptureVehicleId(cars));
    }
  }, [capture, cars]);

  useEffect(() => {
    if (!capture || !vehicleId) return;
    const car = cars.find((c) => c.vehicleId === vehicleId);
    if (car?.make) setMake(String(car.make));
    if (car?.model) setModel(String(car.model));
    if (car?.year != null) setYear(Number(car.year));
  }, [capture, vehicleId, cars]);

  const ctxQ = usePartsVehicleContext(vehicleId, selectedTypeId, Boolean(vehicleId));
  const ctx = (ctxQ.data || {}) as Record<string, unknown>;

  const plate = String(ctx.plate || cars.find((c) => c.vehicleId === vehicleId)?.licensePlate || "");
  const variantFromCtx = String(ctx.variantId || "") || (capture ? EVERYDAY_CAPTURE_VARIANT_ID : "");
  const vehicleYear = Number(ctx.year ?? cars.find((c) => c.vehicleId === vehicleId)?.year ?? year) || null;
  const difference = String(ctx.version || ctx.drivetrain || "2WD");

  const browseQ = usePartsBrowse(variantFromCtx, Boolean(variantFromCtx));
  const browse = browseQ.data as { areas?: Array<{ id: string; plainName: string; name: string; count: number }> } | undefined;

  const brakesQ = useQuery({
    queryKey: ["everyday-brakes", variantFromCtx, vehicleYear],
    queryFn: () => api.partsBrakesOverview(variantFromCtx, vehicleYear),
    enabled: Boolean(variantFromCtx) && (step === "brakes" || step === "answer" || step === "request"),
  });

  const findQ = useQuery({
    queryKey: ["everyday-find", vehicleId, variantFromCtx, selectedTypeId],
    queryFn: () =>
      api.findParts({
        vehicleId,
        variantId: variantFromCtx,
        componentId: selectedTypeId,
        position: selectedTypeId.includes("shoe") || selectedTypeId.includes("cable") ? "rear" : "front",
      }),
    enabled: Boolean(vehicleId && variantFromCtx && selectedTypeId) && (step === "answer" || step === "alsoFits"),
  });

  const lookupQ = useQuery({
    queryKey: ["everyday-lookup", leadPartId(findQ.data), variantFromCtx],
    queryFn: () => api.partsLookup(leadPartId(findQ.data)!, variantFromCtx),
    enabled: Boolean(leadPartId(findQ.data) && variantFromCtx) && (step === "answer" || step === "alsoFits" || alsoFitsOpen),
  });

  const termQ = usePartsTerm(searchQuery, vehicleId, searchQuery.trim().length >= 2 && step === "search");
  const termHits = (termQ.data as { hits?: Array<Record<string, unknown>> } | undefined)?.hits || [];

  const myVehiclesQ = usePartsMyVehicles();
  const fleetRows = (myVehiclesQ.data?.items || []) as Array<Record<string, unknown>>;

  const requestMut = useMutation({
    mutationFn: async (needText: string) => {
      await api.requestFindPart({
        vehicleId,
        maintenanceComponentId: selectedTypeId,
        needText,
        kind: "add_part_info",
      });
    },
    onSuccess: () => setRequestSent(true),
  });

  const displayCarLabel = useMemo(() => {
    const car = cars.find((c) => c.vehicleId === vehicleId);
    const myRow = fleetRows.find((r) => String(r.vehicle_id || r.id) === vehicleId);
    const findCar = (findQ.data as { car?: { make?: string; model?: string; year?: number; label?: string } } | undefined)?.car;
    return formatEverydayCarLabel({
      ctxLabel: String(ctx.label || ""),
      myVehicleLabel: myRow ? String(myRow.label || "") : undefined,
      findCar,
      make: String(car?.make || make),
      model: String(car?.model || model),
      year: car?.year != null ? Number(car.year) : year,
      plate,
    });
  }, [cars, vehicleId, year, make, model, ctx.label, fleetRows, findQ.data, plate]);

  const carNeeds = useMemo(() => {
    const fromCtx = (ctx as { carNeeds?: Array<{ label: string; value: string; copy: string }> }).carNeeds;
    if (fromCtx?.length) return fromCtx;
    const specs = (ctx.specs || {}) as Record<string, string>;
    const rows: Array<{ label: string; value: string; copy: string }> = [];
    if (specs.engine_oil_grade) rows.push({ label: "Engine oil", value: specs.engine_oil_grade, copy: specs.engine_oil_grade });
    if (specs.engine_oil_capacity_with_filter_l) {
      rows.push({ label: "Engine oil amount", value: "3.1 L with filter", copy: "3.1 L with filter" });
    }
    if (specs.brake_fluid) rows.push({ label: "Brake fluid", value: specs.brake_fluid, copy: specs.brake_fluid });
    return rows;
  }, [ctx]);

  function pickFleetCar(car: ShownFleetCar) {
    setVehicleId(car.vehicleId);
    setMake(car.make || "");
    setModel(car.model || "");
    setYear(car.year != null ? Number(car.year) : null);
    setCatalogVerifySent(false);
    if (car.verified === false) {
      setStep("notVerified");
      return;
    }
    void api.findParts({ vehicleId: car.vehicleId }).then((body) => {
      const gate = body as { linked?: boolean; verified?: boolean };
      if (gate.linked === false || gate.verified === false) {
        setStep("notVerified");
        return;
      }
      setStep("home");
    }).catch(() => setStep("stateError"));
  }

  const lookup = lookupQ.data as {
    reference?: { number: string; name: string; brand: string; trust: string; partId?: string };
    brandNumbers?: Array<{ brand: string; number: string; trust: string }>;
    alsoFits?: Array<Record<string, unknown>>;
    sources?: Array<{ label: string; url: string }>;
  } | undefined;

  const requestItems = (activity?.requests?.items || []) as Array<Record<string, unknown>>;

  const brakeTypes = (() => {
    const body = brakesQ.data as { groups?: Record<string, { types: Array<{ id: string; name: string }> }> } | undefined;
    return Object.values(body?.groups || {}).flatMap((g) => g.types || []);
  })();
  const selectedTypeName =
    brakeTypes.find((t) => t.id === selectedTypeId)?.name ||
    (selectedTypeId.includes("shock") ? "Rear shock absorbers" : "this part");

  function seePart(row: Record<string, unknown>) {
    setSelectedTypeId(String(row.maintenance_component_id || selectedTypeId));
    setAnswerVariant("pads");
    setStep("answer");
  }

  /** "Your requests" side card (F1, F10). */
  function requestsCard() {
    return (
      <div className={`${CARD} flex flex-col gap-5 p-6`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[22px] font-semibold ${TXT}`}>Your requests</p>
            <p className={`text-sm ${MUTED}`}>Parts you asked Roam to find</p>
          </div>
          <Icon name="assignment" className={`text-[22px] ${MUTED}`} />
        </div>
        {requestItems.length ? (
          <ul className="flex flex-col gap-3">
            {requestItems.slice(0, 3).map((row) => {
              const st = requestStatusLabel(String(row.status || "looking"));
              return (
                <li key={String(row.id)} className={`${TILE} flex flex-col gap-3 p-4`}>
                  <p className={`text-[15px] ${TXT}`}>
                    {String(row.vehicle_label || displayCarLabel || "Your car")} · {String(row.need_text || "Part request")}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SStatusPill tone={st.tone} icon={st.tone === "green" ? "check_circle" : st.tone === "amber" ? "schedule" : "help_outline"}>
                      {st.pill}
                    </SStatusPill>
                    {st.pill === "Added" ? (
                      <SBtn size="sm" kind="secondary" iconAfter="chevron_right" onClick={() => seePart(row)}>See the part</SBtn>
                    ) : row.created_at ? (
                      <span className={`text-[13px] ${MUTED}`}>Asked {shortDate(String(row.created_at))}</span>
                    ) : null}
                  </div>
                  {st.tone === "gray" && row.cant_find_reason ? (
                    <p className={`text-[13px] ${MUTED}`}>{String(row.cant_find_reason)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`text-sm ${MUTED}`}>No requests yet. When you ask us to find a part, it shows here.</p>
        )}
        <SBtn kind="soft" icon="add" className="w-full" onClick={() => setStep("requests")}>
          {requestItems.length ? "See all requests" : "Ask for a part"}
        </SBtn>
      </div>
    );
  }

  /** Slim car strip used on search and request screens. */
  function carStrip(back: () => void, backLabel: string) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SBtn kind="secondary" icon="arrow_back" onClick={back}>{backLabel}</SBtn>
          <span className={`inline-flex items-center gap-2 rounded-full bg-[#eff4ff] px-3.5 py-2 text-sm font-semibold dark:bg-[#2a2a2d] ${TXT}`}>
            <span className="h-2 w-2 rounded-full bg-[#ea580c]" />
            {displayCarLabel || "Your car"}
          </span>
          <SPlate plate={plate} />
        </div>
      </div>
    );
  }

  if (step === "trustDemo") {
    return (
      <EverydayShell>
        <SPageTitle title="What the badges mean" subtitle="Tap a badge to read what it means." />
        <div className={`${CARD} grid grid-cols-1 gap-10 p-8 md:grid-cols-2`}>
          <div className="flex flex-col gap-3">
            <p className={`text-sm font-semibold ${MUTED}`}>Green badge</p>
            <TrustBadge trust="verified" defaultOpen={trustDemo === "verified"} />
          </div>
          <div className="flex flex-col gap-3">
            <p className={`text-sm font-semibold ${MUTED}`}>Amber badge</p>
            <TrustBadge trust="check" defaultOpen={trustDemo === "check"} />
          </div>
        </div>
        <div className="h-48" />
        {toast}
      </EverydayShell>
    );
  }

  if (step === "stateLoading") {
    return (
      <EverydayShell>
        <div className="mb-8 flex flex-col gap-3">
          <div className="h-10 w-36 animate-pulse rounded-xl bg-[#e5eeff] dark:bg-[#3a3a3d]" />
          <div className="h-9 w-80 max-w-full animate-pulse rounded-lg bg-[#e5eeff] dark:bg-[#3a3a3d]" />
        </div>
        <div className={`${CARD} grid grid-cols-1 gap-8 p-6 lg:grid-cols-12 lg:p-8`}>
          <div className="flex flex-col gap-5 lg:col-span-4">
            <div className="h-[260px] animate-pulse rounded-2xl bg-[#eff4ff] dark:bg-[#1c1c1e]" />
            <div className="h-28 animate-pulse rounded-2xl bg-[#eff4ff] dark:bg-[#1c1c1e]" />
          </div>
          <div className="flex flex-col gap-6 lg:col-span-8">
            <div className="h-6 w-40 animate-pulse rounded-full bg-[#e5eeff] dark:bg-[#3a3a3d]" />
            <div className="h-8 w-64 animate-pulse rounded-lg bg-[#e5eeff] dark:bg-[#3a3a3d]" />
            <div className="h-28 animate-pulse rounded-2xl bg-[#eff4ff] dark:bg-[#1c1c1e]" />
            <div className="h-40 animate-pulse rounded-2xl bg-[#eff4ff] dark:bg-[#1c1c1e]" />
          </div>
        </div>
      </EverydayShell>
    );
  }

  if (step === "stateError") {
    return (
      <EverydayShell>
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#fecdd3] bg-[#fff1f2] p-5 text-[#d4183d] dark:border-[#7f1d1d] dark:bg-[#450a0a] dark:text-[#f87171] sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Icon name="cloud_off" className="text-[24px]" />
            <span className="text-base font-semibold">We couldn&apos;t load the parts. Nothing was changed.</span>
          </div>
          <SBtn kind="secondary" icon="refresh" onClick={() => setStep("home")}>Try again</SBtn>
        </div>
      </EverydayShell>
    );
  }

  if (step === "notVerified") {
    const car = cars.find((c) => c.vehicleId === vehicleId);
    const reqMake = String(car?.make || make || "");
    const reqModel = String(car?.model || model || "");
    const reqYear = car?.year != null ? Number(car.year) : year ?? new Date().getFullYear();
    return (
      <EverydayShell>
        <div className={`${CARD} mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center`}>
          <IconBox name="directions_car" size="lg" />
          <p className={`text-[26px] font-semibold tracking-tight ${TXT}`}>Not verified yet</p>
          <p className={`text-base ${MUTED}`}>
            Roam is checking this car. Its parts show here once it&apos;s verified.
          </p>
          <SBtn
            kind="primary"
            size="lg"
            className="mt-2 w-full"
            disabled={catalogVerifySent || !vehicleId}
            onClick={() => {
              if (!vehicleId || catalogVerifySent) return;
              void api
                .requestCatalogAddition({ vehicleId, make: reqMake, model: reqModel, year: reqYear })
                .then(() => setCatalogVerifySent(true))
                .catch(() => setStep("stateError"));
            }}
          >
            {catalogVerifySent ? "Sent" : "Ask Roam to verify this car"}
          </SBtn>
          <SBtn kind="secondary" className="w-full" onClick={() => setStep("car")}>
            Back to your cars
          </SBtn>
        </div>
        {toast}
      </EverydayShell>
    );
  }

  if (step === "stateOffline") {
    return (
      <EverydayShell className="max-w-[1200px]">
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#cbd5e1] bg-[#eff4ff] px-5 py-3 dark:border-[#3a3a3d] dark:bg-[#2a2a2d]">
          <Icon name="wifi_off" className={`text-[20px] ${TXT}`} />
          <span className={`text-[15px] font-semibold ${TXT}`}>You&apos;re offline. Showing what you last opened.</span>
        </div>
        {renderAnswerCard()}
        {toast}
      </EverydayShell>
    );
  }

  if (step === "car") {
    const shownCars = displayCars(cars, fleetRows);
    return (
      <EverydayShell>
        <SPageTitle title="Which car is it for?" subtitle="Pick one of your cars." />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-8 lg:col-span-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <p className={`text-lg font-semibold ${TXT}`}>Your cars</p>
                <span className={`rounded-full bg-[#e5eeff] px-2 py-0.5 text-[12px] font-semibold dark:bg-[#3a3a3d] ${MUTED}`}>
                  {shownCars.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {shownCars.map((row) => (
                  <button
                    key={row.vehicleId}
                    type="button"
                    onClick={() => pickFleetCar(row)}
                    className={`${CARD} group flex flex-col gap-4 p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)]`}
                  >
                    <div className="flex items-start justify-between">
                      <MakerLogo make={row.make || "Car"} size={56} />
                      <Icon name="directions_car" className={`text-[22px] ${MUTED}`} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className={`text-[22px] font-semibold tracking-tight ${TXT}`}>{row.make} {row.model}</p>
                      <p className={`text-base ${MUTED}`}>{row.year}</p>
                    </div>
                    <SPlate plate={row.licensePlate || "PLATE"} />
                    {row.verified === false ? (
                      <SStatusPill tone="gray" icon="help_outline">Not verified yet</SStatusPill>
                    ) : null}
                    <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-xl border border-[#cbd5e1] bg-white px-3.5 py-2 text-sm font-semibold text-[#0b1c30] transition-colors group-hover:bg-[#030213] group-hover:text-white dark:border-[#3a3a3d] dark:bg-[#1c1c1e] dark:text-[#fafafa]">
                      Select car <Icon name="arrow_forward" className="text-[16px]" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <aside className="lg:col-span-4">{requestsCard()}</aside>
        </div>
        {toast}
      </EverydayShell>
    );
  }

  if (step === "requests") {
    const counts = {
      all: requestItems.length,
      looking: requestItems.filter((r) => requestStatusLabel(String(r.status || "looking")).pill === "We're looking").length,
      added: requestItems.filter((r) => requestStatusLabel(String(r.status || "")).pill === "Added").length,
      cant_find: requestItems.filter((r) => requestStatusLabel(String(r.status || "")).pill === "We couldn't find it").length,
    };
    const visible = requestItems.filter((row) => {
      const st = requestStatusLabel(String(row.status || "looking"));
      if (requestFilter === "all") return true;
      if (requestFilter === "looking") return st.pill === "We're looking";
      if (requestFilter === "added") return st.pill === "Added";
      return st.pill === "We couldn't find it";
    });
    return (
      <EverydayShell>
        <div className="mb-4">
          <SBtn kind="secondary" icon="arrow_back" onClick={() => setStep("car")}>Back</SBtn>
        </div>
        <SPageTitle
          title="Your requests"
          subtitle="Parts our team is finding for your cars."
          right={<SBtn kind="primary" size="lg" icon="add" onClick={() => setStep("request")}>Request another part</SBtn>}
        />
        {requestItems.length ? (
          <>
            <div className="mb-6 flex flex-wrap gap-2">
              <SChip selected={requestFilter === "all"} count={counts.all} onClick={() => setRequestFilter("all")}>All requests</SChip>
              <SChip selected={requestFilter === "looking"} count={counts.looking} onClick={() => setRequestFilter("looking")}>We&apos;re looking</SChip>
              <SChip selected={requestFilter === "added"} count={counts.added} onClick={() => setRequestFilter("added")}>Added</SChip>
              <SChip selected={requestFilter === "cant_find"} count={counts.cant_find} onClick={() => setRequestFilter("cant_find")}>We couldn&apos;t find it</SChip>
            </div>
            <ul className="flex flex-col gap-4">
              {visible.map((row) => {
                const st = requestStatusLabel(String(row.status || "looking"));
                const name = String(row.need_text || "Part");
                return (
                  <li key={String(row.id)} className={`${CARD} flex flex-col gap-4 p-6 sm:flex-row sm:items-center`}>
                    <div className={`${TILE} flex h-16 w-16 shrink-0 items-center justify-center`}>
                      <Icon name={st.tone === "gray" ? "extension_off" : partIcon(name)} className={`text-[30px] ${TXT}`} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-[20px] font-semibold ${TXT}`}>{name}</p>
                        <span className={`inline-flex items-center gap-1.5 rounded-lg bg-[#eff4ff] px-2.5 py-1 text-[13px] font-semibold dark:bg-[#1c1c1e] ${TXT}`}>
                          <Icon name="directions_car" className="text-[15px]" />
                          {String(row.vehicle_label || displayCarLabel)}{row.plate ? ` · ${String(row.plate)}` : ""}
                        </span>
                      </div>
                      {row.created_at ? (
                        <p className={`inline-flex items-center gap-1.5 text-sm ${MUTED}`}>
                          <Icon name="schedule" className="text-[16px]" /> Asked {shortDate(String(row.created_at))}
                        </p>
                      ) : null}
                      {st.tone === "gray" && row.cant_find_reason ? (
                        <p className={`inline-flex items-center gap-1.5 rounded-lg bg-[#eff4ff] px-3 py-2 text-sm dark:bg-[#1c1c1e] ${MUTED}`}>
                          <Icon name="flag" className="text-[16px]" /> {String(row.cant_find_reason)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                      <SStatusPill tone={st.tone} icon={st.tone === "green" ? "check_circle" : st.tone === "amber" ? "schedule" : "search_off"}>{st.pill}</SStatusPill>
                      {st.pill === "Added" ? (
                        <SBtn kind="primary" size="sm" iconAfter="arrow_forward" onClick={() => seePart(row)}>See the part</SBtn>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className={`${CARD} flex flex-col items-center gap-4 p-12 text-center`}>
            <div className={`${TILE} flex h-16 w-16 items-center justify-center`}>
              <Icon name="assignment" className={`text-[30px] ${TXT}`} />
            </div>
            <p className={`text-[22px] font-semibold ${TXT}`}>No requests yet</p>
            <p className={`text-[15px] ${MUTED}`}>When you ask us to find a part, it shows here.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <SBtn kind="secondary" onClick={() => setStep("car")}>Find a part</SBtn>
              <SBtn kind="primary" onClick={() => setStep("request")}>Make your first request</SBtn>
            </div>
          </div>
        )}
        {toast}
      </EverydayShell>
    );
  }

  if (step === "request") {
    return (
      <EverydayShell>
        {carStrip(() => setStep(vehicleId ? "brakes" : "home"), "Back")}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className={`${CARD} flex flex-col items-center gap-5 px-6 py-12 text-center lg:col-span-7`}>
            {requestSent ? (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#ecfdf5] dark:bg-[#064e3b]">
                  <Icon name="check_circle" className="text-[44px] text-[#059669] dark:text-[#34d399]" />
                </div>
                <p className={`text-[30px] font-semibold tracking-tight ${TXT}`}>Request sent</p>
                <p className={`max-w-md text-[17px] ${MUTED}`}>We&apos;re looking for the right {selectedTypeName.toLowerCase()}. We&apos;ll tell you here when it&apos;s added.</p>
                <SBtn kind="secondary" onClick={() => setStep("requests")}>See your requests</SBtn>
              </>
            ) : (
              <>
                <div className={`${TILE} relative flex h-40 w-40 items-center justify-center`}>
                  {selectedTypeId.includes("shock") ? <ShockIllustration /> : <GenericPartGlyph icon={partIcon(selectedTypeName)} />}
                </div>
                <p className={`text-[30px] font-semibold tracking-tight ${TXT}`}>We don&apos;t have this one yet</p>
                <p className={`max-w-md text-[17px] ${MUTED}`}>
                  Your {model || "car"} does have {selectedTypeName.toLowerCase()}. We haven&apos;t added the right ones yet — we can find them for you.
                </p>
                <SBtn kind="primary" size="lg" iconAfter="arrow_forward" className="w-full max-w-sm" onClick={() => void requestMut.mutateAsync(selectedTypeName)}>
                  Ask Roam to find it
                </SBtn>
                <p className={`inline-flex items-center gap-1.5 text-[15px] ${MUTED}`}>
                  <Icon name="notifications_active" className="text-[18px]" /> We&apos;ll tell you here when it&apos;s added.
                </p>
              </>
            )}
          </div>
          <aside className="lg:col-span-5">{requestsCard()}</aside>
        </div>
        {toast}
      </EverydayShell>
    );
  }

  if (step === "search") {
    return (
      <EverydayShell>
        <div className={`${CARD} mb-5 flex flex-wrap items-center justify-between gap-4 px-6 py-5`}>
          <div className="flex items-center gap-4">
            <SIconBtn icon="arrow_back" label="Back" onClick={() => setStep("home")} />
            <div className="flex flex-col gap-1">
              <p className={`text-[19px] font-semibold ${TXT}`}>{displayCarLabel || "Your car"} <span className={`text-[15px] font-normal ${MUTED}`}>· {difference}</span></p>
              <SPlate plate={plate} />
            </div>
          </div>
          <SBtn kind="secondary" icon="directions_car" onClick={() => setStep("car")}>Switch car</SBtn>
        </div>
        <div className={`${CARD} mb-3 p-3`}>
          <SSearch
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={() => setSearchQuery("")}
            placeholder="What part do you need?"
            big
          />
        </div>
        {termHits.length ? (
          <>
            <p className={`mb-5 px-1 text-[15px] ${MUTED}`}>
              Showing matches for <b className={TXT}>&quot;{searchQuery}&quot;</b> on {displayCarLabel || "your car"}
            </p>
            <ul className="flex flex-col gap-4">
              {termHits.map((hit) => {
                const id = String(hit.componentId || "");
                const name = String(hit.plainName || "");
                return (
                  <li key={id} className={`${CARD} flex flex-col gap-5 p-6 sm:flex-row sm:items-center`}>
                    <div className={`${TILE} flex h-24 w-24 shrink-0 items-center justify-center`}>
                      <Icon name={partIcon(id + name)} className={`text-[40px] ${TXT}`} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-[22px] font-semibold ${TXT}`}>{name}</p>
                        <TrustBadge trust={mapTrustLabel(String(hit.trust || "Confirmed"))} />
                      </div>
                      {hit.number ? <p className={`${MONO} text-[24px] ${TXT}`}>{String(hit.number)}</p> : null}
                      {hit.hint ? (
                        <p className={`inline-flex items-start gap-2 rounded-xl bg-[#eff4ff] px-4 py-3 text-[15px] dark:bg-[#1c1c1e] ${TXT}`}>
                          <Icon name="info" className="mt-0.5 text-[18px] text-[#ea580c]" /> {String(hit.hint)}
                        </p>
                      ) : null}
                    </div>
                    <SIconBtn
                      icon="arrow_forward"
                      label={`Open ${name}`}
                      className="h-11 w-11 rounded-xl"
                      onClick={() => {
                        setSelectedTypeId(id);
                        setAnswerVariant(id.includes("shoe") ? "shoes" : "pads");
                        setStep("answer");
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className={`${CARD} mt-4 flex flex-col items-center gap-4 p-12 text-center`}>
            <div className={`${TILE} flex h-16 w-16 items-center justify-center`}>
              <Icon name="search_off" className={`text-[30px] ${TXT}`} />
            </div>
            <p className={`text-[22px] font-semibold ${TXT}`}>
              Nothing called &quot;{searchQuery}&quot; for your {model || "car"} yet.
            </p>
            <SBtn kind="primary" size="lg" iconAfter="arrow_forward" onClick={() => setStep("request")}>Ask Roam to find it</SBtn>
          </div>
        )}
        {toast}
      </EverydayShell>
    );
  }

  if (step === "brakes") {
    const body = brakesQ.data as
      | { groups?: Record<string, { types: Array<{ id: string; name: string; description: string; onFile: boolean }> }> }
      | undefined;
    const sections = (["front", "rear", "whole"] as const)
      .map((key) => ({ key, g: body?.groups?.[key] }))
      .filter((s) => s.g?.types?.length);
    return (
      <EverydayShell>
        <div className="mb-6">
          <SBtn kind="secondary" icon="arrow_back" onClick={() => setStep("home")}>Back to {model || "car"} parts</SBtn>
        </div>
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className={`${CARD} flex flex-col justify-between gap-6 p-7 lg:col-span-7`}>
            <div className="flex items-start gap-4">
              <IconBox name="disc_full" className="!bg-[#fff7ed] !text-[#ea580c] dark:!bg-[#431407]" />
              <div>
                <h1 className={`text-[32px] font-semibold tracking-tight ${TXT}`}>Brakes</h1>
                <p className={`text-[15px] ${MUTED}`}>Every brake part for your car, by where it goes.</p>
              </div>
            </div>
            <div className={`${TILE} flex flex-wrap items-center gap-3 px-4 py-3`}>
              <SPlate plate={plate} />
              <span className={`text-[16px] font-semibold ${TXT}`}>{displayCarLabel}</span>
              <span className={`text-sm ${MUTED}`}>· {difference}</span>
            </div>
          </div>
          <div className={`${CARD} flex items-center gap-5 p-6 lg:col-span-5`}>
            <div className={`${TILE} flex h-40 w-32 shrink-0 items-center justify-center p-3`}>
              <StitchCarPosition spot={hoverWheel} />
            </div>
            <div className="flex flex-col gap-2">
              <p className={`text-[17px] font-semibold ${TXT}`}>Where it goes</p>
              <p className={`text-sm ${MUTED}`}>Point at a part and its wheels light up.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-6">
          {sections.map(({ key, g }) => {
            const title = key === "front" ? "Front wheels" : key === "rear" ? "Rear wheels" : "Whole car";
            const icon = key === "front" ? "adjust" : key === "rear" ? "album" : "opacity";
            const onFile = g!.types.filter((t) => t.onFile).length;
            const total = g!.types.length;
            return (
              <section key={key} className={`${CARD} p-6 sm:p-7`}>
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#e5eeff] pb-4 dark:border-[#3a3a3d]">
                  <div className="flex items-center gap-3">
                    <IconBox name={icon} size="sm" />
                    <p className={`text-[20px] font-semibold ${TXT}`}>{title}</p>
                  </div>
                  <SStatusPill tone={onFile === total ? "green" : "gray"} icon="check_circle">{onFile} of {total} Verified</SStatusPill>
                </div>
                <div className="flex flex-col">
                  {g!.types.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="group flex w-full items-center gap-4 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-[#eff4ff] dark:hover:bg-[#1c1c1e]"
                      onMouseEnter={() => setHoverWheel(key === "whole" ? "all" : key)}
                      onMouseLeave={() => setHoverWheel("none")}
                      onFocus={() => setHoverWheel(key === "whole" ? "all" : key)}
                      onBlur={() => setHoverWheel("none")}
                      onClick={() => {
                        setSelectedTypeId(row.id);
                        if (row.onFile) {
                          setAnswerVariant(row.id.includes("caliper") ? "calipers" : row.id.includes("cable") ? "cables" : row.id.includes("shoe") ? "shoes" : "pads");
                          setStep("answer");
                        } else setStep("request");
                      }}
                    >
                      <IconBox name={partIcon(row.id + row.name)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-[16px] font-semibold ${TXT}`}>{row.name}</p>
                        <p className={`text-sm ${MUTED}`}>{row.description}</p>
                      </div>
                      {row.onFile ? (
                        <SStatusPill tone="green" icon="check_circle">Verified</SStatusPill>
                      ) : (
                        <SStatusPill tone="gray" icon="help_outline">Not on file yet — ask Roam</SStatusPill>
                      )}
                      <Icon name="chevron_right" className={`text-[22px] ${MUTED}`} />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {toast}
      </EverydayShell>
    );
  }

  if (step === "answer" || step === "alsoFits") {
    return (
      <EverydayShell className="everyday-answer max-w-[1200px]">
        <StitchAnswerHeader
          title={
            answerVariant === "calipers"
              ? "Front brake calipers"
              : answerVariant === "cables"
                ? "Handbrake cables"
                : answerVariant === "shoes"
                  ? "Rear brake shoes"
                  : lookup?.reference?.name || "Front brake pads"
          }
          carLabel={displayCarLabel}
          plate={plate}
          backLabel="Back to Brakes"
          onBack={() => setStep("brakes")}
        />
        {renderAnswerCard()}
        <EverydayAlsoFitsSheet
          open={alsoFitsOpen || step === "alsoFits"}
          onClose={() => { setAlsoFitsOpen(false); if (step === "alsoFits") setStep("answer"); }}
          partName={lookup?.reference?.name || "Front brake pads"}
          partNumber={lookup?.reference?.number || ""}
          rows={(lookup?.alsoFits || []) as Array<{ make: string; model: string; years: string; trust: string; isYourCar?: boolean; difference?: string; version?: string; chassis?: string; engine?: string }>}
          numberBrand={lookup?.reference?.brand || ""}
          brandNumbers={lookupBrandNumbers()}
          plate={plate}
        />
        {toast}
      </EverydayShell>
    );
  }

  // home (F4)
  // Every area always shows (prompt: "every part type the car has is listed, even when we have nothing yet").
  // Real counts come from the server; an area the server doesn't send reads "Not on file yet".
  const AREA_ORDER = [
    "Brakes",
    "Engine & oil",
    "Filters",
    "Fluids",
    "Suspension & steering",
    "Lights & wipers",
    "Battery & electrical",
    "Cooling",
  ];
  const served = browse?.areas || [];
  const areas = [
    ...AREA_ORDER.map((label) => {
      const hit = served.find((a) => (a.plainName || a.name).toLowerCase() === label.toLowerCase());
      return hit || { id: `area-${label}`, plainName: label, name: label, count: 0 };
    }),
    ...served.filter((a) => !AREA_ORDER.some((l) => l.toLowerCase() === (a.plainName || a.name).toLowerCase())),
  ];
  return (
    <EverydayShell className="everyday-home">
      <div className="flex flex-col gap-6">
        <div className={`${CARD} flex flex-col justify-between gap-5 p-6 sm:flex-row sm:items-center sm:p-7`}>
          <div className="flex items-center gap-5">
            <div className={`${TILE} flex h-[72px] w-[72px] items-center justify-center`}>
              <MakerLogo make={make || String(seed?.make || "Car")} size={52} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <p className={`text-[28px] font-semibold tracking-tight max-sm:text-[22px] ${TXT}`}>{make} {model}</p>
                <SPlate plate={plate} tone="dark" />
              </div>
              <p className={`text-[15px] ${MUTED}`}>
                {vehicleYear || year} · {difference}
              </p>
            </div>
          </div>
          <SBtn kind="soft" icon="sync_alt" onClick={() => setStep("car")}>Change car</SBtn>
        </div>

        <div className={`${CARD} flex flex-col gap-4 p-6 sm:p-7`}>
          <SSearch
            big
            placeholder="What part do you need? — e.g. brake pads, oil filter, wiper"
            onEnter={(v) => {
              setSearchQuery(v);
              setStep("search");
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className={`mr-1 inline-flex items-center gap-1 text-[15px] ${MUTED}`}>
              <Icon name="local_fire_department" className="text-[18px]" /> Popular:
            </span>
            {popularChips().map((chip) => (
              <SChip
                key={chip.id}
                icon={chip.icon}
                onClick={() => {
                  if (chip.id === "pads") {
                    setSelectedTypeId("cmp-brake-pads");
                    setAnswerVariant("pads");
                    setStep("answer");
                  } else if (chip.id === "brake-fluid") {
                    setStep("brakes");
                  } else {
                    setSearchQuery(chip.label);
                    setStep("search");
                  }
                }}
              >
                {chip.label}
              </SChip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <div>
              <p className={`text-[22px] font-semibold ${TXT}`}>By area</p>
              <p className={`text-[15px] ${MUTED}`}>Pick where on the car the part goes.</p>
            </div>
            {areas.length ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {areas.map((area) => {
                  const label = area.plainName || area.name;
                  return (
                    <button
                      key={area.id}
                      type="button"
                      className={`${CARD} group relative flex min-h-[170px] flex-col justify-between overflow-hidden p-5 text-left transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)]`}
                      onClick={() => {
                        if (/brake/i.test(label)) setStep("brakes");
                        else {
                          setSearchQuery(label);
                          setStep(area.count ? "search" : "request");
                        }
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <IconBox name={areaIcon(label)} className="transition-colors group-hover:!bg-[#030213] group-hover:!text-white" />
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#cbd5e1] text-[#47464c] transition-colors group-hover:bg-[#030213] group-hover:text-white dark:border-[#3a3a3d] dark:text-[#a1a1aa]">
                          <Icon name="arrow_forward" className="text-[16px]" />
                        </span>
                      </div>
                      <div className="mt-6">
                        <p className={`text-[16px] font-semibold ${TXT}`}>{label}</p>
                        <p className={`text-sm ${MUTED}`}>{area.count ? `${area.count} ${area.count === 1 ? "part" : "parts"} on file` : "Not on file yet"}</p>
                      </div>
                      <span className="absolute bottom-0 left-0 right-0 h-1 origin-left scale-x-0 bg-[#030213] transition-transform group-hover:scale-x-100 dark:bg-[#fafafa]" />
                    </button>
                  );
                })}
              </div>
            ) : browseQ.isLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[170px] animate-pulse rounded-[20px] bg-[#eff4ff] dark:bg-[#2a2a2d]" />
                ))}
              </div>
            ) : (
              <div className={`${CARD} p-6 text-[15px] ${MUTED}`}>No parts are on file for this car yet. Search above, or ask Roam to find a part.</div>
            )}
          </div>

          <aside className="lg:col-span-4">
            <div className={`${CARD} flex flex-col gap-5 p-6`}>
              <div className="flex items-start gap-3">
                <IconBox name="fact_check" size="sm" />
                <div>
                  <p className={`text-[20px] font-semibold ${TXT}`}>Your {model || "car"} needs</p>
                  <p className={`text-sm ${MUTED}`}>Fluids and sizes on file for this car.</p>
                </div>
              </div>
              {carNeeds.length ? (
                <ul className="flex flex-col gap-3">
                  {carNeeds.map((row) => (
                    <li key={row.label} className={`${TILE} flex items-start justify-between gap-3 p-3.5`}>
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-[#2a2a2d]">
                          <Icon name={needIcon(row.label)} className={`text-[18px] ${TXT}`} />
                        </span>
                        <div className="min-w-0">
                          <p className={`text-[13px] ${MUTED}`}>{row.label}</p>
                          <p className={`text-[17px] font-semibold ${TXT}`}>{row.value}</p>
                        </div>
                      </div>
                      <SIconBtn icon="content_copy" label={`Copy ${row.value}`} onClick={() => void copy(row.copy, row.value)} className="h-8 w-8" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`${TILE} p-4 text-sm ${MUTED}`}>Not on file yet.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
      {toast}
    </EverydayShell>
  );

  /** The facts shown in "Your part info": same car record "Copy part info" uses; empty values are left out. */
  function yourPartInfo(partName: string): PartInfoFact[] {
    const specs = (ctx.specs || {}) as Record<string, unknown>;
    const facts: PartInfoFact[] = [];
    const add = (label: string, raw: unknown, extra?: Partial<PartInfoFact>) => {
      const value = String(raw ?? "").trim();
      if (value) facts.push({ label, value, ...extra });
    };
    add("Car", displayCarLabel);
    add("Chassis", specs.chassis_code, { mono: true });
    add("Engine", specs.engine_code, { mono: true });
    add("Drive", specs.drivetrain);
    add("Part", partName, { wide: true });
    return facts;
  }

  /** What the store needs: car (make, model, year), part name and part number. */
  function storeText(partName: string | undefined, num: string, numberBrand?: string, brandNumbers?: StoreBrandNumber[]) {
    const specs = (ctx.specs || {}) as Record<string, unknown>;
    // Only real values from the car's record; a missing one is left out, never guessed.
    return buildStoreCopyText({
      carLine: displayCarLabel || "",
      carDetails: carDetailsLine({
        chassis: String(specs.chassis_code ?? ""),
        engine: String(specs.engine_code ?? ""),
        drive: String(specs.drivetrain ?? ""),
      }),
      partName,
      number: num,
      numberBrand,
      brandNumbers,
    });
  }

  /** The reference number plus every brand number for the looked-up part. */
  // A function (not a const): this sits after the component's return, so only hoisted declarations work here.
  function lookupBrandNumbers(): StoreBrandNumber[] {
    return [
      ...(lookup?.reference?.number ? [{ brand: String(lookup.reference.brand || ""), number: String(lookup.reference.number) }] : []),
      ...(lookup?.brandNumbers || []).map((a) => ({ brand: String(a.brand || ""), number: String(a.number || "") })),
    ];
  }

  function renderAnswerCard() {
    const ref = lookup?.reference;
    const alts = lookup?.brandNumbers || [];
    const primary = ref?.number || "";
    if (answerVariant === "calipers" || answerVariant === "cables" || answerVariant === "shoes") {
      const cards = (findQ.data as { sections?: Array<{ items?: Array<Record<string, unknown>> }> })?.sections?.[0]?.items || [];
      const partOf = (item: Record<string, unknown>) =>
        (item.part || {}) as { name?: string; oem_part_number?: string; catalog_decision?: string };
      const numberBox = (num: string, partName?: string, compact?: boolean) => (
        <div className={`${TILE} flex flex-wrap items-center justify-between gap-3 p-4`}>
          <div className="flex flex-col gap-1">
            <span className={`text-[12px] font-semibold uppercase tracking-wider ${MUTED}`}>Your part info</span>
            <span className={`${MONO} text-[20px] ${TXT}`}>{num}</span>
          </div>
          {compact ? (
            <SIconBtn icon="content_copy" label={`Copy ${num}`} onClick={() => void copy(storeText(partName, num), num)} />
          ) : (
            <SBtn kind="primary" size="sm" icon="content_copy" onClick={() => void copy(storeText(partName, num), num)}>Copy part info</SBtn>
          )}
        </div>
      );

      if (answerVariant === "calipers") {
        return (
          <div className="flex flex-col gap-4">
            <p className={`text-[15px] ${MUTED}`}>Your {model || "car"} has two — one for each front wheel.</p>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {cards.map((item) => {
                const part = partOf(item);
                const side = String((item as { side?: string }).side || "");
                const right = side === "right";
                return (
                  <div key={String(item.groupId)} className={`${CARD} flex flex-col gap-5 p-6`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div className={`${TILE} flex h-20 w-16 items-center justify-center p-1.5`}>
                          <StitchCarPosition spot={right ? "front-right" : "front-left"} />
                        </div>
                        <p className={`text-[17px] font-semibold ${TXT}`}>{right ? "Right front wheel" : "Left front wheel"}</p>
                      </div>
                      <TrustBadge trust={mapTrustLabel(part.catalog_decision === "confirmed" ? "Confirmed" : "Needs checking")} />
                    </div>
                    <p className={`text-[20px] font-semibold ${TXT}`}>{part.name}</p>
                    {numberBox(String(part.oem_part_number || ""), part.name)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      if (answerVariant === "cables") {
        return (
          <div className="flex flex-col gap-5">
            <p className={`text-[15px] ${MUTED}`}>Your {model || "car"} has three handbrake cables.</p>
            <div className={`${CARD} p-6 sm:p-8`}>
              <div className={`${TILE} px-4 py-6`}>
                <CablePathDiagram />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {cards.map((item) => {
                const part = partOf(item);
                return (
                  <div key={String(item.groupId)} className={`${CARD} flex flex-col gap-4 p-6`}>
                    <div className="flex items-start justify-between gap-2">
                      <IconBox name="cable" size="sm" />
                      <TrustBadge trust={mapTrustLabel(part.catalog_decision === "confirmed" ? "Confirmed" : "Needs checking")} />
                    </div>
                    <p className={`text-[18px] font-semibold ${TXT}`}>{part.name}</p>
                    {numberBox(String(part.oem_part_number || ""), part.name, true)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      // shoes
      const current = cards[0] ? partOf(cards[0]) : null;
      const older = cards[1] ? partOf(cards[1]) : null;
      return (
        <div className="flex flex-col gap-5">
          {current ? (
            <div className={`${CARD} grid grid-cols-1 items-center gap-6 p-6 sm:p-8 lg:grid-cols-12`}>
              <div className="flex flex-col gap-3 lg:col-span-7">
                <div className="flex flex-wrap items-center gap-2">
                  <TrustBadge trust={mapTrustLabel(current.catalog_decision === "confirmed" ? "Confirmed" : "Needs checking")} />
                  <span className={`text-sm ${MUTED}`}>· Set of 4 shoes (both rear wheels)</span>
                </div>
                <p className={`text-[28px] font-semibold tracking-tight ${TXT}`}>{current.name || "Rear brake shoes"}</p>
                <p className={`text-[15px] ${MUTED}`}>Genuine part</p>
                <div className="flex items-center gap-3">
                  <div className={`${TILE} flex h-20 w-16 items-center justify-center p-1.5`}>
                    <StitchCarPosition spot="rear" />
                  </div>
                  <p className={`text-[15px] font-semibold ${TXT}`}>Both rear wheels</p>
                </div>
              </div>
              <div className="lg:col-span-5">
                <div className={`${TILE} flex flex-col gap-3 p-5`}>
                  <span className={`text-[12px] font-semibold uppercase tracking-wider ${MUTED}`}>Your part info</span>
                  <span className={`${MONO} text-[24px] ${TXT}`}>{String(current.oem_part_number || "")}</span>
                  <SBtn kind="primary" icon="content_copy" className="w-full" onClick={() => void copy(storeText(current.name || "Rear brake shoes", String(current.oem_part_number || "")), String(current.oem_part_number || ""))}>
                    Copy part info
                  </SBtn>
                </div>
              </div>
            </div>
          ) : null}
          {older ? (
            <div className={`${CARD} flex flex-col justify-between gap-5 border border-[#fde68a] p-6 dark:border-[#78350f] md:flex-row md:items-center`}>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <TrustBadge trust="check" />
                  <span className={`text-sm ${MUTED}`}>Older number</span>
                </div>
                <p className={`text-[19px] font-semibold ${TXT}`}>
                  Older part number: <span className={MONO}>{String(older.oem_part_number || "")}</span>
                </p>
                <p className={`text-[15px] ${MUTED}`}>An older number some stores still use.</p>
              </div>
              <SBtn kind="secondary" icon="content_copy" onClick={() => void copy(storeText(older.name || current?.name || "Rear brake shoes", String(older.oem_part_number || "")), String(older.oem_part_number || ""))}>
                Copy older number
              </SBtn>
            </div>
          ) : null}
        </div>
      );
    }

    const fits = ((lookup?.alsoFits || []) as Array<{ make?: string; model?: string; isYourCar?: boolean }>).map((r) => ({
      make: String(r.make || ""),
      model: String(r.model || ""),
      isYourCar: Boolean(r.isYourCar),
    }));
    return (
      <StitchAnswerCard
        name={ref?.name || "Front brake pads"}
        trust={ref?.trust || "Confirmed"}
        brand={ref?.brand}
        qtyLine="Set of 4 pads (both front wheels)"
        positionTitle="Both front wheels"
        positionBody="4 pads in all: left and right front. Not for the rear."
        spot="front"
        number={primary}
        alts={alts.map((a) => ({ brand: a.brand, number: a.number }))}
        fits={fits}
        defaultAltsOpen={otherNumbersOpen || Boolean(capture)}
        partInfo={yourPartInfo(ref?.name || "Front brake pads")}
        onCopy={(text, brand) =>
          void copy(
            storeText(ref?.name || "Front brake pads", text, brand || ref?.brand, lookupBrandNumbers()),
            brand ? `${brand} ${text}` : text,
          )
        }
        onSeeEveryCar={() => setAlsoFitsOpen(true)}
        onUseInService={
          onUseInService && ref?.partId
            ? () => onUseInService(vehicleId, selectedTypeId, ref.name || "Part")
            : undefined
        }
      />
    );
  }

  function displayCars(fleetCars: FleetCar[], rows: Array<Record<string, unknown>>): ShownFleetCar[] {
    if (rows.length) {
      return rows.map((row, i) => {
        const vehicleId = String(row.vehicle_id || row.id || fleetCars[i]?.vehicleId || `row-${i}`);
        const match = fleetCars.find((c) => c.vehicleId === vehicleId) || fleetCars[i];
        return {
          vehicleId,
          licensePlate: String(row.plate || match?.licensePlate || "PLATE"),
          make: String(row.make || match?.make || ""),
          model: String(row.model || match?.model || ""),
          year: Number(row.year ?? match?.year ?? 0) || undefined,
          verified: row.verified === undefined ? true : Boolean(row.verified),
        };
      });
    }
    return fleetCars.map((c) => ({ ...c, verified: true }));
  }
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function leadPartId(findData: unknown): string | null {
  const sections = (findData as { sections?: Array<{ items?: Array<{ part?: { id?: string } }> }> })?.sections;
  const part = sections?.[0]?.items?.[0]?.part;
  return part?.id ? String(part.id) : null;
}
