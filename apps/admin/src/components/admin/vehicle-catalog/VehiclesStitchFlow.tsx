import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { versionDifferenceLabel, versionYearsLabel } from "@roam/vehicle-catalog-core";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { listVehicleCatalog, deleteVehicleCatalog, createVehicleCatalog, updateVehicleCatalog } from "../../../services/vehicleCatalogService";
import { fetchChecklist, fetchPartsOverview, fetchSpecKeys } from "../parts-database/partsDatabaseApi";
import { VehicleCatalogEditDialog, emptyForm, recordToForm, toCreatePayload, toPatchPayload, type FormState } from "./VehicleCatalogEditDialog";
import { isCatalogReferenceMake } from "../../../data/vehicleMakesReference";
import { D_CARD, D_MUTED, D_TXT, DCode, DIcon } from "../parts-database/add-parts/catalog/dominionKit";
import { SpecEditorPanel } from "./SpecEditorPanel";
import {
  captureFixtureRecords,
  captureInitialRoute,
  VEHICLES_CAPTURE_CHECKLIST,
  VEHICLES_CAPTURE_DASHBOARD,
  VEHICLES_CAPTURE_MAKERS,
  VEHICLES_CAPTURE_OVERVIEW,
  VEHICLES_CAPTURE_SPEC_KEYS,
  vehiclesCaptureFromUrl,
} from "./vehiclesCaptureFixtures";
import { VEHICLES_CAPTURE_SISTER_ROWS } from "./vehiclesCaptureFixtureData";
import {
  fetchCatalogMakers,
  fetchSisterVehicles,
  fetchVariantRevisions,
  fetchVehiclesDashboard,
  type CatalogMakerSummary,
} from "./vehiclesCatalogApi";
import { VehiclesHomeScreen } from "./vehicles-stitch/VehiclesHomeScreen";
import { VehiclesMakerScreen } from "./vehicles-stitch/VehiclesMakerScreen";
import { VehiclesModelScreen } from "./vehicles-stitch/VehiclesModelScreen";
import { VehiclesOverviewTab } from "./vehicles-stitch/VehiclesOverviewTab";
import { VehiclesCarSpecsTab } from "./vehicles-stitch/VehiclesCarSpecsTab";
import { VehiclesPartsOnFileTab } from "./vehicles-stitch/VehiclesPartsOnFileTab";
import { VehiclesSisterTab } from "./vehicles-stitch/VehiclesSisterTab";
import { VehiclesHistoryTab } from "./vehicles-stitch/VehiclesHistoryTab";
import { VehiclesAddCarFlow } from "./vehicles-stitch/VehiclesAddCarFlow";
import { VehiclesStatesGallery } from "./vehicles-stitch/VehiclesStatesGallery";
import { MakerLogo } from "./MakerLogo";
import { PartsButton } from "../parts-database/PartsButton";
import { rowFingerprint } from "./vehicles-stitch/vehiclesStitchShared";
import "./vehiclesCatalog.css";
import "../parts-database/partsDatabase.css";

const RECENT_KEY = "dominion-vehicles-recent";

type Screen = "home" | "maker" | "model" | "car" | "add" | "states";

type JobRow = { status?: string; section?: string; label?: string; parts?: Array<{ partNumber?: string }> };

export function VehiclesStitchFlow({
  token,
  onOpenLegacy,
}: {
  token: string;
  onOpenLegacy: () => void;
}) {
  const cap = vehiclesCaptureFromUrl();
  const capRoute = useMemo(() => captureInitialRoute(cap), [cap]);
  const [screen, setScreen] = useState<Screen>(capRoute.screen);
  const [make, setMake] = useState(capRoute.make ?? "");
  const [model, setModel] = useState(capRoute.model ?? "");
  const [carId, setCarId] = useState<string | null>(capRoute.carId ?? null);
  const [tab, setTab] = useState(capRoute.tab ?? "overview");
  const [search, setSearch] = useState("");
  const [specPanel, setSpecPanel] = useState(capRoute.specPanel ?? false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !cap);
  const [items, setItems] = useState<VehicleCatalogRecord[]>(() => (cap ? captureFixtureRecords() : []));
  const [retireOpen, setRetireOpen] = useState(capRoute.retireDialog ?? false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<FormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addPresetMake, setAddPresetMake] = useState<string | undefined>();
  const [addPresetModel, setAddPresetModel] = useState<string | undefined>();

  const makersQuery = useQuery({
    queryKey: ["catalog-makers"],
    queryFn: fetchCatalogMakers,
    enabled: !cap,
  });
  const makers: CatalogMakerSummary[] = cap ? VEHICLES_CAPTURE_MAKERS : (makersQuery.data?.items ?? []);

  const load = useCallback(async () => {
    if (cap) {
      setItems(captureFixtureRecords());
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { items: rows } = await listVehicleCatalog(token);
      const active = rows.filter((r) => (r as VehicleCatalogRecord & { status?: string }).status !== "retired");
      setItems(active);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "We couldn't load the cars. Nothing was changed.");
    } finally {
      setLoading(false);
    }
  }, [token, cap]);

  useEffect(() => {
    void load();
  }, [load]);

  const car = useMemo(() => items.find((r) => r.id === carId) ?? null, [items, carId]);

  const revisionsQuery = useQuery({
    queryKey: ["vehicle-revisions", carId],
    queryFn: () => fetchVariantRevisions(carId!),
    enabled: Boolean(carId) && tab === "history",
  });

  const checklistQuery = useQuery({
    queryKey: ["variant-checklist", carId],
    queryFn: () => fetchChecklist(carId!),
    enabled: Boolean(carId),
  });

  const specKeysQuery = useQuery({ queryKey: ["spec-keys"], queryFn: fetchSpecKeys, enabled: !cap });

  const logoByMake = useMemo(
    () => new Map(makers.map((m) => [m.make.toLowerCase(), m.logo_storage_path])),
    [makers],
  );

  const filteredSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/);
    return items
      .filter((r) => {
        const hay = [r.make, r.model, r.chassis_code, r.engine_code, String(r.production_start_year)]
          .map((x) => String(x ?? "").toLowerCase())
          .join(" ");
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 12);
  }, [items, search]);

  const modelsForMaker = useMemo(() => {
    const m = new Map<string, VehicleCatalogRecord[]>();
    for (const r of items.filter((x) => x.make.toLowerCase() === make.toLowerCase())) {
      const key = r.model;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()].map(([name, versions]) => ({
      name,
      versions,
      yearMin: Math.min(...versions.map((v) => v.production_start_year)),
      yearMax: Math.max(...versions.map((v) => v.production_end_year ?? 9999)),
    }));
  }, [items, make]);

  const versionsForModel = useMemo(
    () =>
      items
        .filter((r) => r.make.toLowerCase() === make.toLowerCase() && r.model.toLowerCase() === model.toLowerCase())
        .sort((a, b) => a.production_start_year - b.production_start_year),
    [items, make, model],
  );

  const sisterAnchorId = carId ?? (screen === "model" ? versionsForModel[0]?.id : undefined);

  const sistersQuery = useQuery({
    queryKey: ["vehicle-sisters", sisterAnchorId],
    queryFn: () => fetchSisterVehicles(sisterAnchorId ? [sisterAnchorId] : []),
    enabled: Boolean(sisterAnchorId) && !cap,
  });

  const captureSisters = useMemo(() => {
    if (!cap) return [];
    return VEHICLES_CAPTURE_SISTER_ROWS.map((s) => {
      const full = items.find((r) => r.id === s.id);
      return {
        id: s.id,
        make: s.make,
        model: s.model,
        chassis_code: s.chassis_code,
        production_start_year: full?.production_start_year ?? s.production_start_year,
        production_end_year: full?.production_end_year ?? s.production_end_year,
      };
    });
  }, [cap, items]);

  const sistersItems = cap ? captureSisters : (sistersQuery.data?.items ?? []);

  const dupes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of versionsForModel) {
      const k = rowFingerprint(v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [versionsForModel]);

  const [recentTick, setRecentTick] = useState(0);
  const recentCars = useMemo(() => {
    void recentTick;
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      return ids.map((id) => items.find((r) => r.id === id)).filter(Boolean).slice(0, 4) as VehicleCatalogRecord[];
    } catch {
      return [];
    }
  }, [items, recentTick]);

  const recentIds = recentCars.map((r) => r.id);
  const dashboardQuery = useQuery({
    queryKey: ["vehicles-dashboard", recentIds.join(",")],
    queryFn: () => fetchVehiclesDashboard(recentIds),
    enabled: !cap && screen === "home",
    retry: false,
    placeholderData: (prev) => prev,
  });
  const overviewQuery = useQuery({
    queryKey: ["parts-overview"],
    queryFn: fetchPartsOverview,
    enabled: !cap && screen === "home",
    retry: false,
  });

  const jobs = (
    cap && carId
      ? VEHICLES_CAPTURE_CHECKLIST.jobs
      : ((checklistQuery.data?.jobs as JobRow[]) ?? [])
  ) as JobRow[];
  const specs = (
    cap && carId
      ? VEHICLES_CAPTURE_CHECKLIST.specs
      : ((checklistQuery.data?.specs as Array<{ specKey?: string; value?: string | null; reach?: string }>) ?? [])
  );
  const otherParts = (
    cap && carId
      ? VEHICLES_CAPTURE_CHECKLIST.otherParts
      : ((checklistQuery.data?.otherParts as Array<{ category?: string; parts?: unknown[] }>) ?? [])
  );

  const specCountById = useMemo(() => {
    const m = new Map<string, number>();
    if (carId) m.set(carId, specs.filter((s) => s.value).length);
    for (const v of versionsForModel) {
      m.set(v.id, v.id === carId ? specs.filter((s) => s.value).length : 4);
    }
    return m;
  }, [carId, specs, versionsForModel]);

  // Real key-parts readiness for every version of this model (same numbers as the dashboard).
  const versionIds = versionsForModel.map((v) => v.id);
  const versionsReadinessQuery = useQuery({
    queryKey: ["vehicles-dashboard", "versions", versionIds.join(",")],
    queryFn: () => fetchVehiclesDashboard(versionIds),
    enabled: !cap && versionIds.length > 0 && (screen === "model" || screen === "car"),
    retry: false,
  });
  const keyPartsById = useMemo(() => {
    const m = new Map<string, { ready: number; total: number }>();
    if (cap) {
      const ready = jobs.filter((j) => j.status === "verified").length;
      for (const v of versionsForModel) m.set(v.id, { ready: v.id === carId ? ready : 4, total: 10 });
      return m;
    }
    for (const c of versionsReadinessQuery.data?.cars ?? []) m.set(c.id, { ready: c.keyParts, total: 10 });
    return m;
  }, [cap, jobs, versionsForModel, carId, versionsReadinessQuery.data]);

  function openCar(r: VehicleCatalogRecord, nextTab = "overview") {
    setMake(r.make);
    setModel(r.model);
    setCarId(r.id);
    setTab(nextTab);
    setScreen("car");
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const prev: string[] = raw ? JSON.parse(raw) : [];
      const next = [r.id, ...prev.filter((id) => id !== r.id)].slice(0, 4);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setRecentTick((n) => n + 1);
  }

  /** Go to another Dominion page; AdminPortal follows the address on popstate. */
  function openPage(page: string, params: Record<string, string> = {}) {
    const next = new URLSearchParams({ page, ...params });
    window.history.pushState({ page }, "", `${window.location.pathname}?${next.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate", { state: { page } }));
  }

  function openAddCar(presetMake?: string, presetModel?: string) {
    setAddPresetMake(presetMake);
    setAddPresetModel(presetModel);
    setScreen("add");
  }

  async function confirmRetire() {
    if (!car || !token) return;
    try {
      await deleteVehicleCatalog(token, car.id);
      setRetireOpen(false);
      setScreen("model");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not retire");
    }
  }

  function openEditDetails() {
    if (!car) return;
    setEditingId(car.id);
    setEditForm(recordToForm(car));
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!token || !editingId) return;
    const patched = await updateVehicleCatalog(token, editingId, toPatchPayload(editForm));
    setItems((prev) => prev.map((r) => (r.id === editingId ? patched : r)));
    setEditOpen(false);
  }

  const update =
    (key: keyof FormState) =>
    (value: string) => {
      setEditForm((prev) => ({ ...prev, [key]: value }));
    };

  if (loading && screen !== "states") {
    return (
      <div className="vehicles-database-stitch parts-database-stitch px-margin py-space-lg animate-pulse">
        <div className="h-10 bg-surface-container rounded-xl mb-4" />
        <div className="h-32 bg-surface-container rounded-xl" />
      </div>
    );
  }

  if (screen === "states") {
    const showGallery = capRoute.statesMode === "gallery" || cap === "vehicles_system_states_dialogs";
    if (showGallery) {
      return (
        <VehiclesStatesGallery
          onAddCar={() => openAddCar()}
          onRetry={() => void load()}
          car={car ?? items[0] ?? null}
          onKeepRetire={() => setRetireOpen(false)}
          onConfirmRetire={() => void confirmRetire()}
        />
      );
    }
    if (capRoute.statesMode === "loading") {
      return (
        <div className="vehicles-database-stitch parts-database-stitch px-margin py-space-lg animate-pulse">
          <div className="h-10 bg-surface-container rounded-xl mb-4" />
          <div className="h-32 bg-surface-container rounded-xl" />
        </div>
      );
    }
    if (capRoute.statesMode === "error" || loadError) {
      return (
        <div className="vehicles-database-stitch parts-database-stitch px-margin py-space-lg">
          <div className="rounded-xl border border-error/30 bg-error-container/30 px-4 py-3 text-body-md">
            We couldn&apos;t load the cars. Nothing was changed.
            <PartsButton variant="secondary" className="ml-3" onClick={() => void load()}>
              Try again
            </PartsButton>
          </div>
        </div>
      );
    }
    if (capRoute.statesMode === "empty") {
      return (
        <div className="vehicles-database-stitch parts-database-stitch px-margin py-space-lg">
          <p className="text-body-md">
            No car matches &quot;roomy 2014&quot;.
            <PartsButton variant="primary" className="ml-2" onClick={() => openAddCar()}>
              + Add a car
            </PartsButton>
          </p>
        </div>
      );
    }
    if (capRoute.statesMode === "retire" && car) {
      return (
        <VehiclesStatesGallery
          onAddCar={() => openAddCar()}
          onRetry={() => void load()}
          car={car}
          onKeepRetire={() => setRetireOpen(false)}
          onConfirmRetire={() => void confirmRetire()}
        />
      );
    }
  }

  if (screen === "home") {
    return (
      <VehiclesHomeScreen
        makers={makers}
        items={items}
        recentCars={cap && !recentCars.length ? items.slice(0, 2) : recentCars}
        logoByMake={logoByMake}
        search={search}
        onSearch={setSearch}
        filteredSearch={filteredSearch}
        onOpenMaker={(m) => {
          setMake(m);
          setScreen("maker");
        }}
        dashboard={cap ? VEHICLES_CAPTURE_DASHBOARD : dashboardQuery.data}
        dashboardLoading={!cap && dashboardQuery.isLoading}
        dashboardError={!cap && dashboardQuery.isError}
        onRetryDashboard={() => void dashboardQuery.refetch()}
        overview={cap ? VEHICLES_CAPTURE_OVERVIEW : overviewQuery.data}
        overviewError={!cap && overviewQuery.isError}
        onRetryOverview={() => void overviewQuery.refetch()}
        onOpenCar={(r, nextTab) => openCar(r, nextTab)}
        onAddCar={() => openAddCar()}
        onOpenLegacy={onOpenLegacy}
        onOpenPage={openPage}
        onReviewDuplicates={() => {
          const seen = new Map<string, VehicleCatalogRecord>();
          const dup = items.find((r) => {
            const k = rowFingerprint(r);
            if (seen.has(k)) return true;
            seen.set(k, r);
            return false;
          });
          if (!dup) return;
          setMake(dup.make);
          setModel(dup.model);
          setScreen("model");
        }}
        onReviewNoSpecs={() => {
          const first = items.find((r) => !r.engine_code && !r.chassis_code);
          if (first) openCar(first, "overview");
        }}
        onAddLogos={() => {
          const first = makers.find((m) => !m.logo_storage_path);
          if (!first) return;
          setMake(first.make);
          setScreen("maker");
        }}
      />
    );
  }

  if (screen === "maker") {
    const summary = makers.find((m) => m.make.toLowerCase() === make.toLowerCase());
    return (
      <VehiclesMakerScreen
        make={make}
        summary={summary}
        models={modelsForMaker}
        items={items}
        logoPath={summary?.logo_storage_path}
        onBack={() => setScreen("home")}
        onOpenModel={(m) => {
          setModel(m);
          setScreen("model");
        }}
        onAddCar={() => openAddCar(make)}
      />
    );
  }

  if (screen === "model") {
    return (
      <VehiclesModelScreen
        make={make}
        model={model}
        versions={versionsForModel}
        sisters={sistersItems}
        logoPath={logoByMake.get(make.toLowerCase())}
        logoByMake={logoByMake}
        specCountById={specCountById}
        keyPartsById={keyPartsById}
        dupes={dupes}
        onBack={() => setScreen("maker")}
        onOpenCar={(r) => openCar(r)}
        onAddCar={() => openAddCar(make, model)}
      />
    );
  }

  if (screen === "add") {
    return (
      <VehiclesAddCarFlow
        makers={makers}
        items={cap ? captureFixtureRecords() : items}
        logoByMake={logoByMake}
        sisters={sistersItems.length ? sistersItems : catalogSistersFromItems(items)}
        presetMake={addPresetMake ?? make}
        presetModel={addPresetModel ?? model}
        addCarReviewCapture={cap === "vehicles_add_a_car"}
        onBack={() => setScreen("home")}
        onOpenCar={(r) => openCar(r)}
        onSubmit={async (draft) => {
          if (!token) return;
          // The form stores the maker as makeSelection / makeOther (there is no "make" field). Without this every
          // new car would save as the form's default maker (Toyota).
          const knownMake = isCatalogReferenceMake(draft.make);
          const form: FormState = {
            ...emptyForm(),
            makeSelection: knownMake ? (draft.make as FormState["makeSelection"]) : "Other",
            makeOther: knownMake ? "" : draft.make,
            model: draft.model,
            production_start_year: draft.production_start_year,
            production_end_year: draft.production_end_year,
            drivetrain: draft.drivetrain,
            engine_code: draft.engine_code,
            chassis_code: draft.chassis_code,
            fuel_type: draft.fuel_type,
            transmission: draft.transmission,
            engine_displacement_l: draft.engine_displacement_l,
          };
          const created = await createVehicleCatalog(token, toCreatePayload(form));
          setItems((prev) => [...prev, created]);
          openCar(created);
        }}
      />
    );
  }

  if (screen === "car" && car) {
    const tabs = [
      { id: "overview", label: "Overview" },
      { id: "specs", label: "Car specs" },
      { id: "parts", label: "Parts on file" },
      { id: "sisters", label: "Sister cars" },
      { id: "history", label: "History" },
    ];
    const sisters = sistersItems;
    const otherRoomyVersions = items.filter(
      (r) =>
        r.id !== car.id
        && r.make === car.make
        && r.model === car.model,
    );
    const specPanelSisters = sisters
      .map((s) => {
        const full = items.find((r) => r.id === s.id);
        return {
          ...s,
          production_start_year: full?.production_start_year ?? (s as { production_start_year?: number }).production_start_year,
          production_end_year: full?.production_end_year ?? (s as { production_end_year?: number | null }).production_end_year,
        };
      })
      .filter((s) => s.make !== car.make || s.model !== car.model);
    return (
      <div className="vehicles-database-stitch parts-database-stitch px-margin py-space-lg flex flex-col gap-space-md relative">
        <PartsButton variant="secondary" className="self-start" onClick={() => setScreen("model")}>
          <DIcon name="arrow_back" className="text-[18px]" /> Back to {car.model} versions
        </PartsButton>
        <div className={`${D_CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-start justify-between gap-4 p-6">
            <div className="flex min-w-0 items-start gap-4">
              <MakerLogo make={car.make} logoStoragePath={logoByMake.get(car.make.toLowerCase())} size={56} />
              <div className="flex flex-col gap-1.5">
                <h1 className={`text-[26px] font-semibold tracking-tight ${D_TXT}`}>
                  {car.make} {car.model}
                </h1>
                <p className={`text-[16px] ${D_TXT}`}>
                  {versionYearsLabel(car.production_start_year, car.production_end_year)} · {versionDifferenceLabel(car)}
                </p>
                <p className="flex flex-wrap gap-1.5">
                  {car.chassis_code ? <DCode>{car.chassis_code}</DCode> : null}
                  {car.engine_code ? <DCode>{car.engine_code}</DCode> : null}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <PartsButton variant="primary" onClick={() => setSpecPanel(true)}>
                <DIcon name="add" className="text-[18px]" /> Add spec
              </PartsButton>
              <PartsButton variant="secondary" onClick={openEditDetails}>
                <DIcon name="edit" className="text-[18px]" /> Edit details
              </PartsButton>
              <PartsButton variant="danger" onClick={() => setRetireOpen(true)}>
                <DIcon name="archive" className="text-[18px]" /> Retire
              </PartsButton>
            </div>
          </div>
          <div className="vehicles-tab-pills flex gap-1 overflow-x-auto border-t border-[#e6e7ee] px-4 dark:border-[#1e293b]" role="tablist">
            {tabs.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px shrink-0 border-b-2 px-3 py-3 text-[14px] font-semibold transition-colors ${
                    on ? "border-[#0153dc] text-[#0153dc] dark:text-[#93b4ff]" : `border-transparent hover:text-[#0153dc] ${D_MUTED}`
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        {tab === "overview" ? (
          <VehiclesOverviewTab
            car={car}
            specs={specs}
            jobs={jobs}
            sisters={sisters}
            logoByMake={logoByMake}
            items={items}
            onOpenCar={openCar}
            onTabParts={() => setTab("parts")}
            onAddFact={openEditDetails}
          />
        ) : null}
        {tab === "specs" ? (
          <VehiclesCarSpecsTab
            car={car}
            specKeys={cap ? VEHICLES_CAPTURE_SPEC_KEYS : (specKeysQuery.data?.items ?? [])}
            specs={specs}
            onAddSpec={() => setSpecPanel(true)}
            onEditSpec={() => setSpecPanel(true)}
          />
        ) : null}
        {tab === "parts" ? <VehiclesPartsOnFileTab car={car} jobs={jobs} otherParts={otherParts as Parameters<typeof VehiclesPartsOnFileTab>[0]["otherParts"]} /> : null}
        {tab === "sisters" ? (
          <VehiclesSisterTab car={car} sisters={sisters} items={items} logoByMake={logoByMake} onOpenCar={openCar} />
        ) : null}
        {tab === "history" ? (
          <VehiclesHistoryTab revisions={revisionsQuery.data?.items ?? []} />
        ) : null}
        {specPanel ? (
          <SpecEditorPanel
            car={car}
            otherVersions={otherRoomyVersions}
            sisters={specPanelSisters}
            onClose={() => setSpecPanel(false)}
            onSaved={() => void checklistQuery.refetch()}
          />
        ) : null}
        {retireOpen ? (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog">
            <div className={`${D_CARD} w-full max-w-md p-6 shadow-xl`}>
              <p className={`mb-2 text-[19px] font-semibold ${D_TXT}`}>
                Retire {car.make} {car.model} {versionYearsLabel(car.production_start_year, car.production_end_year)} {versionDifferenceLabel(car).split(" · ")[0]}?
              </p>
              <p className="text-body-sm text-on-surface-variant mb-4">
                It disappears from Fleet and Plug car pickers. Parts stay on file.
              </p>
              <div className="flex gap-2 justify-end">
                <PartsButton variant="secondary" onClick={() => setRetireOpen(false)}>
                  Keep it
                </PartsButton>
                <PartsButton variant="danger" confirm onClick={() => void confirmRetire()}>
                  Retire
                </PartsButton>
              </div>
            </div>
          </div>
        ) : null}
        <VehicleCatalogEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editingId={editingId}
          form={editForm}
          setForm={setEditForm}
          update={update}
          saving={false}
          onSave={() => void saveEdit()}
        />
      </div>
    );
  }

  if (screen === "car" && !car && carId) {
    return (
      <div className="vehicles-database-stitch parts-database-stitch px-margin py-space-lg">
        <p className="text-body-md text-on-surface-variant">We couldn&apos;t find that car.</p>
        <PartsButton variant="secondary" onClick={() => setScreen("home")}>
          Back to Vehicles
        </PartsButton>
      </div>
    );
  }

  return null;
}

/** Sister cars come only from the platform family (self_serve_sister_vehicles); never a typed-in list. */
function catalogSistersFromItems(_items: VehicleCatalogRecord[]) {
  return [] as Array<{ id: string; make: string; model: string }>;
}
