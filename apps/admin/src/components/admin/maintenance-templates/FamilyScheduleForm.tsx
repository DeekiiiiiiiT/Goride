import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { partsEnterpriseApi } from "../../../services/partSourcingService";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

type Scope = "platform" | "engine_family" | "variant";
type Choice = { id: string; label: string };

/** A platform or engine schedule is the default. A variant rule wins when both exist. */
export function FamilyScheduleForm({
  preset,
}: {
  preset?: { variant?: Choice; platform?: Choice; engine?: Choice };
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [scope, setScope] = useState<Scope>(preset?.variant ? "variant" : "platform");
  const [targetId, setTargetId] = useState(preset?.variant?.id ?? preset?.platform?.id ?? "");
  const [platforms, setPlatforms] = useState<Choice[]>([]);
  const [engines, setEngines] = useState<Choice[]>([]);
  const [components, setComponents] = useState<Choice[]>([]);
  const [variantQuery, setVariantQuery] = useState(preset?.variant?.label ?? "");
  const [variants, setVariants] = useState<Choice[]>(preset?.variant ? [preset.variant] : []);
  const [taskName, setTaskName] = useState("");
  const [taskCode, setTaskCode] = useState("");
  const [componentId, setComponentId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void Promise.all([
      partsEnterpriseApi.platforms(token),
      partsEnterpriseApi.engines(token),
      partsEnterpriseApi.components(token),
    ]).then(([platform, engine, component]) => {
      const platformChoices = choices(platform.items, (row) => String(row.label || row.code || row.id));
      const engineChoices = choices(engine.items, (row) => String(row.code || row.id));
      if (preset?.platform && !platformChoices.some((row) => row.id === preset.platform?.id)) {
        platformChoices.unshift(preset.platform);
      }
      if (preset?.engine && !engineChoices.some((row) => row.id === preset.engine?.id)) {
        engineChoices.unshift(preset.engine);
      }
      setPlatforms(platformChoices);
      setEngines(engineChoices);
      setComponents(choices(component.items, (row) => `${String(row.name || "Job")} (${String(row.op_code || row.code || "")})`));
    }).catch(() => toast.error("Could not load platforms, engines, or jobs"));
  }, [token, preset?.platform?.id, preset?.engine?.id]);

  useEffect(() => {
    if (scope === "variant") setTargetId(preset?.variant?.id ?? "");
    if (scope === "platform") setTargetId(preset?.platform?.id ?? "");
    if (scope === "engine_family") setTargetId(preset?.engine?.id ?? "");
  }, [scope, preset?.variant?.id, preset?.platform?.id, preset?.engine?.id]);

  async function searchVariants() {
    if (!token || variantQuery.trim().length < 2) return;
    const found = await partsEnterpriseApi.catalogVariants(token, variantQuery.trim());
    const next = choices(found.items, (row) => [row.make, row.model, row.chassis_code].filter(Boolean).join(" "));
    setVariants(next);
    if (next[0]) setTargetId(next[0].id);
  }

  async function save() {
    if (!token || !taskName.trim() || !targetId.trim()) return;
    const radius = await partsEnterpriseApi.blast(token, scope, targetId);
    const vehicles = `${radius.variantCount} vehicle${radius.variantCount === 1 ? "" : "s"}`;
    const makes = `${radius.makeCount} make${radius.makeCount === 1 ? "" : "s"}`;
    const ok = window.confirm(`This schedule will apply to ${vehicles} across ${makes}.`);
    if (!ok) return;
    setBusy(true);
    try {
      const body: Record<string, string> = {
        template_scope: scope,
        task_name: taskName.trim(),
        task_code: taskCode.trim(),
        component_id: componentId.trim(),
      };
      if (scope === "platform") body.platform_id = targetId.trim();
      if (scope === "engine_family") body.engine_family_id = targetId.trim();
      if (scope === "variant") body.vehicle_catalog_id = targetId.trim();
      const res = await fetch(`${API_ENDPOINTS.fleetOps}/admin/maintenance-templates/scoped`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the schedule");
      toast.success("Schedule saved");
      setTaskName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="font-medium">Family schedule</h3>
      <p className="text-sm text-slate-500">A platform or engine rule covers every variant in that family. A variant rule replaces it for that vehicle only.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Applies to</Label>
          <select className="w-full rounded-md border px-2 py-2 text-sm" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="platform">Platform</option>
            <option value="engine_family">Engine</option>
            <option value="variant">This variant only</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>{scope === "platform" ? "Platform" : scope === "engine_family" ? "Engine" : "Variant"}</Label>
          {scope === "platform" ? (
            <select className="w-full rounded-md border px-2 py-2 text-sm" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Choose a platform</option>
              {platforms.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          ) : null}
          {scope === "engine_family" ? (
            <select className="w-full rounded-md border px-2 py-2 text-sm" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Choose an engine</option>
              {engines.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          ) : null}
          {scope === "variant" ? (
            <div className="flex gap-2">
              <Input value={variantQuery} onChange={(e) => setVariantQuery(e.target.value)} placeholder="Make, model, or chassis" />
              <Button type="button" size="sm" variant="outline" onClick={() => void searchVariants()}>Find</Button>
            </div>
          ) : null}
        </div>
        {scope === "variant" && variants.length > 0 ? (
          <div className="space-y-1 sm:col-span-2">
            <Label>Matching vehicles</Label>
            <select className="w-full rounded-md border px-2 py-2 text-sm" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {variants.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label>Job name</Label>
          <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Job code</Label>
          <Input value={taskCode} onChange={(e) => setTaskCode(e.target.value)} placeholder="ENG-OIL" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Service job</Label>
          <select className="w-full rounded-md border px-2 py-2 text-sm" value={componentId} onChange={(e) => setComponentId(e.target.value)}>
            <option value="">Choose a job</option>
            {components.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </div>
      </div>
      <Button type="button" size="sm" disabled={busy || !taskName.trim() || !targetId.trim()} onClick={() => void save()}>
        Save schedule
      </Button>
    </div>
  );
}

function choices(value: unknown, label: (row: Record<string, unknown>) => string): Choice[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const item = row as Record<string, unknown>;
    return { id: String(item.id ?? ""), label: label(item) };
  }).filter((row) => row.id);
}
