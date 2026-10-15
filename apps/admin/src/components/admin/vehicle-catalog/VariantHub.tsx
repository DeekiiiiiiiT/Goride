import React, { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { publicAnonKey } from "../../../utils/supabase/info";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { FamilyScheduleForm } from "../maintenance-templates/FamilyScheduleForm";

type HubTab = "overview" | "family" | "maintenance" | "parts" | "gaps" | "signals";

async function catalogGet(token: string, path: string) {
  const res = await fetch(`${API_ENDPOINTS.admin}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function VariantHub({ record, onBack }: { record: VehicleCatalogRecord; onBack: () => void }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [tab, setTab] = useState<HubTab>("overview");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [parts, setParts] = useState<Record<string, unknown> | null>(null);
  const [schedule, setSchedule] = useState<Record<string, unknown> | null>(null);
  const [signals, setSignals] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    void catalogGet(token, `catalog/v1/variants/${record.id}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not open this variant"));
  }, [token, record.id]);

  useEffect(() => {
    if (!token) return;
    if (tab === "parts" || tab === "gaps") {
      void catalogGet(token, `catalog/v1/variants/${record.id}/parts`).then(setParts).catch(() => setParts(null));
    }
    if (tab === "maintenance") {
      void catalogGet(token, `catalog/v1/variants/${record.id}/schedule`).then(setSchedule).catch(() => setSchedule(null));
    }
    if (tab === "signals") {
      void catalogGet(token, `admin/catalog/signals?variantId=${record.id}`).then(setSignals).catch(() => setSignals(null));
    }
  }, [tab, token, record.id]);

  const family = (detail?.family ?? null) as { id?: string; code?: string; label?: string } | null;
  const platform = (detail?.platform ?? null) as { id?: string; code?: string; label?: string } | null;
  const engine = (detail?.engine ?? null) as { id?: string; code?: string } | null;
  const siblings = Array.isArray(detail?.siblings) ? detail.siblings as string[] : [];
  const partItems = Array.isArray(parts?.items) ? parts.items as Array<Record<string, unknown>> : [];
  const tasks = Array.isArray(schedule?.items) ? schedule.items as Array<Record<string, unknown>> : [];
  const demand = Array.isArray(signals?.demand)
    ? (signals.demand as Array<Record<string, unknown>>).find((row) => row.variant_id === record.id)
    : null;

  return (
    <div className="p-4 md:p-6 space-y-4 text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{record.make} {record.model}</h1>
          <p className="text-sm text-slate-500">{record.chassis_code || "No chassis"} · {record.engine_code || "No engine"}</p>
        </div>
        <Button type="button" variant="outline" onClick={onBack}>Back to catalog</Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {(["overview", "family", "maintenance", "parts", "gaps", "signals"] as HubTab[]).map((id) => (
          <Button key={id} type="button" size="sm" variant={tab === id ? "default" : "outline"} onClick={() => setTab(id)}>{id}</Button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="text-sm space-y-1">
          <p>Source: {String(record.source ?? "manual")}</p>
          <p>Class: {record.vehicle_class || "car"}</p>
          <p>Verification is shown on each part in the Parts tab.</p>
        </div>
      )}
      {tab === "family" && (
        <div className="text-sm space-y-2">
          <p>Platform: {platform?.code || "Not set"}</p>
          <p>Family: {family?.label || family?.code || "No parent family yet"}</p>
          <p>Engine: {engine?.code || record.engine_code || "Not set"}</p>
          <p>Siblings: {siblings.length ? siblings.join(", ") : "None"}</p>
        </div>
      )}
      {tab === "maintenance" && (
        <div className="space-y-4">
          <ul className="text-sm space-y-1">
            {tasks.length === 0 ? <li>No schedule yet. Add one for this vehicle, its platform, or its engine.</li> : tasks.map((task) => (
              <li key={String(task.template_id)}>{String(task.task_name)} · from {String(task.template_scope)}{task.component_op_code ? ` · ${String(task.component_op_code)}` : ""}</li>
            ))}
          </ul>
          <FamilyScheduleForm preset={{
            variant: { id: record.id, label: `${record.make} ${record.model}` },
            platform: platform?.id ? { id: platform.id, label: platform.label || platform.code || "Platform" } : undefined,
            engine: engine?.id ? { id: engine.id, label: engine.code || "Engine" } : undefined,
          }} />
        </div>
      )}
      {(tab === "parts" || tab === "gaps") && (
        <ul className="text-sm space-y-1">
          {partItems.length === 0 ? <li>No parts for this variant yet.</li> : partItems.map((item) => {
            const part = (item.part ?? {}) as Record<string, unknown>;
            const decision = String(item.catalogDecision ?? part.catalog_decision ?? "pending");
            if (tab === "gaps" && decision === "confirmed") return null;
            return (
              <li key={String(item.fitmentId)}>
                {String(part.name ?? "Part")} · {decision === "confirmed" ? "Verified" : decision === "rejected" ? "Rejected" : "Unverified"}
                {item.tier != null ? ` · tier ${String(item.tier)}` : ""}
              </li>
            );
          })}
        </ul>
      )}
      {tab === "signals" && (
        <p className="text-sm">Vehicles using this variant: {demand ? String(demand.vehicle_count) : "0"}. Fleets: {demand ? String(demand.fleet_count) : "0"}.</p>
      )}
    </div>
  );
}
