// Stitch: dominion-redesign/076b36f782ae483ea17a8eb9364200a9
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { VariantPartsChecklist } from "../parts-sourcing/VariantPartsChecklist";
import { AddPartDialog } from "./AddPartDialog";
import { excludeListing, fetchChecklist, removeGuidedPart, saveSpec } from "./partsDatabaseApi";
import { PartsError, PartsLoading } from "./PartsDatabaseStates";
import { supabase } from "../../../utils/supabase/client";

export function VehiclePartsTab({
  variantId,
  onAdd,
  onBack,
}: {
  variantId: string;
  onAdd: () => void;
  onBack: () => void;
}) {
  const client = useQueryClient();
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState("");
  const [value, setValue] = useState("");
  const [reach, setReach] = useState("variant");
  const [source, setSource] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [specError, setSpecError] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [excludeFor, setExcludeFor] = useState("");
  const [excludeReason, setExcludeReason] = useState("");
  const [excludeSource, setExcludeSource] = useState("");
  const [rowError, setRowError] = useState("");
  const query = useQuery({
    queryKey: ["variant-checklist", variantId],
    queryFn: () => fetchChecklist(variantId),
    enabled: Boolean(variantId),
  });

  useEffect(() => {
    void supabase.auth.getSession().then((session) => setToken(session.data.session?.access_token ?? ""));
  }, []);

  if (!variantId) {
    return <p className="text-sm text-on-surface-variant">Open this vehicle's parts page from Find parts.</p>;
  }
  if (query.isLoading) return <PartsLoading />;
  if (query.isError) return <PartsError onRetry={() => { void query.refetch(); }} />;

  const vehicle = (query.data?.vehicle ?? {}) as Record<string, unknown>;
  const sisters = Array.isArray(vehicle.sisterNames) ? vehicle.sisterNames as string[] : [];
  const other = Array.isArray(query.data?.otherParts) ? query.data.otherParts as Array<Record<string, unknown>> : [];
  const specs = Array.isArray(query.data?.specs) ? query.data.specs as Array<Record<string, unknown>> : [];
  const reachInfo = (query.data?.reach ?? {}) as { sisters?: string[]; engineCars?: string[] };
  const title = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle parts";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button type="button" className="text-sm text-secondary" onClick={onBack}>Back to Find parts</button>
        <button type="button" className="bg-secondary text-on-secondary text-sm px-3 py-2 rounded-lg" onClick={onAdd}>Add any part</button>
      </div>
      <header className="bg-surface-container-lowest rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{title || "Toyota Roomy"}</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          {[vehicle.chassis, vehicle.engine, vehicle.years, vehicle.drive].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {sisters.map((name) => <span key={name} className="text-xs bg-surface-container-low px-2 py-1 rounded">{name}</span>)}
          {vehicle.engineCode ? <span className="text-xs bg-surface-container-low px-2 py-1 rounded">{String(vehicle.engineCode)}</span> : null}
        </div>
      </header>
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-on-surface">Service essentials</h2>
        {token ? (
          <VariantPartsChecklist token={token} variant={{ id: variantId, label: title }} />
        ) : <PartsLoading />}
      </section>
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-on-surface">Other parts</h2>
        {rowError ? <p className="text-xs text-red-700 mt-2">{rowError}</p> : null}
        {other.length === 0 ? <p className="text-xs text-on-surface-variant mt-2">None on file yet</p> : other.map((group) => (
          <div key={String(group.category)} className="mt-3">
            <h3 className="text-xs font-semibold">{String(group.category)}</h3>
            {(Array.isArray(group.parts) ? group.parts as Array<Record<string, unknown>> : []).map((part) => {
              const groupId = String(part.groupId ?? "");
              return (
                <div key={String(part.partId)} className="py-1">
                  <p className="text-sm">{String(part.manufacturer ?? "")} {String(part.partNumber ?? "")} {String(part.position ?? "")}</p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <button type="button" className="text-secondary" onClick={() => setEditGroup(groupId)}>Edit</button>
                    <button type="button" className="text-secondary" onClick={() => { setExcludeFor(groupId); setExcludeReason(""); setExcludeSource(""); }}>Not on this car</button>
                    <button type="button" onClick={() => {
                      setRowError("");
                      void removeGuidedPart({ groupId, variantId }).then(() => {
                        void client.invalidateQueries({ queryKey: ["variant-checklist", variantId] });
                      }).catch((err) => setRowError(err instanceof Error ? err.message : "Could not remove"));
                    }}>Remove</button>
                  </div>
                  {excludeFor === groupId ? (
                    <form className="mt-2 space-y-2" onSubmit={(event) => {
                      event.preventDefault();
                      setRowError("");
                      void excludeListing({ groupId, variantId, reason: excludeReason, evidenceUrl: excludeSource }).then(() => {
                        setExcludeFor("");
                        void client.invalidateQueries({ queryKey: ["variant-checklist", variantId] });
                      }).catch((err) => setRowError(err instanceof Error ? err.message : "Could not exclude"));
                    }}>
                      <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={excludeReason} onChange={(event) => setExcludeReason(event.target.value)} placeholder="Reason" required />
                      <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={excludeSource} onChange={(event) => setExcludeSource(event.target.value)} placeholder="Source link" required />
                      <button type="submit" className="text-sm bg-secondary text-on-secondary px-3 py-1.5 rounded-lg">Save exclusion</button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </section>
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-on-surface">Specs</h2>
        <div className="mt-3 grid grid-cols-4 text-xs font-semibold text-on-surface-variant">
          <span>Spec</span><span>Value</span><span>Reach</span><span>Action</span>
        </div>
        {specs.length === 0 ? <p className="text-xs text-on-surface-variant mt-3">None on file yet</p> : specs.map((spec) => (
          <div key={String(spec.specKey ?? spec.label)} className="grid grid-cols-4 text-sm py-2 items-center">
            <span>{String(spec.label ?? spec.specKey)}</span>
            <span>{String(spec.value ?? "—")} {String(spec.unit ?? "")}</span>
            <span>{String(spec.reach ?? "this vehicle")}</span>
            <button type="button" className="text-secondary text-xs text-left" onClick={() => { setEditing(String(spec.specKey)); setValue(String(spec.value ?? "")); setSource(String(spec.source ?? "")); setReach(String(spec.reach ?? "variant") === "engine_family" ? "engine_family" : String(spec.reach ?? "variant") === "platform" ? "platform" : "variant"); setYearFrom(""); setYearTo(""); setSpecError(""); }}>Set</button>
          </div>
        ))}
        {editing ? (
          <form className="mt-3 space-y-2" onSubmit={(event) => {
            event.preventDefault();
            setSpecError("");
            void saveSpec({
              variantId,
              specKey: editing,
              value,
              scope: reach,
              evidenceUrl: source,
              yearFrom: yearFrom || undefined,
              yearTo: yearTo || undefined,
            }).then(() => {
              setEditing("");
              void client.invalidateQueries({ queryKey: ["variant-checklist", variantId] });
            }).catch((err) => setSpecError(err instanceof Error ? err.message : "Could not save the spec"));
          }}>
            <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Value" />
            <select className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={reach} onChange={(event) => setReach(event.target.value)}>
              <option value="variant">This vehicle</option>
              <option value="platform">Sisters</option>
              {editing.startsWith("engine_oil_") ? <option value="engine_family">Engine</option> : null}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input className="bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={yearFrom} onChange={(event) => setYearFrom(event.target.value)} placeholder="Year from" />
              <input className="bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={yearTo} onChange={(event) => setYearTo(event.target.value)} placeholder="Year to" />
            </div>
            <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Source link" required />
            {specError ? <p className="text-xs text-red-700">{specError}</p> : null}
            <button type="submit" className="text-sm bg-secondary text-on-secondary px-3 py-1.5 rounded-lg">Save spec</button>
          </form>
        ) : null}
      </section>
      <section className="bg-surface-container-low rounded-xl p-5">
        <h2 className="text-sm font-semibold text-on-surface">Where these parts also show</h2>
        <p className="text-xs text-on-surface-variant mt-2">
          Sisters: {(reachInfo.sisters ?? []).join(", ") || "None on file yet"}. Engine cars: {(reachInfo.engineCars ?? []).join(", ") || "None on file yet"}.
        </p>
      </section>
      {editGroup ? (
        <AddPartDialog variantId={variantId} groupId={editGroup} onClose={() => setEditGroup("")} />
      ) : null}
    </div>
  );
}
