// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected
import { useEffect, useMemo, useState } from "react";
import { BrandsTable } from "./BrandsTable";
import { CategoriesRequestError, loadHistory, loadTaxonomy, saveTaxonomy } from "./categoriesApi";
import {
  emptySummary,
  type AdminTaxonomy,
  type BrandRow,
  type ChangeRow,
  type SelectedRef,
  type TaxonomyTable,
} from "./categoriesFormat";
import { RestoreDialog } from "./RestoreDialog";
import { RetireDialog } from "./RetireDialog";
import { retiredRows, RetiredList, type RetiredRow } from "./RetiredList";
import { TaxonomyDetail } from "./TaxonomyDetail";
import { TaxonomyEditDrawer } from "./TaxonomyEditDrawer";
import { TaxonomyHistory } from "./TaxonomyHistory";
import { TaxonomyTree } from "./TaxonomyTree";

type Tab = "tree" | "brands" | "retired" | "history";
type Editor = { table: TaxonomyTable; id: string | null; initial: Record<string, string> } | null;

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

function splitList(value: string | undefined): string[] {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function CategoriesPage({
  apiBase,
  getToken,
  canWrite,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  canWrite: boolean;
}) {
  const [tree, setTree] = useState<AdminTaxonomy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<Tab>("tree");
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState<SelectedRef | null>(null);
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [history, setHistory] = useState<ChangeRow[]>([]);
  const [retire, setRetire] = useState<{ table: TaxonomyTable; id: string; label: string; blocked: AdminTaxonomy["placeTypes"][number]["blocked_by"] } | null>(null);
  const [restore, setRestore] = useState<RetiredRow | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = () => {
    setStatus("loading");
    loadTaxonomy(apiBase, getToken).then((next) => {
      setTree(next);
      setSelected((current) => current || (next.placeTypes.some((row) => row.slug === "gas_station")
        ? { table: "place_type", id: "gas_station" }
        : next.placeTypes[0]
          ? { table: "place_type", id: next.placeTypes[0].slug }
          : null));
      setStatus("ready");
    }).catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selected || tab !== "tree") return;
    loadHistory(apiBase, getToken, selected.table, selected.id, 10)
      .then((body) => setChanges(body.rows || []))
      .catch(() => setChanges([]));
  }, [selected, tab, tree]);

  useEffect(() => {
    if (tab !== "history") return;
    loadHistory(apiBase, getToken, "", "", 50)
      .then((body) => setHistory(body.rows || []))
      .catch(() => setHistory([]));
  }, [tab, tree]);

  const summary = tree?.summary || emptySummary();
  const retired = useMemo(() => (tree ? retiredRows(tree) : []), [tree]);
  const retiredLabel = summary.retired === 0 ? "Retired 0" : `Retired ${summary.retired}`;

  function choose(next: SelectedRef) {
    setSelected(next);
  }

  function openCreate(table: TaxonomyTable) {
    setMenu(false);
    setFormError("");
    setEditor({
      table,
      id: null,
      initial: table === "brand" ? { place_types: "gas_station" } : {},
    });
    if (table === "brand") setTab("brands");
  }

  function openEdit(table: TaxonomyTable, id: string, initial: Record<string, string>) {
    setFormError("");
    setEditor({ table, id, initial });
  }

  async function onSave(fields: Record<string, string>, reason: string) {
    if (!editor) return;
    setBusy(true);
    setFormError("");
    const body: Record<string, unknown> = { reason };
    if (editor.table === "brand") {
      body.name = fields.name || "";
      body.slug = fields.slug || "";
      body.aliases = splitList(fields.aliases);
      body.logo_url = fields.logo_url || "";
      body.place_types = splitList(fields.place_types);
    } else {
      body.label = fields.label || "";
      if (!editor.id) {
        body.slug = fields.slug || "";
        body.code = fields.code || fields.slug || "";
      }
      if (fields.colour) body.colour = fields.colour;
      if (fields.group_code) body.group_code = fields.group_code;
      if (fields.category_code) body.category_code = fields.category_code;
      if (fields.default_geofence_m) body.default_geofence_m = Number(fields.default_geofence_m);
      if (fields.default_facilities) body.default_facilities = splitList(fields.default_facilities);
      if (fields.plug_label) body.plug_label = fields.plug_label;
      if (fields.plug_map_label) body.plug_map_label = fields.plug_map_label;
      if (fields.grid_icon) body.grid_icon = fields.grid_icon;
      if (fields.grid_sort) body.grid_sort = Number(fields.grid_sort);
      if (fields.empty_hint) body.empty_hint = fields.empty_hint;
    }
    try {
      await saveTaxonomy(apiBase, getToken, editor.table, editor.id, body);
      setEditor(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not update the list");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRetire(reason: string) {
    if (!retire) return;
    setBusy(true);
    try {
      await saveTaxonomy(apiBase, getToken, retire.table, retire.id, { retire: true, reason });
      setRetire(null);
      load();
    } catch (err) {
      if (err instanceof CategoriesRequestError && err.status === 409 && err.blocked_by) {
        setRetire({ ...retire, blocked: err.blocked_by });
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore(reason: string) {
    if (!restore) return;
    setBusy(true);
    try {
      await saveTaxonomy(apiBase, getToken, restore.table, restore.id, { restore: true, reason });
      setRestore(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-3.5 animate-pulse">
        <div className="grid grid-cols-3 gap-2">
          <div className="h-14 rounded-lg bg-surface-container" />
          <div className="h-14 rounded-lg bg-surface-container" />
          <div className="h-14 rounded-lg bg-surface-container" />
        </div>
        <div className="h-9 w-full rounded-lg bg-surface-container-low" />
        <div className="ml-4 h-9 w-11/12 rounded-lg bg-surface-container-low" />
        <div className="ml-8 h-9 w-10/12 rounded-lg bg-surface-container-low" />
        <div className="mt-1 h-20 rounded-xl bg-surface-container-low" />
      </div>
    );
  }

  if (status === "error" || !tree) {
    return (
      <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
        <div className="flex items-start gap-3 rounded-xl bg-surface-container-low p-4">
          <Icon name="sync_problem" className="text-[18px] text-error" />
          <div>
            <p className="text-xs font-semibold text-on-surface">Could not load categories. Nothing was changed.</p>
            <p className="mt-0.5 text-[11px] text-on-surface-variant">Database handshake timed out on the Kingston central mirror. Master records remain intact.</p>
          </div>
        </div>
        <button type="button" className="mt-4 rounded-lg bg-secondary px-4 py-2 text-xs font-semibold text-white" onClick={load}>Retry</button>
      </div>
    );
  }

  const place = tree.placeTypes.find((row) => selected?.table === "place_type" && row.slug === selected.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
        <span>Dominion</span>
        <span className="text-[11px] text-outline-variant">›</span>
        <span>Master data</span>
        <span className="text-[11px] text-outline-variant">›</span>
        <span>Places and Maps</span>
        <span className="text-[11px] text-outline-variant">›</span>
        <span className="font-semibold text-on-surface">Categories</span>
      </div>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="font-headline text-2xl font-bold tracking-tight text-on-surface">Categories</h1>
          <p className="text-xs leading-relaxed text-on-surface-variant">The groups, categories, place types, facilities and brands every app reads.</p>
        </div>
        {canWrite && (
          <div className="relative inline-flex">
            <div className="inline-flex overflow-hidden rounded-lg bg-secondary text-on-secondary shadow-sm">
              <button type="button" className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold hover:bg-secondary-dim" onClick={() => setMenu((open) => !open)}>
                <Icon name="add" className="text-[16px]" />
                <span>Add</span>
              </button>
              <div className="w-px bg-white/20" />
              <button type="button" className="flex items-center justify-center px-2 py-1.5 hover:bg-secondary-dim" onClick={() => setMenu((open) => !open)}>
                <Icon name="arrow_drop_down" className="text-[16px]" />
              </button>
            </div>
            {menu && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-xl bg-surface-container-lowest py-1.5 text-xs font-medium text-on-surface shadow-xl">
                <MenuItem label="Group" onClick={() => openCreate("category_group")} />
                <MenuItem label="Category" onClick={() => openCreate("category")} />
                <MenuItem label="Place type" onClick={() => openCreate("place_type")} />
                <MenuItem label="Facility type" onClick={() => openCreate("facility_type")} />
                <div className="my-1 h-px bg-surface-container-highest" />
                <MenuItem label="Brand" onClick={() => openCreate("brand")} />
              </div>
            )}
          </div>
        )}
      </div>
      {!canWrite && (
        <div className="flex items-center justify-between rounded-xl bg-surface-container p-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-highest text-outline">
              <Icon name="lock" className="text-[18px]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-on-surface">Staff Role Enforcement Active</span>
                <span className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-on-surface-variant">READ ONLY</span>
              </div>
              <span className="text-xs text-on-surface-variant">You can view categories. Only the owner can add, edit or retire.</span>
            </div>
          </div>
        </div>
      )}
      <div className="mb-2 flex gap-3.5 overflow-x-auto pb-1 md:grid md:grid-cols-5">
        <Kpi label="Groups" value={summary.groups} />
        <Kpi label="Categories" value={summary.categories} hint={`· ${summary.categories_in_use} in use`} hintClass="text-tertiary" />
        <Kpi label="Place types" value={summary.place_types} hint={`· ${summary.place_types_in_use} in use`} hintClass="text-tertiary" />
        <Kpi label="Facility types" value={summary.facility_types} hint={`· ${summary.facility_types_in_use} in use`} hintClass="text-tertiary" />
        <Kpi label="Brands" value={summary.brands} hint={`· logos ${summary.logos}`} hintClass="text-outline" />
      </div>
      <div className="mb-2 flex h-12 items-center gap-8 overflow-x-auto rounded-xl bg-surface-container-lowest px-4 shadow-sm">
        <TabButton active={tab === "tree"} onClick={() => setTab("tree")}>Tree</TabButton>
        <TabButton active={tab === "brands"} onClick={() => setTab("brands")}>Brands</TabButton>
        <TabButton active={tab === "retired"} onClick={() => setTab("retired")}>{retiredLabel}</TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>History</TabButton>
      </div>
      {tab === "tree" && (
        <div className="grid grid-cols-12 items-start gap-6">
          <TaxonomyTree tree={tree} selected={selected} onSelect={choose} />
          <div className="hidden lg:contents">
            <TaxonomyDetail
              tree={tree}
              selected={selected}
              changes={changes}
              canWrite={canWrite}
              onEdit={() => {
                if (!selected) return;
                if (place) {
                  openEdit("place_type", place.slug, {
                    label: place.label,
                    default_geofence_m: String(place.default_geofence_m),
                    default_facilities: (place.default_facilities || []).join(", "),
                    plug_label: place.plug_label || "",
                    plug_map_label: place.plug_map_label || "",
                    grid_icon: place.grid_icon || "",
                    grid_sort: place.grid_sort == null ? "" : String(place.grid_sort),
                    empty_hint: place.empty_hint || "",
                  });
                }
              }}
              onRetire={() => {
                if (!selected) return;
                const row = findBlocked(tree, selected);
                if (row) setRetire(row);
              }}
            />
          </div>
          {selected && (
            <div className="fixed inset-x-0 bottom-0 z-30 max-h-[50vh] overflow-y-auto rounded-t-2xl bg-surface-container-lowest p-4 shadow-xl lg:hidden">
              <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-surface-container-highest" />
              <TaxonomyDetail
                tree={tree}
                selected={selected}
                changes={changes}
                canWrite={canWrite}
                onEdit={() => {
                  if (!place) return;
                  openEdit("place_type", place.slug, {
                    label: place.label,
                    default_geofence_m: String(place.default_geofence_m),
                    default_facilities: (place.default_facilities || []).join(", "),
                    plug_label: place.plug_label || "",
                    plug_map_label: place.plug_map_label || "",
                    grid_icon: place.grid_icon || "",
                    grid_sort: place.grid_sort == null ? "" : String(place.grid_sort),
                    empty_hint: place.empty_hint || "",
                  });
                }}
                onRetire={() => {
                  const row = findBlocked(tree, selected);
                  if (row) setRetire(row);
                }}
              />
            </div>
          )}
        </div>
      )}
      {tab === "brands" && (
        <BrandsTable
          tree={tree}
          canWrite={canWrite}
          onAdd={() => openCreate("brand")}
          onEdit={(row: BrandRow) => openEdit("brand", row.id, {
            name: row.name,
            aliases: (row.aliases || []).join(", "),
            logo_url: row.logo_url || "",
            place_types: (row.place_types || []).join(", "),
          })}
          onRetire={(row) => setRetire({ table: "brand", id: row.id, label: row.name, blocked: row.blocked_by })}
        />
      )}
      {tab === "retired" && (
        <RetiredList rows={retired} canWrite={canWrite} onRestore={setRestore} />
      )}
      {tab === "history" && <TaxonomyHistory rows={history} />}
      {retire && (
        <RetireDialog
          label={retire.label}
          table={retire.table}
          id={retire.id}
          blocked={retire.blocked}
          busy={busy}
          onClose={() => setRetire(null)}
          onRetire={confirmRetire}
        />
      )}
      {restore && (
        <RestoreDialog
          label={restore.label}
          parentLabel={restore.parent}
          busy={busy}
          onClose={() => setRestore(null)}
          onRestore={confirmRestore}
        />
      )}
      {editor && (
        <TaxonomyEditDrawer
          table={editor.table}
          creating={!editor.id}
          initial={editor.initial}
          busy={busy}
          error={formError}
          onClose={() => setEditor(null)}
          onSave={onSave}
        />
      )}
    </div>
  );
}

function findBlocked(tree: AdminTaxonomy, selected: SelectedRef) {
  if (selected.table === "place_type") {
    const row = tree.placeTypes.find((item) => item.slug === selected.id);
    return row ? { table: selected.table, id: row.slug, label: row.label, blocked: row.blocked_by } : null;
  }
  if (selected.table === "facility_type") {
    const row = tree.facilityTypes.find((item) => item.slug === selected.id);
    return row ? { table: selected.table, id: row.slug, label: row.label, blocked: row.blocked_by } : null;
  }
  if (selected.table === "category") {
    const row = tree.categories.find((item) => item.code === selected.id);
    return row ? { table: selected.table, id: row.code, label: row.label, blocked: row.blocked_by } : null;
  }
  const row = tree.groups.find((item) => item.code === selected.id);
  return row ? { table: selected.table, id: row.code, label: row.label, blocked: row.blocked_by } : null;
}

function Kpi({ label, value, hint, hintClass = "" }: { label: string; value: number; hint?: string; hintClass?: string }) {
  return (
    <div className="flex min-w-[9.5rem] shrink-0 flex-col justify-between rounded-xl bg-surface-container-lowest p-3.5 shadow-sm md:min-w-0 md:shrink">
      <span className="font-label text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">{label}</span>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-xl font-bold tracking-tight text-on-surface">{value}</span>
        {hint && <span className={`font-mono text-[11px] font-medium ${hintClass}`}>{hint}</span>}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={`relative flex h-full items-center text-xs ${active ? "font-semibold text-secondary" : "font-medium text-on-surface-variant hover:text-on-surface"}`} onClick={onClick}>
      <span>{children}</span>
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-secondary" />}
    </button>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-container" onClick={onClick}>
      {label}
    </button>
  );
}
