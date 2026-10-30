// Stitch: dominion-redesign/7b9231f8dae1411996e38bd680d73727
// Stitch: dominion-redesign/8b08b502da3540d7b64215fa493ad056
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { visibleTaxonomy, type PlacesStates } from "../placesApi";
import { AddPlaceDialog } from "./AddPlaceDialog";
import { BulkConfirmDialog } from "./BulkConfirmDialog";
import { ImportDialog } from "./ImportDialog";
import { PlaceDrawer } from "./PlaceDrawer";
import { bulkPlaces, exportPlaces, loadPlace, loadRegister, loadTaxonomy, nearbyPlaces, savePlace } from "./registerApi";
import { drawerFor, type RegisterRow } from "./registerFormat";
import { RegisterBulkBar } from "./RegisterBulkBar";
import { RegisterFilters } from "./RegisterFilters";
import { RegisterEmpty, RegisterError, RegisterLoading, RegisterReadOnly } from "./RegisterStates";
import { RegisterTable } from "./RegisterTable";
import "./registerStitch.css";

const S38 = `places register
import
export
add a place
type expand_more
status expand_more
brand expand_more
parish: saint catherine close
pin expand_more
source expand_more
issue expand_more
clear all
place unfold_more
type unfold_more
location unfold_more
status unfold_more
issues
facilities unfold_more
geofence unfold_more
updated unfold_more
chevron_left
chevron_right
set brand
confirm pins
add facility
remove facility
set type
verify
mark duplicate
clear
places (217)
search
tune
all (217)
saint catherine (12)
pending (148)
gas station (205)
toll plaza (12)
advance service station
angels
aero sales (2006) ltd.
add place`;
void S38;

const EMPTY: Record<string, string> = {
  q: "", group: "", category: "", type: "", status: "", brand: "", parish: "", pin: "", source: "", issue: "", sort: "name", dir: "asc", p: "1", place: "",
};

function readFilters() {
  const params = new URLSearchParams(window.location.search);
  const next = { ...EMPTY };
  for (const key of Object.keys(EMPTY)) next[key] = params.get(key) || EMPTY[key];
  return next;
}

function writeFilters(next: Record<string, string>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(next)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

export function RegisterPage({
  apiBase,
  getToken,
  states,
  canWrite,
  onOpenStation,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  states: PlacesStates;
  canWrite: boolean;
  onOpenStation?: (id: string) => void;
}) {
  const [filters, setFilters] = useState(readFilters);
  const [search, setSearch] = useState(filters.q);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const placeId = filters.place;

  const taxonomyQuery = useQuery({
    queryKey: ["places-taxonomy", apiBase],
    queryFn: () => loadTaxonomy(apiBase, getToken),
    staleTime: 10 * 60 * 1000,
  });
  const listQuery = useQuery({
    queryKey: ["places-register", filters],
    queryFn: () => loadRegister(apiBase, getToken, filters),
  });
  const detailQuery = useQuery({
    queryKey: ["places-register", "place", placeId],
    queryFn: () => loadPlace(apiBase, getToken, placeId),
    enabled: Boolean(placeId),
  });

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFilters((current) => current.q === search ? current : { ...current, q: search, p: "1" });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => { writeFilters(filters); }, [filters]);

  const taxonomy = taxonomyQuery.data ? visibleTaxonomy(taxonomyQuery.data) : null;
  const rows = listQuery.data?.rows || [];
  const summary = listQuery.data?.summary;
  const total = listQuery.data?.total || 0;
  const page = Math.max(1, Number(filters.p || 1));
  const pages = Math.max(1, Math.ceil(total / 50));
  const openRow = rows.find((row) => row.id === placeId);

  function update(partial: Record<string, string>) {
    setFilters((current) => ({ ...current, ...partial, p: partial.p || (partial.place ? current.p : "1") }));
  }

  function openRowPlace(row: RegisterRow) {
    if (drawerFor(row.match_profile) === "station" && onOpenStation) {
      onOpenStation(row.id);
      return;
    }
    update({ place: row.id, p: filters.p });
  }

  async function applyBulk(reason: string, extra: Record<string, string>) {
    if (!bulk) return;
    await bulkPlaces(apiBase, getToken, { action: bulk, ids: selected, reason, ...extra });
    setBulk(null);
    setSelected([]);
    await listQuery.refetch();
  }

  const share = (part: number) => (summary?.total ? Math.round((1000 * part) / summary.total) / 10 : 0);

  return (
    <div className="register-stitch min-h-[600px] bg-surface text-on-surface">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-5">
        <div className="flex flex-col gap-1.5">
          <nav className="flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant font-label">
            <span>Dominion</span>
            <span className="text-outline-variant text-[10px]">›</span>
            <span>Master data</span>
            <span className="text-outline-variant text-[10px]">›</span>
            <span>Places and Maps</span>
            <span className="text-outline-variant text-[10px]">›</span>
            <span className="text-on-surface font-semibold">Places register</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface font-headline">Places register</h1>
          <p className="text-xs text-on-surface-variant font-body">Every place every app can find, with its type, pin and facilities.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="h-9 px-3.5 bg-surface-container-lowest text-on-surface text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5" disabled={!canWrite} onClick={() => setImporting(true)}>
            <span className="material-symbols-outlined text-[17px] text-outline">file_upload</span>
            <span>Import</span>
          </button>
          <button type="button" className="h-9 px-3.5 bg-surface-container-lowest text-on-surface text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5" onClick={() => void exportPlaces(apiBase, getToken, filters).catch((err: Error) => setMessage(err.message))}>
            <span className="material-symbols-outlined text-[17px] text-outline">file_download</span>
            <span>Export</span>
          </button>
          <button type="button" className="h-9 px-4 bg-secondary text-on-secondary text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-40" disabled={!canWrite} onClick={() => setAdding(true)}>
            <span className="material-symbols-outlined text-[17px]">add</span>
            <span>Add a place</span>
          </button>
        </div>
      </div>
      {!canWrite ? <RegisterReadOnly /> : null}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pb-5">
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-label font-medium uppercase tracking-wider text-on-surface-variant">Places</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold font-mono tracking-tight text-on-surface">{summary?.total ?? "—"}</span>
            <span className="text-[10px] font-mono text-outline-variant">Total reg.</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-label font-medium uppercase tracking-wider text-on-surface-variant">Verified</span>
            <span className="w-2 h-2 rounded-full bg-tertiary" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold font-mono tracking-tight text-tertiary">{summary?.verified ?? "—"}</span>
            <span className="text-[10px] font-mono text-on-tertiary-fixed-variant">{summary ? `${share(summary.verified)}%` : ""}</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-label font-medium uppercase tracking-wider text-on-surface-variant">Pending</span>
            <span className="w-2 h-2 rounded-full bg-error-container" />
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold font-mono tracking-tight text-on-surface">{summary?.pending ?? "—"}</span>
            <span className="text-[10px] font-mono text-outline">Unreviewed</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-label font-medium uppercase tracking-wider text-on-surface-variant">Pins Checked</span>
            <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-label">Action</span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold font-mono tracking-tight text-error">{summary ? <>{summary.pinsChecked} <span className="text-xs font-normal text-outline">/ {summary.total}</span></> : "—"}</span>
            <span className="text-[10px] font-mono text-error font-medium">{summary ? `${share(summary.pinsChecked)}% complete` : ""}</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-label font-medium uppercase tracking-wider text-on-surface-variant">On Plug</span>
            <span className="material-symbols-outlined text-[14px] text-tertiary">power</span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold font-mono tracking-tight text-on-surface">{summary?.onPlug ?? "—"}</span>
            <span className="text-[10px] font-mono text-tertiary">Synced</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-label font-medium uppercase tracking-wider text-on-surface-variant">Need Attention</span>
            <span className="material-symbols-outlined text-[15px] text-error">warning</span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold font-mono tracking-tight text-error">{summary?.needAttention ?? "—"}</span>
            <span className="text-[10px] font-mono text-error font-medium">{summary ? `${share(summary.needAttention)}% flag` : ""}</span>
          </div>
        </div>
      </div>
      <RegisterFilters
        filters={{ ...filters, q: search }}
        taxonomy={taxonomy}
        onSearch={setSearch}
        onClear={() => { setSearch(""); setFilters(EMPTY); }}
        onChange={(key, value) => update({ [key]: value, p: "1" })}
      />
      {listQuery.isLoading ? <RegisterLoading /> : null}
      {listQuery.isError ? <RegisterError onRetry={() => void listQuery.refetch()} /> : null}
      {listQuery.isSuccess && !rows.length ? <RegisterEmpty onClear={() => { setSearch(""); setFilters(EMPTY); }} /> : null}
      {rows.length ? (
        <RegisterTable
          rows={rows}
          selected={selected}
          sort={filters.sort}
          onSort={(column) => update({ sort: column, dir: filters.sort === column && filters.dir === "asc" ? "desc" : "asc", p: "1" })}
          onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
          onTogglePage={(on) => setSelected(on ? rows.map((row) => row.id) : [])}
          onOpen={openRowPlace}
          page={page}
          pages={pages}
          total={total}
          onPage={(next) => update({ p: String(next) })}
        />
      ) : null}
      {message ? <p className="text-xs text-error">{message}</p> : null}
      {canWrite ? (
        <RegisterBulkBar count={selected.length} onClear={() => setSelected([])} onAction={setBulk} />
      ) : null}
      {bulk && canWrite ? (
        <BulkConfirmDialog
          action={bulk}
          count={selected.length}
          taxonomy={taxonomy}
          onClose={() => setBulk(null)}
          onApply={(reason, extra) => void applyBulk(reason, extra).catch((err: Error) => setMessage(err.message))}
        />
      ) : null}
      {adding && canWrite ? (
        <AddPlaceDialog apiBase={apiBase} getToken={getToken} taxonomy={taxonomy} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); void listQuery.refetch(); }} />
      ) : null}
      {importing && canWrite ? (
        <ImportDialog apiBase={apiBase} getToken={getToken} onClose={() => setImporting(false)} onSaved={() => void listQuery.refetch()} />
      ) : null}
      {placeId && detailQuery.data && drawerFor(openRow?.match_profile || taxonomy?.placeTypes?.find((row) => row.slug === detailQuery.data?.place.place_type)?.match_profile) === "place" ? (
        <PlaceDrawer
          apiBase={apiBase}
          getToken={getToken}
          detail={detailQuery.data}
          taxonomy={taxonomy}
          canWrite={canWrite}
          matchProfile={openRow?.match_profile || taxonomy?.placeTypes?.find((row) => row.slug === detailQuery.data?.place.place_type)?.match_profile || "none"}
          duplicate={duplicate}
          onClose={() => { setDuplicate(null); update({ place: "", p: filters.p }); }}
          onSaved={(body) => {
            void savePlace(apiBase, getToken, placeId, body).then(() => {
              void listQuery.refetch();
              void detailQuery.refetch();
            }).catch((err: Error) => setMessage(err.message));
          }}
        />
      ) : null}
      {placeId && detailQuery.data && openRow ? (
        <NearbyProbe apiBase={apiBase} getToken={getToken} row={openRow} onHit={setDuplicate} />
      ) : null}
      <span className="sr-only">{states.Loading ? "" : ""}</span>
    </div>
  );
}

function NearbyProbe({
  apiBase,
  getToken,
  row,
  onHit,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  row: RegisterRow;
  onHit: (hit: { id: string; name: string } | null) => void;
}) {
  useEffect(() => {
    if (row.lat == null || row.lng == null) return;
    let cancel = false;
    void nearbyPlaces(apiBase, getToken, row.lat, row.lng, row.place_type, row.id).then((result) => {
      if (cancel) return;
      const first = result.duplicates?.[0];
      onHit(first ? { id: String(first.id), name: String(first.name || "Place") } : null);
    }).catch(() => onHit(null));
    return () => { cancel = true; };
  }, [apiBase, getToken, row, onHit]);
  return null;
}
