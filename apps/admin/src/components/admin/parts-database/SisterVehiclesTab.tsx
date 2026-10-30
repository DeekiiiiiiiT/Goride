// Stitch: dominion-redesign/c805c51d47664c68889fd6f36ca9ba83
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchBodyFamilies, saveBodyFamily } from "./partsDatabaseApi";
import { PartsError, PartsLoading } from "./PartsDatabaseStates";

type Car = {
  id?: string;
  make?: string;
  model?: string;
  chassis?: string;
  drive?: string;
  engine?: string;
  years?: string;
  platformId?: string;
};

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
  const [pendingAction, setPendingAction] = useState<"add" | "remove" | "">("");
  const [leaveFamily, setLeaveFamily] = useState("");
  const query = useQuery({ queryKey: ["body-families"], queryFn: fetchBodyFamilies });

  if (query.isLoading) return <PartsLoading />;
  if (query.isError) return <PartsError onRetry={() => { void query.refetch(); }} />;

  const families = query.data?.families ?? [];
  const unassigned = query.data?.unassigned ?? [];
  const engines = query.data?.engines ?? [];
  const selected = families.find((family) => String(family.id) === familyId);
  const members = Array.isArray(selected?.members) ? selected.members as Array<Record<string, unknown>> : [];
  const cars = members.flatMap((member) => {
    const listed = Array.isArray(member.cars) ? member.cars as Car[] : [];
    if (listed.length) return listed;
    return [{
      platformId: String(member.id ?? ""),
      make: String(member.maker ?? ""),
      chassis: String(member.code ?? ""),
    }];
  });

  function toggle(id: string) {
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setPendingAction("");
    setLeaveFamily("");
  }

  async function apply(action: "add" | "remove", dryRun = false, move = false) {
    setMessage("");
    if (!dryRun && !pendingAction) {
      setMessage("Preview the change first.");
      return;
    }
    const nextAction = dryRun ? action : pendingAction;
    if (nextAction !== "add" && nextAction !== "remove") return;
    try {
      const result = await saveBodyFamily({
        label: label || undefined,
        familyId: familyId || undefined,
        platformIds: picked,
        evidenceUrl,
        reason,
        action: nextAction,
        dryRun,
        move,
      });
      const beforeCars = (result.beforeCars ?? []).map((car) => `${car.make} ${car.model} ${car.chassis ?? ""}`).join(", ") || "none";
      const afterCars = (result.afterCars ?? []).map((car) => `${car.make} ${car.model} ${car.chassis ?? ""}`).join(", ") || "none";
      const text = `Before: ${beforeCars}. After: ${afterCars}.`;
      if (dryRun) {
        setPendingAction(action);
        setLeaveFamily("");
        setPreview(text);
      } else {
        setPreview("");
        setPendingAction("");
        setLeaveFamily("");
        setMessage(text);
        await query.refetch();
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not save";
      const leaves = text.match(/That body leaves (.+)/);
      if (leaves && !move) {
        setLeaveFamily(leaves[1]);
        setPendingAction(nextAction);
        setMessage(`This body leaves ${leaves[1]}. Confirm to move it.`);
        return;
      }
      setMessage(text);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sister families {families.length}</h2>
          <button type="button" className="text-xs text-secondary" onClick={() => { setFamilyId(""); setLabel(""); setPicked([]); setPendingAction(""); }}>New family</button>
        </div>
        <input className="w-full bg-surface-container-low text-xs rounded-lg px-3 py-2" placeholder="Filter families..." value={filter} onChange={(event) => setFilter(event.target.value)} />
        {families.length === 0 ? <p className="text-xs text-on-surface-variant">None on file yet</p> : families.filter((family) => String(family.label ?? "").toLowerCase().includes(filter.toLowerCase())).map((family) => (
          <button type="button" key={String(family.id)} className="block text-sm text-left" onClick={() => { setFamilyId(String(family.id)); setLabel(String(family.label ?? "")); setPicked([]); setPendingAction(""); }}>
            {String(family.label)}
            <span className="block text-xs text-on-surface-variant">{Array.isArray(family.members) ? (family.members as Array<Record<string, string>>).map((member) => `${member.maker} ${member.code}`).join(", ") : ""}</span>
          </button>
        ))}
        <h3 className="text-sm font-semibold pt-2">Unassigned platforms ({unassigned.length})</h3>
        <div className="max-h-64 overflow-auto text-xs space-y-1">
          {unassigned.filter((row) => `${row.maker} ${row.code}`.toLowerCase().includes(filter.toLowerCase())).map((row) => (
            <label key={String(row.id)} className="flex items-center gap-2">
              <input type="checkbox" checked={picked.includes(String(row.id))} onChange={() => toggle(String(row.id))} />
              <span>{String(row.maker)} {String(row.code)}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold">Confirm family change</h2>
        <div className="grid grid-cols-6 text-xs font-semibold text-on-surface-variant">
          <span>Make</span><span>Model</span><span>Chassis</span><span>Drive</span><span>Engine</span><span>Years</span>
        </div>
        {cars.length === 0 ? <p className="text-xs text-on-surface-variant">None on file yet</p> : cars.map((car) => {
          const platformId = String(car.platformId ?? "");
          return (
            <label key={`${platformId}-${car.id ?? car.chassis}`} className="grid grid-cols-6 text-xs items-center gap-1">
              <span className="flex items-center gap-1">
                <input type="checkbox" checked={picked.includes(platformId)} onChange={() => toggle(platformId)} />
                {car.make}
              </span>
              <span>{car.model}</span>
              <span>{car.chassis}</span>
              <span>{car.drive || "—"}</span>
              <span>{car.engine || "—"}</span>
              <span>{car.years || "—"}</span>
            </label>
          );
        })}
        <label className="block text-xs">Required source link *</label>
        <input className="w-full bg-surface-container-low text-sm rounded-lg px-3 py-2" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} />
        <label className="block text-xs">Reason for this change *</label>
        <input className="w-full bg-surface-container-low text-sm rounded-lg px-3 py-2" value={reason} onChange={(event) => setReason(event.target.value)} />
        <input className="w-full bg-surface-container-low text-sm rounded-lg px-3 py-2" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Family name" />
        <div className="flex flex-wrap gap-3">
          <button type="button" className="text-sm text-on-surface-variant" onClick={() => { void apply("remove", true); }}>Remove from family</button>
          <button type="button" className="text-sm text-secondary" onClick={() => { void apply("add", true); }}>Add body to family</button>
          <button type="button" className="text-sm" onClick={() => { setLabel(""); setEvidenceUrl(""); setPreview(""); setFamilyId(""); setPendingAction(""); setLeaveFamily(""); }}>Cancel</button>
          <button type="button" className="text-sm bg-secondary text-on-secondary px-3 py-1.5 rounded-lg" onClick={() => { void apply(pendingAction || "add", false, false); }}>Apply changes</button>
          {leaveFamily ? (
            <button type="button" className="text-sm text-secondary" onClick={() => { void apply(pendingAction || "add", false, true); }}>
              Move from {leaveFamily}
            </button>
          ) : null}
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
          const engineCars = Array.isArray(engine.cars) ? engine.cars as Array<Record<string, string>> : [];
          const open = openEngine === String(engine.id);
          return (
            <div key={String(engine.id)} className="text-xs py-1">
              <button type="button" className="grid grid-cols-4 w-full text-left" onClick={() => setOpenEngine(open ? "" : String(engine.id))}>
                <span>{String(engine.code)}</span>
                <span>{String(engine.displacementCc ?? "—")}</span>
                <span>{String(engine.fuel ?? "—")}</span>
                <span>{engineCars.length || String(engine.cars ?? 0)}</span>
              </button>
              {open ? <p className="text-on-surface-variant pl-2">{engineCars.map((car) => `${car.make} ${car.model} ${car.chassis ?? ""}`).join(" · ") || "None on file yet"}</p> : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
