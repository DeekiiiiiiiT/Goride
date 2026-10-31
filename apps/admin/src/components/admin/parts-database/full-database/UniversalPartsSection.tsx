// Stitch: dominion-redesign/S42l · size-based parts, tools from S41e
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { deleteUniversalPart, fetchSpecKeys, fetchUniversalParts, saveUniversalPart } from "../partsDatabaseApi";
import { PartsError, PartsLoading } from "../PartsDatabaseStates";

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "Source";
  }
}

export function UniversalPartsSection({
  owner,
  editorOnly = false,
  startId = "",
  onDismiss,
}: {
  owner: boolean;
  editorOnly?: boolean;
  startId?: string;
  onDismiss?: () => void;
}) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["universal-parts"], queryFn: fetchUniversalParts });
  const specs = useQuery({ queryKey: ["spec-keys"], queryFn: fetchSpecKeys });
  const [open, setOpen] = useState(editorOnly);
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState({ specKey: "", specValue: "", manufacturer: "", partNumber: "", name: "", connector: "", evidenceUrl: "" });
  const [error, setError] = useState("");
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";

  if (query.isLoading) return <PartsLoading />;
  if (query.isError) return <PartsError onRetry={() => { void query.refetch(); }} />;
  const items = query.data?.items ?? [];
  const labelFor = (key: string) => specs.data?.items.find((item) => item.key === key)?.label ?? key;

  useEffect(() => {
    if (!startId || !items.length) return;
    const item = items.find((row) => String(row.id) === startId);
    if (!item) return;
    const extra = (item.extra ?? {}) as Record<string, unknown>;
    setEditId(String(item.id));
    setForm({
      specKey: String(item.spec_key ?? ""),
      specValue: String(item.spec_value ?? ""),
      manufacturer: String(item.manufacturer ?? ""),
      partNumber: String(item.part_number ?? ""),
      name: String(item.name ?? ""),
      connector: String(extra.connector ?? ""),
      evidenceUrl: String(item.evidence_url ?? ""),
    });
  }, [startId, items]);

  async function save() {
    setError("");
    try {
      await saveUniversalPart({
        id: editId || undefined,
        specKey: form.specKey,
        specValue: form.specValue,
        manufacturer: form.manufacturer,
        partNumber: form.partNumber,
        name: form.name,
        evidenceUrl: form.evidenceUrl,
        extra: form.connector ? { connector: form.connector } : undefined,
      });
      setOpen(false);
      await client.invalidateQueries({ queryKey: ["universal-parts"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <div className={editorOnly ? "rounded-xl bg-surface-container-lowest border border-outline-variant/40" : "w-full flex flex-col rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden"}>
      {editorOnly ? null : <div className="px-space-lg py-3 bg-surface-container-low border-b border-outline-variant/40 flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#006e31]" />
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">Size-based parts (Universal specs)</h2>
          </div>
          <p className="font-body-sm text-body-sm text-secondary mt-0.5">These fit any car whose spec matches. They are not listed car by car.</p>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-surface-container border border-outline-variant/50 font-body-sm font-semibold disabled:opacity-40"
          disabled={!owner}
          title={ownerTitle}
          onClick={() => { setEditId(""); setForm({ specKey: "", specValue: "", manufacturer: "", partNumber: "", name: "", connector: "", evidenceUrl: "" }); setOpen(true); }}
        >
          <span className="material-symbols-outlined text-[18px] text-[#006e31]">add</span>
          Add size-based part
        </button>
      </div>}
      {editorOnly ? null : <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface/80 border-b border-outline-variant/40 font-mono-sm text-[11px] uppercase text-secondary tracking-wider h-10">
              <th className="px-space-lg font-semibold">Spec Category</th>
              <th className="px-space-md font-semibold">Dimension / Grade</th>
              <th className="px-space-md font-semibold">Brand</th>
              <th className="px-space-md font-semibold">Part Number</th>
              <th className="px-space-md font-semibold">Product Name</th>
              <th className="px-space-md font-semibold">Verified Source</th>
              <th className="px-space-md text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20 font-body-sm text-body-sm">
            {items.length === 0 ? (
              <tr><td className="px-space-lg py-6 text-secondary" colSpan={7}>Add first part for this spec. None on file yet.</td></tr>
            ) : items.map((item) => {
              const url = String(item.evidence_url ?? "");
              return (
                <tr key={String(item.id)} className="h-12">
                  <td className="px-space-lg font-medium">{labelFor(String(item.spec_key ?? ""))}</td>
                  <td className="px-space-md"><span className="px-2 py-0.5 rounded bg-primary-fixed/30 text-primary font-mono-sm font-bold">{String(item.spec_value ?? "")}</span></td>
                  <td className="px-space-md font-medium">{String(item.manufacturer ?? "")}</td>
                  <td className="px-space-md font-mono-sm text-secondary">{String(item.part_number ?? "")}</td>
                  <td className="px-space-md">{String(item.name ?? "")}</td>
                  <td className="px-space-md font-mono-sm">
                    {url ? <a className="text-primary hover:underline" href={url} target="_blank" rel="noreferrer">{hostLabel(url)}</a> : "—"}
                  </td>
                  <td className="px-space-md text-right">
                    <button type="button" className="text-primary font-semibold disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => {
                      const extra = (item.extra ?? {}) as Record<string, unknown>;
                      setEditId(String(item.id));
                      setForm({
                        specKey: String(item.spec_key ?? ""),
                        specValue: String(item.spec_value ?? ""),
                        manufacturer: String(item.manufacturer ?? ""),
                        partNumber: String(item.part_number ?? ""),
                        name: String(item.name ?? ""),
                        connector: String(extra.connector ?? ""),
                        evidenceUrl: url,
                      });
                      setOpen(true);
                    }}>Edit</button>
                    <span className="text-outline/40 px-1">·</span>
                    <button type="button" className="text-secondary hover:text-error disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={() => { void deleteUniversalPart(String(item.id)).then(() => query.refetch()); }}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
      {open ? (
        <div className="p-space-lg space-y-2 border-t border-outline-variant/30">
          <h3 className="font-body-md font-semibold">{editId ? "Edit" : "Add size-based part"}</h3>
          <select className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={form.specKey} onChange={(event) => setForm({ ...form, specKey: event.target.value })}>
            <option value="">Choose a spec</option>
            {(specs.data?.items ?? []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Value" value={form.specValue} onChange={(event) => setForm({ ...form, specValue: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Brand" value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Part number" value={form.partNumber} onChange={(event) => setForm({ ...form, partNumber: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Connector (wipers only)" value={form.connector} onChange={(event) => setForm({ ...form, connector: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Source link" value={form.evidenceUrl} onChange={(event) => setForm({ ...form, evidenceUrl: event.target.value })} />
          {error ? <p className="text-xs text-error">{error}</p> : null}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setOpen(false); onDismiss?.(); }}>Cancel</button>
            <button type="button" className="bg-primary-container text-on-primary px-3 py-1.5 rounded-lg text-sm disabled:opacity-40" disabled={!owner} onClick={() => { void save(); }}>Save</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
