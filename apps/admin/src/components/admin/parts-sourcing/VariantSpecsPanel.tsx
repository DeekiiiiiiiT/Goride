import React, { useEffect, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { partsEnterpriseApi } from "../../../services/partSourcingService";
import type { GuidedVariant } from "./GuidedPartDialog";
import { toast } from "sonner";

type SpecKey = { key: string; label: string; unit?: string | null; value_type?: string };
type SpecValue = { specKey: string; label: string; value?: string | null; unit?: string | null; scope?: string; sourced?: boolean };

export function VariantSpecsPanel({ token, variant }: { token: string; variant: GuidedVariant }) {
  const [keys, setKeys] = useState<SpecKey[]>([]);
  const [values, setValues] = useState<SpecValue[]>([]);
  const [active, setActive] = useState<SpecKey | null>(null);
  const [value, setValue] = useState("");
  const [scope, setScope] = useState("variant");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  function load() {
    void partsEnterpriseApi.specKeys(token).then((data) => {
      setKeys(Array.isArray(data.items) ? data.items as SpecKey[] : []);
    }).catch(() => setKeys([]));
    void partsEnterpriseApi.checklist(token, variant.id).then((data) => {
      setValues(Array.isArray(data.specs) ? data.specs as SpecValue[] : []);
    }).catch(() => setValues([]));
  }

  useEffect(() => { load(); }, [token, variant.id]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Sizes and fluids for {variant.label}. A catalog note is not verified and is not used to match stock.</p>
      <ul className="divide-y rounded-lg border">
        {keys.map((key) => {
          const current = values.find((row) => row.specKey === key.key);
          return (
            <li key={key.key} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="font-medium flex-1">{key.label}</span>
              <span className={current?.sourced ? "text-emerald-700" : "text-slate-400"}>
                {current?.value ? `${current.value}${current.unit ? ` ${current.unit}` : ""}` : "Empty"}
                {current && !current.sourced ? " · catalog note" : ""}
                {current?.sourced ? " · Verified" : ""}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => { setActive(key); setValue(current?.sourced ? String(current.value ?? "") : ""); setScope("variant"); setEvidenceUrl(""); }}>
                {current?.sourced ? "Edit" : "Add"}
              </Button>
            </li>
          );
        })}
      </ul>
      {active ? (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-medium">{active.label}</p>
          <div className="space-y-1 text-sm">
            <label className="flex gap-2"><input type="radio" checked={scope === "variant"} onChange={() => setScope("variant")} /> This vehicle only</label>
            <label className="flex gap-2"><input type="radio" checked={scope === "platform"} onChange={() => setScope("platform")} /> All cars with this body</label>
            <label className="flex gap-2"><input type="radio" checked={scope === "engine_family"} onChange={() => setScope("engine_family")} /> All cars with this engine</label>
          </div>
          <div>
            <Label>Value{active.unit ? ` (${active.unit})` : ""}</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <Label>Source link</Label>
            <Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!value.trim() || !evidenceUrl.trim()} onClick={() => {
              void partsEnterpriseApi.saveSpec(token, {
                variantId: variant.id,
                specKey: active.key,
                value: value.trim(),
                scope,
                evidenceUrl: evidenceUrl.trim(),
                yearFrom: variant.yearFrom ?? null,
                yearTo: variant.yearTo ?? null,
              }).then(() => { setActive(null); load(); }).catch((err) => toast.error(err instanceof Error ? err.message : "Could not save"));
            }}>Save</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setActive(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
