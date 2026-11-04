import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { pickBestPart } from "@roam/types/partsBestPick";
import { formatPartsFitParam } from "@roam/types/partsFitParam";
import { api } from "../../../services/api";
import { usePermissions } from "../../../hooks/usePermissions";
import { useAuth } from "../../auth/AuthContext";
import { CarStep, type FleetCar } from "./CarStep";
import { LinkCarPanel } from "./LinkCarPanel";
import { PartStep } from "./PartStep";
import { PositionStep } from "./PositionStep";
import { RequestPartPanel } from "./RequestPartPanel";
import { ResultsView } from "./ResultsView";
import type { PartItem } from "./PartDetailDrawer";
import { VariantStep } from "./VariantStep";
import { ActivityView } from "./ActivityView";
import { usePartsActivity, usePartsVehicleContext } from "./findPartsQueries";
import { Fp11Screen, type Fp11Actions } from "./screens/Fp11Screen";
import { buildFp11ViewModel, type Fp11PreviewTab } from "./findPartsViewModels";
import { clearFleetMaintenanceSearch, navigateFleetMaintenanceTab, notifyPartsAdmin } from "./findPartsActions";
import { fleetCoreErrorDetails, formatFindPartsVehicleChip, findPartsConnectionLatencyMs } from "./findPartsErrors";
import {
  clearFindPartsFitState,
  findPartsUrlAfterNewPartPick,
  stepAfterPartPick,
  stepFromPartDeepLink,
} from "./findPartsRoute";
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
  const { user, role } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const [step, setStep] = useState<Step>(() => {
    if (params.get("view") === "activity") return "car";
    if (params.get("part")) {
      return params.get("pos") ? "results" : "position";
    }
    if (params.get("vehicle")) return "car";
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
  const [side, setSide] = useState(params.get("side") || "");
  const [fitParam, setFitParam] = useState(params.get("fit") || "");
  const [requestMatchType, setRequestMatchType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [linkMeta, setLinkMeta] = useState({ make: "", model: "", year: "", plate: "" });

  const activity = usePartsActivity(canView);
  const orgVehicleId = vehicleId || cars[0]?.id || "";
  const orgContext = usePartsVehicleContext(orgVehicleId, "", Boolean(orgVehicleId));
  const orgShortCode = String((orgContext.data as { orgShortCode?: string } | undefined)?.orgShortCode || "");
  const orgAdmin = useQuery({
    queryKey: ["find-parts-org-admin"],
    queryFn: async () => {
      const rows = (await api.getTeamMembers()) as Array<{ name?: string; full_name?: string; role?: string }>;
      const pick = rows.find((row) => /owner|admin|fleet lead|dispatcher lead/i.test(String(row.role || ""))) || rows[0];
      if (!pick) return null;
      return { name: String(pick.full_name || pick.name || "").trim(), role: String(pick.role || "").trim() };
    },
    staleTime: 300_000,
  });
  const fp11Admin = orgAdmin.data?.name
    ? { adminName: orgAdmin.data.name, adminRole: orgAdmin.data.role || undefined }
    : {};
  const [fp11PreviewTab, setFp11PreviewTab] = useState<Fp11PreviewTab>("error");
  const deepLinkGateDone = useRef(false);

  function writeUrl(next: { vehicle?: string; part?: string; pos?: string; side?: string; fit?: string; view?: string }) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "find-parts");
    if (next.vehicle) url.searchParams.set("vehicle", next.vehicle);
    if (next.part) url.searchParams.set("part", next.part);
    if (next.pos) url.searchParams.set("pos", next.pos);
    else if (next.pos === "") url.searchParams.delete("pos");
    if (next.side) url.searchParams.set("side", next.side);
    else if (next.side === "") url.searchParams.delete("side");
    if (next.fit) url.searchParams.set("fit", next.fit);
    else if (next.fit === "") url.searchParams.delete("fit");
    if (next.view) url.searchParams.set("view", next.view);
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }

  useEffect(() => {
    if (error) setFp11PreviewTab("error");
  }, [error]);

  type FindPartsGateBody = {
    linked?: boolean;
    askVariant?: boolean;
    make?: string;
    model?: string;
    year?: number;
    pickedVariantId?: string | null;
    vehicle?: { plate?: string; label?: string };
  };

  function applyVehicleGate(id: string, picked?: FleetCar) {
    setVehicleId(id);
    writeUrl({ vehicle: id });
    void api.findParts({ vehicleId: id }).then((res) => {
      const body = res as FindPartsGateBody;
      if (body.linked === false) {
        setLinkMeta({
          make: body.make || picked?.make || "",
          model: body.model || picked?.model || "",
          year: String(body.year || picked?.year || ""),
          plate: body.vehicle?.plate || picked?.licensePlate || "",
        });
        setMake(body.make || picked?.make || "");
        setModel(body.model || picked?.model || "");
        setYear(body.year ?? (picked?.year != null ? Number(picked.year) : null));
        setStep("link");
      } else if (body.askVariant) {
        setMake(picked?.make || body.make || "");
        setModel(picked?.model || body.model || "");
        setYear(Number(picked?.year ?? body.year) || null);
        setStep("version");
      } else {
        if (body.pickedVariantId) setVariantId(body.pickedVariantId);
        const partId = params.get("part")?.trim() || "";
        if (partId) {
          setComponentId(partId);
          void api.partsBrowse(body.pickedVariantId || undefined).then((browse) => {
            const next = stepFromPartDeepLink(params, browse as Parameters<typeof stepFromPartDeepLink>[1]);
            setStep(next);
          }).catch(() => {
            setStep(params.get("pos") ? "results" : "position");
          });
        } else {
          setStep("part");
        }
      }
    }).catch((err: unknown) => {
      const { message } = fleetCoreErrorDetails(err);
      setError(message);
    });
  }

  useEffect(() => {
    const id = params.get("vehicle")?.trim() || "";
    if (!canView || !id || deepLinkGateDone.current) return;
    deepLinkGateDone.current = true;
    const picked = cars.find((row) => row.vehicleId === id);
    applyVehicleGate(id, picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link once on mount
  }, [canView]);

  function fp11HealthFields(state: Fp11PreviewTab) {
    return { state, previewTab: state };
  }

  function requestPartsAccess() {
    void notifyPartsAdmin({
      kind: "access_request",
      title: "Parts access request",
      body: `User ${user?.email || "unknown"} (${role || "unknown"}) requested fleet parts access.`,
    }).catch(() => undefined);
  }

  function buildFp11Actions(overrides: Partial<Fp11Actions>): Fp11Actions {
    return {
      onPreviewTab: setFp11PreviewTab,
      onRequestAccess: requestPartsAccess,
      onSelectVehicle: () => {
        setError("");
        setStep("car");
        setView("search");
        writeUrl({});
      },
      onBack: () => {
        setError("");
        setStep("car");
        setView("search");
        writeUrl({});
      },
      onCheckConnection: () => {
        void notifyPartsAdmin({
          kind: "connection_check",
          title: "Parts connection check",
          body: "Fleet user requested a parts hub / supplier sync connection check.",
        }).catch(() => undefined);
      },
      onRetry: () => undefined,
      onAskRoam: () => setStep("request"),
      ...overrides,
    };
  }

  const search = useQuery({
    queryKey: ["parts-find", vehicleId, make, model, year, variantId, componentId, position, side, fitParam],
    queryFn: () => api.findParts({
      ...(vehicleId ? { vehicleId } : { make, model, year: String(year) }),
      ...(variantId ? { variantId } : {}),
      ...(componentId ? { componentId } : {}),
      ...(fitParam ? { fit: fitParam } : {}),
      ...(position ? { position, pos: position } : {}),
      ...(side ? { side } : {}),
    }),
    enabled: canView && step === "results" && Boolean(vehicleId || (make && model && year)),
  });

  const stepNumber = step === "car" || step === "link" ? 1 : step === "version" ? 2 : step === "part" || step === "request" ? 3 : step === "position" || position ? 4 : 3;

  useEffect(() => {
    if (step === "results") {
      document.body.setAttribute("data-fleet-find-parts-results", "1");
    } else {
      document.body.removeAttribute("data-fleet-find-parts-results");
    }
    return () => document.body.removeAttribute("data-fleet-find-parts-results");
  }, [step]);
  const car = cars.find((row) => row.vehicleId === vehicleId);
  const trail = useMemo(() => {
    const chips = [];
    if (car) chips.push({ label: [car.make, car.model, car.year].filter(Boolean).join(" "), onPick: () => setStep("car") });
    else if (make) chips.push({ label: [year, make, model].filter(Boolean).join(" "), onPick: () => setStep("car") });
    if (componentId) chips.push({ label: partName || "Part", onPick: () => setStep("part") });
    if (position) chips.push({ label: position === "rear" ? "Back" : "Front", onPick: () => setStep("position") });
    return chips;
  }, [car, make, model, year, componentId, partName, position]);

  if (!canView) {
    return (
      <div className="fleet-find-parts-stitch p-space-xl">
        <Fp11Screen
          data={buildFp11ViewModel({
            userEmail: user?.email,
            role: role ?? undefined,
            errorCode: "FORBIDDEN",
            httpStatus: 403,
            ...fp11Admin,
            ...fp11HealthFields("noperm"),
          })}
          actions={buildFp11Actions({
            onSelectVehicle: () => navigateFleetMaintenanceTab("find-parts"),
            onBack: () => clearFleetMaintenanceSearch(),
            onAskRoam: requestPartsAccess,
          })}
        />
      </div>
    );
  }

  return (
    <div
      className={`fleet-find-parts-stitch find-parts-nested-markup${step === "results" ? " find-parts-am-results" : ""}`}
      data-step={stepNumber}
      data-trail={trail.map((chip) => chip.label).join(" › ")}
    >
      {error ? (
        <Fp11Screen
          data={buildFp11ViewModel({
            state: "error",
            attempts: attempts + 1,
            userEmail: user?.email,
            role: role ?? undefined,
            httpStatus: error.includes("403") ? 403 : 0,
            errorMessage: error,
            vehicleLabel: [year, make, model].filter(Boolean).join(" ") || undefined,
            vehicleChip: formatFindPartsVehicleChip(
              [year, make, model].filter(Boolean).join(" ") || car?.make || "Vehicle",
              car?.licensePlate,
            ),
            sectionLabel: partName || "Part section",
            latencyMs: findPartsConnectionLatencyMs(),
            missingModel: model || undefined,
            ...fp11Admin,
          })}
          actions={buildFp11Actions({
            onRetry: () => {
              const next = attempts + 1;
              setAttempts(next);
              if (next <= 3) {
                sessionStorage.setItem("find-parts-trail", JSON.stringify({ vehicleId, componentId, position }));
                setError("");
                void search.refetch();
              }
            },
            onAskRoam: () => {
              if (make && model && year) {
                void api.requestCatalogAddition({ make, model, year, vehicleId: vehicleId || null }).catch(() => undefined);
              } else {
                setStep("request");
              }
            },
          })}
        />
      ) : null}
      {view === "activity" ? (
        <ActivityView activity={activity.data ?? null} orgShortCode={orgShortCode} onBack={() => { setView("search"); writeUrl({}); }} />
      ) : (
        <>
          {step === "car" ? (
            <CarStep
              cars={cars}
              activity={activity.data ?? null}
              onSeeAll={() => { setView("activity"); writeUrl({ view: "activity" }); }}
              onAsk={() => setStep("request")}
              onPickCar={(picked) => applyVehicleGate(picked.vehicleId, picked)}
              onContinueOther={(choice) => {
                const plate = cars.find((row) => (row.licensePlate || "").toLowerCase() === choice.typed.trim().toLowerCase());
                if (plate) {
                  applyVehicleGate(plate.vehicleId, plate);
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
              initialComponentId={componentId}
              initialPartName={partName}
              onBack={() => setStep(vehicleId ? "car" : "version")}
              onPick={(id, positionAware, name, onFileCount) => {
                const cleared = clearFindPartsFitState();
                setPosition(cleared.position);
                setSide(cleared.side);
                setFitParam(cleared.fitParam);
                setComponentId(id);
                setPartName(name);
                writeUrl(findPartsUrlAfterNewPartPick(vehicleId, id));
                const next = stepAfterPartPick(onFileCount, positionAware);
                setStep(next);
              }}
              onAskRoam={(id, name) => {
                const cleared = clearFindPartsFitState();
                setPosition(cleared.position);
                setSide(cleared.side);
                setFitParam(cleared.fitParam);
                setComponentId(id);
                setPartName(name);
                writeUrl(findPartsUrlAfterNewPartPick(vehicleId, id));
                setStep("request");
              }}
            />
          ) : null}
          {step === "position" ? (
            <PositionStep
              vehicleId={vehicleId}
              componentId={componentId}
              partName={partName}
              onBack={() => setStep("part")}
              onPick={(pos, pickSide = "both", fit) => {
                setPosition(pos);
                setSide(pickSide);
                const sideChoice = (pickSide || "both") as "left" | "right" | "both";
                const pairs =
                  pos === "both"
                    ? [
                      { axle: "front" as const, side: sideChoice },
                      { axle: "rear" as const, side: sideChoice },
                    ]
                    : [{ axle: pos === "rear" ? ("rear" as const) : ("front" as const), side: sideChoice }];
                const nextFit = fit || formatPartsFitParam(pairs);
                setFitParam(nextFit);
                writeUrl({ vehicle: vehicleId, part: componentId, pos, side: pickSide, fit: nextFit });
                setStep("results");
              }}
            />
          ) : null}
          {step === "results" ? (
            <ResultsView
              loading={search.isLoading}
              error={search.error instanceof Error ? search.error.message : ""}
              result={search.data}
              vehicleId={vehicleId}
              plate={car?.licensePlate}
              partName={partName}
              onRetry={() => search.refetch()}
              componentId={componentId}
              position={position}
              areaLabel={componentId === "cmp-brake-pad" ? "Braking system" : undefined}
              onYourRequests={() => {
                setView("activity");
                writeUrl({ vehicle: vehicleId, view: "activity" });
              }}
              onAsk={() => {
                setRequestMatchType(null);
                setStep("request");
              }}
              onAskForTier={(matchType) => {
                setRequestMatchType(matchType);
                setStep("request");
              }}
              bestId={bestId(search.data)}
              unsure={variantId === "any"}
              canLog={Boolean(vehicleId && onUseInService)}
              onBackToPartSelection={() => setStep("part")}
              onChangeCar={() => setStep("car")}
              onEditPartCategory={() => setStep("part")}
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
              onSearchByMmy={() => {
                setVehicleId("");
                setStep("car");
              }}
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
              position={position}
              fitParam={fitParam}
              matchType={requestMatchType}
              activityMeta={(activity.data as { meta?: Record<string, unknown> } | undefined)?.meta as {
                medianAddMinutes?: number | null;
                batchMatchRate?: number | null;
                resolvedCount30d?: number;
                queueDepth?: number;
              }}
              onBack={() => setStep("part")}
              onViewActivity={() => { setView("activity"); writeUrl({ view: "activity" }); }}
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
  return pickBestPart(sections, { useStock: false, usePrice: false })?.id ?? "";
}
