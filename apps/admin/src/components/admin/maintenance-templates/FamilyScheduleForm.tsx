import React, { useState } from "react";
import { toast } from "sonner";
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

/** A platform or engine schedule is the default. A variant rule wins when both exist. */
export function FamilyScheduleForm() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [scope, setScope] = useState<"platform" | "engine_family" | "variant">("platform");
  const [targetId, setTargetId] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskCode, setTaskCode] = useState("");
  const [componentId, setComponentId] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!token || !taskName.trim() || !targetId.trim()) return;
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
          <select className="w-full rounded-md border px-2 py-2 text-sm" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="platform">Platform</option>
            <option value="engine_family">Engine</option>
            <option value="variant">This variant only</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Platform, engine, or variant id</Label>
          <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Job name</Label>
          <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Job code</Label>
          <Input value={taskCode} onChange={(e) => setTaskCode(e.target.value)} placeholder="ENG-OIL" />
        </div>
        <div className="space-y-1">
          <Label>Service component id</Label>
          <Input value={componentId} onChange={(e) => setComponentId(e.target.value)} />
        </div>
      </div>
      <Button type="button" size="sm" disabled={busy || !taskName.trim() || !targetId.trim()} onClick={() => void save()}>
        Save schedule
      </Button>
    </div>
  );
}
