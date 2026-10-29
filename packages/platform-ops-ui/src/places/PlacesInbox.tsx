import { useEffect, useState } from "react";
import { placesSend, type PlacesStates, type Taxonomy } from "./placesApi";

type Item = {
  id: string;
  chip: string;
  title: string;
  placeId: string;
  lat?: number | null;
  lng?: number | null;
  proposal?: boolean;
  placeType?: string;
  href?: string;
  external?: boolean;
};

const CHIPS = [
  { id: "", label: "All" },
  { id: "plug", label: "Plug pin" },
  { id: "learnt", label: "Learnt pin" },
  { id: "import", label: "Import" },
  { id: "evidence", label: "Evidence" },
  { id: "price", label: "Price" },
  { id: "hand", label: "Place changes" },
  { id: "hand-review", label: "Hand review" },
  { id: "facility", label: "Facility proposal" },
];

export function PlacesInbox({
  apiBase,
  getToken,
  states,
  chip,
  onOpen,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  states: PlacesStates;
  chip?: string;
  onOpen?: (id: string) => void;
}) {
  const { Loading, Empty, Error } = states;
  const [active, setActive] = useState(chip || "");
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState(0);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [note, setNote] = useState("");

  const load = () => {
    setStatus("loading");
    const query = active ? `?chip=${active}` : "";
    Promise.all([
      placesSend<Taxonomy>(apiBase, getToken, "/admin/taxonomy"),
      placesSend<{ items: Item[] }>(apiBase, getToken, `/admin/review${query}`),
    ]).then(([tree, body]) => {
      setTaxonomy(tree);
      setItems(body.items || []);
      setCursor(0);
      setStatus("ready");
    }).catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, [active]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "j" || event.key === "J") setCursor((value) => Math.min(items.length - 1, value + 1));
      if (event.key === "k" || event.key === "K") setCursor((value) => Math.max(0, value - 1));
      if (event.key === "a" || event.key === "A") void act("approve");
      if (event.key === "r" || event.key === "R") void act("reject");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, cursor]);

  const current = items[cursor];

  async function act(action: string, extra?: Record<string, unknown>) {
    if (!current) return;
    setNote("");
    try {
      if (current.external) {
        if (current.href) window.location.assign(current.href);
        return;
      }
      if (current.proposal) {
        await placesSend(apiBase, getToken, `/admin/places/${current.id}`, {
          method: "POST",
          body: JSON.stringify({ action, ...extra }),
        });
      } else if (action === "approve") {
        await placesSend(apiBase, getToken, `/admin/register/${current.placeId}/verify`, { method: "POST", body: "{}" });
      } else if (action === "type" && extra?.placeType) {
        await placesSend(apiBase, getToken, `/admin/register/${current.placeId}`, {
          method: "PATCH",
          body: JSON.stringify({ placeType: extra.placeType, name: current.title, lat: current.lat, lng: current.lng }),
        });
      }
      load();
    } catch (err: unknown) {
      const missing = err && typeof err === "object" && "missing" in err
        ? (err as { missing?: string[] }).missing
        : undefined;
      setNote(missing?.length ? `Still needed: ${missing.join(", ")}` : (err instanceof globalThis.Error ? err.message : String(err)));
    }
  }

  if (status === "loading") return <Loading />;
  if (status === "error") return <Error onRetry={load} />;

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {CHIPS.filter((row) => !chip || row.id === chip || row.id === "").map((row) => (
            <button key={row.id || "all"} type="button" className={`rounded-full px-3 py-1 text-sm ${active === row.id ? "bg-slate-900 text-white" : "bg-slate-100"}`} onClick={() => setActive(row.id)}>{row.label}</button>
          ))}
        </div>
        {items.length === 0 ? <Empty body="Nothing is waiting." /> : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {items.map((item, index) => (
              <li key={`${item.chip}-${item.id}`}>
                <button type="button" className={`w-full px-3 py-2 text-left text-sm ${index === cursor ? "bg-slate-50" : ""}`} onClick={() => setCursor(index)}>
                  <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs">{item.chip}</span>
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">J and K move. A approves. R rejects.</p>
        {note ? <p className="mt-2 text-sm text-red-700">{note}</p> : null}
      </div>
      {current && (
        <aside className="space-y-3 rounded-xl border border-slate-200 p-3 text-sm">
          <h3 className="font-semibold">{current.title}</h3>
          <p>Pin {current.lat ?? "—"}, {current.lng ?? "—"}</p>
          <div className="flex flex-wrap gap-2">
            {current.external ? (
              <button type="button" className="rounded bg-slate-900 px-3 py-1 text-white" onClick={() => { if (current.href) window.location.assign(current.href); }}>{current.chip === "price" ? "Open price review" : "Open fuel resolution"}</button>
            ) : (
              <>
                <button type="button" className="rounded bg-slate-900 px-3 py-1 text-white" onClick={() => act("approve")}>Approve</button>
                <button type="button" className="rounded border px-3 py-1" onClick={() => act("reject")}>Reject</button>
                {onOpen && current.placeId ? <button type="button" className="rounded border px-3 py-1" onClick={() => onOpen(current.placeId)}>Open</button> : null}
              </>
            )}
          </div>
          <label className="block">
            Change type
            <select className="mt-1 w-full rounded border px-2 py-1" defaultValue="" onChange={(event) => { if (event.target.value) void act("type", { placeType: event.target.value }); }}>
              <option value="">Keep type</option>
              {(taxonomy?.placeTypes || []).map((row) => <option key={row.slug} value={row.slug}>{row.label}</option>)}
            </select>
          </label>
        </aside>
      )}
    </div>
  );
}
