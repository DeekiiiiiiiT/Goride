// Stitch: dominion-redesign/S42l · sister families, tools from S41d
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchBodyFamilies, saveBodyFamily } from "../partsDatabaseApi";
import { PartsError, PartsLoading } from "../PartsDatabaseStates";

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

export function SisterFamiliesSection({
  owner,
  editorOnly = false,
  onDismiss,
}: {
  owner: boolean;
  editorOnly?: boolean;
  onDismiss?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [familyId, setFamilyId] = useState("");
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<"add" | "remove" | "">("");
  const [leaveFamily, setLeaveFamily] = useState("");
  const [editor, setEditor] = useState(editorOnly);
  const [openEngine, setOpenEngine] = useState("");
  const query = useQuery({ queryKey: ["body-families"], queryFn: fetchBodyFamilies });
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";

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
      model: String(member.code ?? ""),
      chassis: String(member.code ?? ""),
    }];
  });

  function openFamily(id: string, name: string) {
    setFamilyId(id);
    setLabel(name);
    setPicked([]);
    setPendingAction("");
    setEditor(true);
  }

  function toggle(id: string) {
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setPendingAction("");
    setLeaveFamily("");
  }

  async function apply(action: "add" | "remove", dryRun = false, move = false) {
    setMessage("");
    if (!owner) return;
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
    <div className={editorOnly ? "rounded-xl bg-surface-container-lowest border border-outline-variant/40 p-space-lg" : "w-full flex flex-col rounded-xl bg-surface-container-lowest shadow-sm p-space-lg gap-space-md"}>
      {editorOnly ? null : <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm pb-space-sm border-b border-outline-variant/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0e7490]" />
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">Sister car families (Cross-badge platform twins)</h2>
          </div>
          <p className="font-body-sm text-body-sm text-secondary mt-0.5">Parts listed for one car in a family show for the others as &quot;Same car, different badge&quot;.</p>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-surface-container border border-outline-variant/50 text-on-surface font-body-sm font-semibold disabled:opacity-40"
          disabled={!owner}
          title={ownerTitle}
          onClick={() => { setFamilyId(""); setLabel(""); setPicked([]); setPendingAction(""); setEditor(true); }}
        >
          <span className="material-symbols-outlined text-[18px] text-primary">add_circle</span>
          New family
        </button>
      </div>}
      {editorOnly ? null : families.length === 0 ? <p className="font-body-sm text-body-sm text-secondary">None on file yet</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
          {families.map((family) => {
            const familyMembers = Array.isArray(family.members) ? family.members as Array<Record<string, string>> : [];
            const codes = familyMembers.map((member) => member.code).filter(Boolean).join(" · ");
            return (
              <div key={String(family.id)} className="p-space-lg rounded-xl bg-surface-container-low border border-outline-variant/40 flex flex-col gap-space-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-headline-md text-headline-md font-bold text-on-surface">{String(family.label ?? family.code ?? "Family")}</h3>
                    <span className="font-mono-sm text-mono-sm text-[#0e7490] font-semibold block mt-1">{codes || "No chassis codes yet"}</span>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-secondary">account_tree</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {familyMembers.map((member) => (
                    <span key={String(member.id)} className="px-2.5 py-1 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-mono-sm text-mono-sm">{member.maker} {member.code}</span>
                  ))}
                </div>
                <div className="pt-space-sm border-t border-outline-variant/30 flex flex-wrap items-center gap-2 font-body-sm text-body-sm">
                  <span className="font-mono-sm text-mono-sm text-[#0e7490] font-bold">{familyMembers.length} bodies in this family</span>
                  <button type="button" className="text-primary font-semibold disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => openFamily(String(family.id), String(family.label ?? ""))}>+ Add car</button>
                  <button type="button" className="text-secondary hover:text-error disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => openFamily(String(family.id), String(family.label ?? ""))}>Remove</button>
                  <button type="button" className="text-on-surface font-medium disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => openFamily(String(family.id), String(family.label ?? ""))}>Edit family</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!editorOnly && engines.length > 0 ? (
        <div className="pt-space-sm border-t border-outline-variant/30">
          <h3 className="font-body-sm font-semibold">Engines {engines.length}</h3>
          <p className="font-body-sm text-secondary">Engine cross-reference directory</p>
          {engines.map((engine) => {
            const engineCars = Array.isArray(engine.cars) ? engine.cars as Array<Record<string, string>> : [];
            const open = openEngine === String(engine.id);
            return (
              <div key={String(engine.id)} className="font-body-sm py-1">
                <button type="button" className="text-left" onClick={() => setOpenEngine(open ? "" : String(engine.id))}>
                  {String(engine.code)} · {String(engine.displacementCc ?? "—")} · {engineCars.length} cars
                </button>
                {open ? <p className="text-secondary">{engineCars.map((car) => `${car.make} ${car.model} ${car.chassis ?? ""}`).join(" · ") || "None on file yet"}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {editor || editorOnly ? (
        <div className="rounded-xl bg-surface-container-low p-space-lg space-y-3">
          <h3 className="font-headline-md text-headline-md font-semibold">Confirm family change</h3>
          <input className="w-full bg-surface-container-lowest rounded-lg px-3 py-2 text-sm" value={label} placeholder="Family name" onChange={(event) => setLabel(event.target.value)} />
          <p className="text-xs text-secondary">Tick the bodies to add or remove, then preview.</p>
          <div className="max-h-48 overflow-auto text-xs space-y-1">
            {cars.map((car) => {
              const platformId = String(car.platformId ?? "");
              if (!platformId) return null;
              return (
                <label key={platformId} className="flex items-center gap-2">
                  <input type="checkbox" checked={picked.includes(platformId)} onChange={() => toggle(platformId)} />
                  <span>{car.make} {car.model} {car.chassis}</span>
                </label>
              );
            })}
            {unassigned.map((row) => (
              <label key={String(row.id)} className="flex items-center gap-2">
                <input type="checkbox" checked={picked.includes(String(row.id))} onChange={() => toggle(String(row.id))} />
                <span>{String(row.maker)} {String(row.code)} (unassigned)</span>
              </label>
            ))}
          </div>
          <input className="w-full bg-surface-container-lowest rounded-lg px-3 py-2 text-sm" placeholder="Required source link" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} />
          <input className="w-full bg-surface-container-lowest rounded-lg px-3 py-2 text-sm" placeholder="Reason for this change" value={reason} onChange={(event) => setReason(event.target.value)} />
          <div className="flex flex-wrap gap-3 text-sm">
            <button type="button" disabled={!owner} title={ownerTitle} onClick={() => { void apply("add", true); }}>Preview add</button>
            <button type="button" disabled={!owner} title={ownerTitle} onClick={() => { void apply("remove", true); }}>Preview remove</button>
            <button type="button" className="bg-primary-container text-on-primary px-3 py-1.5 rounded-lg disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => { void apply(pendingAction || "add", false, false); }}>Apply changes</button>
            {leaveFamily ? (
              <button type="button" className="text-primary" onClick={() => { void apply(pendingAction || "add", false, true); }}>Move from {leaveFamily}</button>
            ) : null}
            <button type="button" onClick={() => { setEditor(false); onDismiss?.(); }}>Close</button>
          </div>
          {preview ? <p className="text-xs">{preview}</p> : null}
          {message ? <p className="text-xs">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
