import { useCallback, useEffect, useMemo, useState } from "react";
import type { MaintenanceRule } from "./maintenanceMasterApi";
import {
  createMaintenanceRule,
  fetchScopeCoverage,
  loadRoamPolicyStarter,
  patchMaintenanceRule,
} from "./maintenanceMasterApi";
import { formatInterval, sourceLabel } from "./maintenanceMasterFormat";
import type { MaintenanceServiceCategory } from "../../../types/maintenance";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";

export const SAVE_ERROR = "Couldn't save. Nothing was changed.";

type SourceType = "maker_manual" | "part_maker" | "roam_policy";
type ScopeType = "global" | "engine_family" | "platform" | "platform_family" | "variant";

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
};

const scopeOptions: { value: ScopeType; label: string }[] = [
  { value: "global", label: "Everyone" },
  { value: "engine_family", label: "Engine" },
  { value: "platform_family", label: "Platform family" },
  { value: "platform", label: "Platform" },
  { value: "variant", label: "One car version" },
];

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
}: Props) {
  const editing = Boolean(rule?.id);
  const [componentId, setComponentId] = useState("");
  const [scope, setScope] = useState<ScopeType>("global");
  const [vehicleCatalogId, setVehicleCatalogId] = useState("");
  const [intervalKm, setIntervalKm] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("roam_policy");
  const [taskName, setTaskName] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [confidence, setConfidence] = useState("uncertain");
  const [severeEnabled, setSevereEnabled] = useState(false);
  const [severeKm, setSevereKm] = useState("");
  const [severeMo, setSevereMo] = useState("");
  const [vehicleClasses, setVehicleClasses] = useState<string[]>(["car"]);
  const [coversCount, setCoversCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [starterBusy, setStarterBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (rule) {
      setComponentId(String(rule.component_id ?? ""));
      setScope((String(rule.template_scope ?? "global") as ScopeType) || "global");
      setVehicleCatalogId(String(rule.vehicle_catalog_id ?? ""));
      setIntervalKm(rule.interval_km != null ? String(rule.interval_km) : "");
      setIntervalMonths(rule.interval_months != null ? String(rule.interval_months) : "");
      setSourceType((String(rule.source_type ?? "roam_policy") as SourceType) || "roam_policy");
      setTaskName(String(rule.task_name ?? ""));
      setYearFrom(rule.year_from != null ? String(rule.year_from) : "");
      setYearTo(rule.year_to != null ? String(rule.year_to) : "");
      setEvidenceUrl(String((rule as { evidence_url?: string }).evidence_url ?? ""));
      setConfidence(String(rule.confidence ?? "uncertain"));
      setSevereKm(rule.severe_interval_km != null ? String(rule.severe_interval_km) : "");
      setSevereMo(rule.severe_interval_months != null ? String(rule.severe_interval_months) : "");
      setSevereEnabled(Boolean(rule.severe_interval_km || rule.severe_interval_months));
    } else {
      setComponentId(presetComponentId ?? "");
      setScope((presetScope as ScopeType) || "global");
      setVehicleCatalogId("");
      setIntervalKm("");
      setIntervalMonths("");
      setSourceType("roam_policy");
      setTaskName("");
      setYearFrom("");
      setYearTo("");
      setEvidenceUrl("");
      setConfidence("uncertain");
      setSevereEnabled(false);
      setSevereKm("");
      setSevereMo("");
    }
  }, [open, rule, presetComponentId, presetScope]);

  useEffect(() => {
    if (!open || !token) return;
    void fetchScopeCoverage(token, {
      scope,
      vehicle_catalog_id: scope === "variant" ? vehicleCatalogId : undefined,
    }).then(setCoversCount);
  }, [open, token, scope, vehicleCatalogId]);

  const category = useMemo(
    () => categories.find((c) => c.id === componentId),
    [categories, componentId],
  );

  const buildPayload = useCallback(
    (status: "draft" | "active") => {
      const name =
        taskName.trim() ||
        category?.name ||
        (rule?.task_name ? String(rule.task_name) : "Schedule");
      const payload: Record<string, unknown> = {
        task_name: name,
        template_scope: scope,
        component_id: componentId,
        interval_km: intervalKm === "" ? null : Number(intervalKm),
        interval_months: intervalMonths === "" ? null : Number(intervalMonths),
        source_type: sourceType,
        status,
        confidence,
        applicable_vehicle_classes: vehicleClasses,
        year_from: yearFrom === "" ? null : Number(yearFrom),
        year_to: yearTo === "" ? null : Number(yearTo),
        evidence_url: evidenceUrl.trim() || null,
        severe_interval_km: severeEnabled && severeKm !== "" ? Number(severeKm) : null,
        severe_interval_months: severeEnabled && severeMo !== "" ? Number(severeMo) : null,
      };
      if (scope === "variant" && vehicleCatalogId) payload.vehicle_catalog_id = vehicleCatalogId;
      return payload;
    },
    [
      category?.name,
      componentId,
      intervalKm,
      intervalMonths,
      rule?.task_name,
      scope,
      sourceType,
      taskName,
      vehicleCatalogId,
      yearFrom,
      yearTo,
      evidenceUrl,
      confidence,
      severeEnabled,
      severeKm,
      severeMo,
      vehicleClasses,
    ],
  );

  const save = async (status: "draft" | "active") => {
    if (!canWrite || !token) return;
    if (!componentId) {
      setError("Pick a part.");
      return;
    }
    if ((sourceType === "maker_manual" || sourceType === "part_maker") && !evidenceUrl.trim()) {
      setError("Add the link to the page you used");
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

  const summary = formatInterval(
    intervalKm === "" ? null : Number(intervalKm),
    intervalMonths === "" ? null : Number(intervalMonths),
  );

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/30"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-outline-variant/40 bg-surface-container-lowest shadow-xl max-md:inset-0 max-md:max-w-none">
        <header className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <h2 className="font-headline text-headline-sm text-on-surface">
            {editing ? `Edit schedule · ${rule?.task_name ?? "Part"}` : "Add schedule"}
          </h2>
          <button type="button" className="rounded-lg p-2 hover:bg-surface-container" onClick={onClose}>
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {error ? (
            <p className="rounded-lg bg-error-container/20 px-3 py-2 text-sm text-error">{error}</p>
          ) : null}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Which part</h3>
            <select
              className="mt-2 w-full rounded-lg border border-outline-variant/50 bg-white px-3 py-2 text-sm disabled:opacity-60"
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
              disabled={!canWrite || Boolean(presetComponentId && editing)}
            >
              <option value="">Select part…</option>
              {categories
                .filter((c) => c.kind === "component")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
            </select>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Which cars</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {scopeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!canWrite}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    scope === opt.value
                      ? "bg-secondary-container text-on-secondary-container"
                      : "border border-outline-variant/40 text-on-surface-variant"
                  }`}
                  onClick={() => setScope(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {scope === "variant" ? (
              <select
                className="mt-3 w-full rounded-lg border border-outline-variant/50 bg-white px-3 py-2 text-sm"
                value={vehicleCatalogId}
                onChange={(e) => setVehicleCatalogId(e.target.value)}
                disabled={!canWrite}
              >
                <option value="">Search car in catalog…</option>
                {catalog.map((v) => (
                  <option key={v.id} value={v.id}>
                    {[v.make, v.model, v.chassis_code].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            ) : null}
            {coversCount != null ? (
              <p className="mt-2 text-xs text-on-surface-variant">Covers {coversCount} catalogue cars</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1">
              {(["car", "van", "truck"] as const).map((cls) => (
                <button
                  key={cls}
                  type="button"
                  disabled={!canWrite}
                  className={`rounded-full px-3 py-1 text-xs ${
                    vehicleClasses.includes(cls)
                      ? "bg-secondary-container text-on-secondary-container"
                      : "border border-outline-variant/40"
                  }`}
                  onClick={() =>
                    setVehicleClasses((prev) =>
                      prev.includes(cls) ? prev.filter((x) => x !== cls) : [...prev, cls],
                    )
                  }
                >
                  {cls}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-on-surface-variant">
                Year from
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-outline-variant/50 px-2 py-1 text-sm"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  disabled={!canWrite}
                />
              </label>
              <label className="text-xs text-on-surface-variant">
                Year to
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-outline-variant/50 px-2 py-1 text-sm"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  disabled={!canWrite}
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">How often</h3>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="text-sm text-on-surface-variant">
                Every{" "}
                <input
                  type="number"
                  className="font-code ml-1 w-24 rounded-lg border border-outline-variant/50 px-2 py-1 text-sm text-on-surface"
                  value={intervalKm}
                  onChange={(e) => setIntervalKm(e.target.value)}
                  disabled={!canWrite}
                />{" "}
                km
              </label>
              <label className="text-sm text-on-surface-variant">
                or every{" "}
                <input
                  type="number"
                  className="font-code ml-1 w-16 rounded-lg border border-outline-variant/50 px-2 py-1 text-sm text-on-surface"
                  value={intervalMonths}
                  onChange={(e) => setIntervalMonths(e.target.value)}
                  disabled={!canWrite}
                />{" "}
                months
              </label>
            </div>
            <p className="mt-1 text-xs text-on-surface-variant">whichever comes first</p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={severeEnabled}
                onChange={(e) => setSevereEnabled(e.target.checked)}
                disabled={!canWrite}
              />
              Severe duty (shorter interval)
            </label>
            {severeEnabled ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Severe km"
                  className="rounded-lg border border-outline-variant/50 px-2 py-1 text-sm font-code"
                  value={severeKm}
                  onChange={(e) => setSevereKm(e.target.value)}
                  disabled={!canWrite}
                />
                <input
                  type="number"
                  placeholder="Severe months"
                  className="rounded-lg border border-outline-variant/50 px-2 py-1 text-sm font-code"
                  value={severeMo}
                  onChange={(e) => setSevereMo(e.target.value)}
                  disabled={!canWrite}
                />
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Where did this number come from
            </h3>
            <div className="mt-2 space-y-2">
              {(
                [
                  { value: "maker_manual" as const, label: "Car maker's manual or catalogue" },
                  { value: "part_maker" as const, label: "Part maker's catalogue" },
                  { value: "roam_policy" as const, label: "Roam policy (my own rule)" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 ${
                    sourceType === opt.value
                      ? "border-secondary bg-secondary-container/30"
                      : "border-outline-variant/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="mm-source"
                    className="mt-1"
                    checked={sourceType === opt.value}
                    onChange={() => setSourceType(opt.value)}
                    disabled={!canWrite}
                  />
                  <span className="text-sm text-on-surface">{opt.label}</span>
                </label>
              ))}
            </div>
            {canWrite ? (
              <button
                type="button"
                className="mt-3 text-sm font-medium text-secondary hover:underline disabled:opacity-50"
                onClick={() => void loadStarter()}
                disabled={starterBusy}
              >
                Load Roam policy starter set
              </button>
            ) : null}
            <label className="mt-3 block text-sm text-on-surface-variant">
              Evidence link
              <input
                type="url"
                className="mt-1 w-full rounded-lg border border-outline-variant/50 px-3 py-2 text-sm"
                placeholder="https://…"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                disabled={!canWrite}
              />
            </label>
            <label className="mt-3 block text-sm text-on-surface-variant">
              Confidence
              <select
                className="mt-1 w-full rounded-lg border border-outline-variant/50 px-3 py-2 text-sm"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                disabled={!canWrite}
              >
                <option value="confirmed">Confirmed</option>
                <option value="likely">Likely</option>
                <option value="uncertain">Uncertain</option>
              </select>
            </label>
          </section>

          <div className="rounded-xl border border-outline-variant/30 bg-white px-4 py-3 text-sm text-on-surface">
            {category?.name ?? "Part"} for {scopeOptions.find((s) => s.value === scope)?.label ?? scope}:{" "}
            <span className="font-code">{summary}</span>. Source: {sourceLabel(sourceType)}.
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant/30 px-6 py-4 max-md:hidden">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container"
            onClick={onClose}
          >
            Cancel
          </button>
          {canWrite ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-outline-variant/50 px-4 py-2 text-sm text-on-surface hover:bg-surface-container disabled:opacity-50"
                disabled={busy}
                onClick={() => void save("draft")}
              >
                Save as draft
              </button>
              <button
                type="button"
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-on-secondary disabled:opacity-50"
                disabled={busy}
                onClick={() => void save("active")}
              >
                Make active
              </button>
            </>
          ) : null}
        </footer>
        <div className="hidden border-t border-outline-variant/30 px-6 py-3 text-sm text-on-surface-variant max-md:block">
          Edit schedules on a larger screen.
        </div>
      </aside>
    </>
  );
}
