// Stitch: dominion-redesign/S42l
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../../../utils/supabase/client";
import { useAuth } from "../../../auth/AuthContext";
import { partsEnterpriseApi } from "../../../../services/partSourcingService";
import {
  deleteUniversalPart,
  fetchMasterSearch,
  fetchPartsOverview,
  fetchSameModel,
  fetchVehicleOptions,
  type MasterPartRow,
  type SisterFamilyRow,
  type UniversalCatalogRow,
} from "../partsDatabaseApi";
import { PartsError, PartsLoading } from "../PartsDatabaseStates";
import { readCatalogFilters, writeCatalogSearch, type CatalogMatch } from "../partsCatalogUrl";
import { FullDatabaseDrawer } from "./FullDatabaseDrawer";
import { FullDatabaseFilterPanel } from "./FullDatabaseFilterPanel";
import { FullDatabaseGroupedTable } from "./FullDatabaseGroupedTable";
import { FullDatabaseSummaryBar } from "./FullDatabaseSummaryBar";
import { SisterFamiliesSection } from "./SisterFamiliesSection";
import { UniversalPartsSection } from "./UniversalPartsSection";

const PAGE_SIZE = 25;
const EMPTY_COUNTS = { all: 0, oem: 0, sister: 0, engine: 0, aftermarket: 0, universal: 0 };

export function FullDatabaseTab({
  onAddPart,
  onEditPart,
}: {
  onAddPart: () => void;
  onEditPart: (groupId: string | null) => void;
}) {
  const { role } = useAuth();
  const owner = role === "platform_owner";
  const client = useQueryClient();
  const initial = readCatalogFilters();
  const [draft, setDraft] = useState(initial.q);
  const [q, setQ] = useState(initial.q);
  const [match, setMatch] = useState<CatalogMatch>(initial.match);
  const [brands, setBrands] = useState(initial.brand ? initial.brand.split(",").filter(Boolean) : []);
  const [assembly, setAssembly] = useState(initial.assembly);
  const [variant, setVariant] = useState(initial.variant);
  const [status, setStatus] = useState(initial.status);
  const [make, setMake] = useState(initial.make);
  const [model, setModel] = useState(initial.model);
  const [year, setYear] = useState(initial.year);
  const [page, setPage] = useState(initial.p);
  const [openId, setOpenId] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [familyEditor, setFamilyEditor] = useState<"new" | "add" | "remove" | "">("");
  const [universalEditor, setUniversalEditor] = useState<"add" | "edit" | "">("");
  const [universalEditId, setUniversalEditId] = useState("");
  const [viewUniversal, setViewUniversal] = useState<UniversalCatalogRow | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const overview = useQuery({ queryKey: ["parts-overview"], queryFn: fetchPartsOverview, retry: false });

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(draft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    if (!variant || make) return;
    let cancelled = false;
    void fetchSameModel(variant).then((data) => {
      if (cancelled) return;
      const row = data.items.find((item) => item.id === variant) ?? data.items[0];
      if (!row) return;
      setMake(row.make);
      setModel(row.model);
      setYear(row.production_start_year ? String(row.production_start_year) : "");
      setVariant("");
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [variant, make]);

  useEffect(() => {
    writeCatalogSearch({
      tab: "Full database",
      q: q || null,
      match: match === "all" ? null : match,
      brand: brands.join(",") || null,
      assembly: assembly || null,
      variant: variant || null,
      status: status || null,
      make: make || null,
      model: model || null,
      year: year || null,
      p: page > 1 ? String(page) : null,
    }, "replace");
  }, [q, match, brands, assembly, variant, status, make, model, year, page]);

  const makesQuery = useQuery({ queryKey: ["vehicle-options", ""], queryFn: () => fetchVehicleOptions({}) });
  const modelsQuery = useQuery({
    queryKey: ["vehicle-options", make],
    queryFn: () => fetchVehicleOptions({ make }),
    enabled: Boolean(make),
  });
  const yearsQuery = useQuery({
    queryKey: ["vehicle-options", make, model],
    queryFn: () => fetchVehicleOptions({ make, model }),
    enabled: Boolean(make && model),
  });

  const search = useQuery({
    queryKey: ["catalog-master", q, match, brands.join(","), assembly, variant, status, make, model, year, page],
    queryFn: async () => {
      const started = performance.now();
      const data = await fetchMasterSearch({
        q,
        match,
        brand: brands.join(","),
        assembly,
        variantId: variant,
        status,
        make,
        model,
        year,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setLatencyMs(Math.max(1, Math.round(performance.now() - started)));
      return data;
    },
  });

  const counts = search.data?.chips ?? EMPTY_COUNTS;
  const groups = search.data?.groups;
  const parts = useMemo(() => ({
    oem: (groups?.oem ?? search.data?.rows?.filter((row) => row.tier === 1) ?? []) as MasterPartRow[],
    engine: (groups?.engine ?? search.data?.rows?.filter((row) => row.tier === 3) ?? []) as MasterPartRow[],
    aftermarket: (groups?.aftermarket ?? search.data?.rows?.filter((row) => row.tier === 4) ?? []) as MasterPartRow[],
  }), [groups, search.data?.rows]);
  const sisters = (groups?.sister ?? []) as SisterFamilyRow[];
  const universals = (groups?.universal ?? []) as UniversalCatalogRow[];
  const emptyTiers = search.data?.emptyTiers ?? [];
  const activeFilterCount = [q, make, model, year, assembly, status, match !== "all" ? match : "", brands.length ? "brand" : ""].filter(Boolean).length;

  const chips = [
    make ? { id: "make", label: make } : null,
    model ? { id: "model", label: model } : null,
    year ? { id: "year", label: year } : null,
    assembly ? { id: "assembly", label: assembly } : null,
    ...brands.map((name) => ({ id: `brand:${name}`, label: name })),
    status === "verified" ? { id: "status", label: "Verified" } : null,
    status === "needs_checking" ? { id: "status", label: "Needs checking" } : null,
  ].filter((chip): chip is { id: string; label: string } => Boolean(chip));

  function reset() {
    setDraft("");
    setQ("");
    setMatch("all");
    setBrands([]);
    setAssembly("");
    setVariant("");
    setStatus("");
    setMake("");
    setModel("");
    setYear("");
    setPage(1);
  }

  function removeChip(id: string) {
    setPage(1);
    if (id === "make") { setMake(""); setModel(""); setYear(""); setVariant(""); return; }
    if (id === "model") { setModel(""); setYear(""); return; }
    if (id === "year") { setYear(""); return; }
    if (id === "assembly") { setAssembly(""); return; }
    if (id === "status") { setStatus(""); return; }
    if (id.startsWith("brand:")) setBrands((current) => current.filter((name) => name !== id.slice(6)));
  }

  async function removePart(row: MasterPartRow) {
    if (!owner) return;
    if (!window.confirm(`Remove ${row.name || "this part"} from the catalog?`)) return;
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      await partsEnterpriseApi.decidePart(token, row.partId, "rejected");
      toast.success("Part removed");
      await client.invalidateQueries({ queryKey: ["catalog-master"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove that part");
    }
  }

  async function removeUniversal(row: UniversalCatalogRow) {
    if (!owner) return;
    if (!window.confirm(`Delete ${row.name || "this size-based part"}?`)) return;
    try {
      await deleteUniversalPart(row.id);
      toast.success("Size-based part deleted");
      await client.invalidateQueries({ queryKey: ["catalog-master"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that part");
    }
  }

  const brandCounts = search.data?.facets?.brandCounts;
  const brandChoices = brandCounts?.length
    ? brandCounts
    : (search.data?.facets?.brands ?? []).map((name) => ({ name, count: 0 }));
  const areas = search.data?.facets?.areaCounts ?? (search.data?.facets?.assemblies ?? []).map((name) => ({ name, count: 0 }));
  const reportedStatus = search.data?.facets?.statusCounts;
  const statusCounts = reportedStatus
    ? {
        all: reportedStatus.verified + reportedStatus.needs_checking,
        verified: reportedStatus.verified,
        needs_checking: reportedStatus.needs_checking,
      }
    : {
        all: counts.oem + counts.engine + counts.aftermarket,
        verified: 0,
        needs_checking: 0,
      };
  const title = make || model ? [make, model, year].filter(Boolean).join(" ") : "Whole database";
  const changedAt = overview.data?.lastCatalogChangeAt;
  const changedLabel = changedAt
    ? new Date(changedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase()
    : "—";
  const indexLabel = `INDEX ${changedLabel} · ${latencyMs == null ? "—" : `${latencyMs}MS`} LATENCY`;

  return (
    <div className="full-database">
      <div className="px-margin pt-space-md lg:hidden">
        <button type="button" className="h-9 px-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest font-body-sm" onClick={() => setFiltersOpen(true)}>
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
      </div>
      <div className="p-margin flex items-start gap-space-lg">
        <aside className={`${filtersOpen ? "fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-y-auto rounded-t-xl shadow-2xl" : "hidden"} lg:flex lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:w-[280px] lg:shrink-0 lg:rounded-xl lg:shadow-sm w-full bg-surface-container-lowest border border-outline-variant/40 p-space-md flex-col`}>
          <div className="lg:hidden flex justify-end mb-2">
            <button type="button" className="text-secondary" onClick={() => setFiltersOpen(false)}>Close</button>
          </div>
          <FullDatabaseFilterPanel
            draft={draft}
            onDraft={(value) => { setDraft(value); setPage(1); }}
            make={make}
            model={model}
            year={year}
            makes={makesQuery.data?.makes ?? []}
            models={make ? (modelsQuery.data?.models ?? []) : []}
            years={model ? (yearsQuery.data?.years ?? []) : []}
            onMake={(value) => { setMake(value); setModel(""); setYear(""); setVariant(""); setPage(1); }}
            onModel={(value) => { setModel(value); setYear(""); setPage(1); }}
            onYear={(value) => { setYear(value); setPage(1); }}
            match={match}
            counts={counts}
            onMatch={(value) => { setMatch(value); setPage(1); setFiltersOpen(false); }}
            assembly={assembly}
            areas={areas}
            onAssembly={(value) => { setAssembly(value); setPage(1); }}
            brands={brands}
            brandChoices={brandChoices}
            onToggleBrand={(name) => { setBrands((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]); setPage(1); }}
            status={status}
            statusCounts={statusCounts}
            onStatus={(value) => { setStatus(value); setPage(1); }}
            onReset={reset}
          />
        </aside>
        <div className="flex-1 flex flex-col gap-space-md min-w-0">
          <FullDatabaseSummaryBar title={title} total={search.data?.total ?? 0} chips={chips} onRemove={removeChip} indexLabel={indexLabel} />
          {search.isLoading ? <PartsLoading /> : null}
          {search.isError ? <PartsError message="Could not load the catalogue. Nothing was changed." onRetry={() => { void search.refetch(); }} /> : null}
          {q && (search.data?.total ?? 0) === 0 && !search.isLoading ? (
            <div className="w-full p-space-xl rounded-xl bg-surface-container-lowest border border-outline-variant/40 text-center flex flex-col items-center gap-2">
              <h3 className="font-headline-md font-semibold">Nothing matches &apos;{q}&apos;.</h3>
              <div className="flex gap-2">
                <button type="button" className="px-4 h-9 rounded-xl border border-outline-variant/60" onClick={reset}>Reset filters</button>
                <button type="button" className="px-4 h-9 rounded-xl bg-primary-container text-on-primary font-semibold disabled:opacity-40" disabled={!owner} title={owner ? undefined : "Only the owner can change parts."} onClick={onAddPart}>Add a part</button>
              </div>
            </div>
          ) : null}
          {search.data && !search.isLoading ? (
            <FullDatabaseGroupedTable
              match={match}
              parts={parts}
              sisters={sisters}
              universals={universals}
              counts={counts}
              emptyTiers={emptyTiers}
              total={search.data.total ?? 0}
              page={page}
              pageSize={PAGE_SIZE}
              owner={owner}
              onPage={setPage}
              onView={setOpenId}
              onEdit={(row) => onEditPart(row.groupId)}
              onDelete={(row) => { void removePart(row); }}
              onNewFamily={() => setFamilyEditor("new")}
              onAddCar={() => setFamilyEditor("add")}
              onRemoveCar={() => setFamilyEditor("remove")}
              onAddUniversal={() => { setUniversalEditId(""); setUniversalEditor("add"); }}
              onEditUniversal={(row) => { setUniversalEditId(row.id); setUniversalEditor("edit"); }}
              onDeleteUniversal={(row) => { void removeUniversal(row); }}
              onViewUniversal={setViewUniversal}
              onAddEngine={onAddPart}
            />
          ) : null}
          {search.data && !search.isLoading ? (
            <div className="w-full p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shadow-sm">
              <div className="flex items-start gap-2 text-secondary font-body-sm text-body-sm">
                <span className="material-symbols-outlined text-primary text-[20px]">verified_user</span>
                <span><strong className="font-semibold text-on-surface">Catalog notice:</strong> Master catalog dataset is stripped of customer pricing and sensitive trade terms. Zero PII stored.</span>
              </div>
              <div className="flex items-center gap-2 font-mono-sm text-mono-sm shrink-0">
                <span className="text-secondary">SYSTEM ROLE:</span>
                <span className="px-2 py-0.5 rounded bg-surface-container font-bold text-primary">{owner ? "OWNER_RW" : "STAFF"}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {familyEditor ? (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-4" onClick={() => setFamilyEditor("")}>
          <div className="w-full max-w-xl max-h-[80vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <SisterFamiliesSection owner={owner} editorOnly onDismiss={() => { setFamilyEditor(""); void client.invalidateQueries({ queryKey: ["catalog-master"] }); }} />
          </div>
        </div>
      ) : null}
      {universalEditor ? (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-4" onClick={() => setUniversalEditor("")}>
          <div className="w-full max-w-xl" onClick={(event) => event.stopPropagation()}>
            <UniversalPartsSection owner={owner} editorOnly startId={universalEditId} onDismiss={() => { setUniversalEditor(""); setUniversalEditId(""); void client.invalidateQueries({ queryKey: ["catalog-master"] }); }} />
          </div>
        </div>
      ) : null}
      {viewUniversal ? (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-4" onClick={() => setViewUniversal(null)}>
          <div className="w-full max-w-md rounded-xl bg-surface-container-lowest border border-outline-variant/40 p-space-lg flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono-sm text-primary font-bold">{viewUniversal.number || "No number"}</p>
                <h2 className="font-headline-md font-bold text-on-surface">{viewUniversal.name || "Part"}</h2>
              </div>
              <button type="button" className="text-secondary" onClick={() => setViewUniversal(null)}>Close</button>
            </div>
            <p className="font-body-sm text-secondary">{viewUniversal.brand || "No brand"} · {viewUniversal.fits || "No size on file"}</p>
            {viewUniversal.source ? <a className="text-primary font-body-sm hover:underline" href={viewUniversal.source} target="_blank" rel="noreferrer">{viewUniversal.source}</a> : <p className="font-body-sm text-secondary">No source link yet.</p>}
          </div>
        </div>
      ) : null}
      {openId ? (
        <FullDatabaseDrawer
          partId={openId}
          onClose={() => setOpenId("")}
          onAddCar={() => {
            const row = [...parts.oem, ...parts.engine, ...parts.aftermarket].find((item) => item.partId === openId);
            onEditPart(row?.groupId ?? null);
          }}
          onEdit={() => {
            const row = [...parts.oem, ...parts.engine, ...parts.aftermarket].find((item) => item.partId === openId);
            onEditPart(row?.groupId ?? null);
          }}
        />
      ) : null}
    </div>
  );
}
