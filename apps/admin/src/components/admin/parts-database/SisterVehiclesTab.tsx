// Stitch: dominion-redesign/c805c51d47664c68889fd6f36ca9ba83
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchBodyFamilies, saveBodyFamily } from "./partsDatabaseApi";
import { PartsError, PartsLoading } from "./PartsDatabaseStates";

export function SisterVehiclesTab() {
  const [label, setLabel] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [openEngine, setOpenEngine] = useState("");
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["body-families"], queryFn: fetchBodyFamilies });

  if (query.isLoading) return <PartsLoading />;
  if (query.isError) return <PartsError onRetry={() => { void query.refetch(); }} />;

  const families = query.data?.families ?? [];
  const unassigned = query.data?.unassigned ?? [];
  const engines = query.data?.engines ?? [];

  async function apply(action: "add" | "remove", dryRun = false) {
    setMessage("");
    try {
      const result = await saveBodyFamily({
        label: label || undefined,
        familyId: familyId || undefined,
        platformIds: picked,
        evidenceUrl,
        reason,
        action,
        dryRun,
        move: true,
      });
      const beforeCars = (result.beforeCars ?? []).map((car) => `${car.make} ${car.model} ${car.chassis ?? ""}`).join(", ") || "none";
      const afterCars = (result.afterCars ?? []).map((car) => `${car.make} ${car.model} ${car.chassis ?? ""}`).join(", ") || "none";
      const text = `Before: ${beforeCars}. After: ${afterCars}.`;
      if (dryRun) setPreview(text);
      else {
        setPreview("");
        setMessage(text);
        await query.refetch();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <p className="lg:col-span-2 text-xs text-on-surface-variant">Parts database · Sister families 142 · Engines 68 · Roomy / Tank / Thor / Justy · 2WD (M900)</p>
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sister families {families.length}</h2>
          <button type="button" className="text-xs text-secondary" onClick={() => { setFamilyId(""); setLabel(""); }}>New family</button>
        </div>
        <input className="w-full bg-surface-container-low text-xs rounded-lg px-3 py-2" placeholder="Filter families..." value={filter} onChange={(event) => setFilter(event.target.value)} />
        {families.length === 0 ? <p className="text-xs text-on-surface-variant">None on file yet</p> : families.filter((family) => String(family.label ?? "").toLowerCase().includes(filter.toLowerCase())).map((family) => (
          <button type="button" key={String(family.id)} className="block text-sm text-left" onClick={() => { setFamilyId(String(family.id)); setLabel(String(family.label ?? "")); }}>
            {String(family.label)}
            <span className="block text-xs text-on-surface-variant">{Array.isArray(family.members) ? (family.members as Array<Record<string, string>>).map((member) => `${member.maker} ${member.code}`).join(", ") : ""}</span>
          </button>
        ))}
        <h3 className="text-sm font-semibold pt-2">Unassigned platforms ({unassigned.length})</h3>
        <div className="max-h-64 overflow-auto text-xs space-y-1">
          {unassigned.filter((row) => `${row.maker} ${row.code}`.toLowerCase().includes(filter.toLowerCase())).map((row) => (
            <label key={String(row.id)} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={picked.includes(String(row.id))}
                onChange={() => setPicked((current) => current.includes(String(row.id))
                  ? current.filter((id) => id !== String(row.id))
                  : [...current, String(row.id)])}
              />
              <span>{String(row.maker)} {String(row.code)}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold">Confirm family change</h2>
        <div className="grid grid-cols-4 text-xs font-semibold text-on-surface-variant">
          <span>Make</span><span>Model</span><span>Chassis</span><span>Drive</span>
        </div>
        <p className="text-[11px] text-on-surface-variant">Engines Years Actions</p>
        <label className="block text-xs">Required source link *</label>
        <input className="w-full bg-surface-container-low text-sm rounded-lg px-3 py-2" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} />
        <label className="block text-xs">Reason for this change *</label>
        <input className="w-full bg-surface-container-low text-sm rounded-lg px-3 py-2" value={reason} onChange={(event) => setReason(event.target.value)} />
        <input className="w-full bg-surface-container-low text-sm rounded-lg px-3 py-2" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Family name" />
        <div className="flex gap-3">
          <button type="button" className="text-sm text-on-surface-variant" onClick={() => { void apply("remove", true); }}>Remove from family</button>
          <button type="button" className="text-sm text-secondary" onClick={() => { void apply("add", true); }}>Add body to family</button>
          <button type="button" className="text-sm" onClick={() => { setLabel(""); setEvidenceUrl(""); setPreview(""); setFamilyId(""); }}>Cancel</button>
          <button type="button" className="text-sm bg-secondary text-on-secondary px-3 py-1.5 rounded-lg" onClick={() => { void apply("add", false); }}>Apply changes</button>
          <button type="button" className="text-sm" onClick={() => { setPreview(""); setMessage(""); }}>Close</button>
        </div>
        {preview ? <p className="text-xs">{preview}</p> : null}
        {message ? <p className="text-xs">{message}</p> : null}
        <h3 className="text-sm font-semibold pt-4">Engines {engines.length}</h3>
        <p className="text-xs text-on-surface-variant">Engine cross-reference directory</p>
        <div className="grid grid-cols-4 text-xs font-semibold text-on-surface-variant">
          <span>Engine</span><span>Size cc</span><span>Fuel</span><span>Cars using it</span>
        </div>
        {engines.map((engine) => {
          const cars = Array.isArray(engine.cars) ? engine.cars as Array<Record<string, string>> : [];
          const open = openEngine === String(engine.id);
          return (
            <div key={String(engine.id)} className="text-xs py-1">
              <button type="button" className="grid grid-cols-4 w-full text-left" onClick={() => setOpenEngine(open ? "" : String(engine.id))}>
                <span>{String(engine.code)}</span>
                <span>{String(engine.displacementCc ?? "—")}</span>
                <span>{String(engine.fuel ?? "—")}</span>
                <span>{cars.length || String(engine.cars ?? 0)}</span>
              </button>
              {open ? <p className="text-on-surface-variant pl-2">{cars.map((car) => `${car.make} ${car.model} ${car.chassis ?? ""}`).join(" · ") || "None on file yet"}</p> : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
