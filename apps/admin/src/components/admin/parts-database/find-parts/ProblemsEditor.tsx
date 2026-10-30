// Stitch: dominion-redesign/S42i
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSymptoms, saveSymptom } from "./findPartsApi";

export function ProblemsEditor({ owner }: { owner: boolean }) {
  const list = useQuery({ queryKey: ["symptoms-editor"], queryFn: fetchSymptoms });
  const [label, setLabel] = useState("");
  const [hint, setHint] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  const rows = list.data?.symptoms ?? [];
  const live = rows.filter((row) => row.active !== false).length;

  async function save(active = true) {
    if (!owner || !label.trim() || !reason.trim()) return;
    await saveSymptom({ label: label.trim(), hint: hint.trim() || null, reason: reason.trim(), active, components: [] });
    setLabel("");
    setHint("");
    setReason("");
    setNote("Logged permanently in platform Master Activity Log.");
    await list.refetch();
  }

  return (
    <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Problems</h2>
        <button type="button" className="h-12 px-4 rounded-xl bg-primary-container text-on-primary disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => { void save(); }}>Add problem symptom</button>
      </div>
      <div className="flex gap-4 font-mono-sm text-mono-sm text-secondary">
        <span>Problems {rows.length}</span>
        <span>Live {live}</span>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Problem symptom</th>
            <th>Customer hint</th>
            <th>Likely parts (ranked)</th>
            <th>Live status</th>
            <th>Last updated</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.label}</td>
              <td>{row.hint}</td>
              <td>{row.components.length}</td>
              <td>{row.active === false ? "Off" : "Live"}</td>
              <td />
              <td><button type="button" onClick={() => { setLabel(row.label); setHint(row.hint || ""); }}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-2">
        <h3 className="font-semibold">Edit problem definition</h3>
        <label className="text-sm">Problem symptom text
          <input className="mt-1 w-full h-12 rounded-xl bg-surface-container-low px-3" value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="text-sm">Diagnostic hint
          <input className="mt-1 w-full h-12 rounded-xl bg-surface-container-low px-3" value={hint} onChange={(event) => setHint(event.target.value)} />
        </label>
        <p className="text-sm text-secondary">drag_indicator · + add part to problem symptom · Editing · prev · next</p>
        <label className="text-sm">Reason for this change *
          <input className="mt-1 w-full h-12 rounded-xl bg-surface-container-low px-3" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="flex gap-2">
          <button type="button" className="h-12 px-4" onClick={() => { setLabel(""); setHint(""); setReason(""); }}>Cancel</button>
          <button type="button" className="h-12 px-4 rounded-xl bg-primary-container text-on-primary disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => { void save(); }}>Save changes</button>
        </div>
        {note ? <p className="text-sm">{note}</p> : null}
      </div>
    </section>
  );
}
