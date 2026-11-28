import { useCallback, useEffect, useMemo, useState } from "react";
import type { MaintenanceRule } from "./maintenanceMasterApi";
import {
  createMaintenanceRule,
  fetchScopeCoverage,
  loadRoamPolicyStarter,
  patchMaintenanceRule,
} from "./maintenanceMasterApi";
import { formatInterval } from "./maintenanceMasterFormat";
import type { MaintenanceServiceCategory } from "../../../types/maintenance";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { EMPTY_PICK, MmCarPicker, carPickLabel, pickForCatalogId, type CarPick } from "./MmCarPicker";
import { getCarScope, listModelFamilies, marketLabel, type CarScope, type ManualSummary } from "./manuals/manualsApi";
import { SEVERE_MISSING, scheduleBlocker } from "./scheduleDrawerModel";

export const SAVE_ERROR = "Couldn't save. Nothing was changed.";

type SourceType = "maker_manual" | "part_maker" | "roam_policy";
/** Rebuild step 4 (MER-01/02): four levels, each saves a real id. "One model" = a platform rule on the model family. */
type ScopeType = "global" | "platform" | "engine_family" | "variant";

type Props = {
  open: boolean;
  token: string;
  canWrite: boolean;
  rule: MaintenanceRule | null;
  categories: MaintenanceServiceCategory[];
  catalog: VehicleCatalogRecord[];
  presetComponentId?: string;
  presetScope?: string;
  onClose: () => void;
  onSaved: () => void;
  onRequestImpact: (payload: Record<string, unknown>, mode: "draft" | "active") => void;
  onStarterLoaded: () => void;
  /** Opens the Manuals tab upload for the model the owner picked. */
  onUploadManual?: (platformId: string) => void;
};

export const SCOPE_CHOICES: { value: ScopeType; title: string; line: string; icon: string }[] = [
  { value: "global", title: "Everyone", line: "Every car, unless a model has its own", icon: "public" },
  { value: "platform", title: "One model", line: "All years and names of one model", icon: "directions_car" },
  { value: "engine_family", title: "One engine", line: "Every car with this engine", icon: "settings" },
  { value: "variant", title: "One car version", line: "One exact version only", icon: "pin_drop" },
];

function normaliseScope(s: string | undefined | null): ScopeType {
  if (s === "platform" || s === "platform_family") return "platform";
  if (s === "engine_family" || s === "variant" || s === "global") return s;
  return "global";
}

const INPUT =
  "h-11 w-full rounded-[10px] border border-[#c5c6d0] bg-white px-3 font-mono text-[15px] tabular-nums text-[#30323b] focus:border-[#0153dc] focus:outline-none focus:ring-2 focus:ring-[#0153dc]/30 disabled:bg-[#f3f4fb] disabled:text-[#5d5f68]";
const SECTION_TITLE = "text-[15px] font-semibold text-[#30323b]";

export function MaintenanceMasterScheduleDrawer({
  open,
  token,
  canWrite,
  rule,
  categories,
  catalog,
  presetComponentId,
  presetScope,
  onClose,
  onSaved,
  onRequestImpact,
  onStarterLoaded,
  onUploadManual,
}: Props) {
  const editing = Boolean(rule?.id);
  const [componentId, setComponentId] = useState("");
  const [scope, setScope] = useState<ScopeType>("global");
  const [car, setCar] = useState<CarPick>(EMPTY_PICK);
  const [carScope, setCarScope] = useState<CarScope | null>(null);
  const [carScopeError, setCarScopeError] = useState("");
  /** Editing a saved model/engine rule: its own id, until the owner picks a different car. */
  const [savedTarget, setSavedTarget] = useState<{ platform_id?: string; engine_family_id?: string; name?: string } | null>(
    null,
  );
  const [intervalKm, setIntervalKm] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [severeKm, setSevereKm] = useState("");
  const [severeMo, setSevereMo] = useState("");
  const [oneFigure, setOneFigure] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("roam_policy");
  const [manualId, setManualId] = useState("");
  const [evidencePage, setEvidencePage] = useState("");
  const [manuals, setManuals] = useState<ManualSummary[]>([]);
  const [taskName, setTaskName] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [confidence, setConfidence] = useState("uncertain");
  const [vehicleClasses, setVehicleClasses] = useState<string[]>(["car"]);
  const [coversCount, setCoversCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [starterBusy, setStarterBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setCarScope(null);
    setCarScopeError("");
    if (rule) {
      const s = normaliseScope(String(rule.template_scope ?? "global"));
      setComponentId(String(rule.component_id ?? ""));
      setScope(s);
      setCar(rule.vehicle_catalog_id ? pickForCatalogId(catalog, String(rule.vehicle_catalog_id)) : EMPTY_PICK);
      setSavedTarget(
        s === "platform" && rule.platform_id
          ? { platform_id: String(rule.platform_id) }
          : s === "engine_family" && rule.engine_family_id
            ? { engine_family_id: String(rule.engine_family_id) }
            : null,
      );
      setIntervalKm(rule.interval_km != null ? String(rule.interval_km) : "");
      setIntervalMonths(rule.interval_months != null ? String(rule.interval_months) : "");
      setSourceType((String(rule.source_type ?? "roam_policy") as SourceType) || "roam_policy");
      setManualId(String((rule as { manual_id?: string }).manual_id ?? ""));
      setEvidencePage(
        (rule as { evidence_page?: number | null }).evidence_page != null
          ? String((rule as { evidence_page?: number }).evidence_page)
          : "",
      );
      setTaskName(String(rule.task_name ?? ""));
      setYearFrom(rule.year_from != null ? String(rule.year_from) : "");
      setYearTo(rule.year_to != null ? String(rule.year_to) : "");
      setEvidenceUrl(String((rule as { evidence_url?: string }).evidence_url ?? ""));
      setConfidence(String(rule.confidence ?? "uncertain"));
      setSevereKm(rule.severe_interval_km != null ? String(rule.severe_interval_km) : "");
      setSevereMo(rule.severe_interval_months != null ? String(rule.severe_interval_months) : "");
      setOneFigure(Boolean((rule as { severe_same_as_normal?: boolean }).severe_same_as_normal));
      setVehicleClasses(
        Array.isArray(rule.applicable_vehicle_classes) ? (rule.applicable_vehicle_classes as string[]) : ["car"],
      );
    } else {
      setComponentId(presetComponentId ?? "");
      setScope(normaliseScope(presetScope));
      setCar(EMPTY_PICK);
      setSavedTarget(null);
      setIntervalKm("");
      setIntervalMonths("");
      setSourceType("roam_policy");
      setManualId("");
      setEvidencePage("");
      setTaskName("");
      setYearFrom("");
      setYearTo("");
      setEvidenceUrl("");
      setConfidence("uncertain");
      setSevereKm("");
      setSevereMo("");
      setOneFigure(false);
      setVehicleClasses(["car"]);
    }
  }, [open, rule, presetComponentId, presetScope, catalog]);

  // Which model family / engine the picked car belongs to.
  useEffect(() => {
    if (!open || !token || !car.versionId) {
      setCarScope(null);
      return;
    }
    let live = true;
    setCarScopeError("");
    void getCarScope(token, car.versionId)
      .then((r) => {
        if (!live) return;
        setCarScope(r);
        setSavedTarget(null);
      })
      .catch((e: unknown) => live && setCarScopeError(e instanceof Error ? e.message : "Could not look up that car."));
    return () => {
      live = false;
    };
  }, [open, token, car.versionId]);

  const platformId = scope === "platform" ? (carScope?.model?.platform_id ?? savedTarget?.platform_id ?? "") : "";
  const engineFamilyId =
    scope === "engine_family" ? (carScope?.engine?.engine_family_id ?? savedTarget?.engine_family_id ?? "") : "";
  const familyForManual = carScope?.model?.platform_id ?? savedTarget?.platform_id ?? "";

  // Saved model rule being edited: say its plain name.
  useEffect(() => {
    if (!open || !token || !savedTarget?.platform_id || savedTarget.name) return;
    let live = true;
    void listModelFamilies(token, { platformId: savedTarget.platform_id })
      .then((r) => {
        const name = r.items[0]?.name ?? r.items[0]?.label ?? "";
        if (live && name) setSavedTarget((prev) => (prev ? { ...prev, name } : prev));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, token, savedTarget]);

  // The manuals of the picked model, for a car maker number.
  useEffect(() => {
    if (!open || !token || !familyForManual) {
      setManuals([]);
      return;
    }
    let live = true;
    void listModelFamilies(token, { platformId: familyForManual })
      .then((r) => {
        if (!live) return;
        setManuals((r.items[0]?.manuals ?? []).filter((m) => m.status !== "rejected"));
      })
      .catch(() => live && setManuals([]));
    return () => {
      live = false;
    };
  }, [open, token, familyForManual]);

  useEffect(() => {
    if (!open || !token) return;
    const params: Record<string, string | undefined> = { scope };
    if (scope === "variant") params.vehicle_catalog_id = car.versionId || undefined;
    if (scope === "platform") params.platform_id = platformId || undefined;
    if (scope === "engine_family") params.engine_family_id = engineFamilyId || undefined;
    if (scope !== "global" && !params.vehicle_catalog_id && !params.platform_id && !params.engine_family_id) {
      setCoversCount(null);
      return;
    }
    void fetchScopeCoverage(token, params)
      .then(setCoversCount)
      .catch(() => setCoversCount(null));
  }, [open, token, scope, car.versionId, platformId, engineFamilyId]);

  const category = useMemo(() => categories.find((c) => c.id === componentId), [categories, componentId]);

  const carMaker = sourceType === "maker_manual";
  const pickedManual = manuals.find((m) => m.id === manualId);

  /** What still stops a save, in plain words (shown under the buttons). Empty = ready. */
  const blocker = scheduleBlocker({
    componentId,
    scope,
    carVersionId: car.versionId,
    platformId,
    engineFamilyId,
    carHasNoModel: Boolean(carScope && !carScope.model),
    carHasNoEngine: Boolean(carScope && !carScope.engine),
    intervalKm,
    intervalMonths,
    sourceType,
    familyForManual,
    manualCount: manuals.length,
    manualId,
    evidencePage,
    oneFigure,
    severeKm,
    severeMonths: severeMo,
    evidenceUrl,
  });

  const severeMissing = blocker === SEVERE_MISSING;

  const buildPayload = useCallback(
    (status: "draft" | "active") => {
      const name = taskName.trim() || category?.name || (rule?.task_name ? String(rule.task_name) : "Schedule");
      const payload: Record<string, unknown> = {
        task_name: name,
        template_scope: scope,
        component_id: componentId,
        vehicle_catalog_id: scope === "variant" ? car.versionId || null : null,
        platform_id: scope === "platform" ? platformId || null : null,
        engine_family_id: scope === "engine_family" ? engineFamilyId || null : null,
        interval_km: intervalKm === "" ? null : Number(intervalKm),
        interval_months: intervalMonths === "" ? null : Number(intervalMonths),
        source_type: sourceType,
        status,
        confidence,
        applicable_vehicle_classes: vehicleClasses,
        year_from: yearFrom === "" ? null : Number(yearFrom),
        year_to: yearTo === "" ? null : Number(yearTo),
        evidence_url: carMaker ? null : evidenceUrl.trim() || null,
        manual_id: carMaker ? manualId || null : null,
        evidence_page: carMaker && evidencePage !== "" ? Number(evidencePage) : null,
        severe_same_as_normal: oneFigure,
        severe_interval_km: !oneFigure && severeKm !== "" ? Number(severeKm) : null,
        severe_interval_months: !oneFigure && severeMo !== "" ? Number(severeMo) : null,
      };
      return payload;
    },
    [
      taskName,
      category?.name,
      rule?.task_name,
      scope,
      componentId,
      car.versionId,
      platformId,
      engineFamilyId,
      intervalKm,
      intervalMonths,
      sourceType,
      confidence,
      vehicleClasses,
      yearFrom,
      yearTo,
      carMaker,
      evidenceUrl,
      manualId,
      evidencePage,
      oneFigure,
      severeKm,
      severeMo,
    ],
  );

  const save = async (status: "draft" | "active") => {
    if (!canWrite || !token) return;
    // A draft may be unfinished; going live needs everything.
    if (status === "active" && blocker) {
      setError(blocker);
      return;
    }
    if (!componentId) {
      setError("Pick a part.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = buildPayload(status);
      if (status === "active") {
        if (editing && rule?.id) payload.id = rule.id;
        onRequestImpact(payload, "active");
        setBusy(false);
        return;
      }
      if (editing && rule?.id) {
        await patchMaintenanceRule(token, rule.id, payload);
      } else {
        await createMaintenanceRule(token, payload);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : SAVE_ERROR;
      setError(msg.includes("Nothing was changed") ? SAVE_ERROR : msg);
    } finally {
      setBusy(false);
    }
  };

  const loadStarter = async () => {
    if (!canWrite || !token) return;
    setStarterBusy(true);
    setError("");
    try {
      await loadRoamPolicyStarter(token);
      onStarterLoaded();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : SAVE_ERROR);
    } finally {
      setStarterBusy(false);
    }
  };

  if (!open) return null;

  const who =
    scope === "global"
      ? "everyone"
      : scope === "platform"
        ? (carScope?.model?.name ?? savedTarget?.name ?? "this model")
        : scope === "engine_family"
          ? (carScope?.engine?.name ?? "this engine")
          : carPickLabel(catalog as never, car) || "this car version";
  const normalText = formatInterval(
    intervalKm === "" ? null : Number(intervalKm),
    intervalMonths === "" ? null : Number(intervalMonths),
  );
  const severeText = oneFigure
    ? "the same as normal"
    : severeKm !== "" || severeMo !== ""
      ? formatInterval(severeKm === "" ? null : Number(severeKm), severeMo === "" ? null : Number(severeMo))
      : "";
  const summary = `${category?.name ?? "This part"} for ${who}: ${normalText}${
    severeText ? `; harder driving ${severeText}` : ""
  }.${carMaker && evidencePage ? ` From the owner's manual, page ${evidencePage}.` : ""}`;

  const coversLine =
    scope === "platform" && carScope?.model
      ? `Covers ${[carScope.model.name.replace(/\s\d{4}.*$/, ""), ...carScope.model.also].join(", ")}`
      : scope === "platform" && savedTarget?.name
        ? `Covers ${savedTarget.name}`
        : scope === "engine_family" && carScope?.engine
          ? `Covers every car with the ${carScope.engine.name} (${carScope.engine.cars} in the catalogue)`
          : coversCount != null && scope !== "global"
            ? `Covers ${coversCount} catalogue car${coversCount === 1 ? "" : "s"}`
            : "";

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/40" aria-label="Close drawer" onClick={onClose} />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-white text-[#30323b] shadow-2xl max-md:inset-0 max-md:max-w-none"
        data-testid="mm-schedule-drawer"
      >
        <header className="flex items-center justify-between border-b border-[#e6e7ee] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc]">
              <span className="material-symbols-outlined text-[22px]">calendar_month</span>
            </span>
            <h2 className="text-[22px] font-semibold">
              {editing ? `Edit schedule · ${rule?.task_name ?? "Part"}` : "Add schedule"}
            </h2>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#c5c6d0] bg-white hover:bg-[#f3f4fb]"
            aria-label="Close"
            onClick={onClose}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>

        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-5">
          {error ? (
            <p className="rounded-[10px] border border-[#f3c5c4] bg-[#fdecec] px-3 py-2 text-[14px] text-[#a83836]" role="alert">
              {error}
            </p>
          ) : null}

          <section>
            <h3 className={SECTION_TITLE}>Which part</h3>
            <select
              className="mt-2 h-11 w-full rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[15px] disabled:opacity-60"
              value={componentId}
              aria-label="Which part"
              onChange={(e) => setComponentId(e.target.value)}
              disabled={!canWrite || Boolean(presetComponentId && editing)}
            >
              <option value="">Choose a part</option>
              {categories
                .filter((c) => c.kind === "component")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>Which cars</h3>
            <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Which cars">
              {SCOPE_CHOICES.map((opt) => {
                const on = scope === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!canWrite}
                    className={`relative min-h-[104px] rounded-2xl border p-4 text-left transition-colors ${
                      on ? "border-2 border-[#0153dc] bg-[#f3f6ff]" : "border-[#c5c6d0] bg-white hover:bg-[#f9f9fd]"
                    }`}
                    onClick={() => setScope(opt.value)}
                  >
                    <span className={`material-symbols-outlined text-[22px] ${on ? "text-[#0153dc]" : "text-[#5d5f68]"}`}>
                      {opt.icon}
                    </span>
                    {on ? (
                      <span className="material-symbols-outlined absolute right-3 top-3 text-[22px] text-[#0153dc]">
                        check_circle
                      </span>
                    ) : null}
                    <span className={`mt-2 block text-[16px] font-semibold ${on ? "text-[#0153dc]" : ""}`}>{opt.title}</span>
                    <span className="mt-0.5 block text-[13px] text-[#5d5f68]">{opt.line}</span>
                  </button>
                );
              })}
            </div>

            {scope !== "global" ? (
              <div className="mt-3 rounded-2xl bg-[#f3f4fb] p-4">
                {savedTarget && !car.versionId ? (
                  <p className="mb-3 text-[14px] text-[#30323b]">
                    Saved for <span className="font-semibold">{savedTarget.name ?? "this model"}</span>. Pick a car below to
                    change it.
                  </p>
                ) : null}
                <MmCarPicker catalog={catalog} value={car} onChange={setCar} disabled={!canWrite} />
                {carScopeError ? <p className="mt-2 text-[13px] text-[#a83836]">{carScopeError}</p> : null}
                {coversLine ? (
                  <p className="mt-3 flex items-start gap-2 text-[13px] text-[#006e31]">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    {coversLine}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(["car", "van", "truck"] as const).map((cls) => {
                const on = vehicleClasses.includes(cls);
                return (
                  <button
                    key={cls}
                    type="button"
                    disabled={!canWrite}
                    aria-pressed={on}
                    className={`h-9 rounded-full border px-3 text-[13px] capitalize ${
                      on ? "border-[#0153dc] bg-[#dbe1ff] text-[#0047c0]" : "border-[#c5c6d0] bg-white text-[#30323b]"
                    }`}
                    onClick={() =>
                      setVehicleClasses((prev) => (prev.includes(cls) ? prev.filter((x) => x !== cls) : [...prev, cls]))
                    }
                  >
                    {cls}
                  </button>
                );
              })}
              <label className="ml-auto flex items-center gap-2 text-[13px] text-[#5d5f68]">
                Years
                <input
                  type="number"
                  className={`${INPUT} h-9 w-20`}
                  placeholder="from"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  disabled={!canWrite}
                  aria-label="Year from"
                />
                <input
                  type="number"
                  className={`${INPUT} h-9 w-20`}
                  placeholder="to"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  disabled={!canWrite}
                  aria-label="Year to"
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>How often</h3>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#e6e7ee] bg-white p-4">
                <p className="text-[15px] font-semibold">Normal driving</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-[12px] text-[#5d5f68]">
                    Every km
                    <input
                      type="number"
                      className={`${INPUT} mt-1`}
                      value={intervalKm}
                      onChange={(e) => setIntervalKm(e.target.value)}
                      disabled={!canWrite}
                      aria-label="Normal km"
                    />
                  </label>
                  <label className="text-[12px] text-[#5d5f68]">
                    or months
                    <input
                      type="number"
                      className={`${INPUT} mt-1`}
                      value={intervalMonths}
                      onChange={(e) => setIntervalMonths(e.target.value)}
                      disabled={!canWrite}
                      aria-label="Normal months"
                    />
                  </label>
                </div>
              </div>
              <div
                className={`rounded-2xl border p-4 ${
                  severeMissing ? "border-[#a83836] bg-[#fdecec]" : "border-[#e6e7ee] bg-[#f3f4fb]"
                }`}
              >
                <p className={`text-[15px] font-semibold ${severeMissing ? "text-[#a83836]" : ""}`}>Harder driving</p>
                <p className="text-[12px] text-[#5d5f68]">Taxis, heavy traffic</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    className={INPUT}
                    placeholder={oneFigure ? "Same" : "km"}
                    value={oneFigure ? "" : severeKm}
                    onChange={(e) => setSevereKm(e.target.value)}
                    disabled={!canWrite || oneFigure}
                    aria-label="Harder driving km"
                  />
                  <input
                    type="number"
                    className={INPUT}
                    placeholder={oneFigure ? "Same" : "months"}
                    value={oneFigure ? "" : severeMo}
                    onChange={(e) => setSevereMo(e.target.value)}
                    disabled={!canWrite || oneFigure}
                    aria-label="Harder driving months"
                  />
                </div>
                <label className="mt-3 flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded accent-[#0153dc]"
                    checked={oneFigure}
                    onChange={(e) => setOneFigure(e.target.checked)}
                    disabled={!canWrite}
                  />
                  The manual gives one figure
                </label>
              </div>
            </div>
            {severeMissing ? (
              <p className="mt-2 flex items-center gap-1 text-[13px] text-[#a83836]">
                <span className="material-symbols-outlined text-[18px]">error</span>
                Fill in the harder-driving numbers, or tick 'The manual gives one figure'.
              </p>
            ) : (
              <p className="mt-2 text-[13px] text-[#5d5f68]">Due is whichever comes first.</p>
            )}
          </section>

          <section>
            <h3 className={SECTION_TITLE}>Where this number comes from</h3>
            <div className="mt-2 space-y-2" role="radiogroup" aria-label="Where this number comes from">
              {(
                [
                  { value: "maker_manual" as const, label: "Car maker's owner's manual" },
                  { value: "part_maker" as const, label: "Part maker's catalogue" },
                  { value: "roam_policy" as const, label: "Roam policy" },
                ] as const
              ).map((opt) => {
                const on = sourceType === opt.value;
                return (
                  <div
                    key={opt.value}
                    className={`rounded-2xl border ${on ? "border-2 border-[#0153dc] bg-[#f3f6ff]" : "border-[#c5c6d0] bg-white"}`}
                  >
                    <label className="flex min-h-[48px] cursor-pointer items-center gap-3 px-4">
                      <input
                        type="radio"
                        name="mm-source"
                        className="h-5 w-5 accent-[#0153dc]"
                        checked={on}
                        onChange={() => setSourceType(opt.value)}
                        disabled={!canWrite}
                      />
                      <span className="text-[15px]">{opt.label}</span>
                    </label>
                    {on && opt.value === "maker_manual" ? (
                      <div className="space-y-2 px-4 pb-4">
                        <div className="flex gap-2">
                          <select
                            className={`h-11 flex-1 rounded-[10px] border bg-white px-3 text-[15px] ${
                              familyForManual && !manuals.length ? "border-[#a83836] text-[#a83836]" : "border-[#c5c6d0]"
                            }`}
                            value={manualId}
                            onChange={(e) => setManualId(e.target.value)}
                            disabled={!canWrite || !manuals.length}
                            aria-label="Manual"
                          >
                            <option value="">
                              {!familyForManual
                                ? "Pick the model first"
                                : manuals.length
                                  ? "Choose the manual"
                                  : `No manual for ${carScope?.model?.name?.replace(/\s\d{4}.*$/, "") ?? "this model"} yet`}
                            </option>
                            {manuals.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.title} · {marketLabel(m.market).label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            className={`${INPUT} w-24`}
                            placeholder="Page"
                            value={evidencePage}
                            onChange={(e) => setEvidencePage(e.target.value)}
                            disabled={!canWrite}
                            aria-label="Page"
                          />
                        </div>
                        {familyForManual && !manuals.length ? (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[13px] text-[#a83836]">
                              Upload the manual first, or pick Roam policy.
                            </p>
                            {onUploadManual ? (
                              <button
                                type="button"
                                className="h-9 shrink-0 rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[13px] font-medium hover:bg-[#f3f4fb]"
                                onClick={() => onUploadManual(familyForManual)}
                              >
                                Upload a manual
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {pickedManual ? (
                          <p className="text-[12px] text-[#5d5f68]">
                            {marketLabel(pickedManual.market).label} manual · table on
                            pages {pickedManual.page_from}–{pickedManual.page_to}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {on && opt.value === "part_maker" ? (
                      <div className="px-4 pb-4">
                        <input
                          type="url"
                          className="h-11 w-full rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[15px]"
                          placeholder="Link to the page you used"
                          value={evidenceUrl}
                          onChange={(e) => setEvidenceUrl(e.target.value)}
                          disabled={!canWrite}
                          aria-label="Evidence link"
                        />
                      </div>
                    ) : null}
                    {on && opt.value === "roam_policy" && canWrite ? (
                      <div className="px-4 pb-4">
                        <button
                          type="button"
                          className="h-9 rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[13px] font-medium hover:bg-[#f3f4fb] disabled:opacity-50"
                          onClick={() => void loadStarter()}
                          disabled={starterBusy}
                        >
                          Load Roam policy starter set
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className={SECTION_TITLE}>How sure are you?</h3>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-[12px] bg-[#eeedf6] p-1">
              {(
                [
                  { value: "confirmed", label: "Checked" },
                  { value: "likely", label: "Likely" },
                  { value: "uncertain", label: "Not sure" },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={confidence === o.value}
                  disabled={!canWrite}
                  className={`h-10 rounded-[10px] text-[14px] font-medium ${
                    confidence === o.value ? "bg-white text-[#0153dc] shadow-sm" : "text-[#5d5f68]"
                  }`}
                  onClick={() => setConfidence(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          <div className="rounded-2xl bg-[#f3f4fb] px-4 py-3 text-[14px] text-[#30323b]" data-testid="mm-schedule-summary">
            {summary}
          </div>
        </div>

        <footer className="border-t border-[#e6e7ee] px-6 py-4 max-md:hidden">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="mr-auto h-11 rounded-[10px] border border-[#a83836] bg-white px-4 text-[15px] font-medium text-[#a83836] hover:bg-[#fdecec]"
              onClick={onClose}
            >
              Cancel
            </button>
            {canWrite ? (
              <>
                <button
                  type="button"
                  className="h-11 rounded-[10px] border border-[#c5c6d0] bg-white px-4 text-[15px] font-medium hover:bg-[#f3f4fb] disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void save("draft")}
                >
                  Save as draft
                </button>
                <button
                  type="button"
                  className="h-11 rounded-[10px] bg-[#0153dc] px-5 text-[15px] font-semibold text-white hover:bg-[#0047c0] disabled:opacity-50"
                  disabled={busy || Boolean(blocker)}
                  onClick={() => void save("active")}
                >
                  Make active
                </button>
              </>
            ) : null}
          </div>
          {canWrite && blocker ? (
            <p className="mt-2 text-right text-[13px] text-[#5d5f68]" data-testid="mm-schedule-blocker">
              {blocker}
            </p>
          ) : null}
        </footer>
        <div className="hidden border-t border-[#e6e7ee] px-6 py-3 text-[14px] text-[#5d5f68] max-md:block">
          Edit schedules on a larger screen.
        </div>
      </aside>
    </>
  );
}
