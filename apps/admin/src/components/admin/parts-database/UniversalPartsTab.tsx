// Stitch: dominion-redesign/61470f6ad1244f49889906b603e87e54
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteUniversalPart, fetchSpecKeys, fetchUniversalParts, saveUniversalPart } from "./partsDatabaseApi";
import { PartsError, PartsLoading } from "./PartsDatabaseStates";

export function UniversalPartsTab() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["universal-parts"], queryFn: fetchUniversalParts });
  const specs = useQuery({ queryKey: ["spec-keys"], queryFn: fetchSpecKeys });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState({ specKey: "", specValue: "", manufacturer: "", partNumber: "", name: "", connector: "", evidenceUrl: "" });
  const [error, setError] = useState("");
  const [specFilter, setSpecFilter] = useState("");

  if (query.isLoading) return <PartsLoading />;
  if (query.isError) return <PartsError onRetry={() => { void query.refetch(); }} />;
  const items = query.data?.items ?? [];
  const labelFor = (key: string) => specs.data?.items.find((item) => item.key === key)?.label ?? key;
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = String(item.spec_key ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const visible = specFilter ? items.filter((item) => String(item.spec_key ?? "") === specFilter) : items;

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
    <section className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 flex flex-wrap gap-2 text-xs">
        <button type="button" className={specFilter ? "text-on-surface-variant" : "text-secondary"} onClick={() => setSpecFilter("")}>All specs {items.length}</button>
        {[...counts.entries()].map(([key, count]) => (
          <button type="button" key={key} className={specFilter === key ? "text-secondary" : "text-on-surface-variant"} onClick={() => setSpecFilter(key)}>{labelFor(key)} {count}</button>
        ))}
      </div>
      <div className="px-5 py-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Universal parts {items.length}</h2>
        <button type="button" className="text-xs text-secondary bg-surface-container-low px-3 py-1.5 rounded-lg" onClick={() => { setEditId(""); setOpen(true); }}>Add universal part</button>
      </div>
      <div className="grid grid-cols-8 px-5 py-2 text-xs font-semibold text-on-surface-variant">
        <span>Spec</span><span>Value</span><span>Brand</span><span>Part number</span><span>Name</span><span>Connector</span><span>Source</span><span>Actions</span>
      </div>
      {visible.length === 0 ? (
        <p className="px-5 py-6 text-sm text-on-surface-variant">Add first part for this spec. None on file yet.</p>
      ) : visible.map((item) => {
        const extra = (item.extra ?? {}) as Record<string, unknown>;
        return (
          <div key={String(item.id)} className="grid grid-cols-8 px-5 py-2 text-xs items-center">
            <span>{labelFor(String(item.spec_key ?? ""))}</span>
            <span>{String(item.spec_value ?? "")}</span>
            <span>{String(item.manufacturer ?? "")}</span>
            <span>{String(item.part_number ?? "")}</span>
            <span>{String(item.name ?? "")}</span>
            <span>{String(extra.connector ?? "—")}</span>
            <a className="truncate text-secondary" href={String(item.evidence_url ?? "")}>Source</a>
            <span className="flex gap-2">
              <button type="button" className="text-secondary" onClick={() => {
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
                setOpen(true);
              }}>Edit</button>
              <button type="button" onClick={() => { void deleteUniversalPart(String(item.id)).then(() => query.refetch()); }}>Delete</button>
            </span>
          </div>
        );
      })}
      {open ? (
        <div className="p-5 space-y-2 border-t">
          <h3 className="text-sm font-semibold">{editId ? "Edit" : "Add universal part"}</h3>
          <label className="block text-xs">Spec specification *
            <select className="mt-1 w-full bg-surface-container-low rounded-lg px-3 py-2" value={form.specKey} onChange={(event) => setForm({ ...form, specKey: event.target.value })}>
              <option value="">Choose</option>
              {(specs.data?.items ?? []).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Value *" value={form.specValue} onChange={(event) => setForm({ ...form, specValue: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Brand *" value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Part number *" value={form.partNumber} onChange={(event) => setForm({ ...form, partNumber: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Commercial name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Connector (wipers only)" value={form.connector} onChange={(event) => setForm({ ...form, connector: event.target.value })} />
          <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Source link *" value={form.evidenceUrl} onChange={(event) => setForm({ ...form, evidenceUrl: event.target.value })} />
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          <div className="flex gap-3">
            <button type="button" onClick={() => setOpen(false)}>Close</button>
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="bg-secondary text-on-secondary px-3 py-1.5 rounded-lg text-sm" onClick={() => { void save(); }}>Save universal part</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
