import React, { useCallback, useEffect, useState } from "react";
import { API_ENDPOINTS } from "../services/apiConfig";

type DeskItem = {
  id: string;
  need_text?: string;
  part_number?: string;
  status?: string;
  organization_id?: string;
  vehicle_id?: string;
  created_at?: string;
};

const LISTS = [
  ["requests", "Requests"],
  ["quotes", "Quotes"],
  ["cores", "Core returns"],
  ["claims", "Warranty claims"],
  ["alerts", "Repeat failures"],
  ["stock", "Stock"],
  ["orphans", "Broken links"],
  ["link-reviews", "Number reviews"],
] as const;

async function loadList(token: string, name: string): Promise<DeskItem[]> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/parts/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load the parts desk");
  if (name === "orphans") {
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((row: { vehicleId?: string; vehicle_catalog_id?: string; label?: string }) => ({
      id: String(row.vehicleId ?? ""),
      need_text: row.label || row.vehicle_catalog_id || "Broken catalog link",
      vehicle_id: row.vehicleId,
      status: "open",
    }));
  }
  return Array.isArray(data.items) ? data.items : [];
}

export function FleetAdminPartsDesk({ token }: { token: string }) {
  const [tab, setTab] = useState<(typeof LISTS)[number][0]>("requests");
  const [items, setItems] = useState<DeskItem[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [catalogNumber, setCatalogNumber] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await loadList(token, tab));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the parts desk");
    }
  }, [token, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(item: DeskItem, askCatalog: boolean) {
    const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/parts/requests/${item.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "resolved",
        catalogTask: askCatalog ? { note: note || item.need_text } : undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not resolve the request");
      return;
    }
    setNote("");
    await load();
  }

  async function reviewNumber(item: DeskItem, status: "linked" | "dismissed") {
    const res = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/parts/link-reviews/${item.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status, partNumber: catalogNumber }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not update the number review");
      return;
    }
    setCatalogNumber("");
    await load();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h2 className="text-xl font-semibold">Parts desk</h2>
      <p className="text-sm text-slate-400">Customer requests, prices, returns, and broken catalog links. A new catalog part is sent to Dominion with no customer on it.</p>
      <div className="flex flex-wrap gap-2">
        {LISTS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === id ? "bg-slate-800" : "bg-slate-900"}`}>
            {label}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {tab === "requests" ? (
        <input className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm" placeholder="Note for a new catalog part" value={note} onChange={(e) => setNote(e.target.value)} />
      ) : null}
      <ul className="space-y-2">
        {items.length === 0 ? <li className="text-sm text-slate-500">Nothing in this list.</li> : items.map((item) => (
          <li key={item.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
            <p>{item.part_number || item.need_text || item.status || item.id}</p>
            <p className="text-xs text-slate-500">{item.organization_id} {item.vehicle_id}</p>
            {tab === "requests" ? (
              <div className="mt-2 flex gap-2">
                <button type="button" className="rounded bg-slate-800 px-2 py-1" onClick={() => void resolve(item, false)}>Resolve</button>
                <button type="button" className="rounded bg-amber-700 px-2 py-1" onClick={() => void resolve(item, true)}>Needs a new catalog part</button>
              </div>
            ) : null}
            {tab === "link-reviews" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <input className="rounded border border-slate-700 bg-slate-950 px-2 py-1" placeholder="Catalog part number" value={catalogNumber} onChange={(e) => setCatalogNumber(e.target.value)} />
                <button type="button" className="rounded bg-slate-800 px-2 py-1" onClick={() => void reviewNumber(item, "linked")}>Link</button>
                <button type="button" className="rounded bg-slate-800 px-2 py-1" onClick={() => void reviewNumber(item, "dismissed")}>Dismiss</button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
