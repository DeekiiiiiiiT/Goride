import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { normalizePartPositionSide } from "@roam/types/partPositionNorm";
import { useAuth } from "../../auth/AuthContext";
import {
  createVehicleOeNumber,
  deleteVehicleOeNumber,
  fetchPartMatchHealth,
  fetchVehicleDerivedFits,
  fetchVehicleOeNumbers,
  fetchVehicleOeRevisions,
  keepDerivedBatch,
  normalizeOeNumberPreview,
  removeDerivedBatch,
  resolveAutoMatchConflict,
  updateVehicleOeNumber,
} from "../../../services/partsAutoMatchApi";
import { fetchPartsBrowse } from "../parts-database/partsDatabaseApi";
import { goDominionPage, writeCatalogSearch } from "../parts-database/partsCatalogUrl";
import { formatCatalogProductionWindow, type VehicleCatalogRecord } from "../../../types/vehicleCatalog";

type TabId = "spec" | "factory" | "derived" | "audit";

function oeScopeKey(position: unknown, side: unknown): string {
  const norm = (v: unknown) => {
    if (v == null || v === "") return "any";
    const s = String(v).trim().toLowerCase();
    return s === "any" ? "any" : s;
  };
  return `${norm(position)}|${norm(side)}`;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source on file";
  }
}

function formatOeSideChip(side: unknown): string {
  const s = side == null || side === "" ? "both" : String(side).trim().toLowerCase();
  if (s === "left") return "L";
  if (s === "right") return "R";
  if (s === "both") return "Both";
  return "Both";
}

function formatPositionChip(position: unknown): string {
  if (position == null || position === "") return "—";
  const p = String(position).trim().toLowerCase();
  if (p === "front") return "Front";
  if (p === "rear") return "Rear";
  if (p === "any") return "Any";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function runDisplayNumber(runId: string | undefined): string {
  if (!runId) return "";
  const digits = runId.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return runId.slice(0, 4).toUpperCase();
}

function catalogStatusChip(record: VehicleCatalogRecord): { label: string; className: string } {
  if (record.source === "pending_approve") {
    return { label: "Pending catalog", className: "border-amber-600/30 bg-amber-500/10 text-amber-900 dark:text-amber-200" };
  }
  return { label: "Active catalog", className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-200" };
}

function pluralNumbers(count: number): string {
  return `${count} number${count === 1 ? "" : "s"} on file`;
}

function sysId(r: VehicleCatalogRecord): string {
  const make3 = (r.make || "XXX").slice(0, 3).toUpperCase();
  const chassis = (r.chassis_code || "GEN").replace(/\s+/g, "");
  const short = r.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `VEC-${make3}-${chassis}-${short}`;
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

function groupRows(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const key = String(row.part_type_name || row.maintenance_component_id || "Other");
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function VehicleAutoMatchTabs({
  record: r,
  onClose,
  onOpenPlatform,
  specCards,
}: {
  record: VehicleCatalogRecord;
  onClose: () => void;
  onOpenPlatform?: (platformId: string) => void;
  specCards: React.ReactNode;
}) {
  const { session, role } = useAuth();
  const token = session?.access_token ?? "";
  const owner = role === "platform_owner";
  const client = useQueryClient();
  const [tab, setTab] = useState<TabId>("spec");
  const [area, setArea] = useState("all");
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draftBrand, setDraftBrand] = useState("");
  const [draftNumber, setDraftNumber] = useState("");
  const [draftEvidence, setDraftEvidence] = useState("");
  const [draftPosition, setDraftPosition] = useState("front");
  const [draftSide, setDraftSide] = useState("both");
  const [draftComponentId, setDraftComponentId] = useState("");
  const [draftYearFrom, setDraftYearFrom] = useState("");
  const [draftYearTo, setDraftYearTo] = useState("");
  const [normPreview, setNormPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const platformId = (r as VehicleCatalogRecord & { platform_id?: string | null }).platform_id;

  const health = useQuery({
    queryKey: ["part-match-health", r.id],
    queryFn: () => fetchPartMatchHealth(token, r.id),
    enabled: Boolean(token),
  });
  const oe = useQuery({
    queryKey: ["vehicle-oe-numbers", r.id],
    queryFn: () => fetchVehicleOeNumbers(token, r.id),
    enabled: Boolean(token) && (tab === "factory" || tab === "spec"),
  });
  const derived = useQuery({
    queryKey: ["vehicle-derived-fits", r.id],
    queryFn: () => fetchVehicleDerivedFits(token, r.id),
    enabled: Boolean(token) && tab === "derived",
  });
  const revisions = useQuery({
    queryKey: ["vehicle-oe-revisions", r.id],
    queryFn: () => fetchVehicleOeRevisions(token, r.id),
    enabled: Boolean(token) && tab === "audit",
  });

  const yearLabel = formatCatalogProductionWindow(r);
  const designation = `${r.make} ${r.model} ${yearLabel}`.replace(/\s+/g, " ").trim();
  const trimTail = [r.catalog_trim, r.trim_series].filter(Boolean).join(" · ");
  const displayTitle = trimTail ? `${designation} · ${trimTail}` : designation;
  const chassisLabel = r.full_model_code || r.chassis_code || "—";

  const platformCode = (r as VehicleCatalogRecord & { platform_code?: string | null }).platform_code
    || (oe.data?.platformCode as string | undefined);
  const rows = oe.data?.rows ?? [];
  const browse = useQuery({
    queryKey: ["parts-browse-vehicle-oe"],
    queryFn: fetchPartsBrowse,
    enabled: Boolean(token) && panelOpen,
  });
  const componentOptions = useMemo(() => {
    const fromRows = rows.map((row) => ({
      id: String(row.maintenance_component_id || ""),
      label: String(row.part_type_name || row.op_code || "Component"),
    })).filter((row) => row.id);
    const fromBrowse = (browse.data?.systems ?? []).flatMap((sys) =>
      (sys.components ?? []).map((c) => ({ id: c.id, label: c.plainName })),
    );
    const map = new Map<string, { id: string; label: string }>();
    for (const opt of [...fromRows, ...fromBrowse]) map.set(opt.id, opt);
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, browse.data]);
  const areaChipList = useMemo(() => {
    return (oe.data as { areaChips?: Array<{ id: string; label: string; count: number }> } | undefined)?.areaChips ?? [];
  }, [oe.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (area !== "all") {
        const ids = Array.isArray(row.catalog_area_ids) ? row.catalog_area_ids as string[] : [];
        if (!ids.includes(area)) return false;
      }
      if (!q) return true;
      return [row.oe_number, row.part_type_name, row.oe_brand].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [rows, search, area]);

  const grouped = useMemo(() => groupRows(filtered), [filtered]);
  const factoryCount = rows.length;
  const derivedCount = Number(health.data?.derived?.live ?? 0) + Number(health.data?.derived?.needsChecking ?? 0);
  const statusChip = catalogStatusChip(r);
  const lastRun = oe.data?.lastRun || health.data?.lastRun;
  const lastErr = health.data?.lastRun?.error;
  const engineVersion = health.data?.engineVersion ?? 4;
  const crossRefLabel = `MATCH-V${engineVersion} ${lastErr ? "ERROR" : "OK"}`;
  const pollLabel = health.data?.enabled ? "POLL_INTERVAL: 60s" : "OFF";
  const runLabel = runDisplayNumber(String(lastRun?.run_id || ""));

  async function refreshNormPreview(number: string, brand: string) {
    if (!token || !number.trim()) {
      setNormPreview("");
      return;
    }
    try {
      const out = await normalizeOeNumberPreview(token, {
        brand,
        oe_number: number,
        position: draftPosition === "any" ? undefined : draftPosition,
        side: draftSide === "any" ? undefined : draftSide,
      });
      setNormPreview(String(out.oe_number_norm || ""));
    } catch {
      setNormPreview("");
    }
  }

  function openAddPanel() {
    setEditId(null);
    setDraftBrand(String(r.make || ""));
    setDraftNumber("");
    setDraftEvidence("");
    setDraftPosition("front");
    setDraftSide("both");
    setDraftComponentId(String(rows[0]?.maintenance_component_id || componentOptions[0]?.id || ""));
    setDraftYearFrom(r.production_start_year ? String(r.production_start_year) : "");
    setDraftYearTo(r.production_end_year ? String(r.production_end_year) : "");
    setNormPreview("");
    setPanelOpen(true);
  }

  function openEditPanel(row: Record<string, unknown>) {
    setEditId(String(row.id));
    setDraftBrand(String(row.oe_brand || r.make || ""));
    setDraftNumber(String(row.oe_number || ""));
    setDraftEvidence(String(row.evidence_url || ""));
    setDraftPosition(row.position == null || row.position === "" ? "any" : String(row.position));
    setDraftSide(row.side == null || row.side === "" ? "any" : String(row.side));
    setDraftComponentId(String(row.maintenance_component_id || ""));
    setDraftYearFrom(row.year_from != null ? String(row.year_from) : "");
    setDraftYearTo(row.year_to != null ? String(row.year_to) : "");
    setPanelOpen(true);
    void refreshNormPreview(String(row.oe_number || ""), String(row.oe_brand || ""));
  }

  function openFindPartsMatches() {
    goDominionPage("parts-catalog");
    writeCatalogSearch({ tab: "Find parts", variant: r.id, car: r.id }, "push");
  }

  function openImportCsv() {
    goDominionPage("parts-catalog");
    writeCatalogSearch({ tab: "Import" }, "push");
  }

  const duplicateOeWarning = useMemo(() => {
    if (!draftNumber.trim() || !draftComponentId) return "";
    const norm = normPreview || draftNumber.trim();
    const hit = rows.find((row) =>
      String(row.maintenance_component_id) === draftComponentId
      && String(row.oe_number_norm || row.oe_number || "").toLowerCase() === norm.toLowerCase()
      && oeScopeKey(row.position, row.side) === oeScopeKey(
        draftPosition === "any" ? null : draftPosition,
        draftSide === "any" ? null : draftSide,
      )
      && String(row.id) !== String(editId || ""),
    );
    if (!hit) return "";
    return `This number is already on this car for ${String(hit.part_type_name || "this part type")} · ${formatPositionChip(draftPosition === "any" ? null : draftPosition)}. Saving will create a revision entry.`;
  }, [draftNumber, draftComponentId, draftPosition, draftSide, normPreview, rows, editId]);

  async function saveOeNumber() {
    if (!owner || !token) return;
    if (!draftBrand.trim() || !draftNumber.trim() || !draftEvidence.trim()) {
      toast.message("Brand, number, and source link are required.");
      return;
    }
    if (!draftComponentId) {
      toast.message("Pick a part type first.");
      return;
    }
    if (duplicateOeWarning && !editId) {
      toast.error(duplicateOeWarning);
      return;
    }
    setBusy(true);
    try {
      const body = {
        oe_brand: draftBrand.trim(),
        oe_number: draftNumber.trim(),
        evidence_url: draftEvidence.trim(),
        position: draftPosition === "any" ? null : draftPosition,
        side: draftSide === "any" ? null : draftSide,
        maintenance_component_id: draftComponentId,
        year_from: draftYearFrom.trim() ? Number(draftYearFrom) : null,
        year_to: draftYearTo.trim() ? Number(draftYearTo) : null,
      };
      if (editId) {
        await updateVehicleOeNumber(token, r.id, editId, body);
        toast.success("Factory number updated");
      } else {
        await createVehicleOeNumber(token, r.id, body);
        toast.success("Factory number added");
      }
      setPanelOpen(false);
      await client.invalidateQueries({ queryKey: ["vehicle-oe-numbers", r.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function removeOeNumber(id: string) {
    if (!owner || !token) return;
    if (!window.confirm("Remove this factory number from the car record?")) return;
    setBusy(true);
    try {
      await deleteVehicleOeNumber(token, r.id, id);
      toast.success("Removed");
      await client.invalidateQueries({ queryKey: ["vehicle-oe-numbers", r.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="vehicle-factory-record mt-6 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-sm">
      <div className="border-b border-outline-variant/40 bg-surface-container-lowest px-space-xl py-space-lg">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap items-center gap-1 font-mono-sm text-mono-sm uppercase tracking-wider text-secondary">
            <span>DOMINION</span><span>/</span><span>MASTER DATA</span><span>/</span><span>VEHICLES</span><span>/</span>
            <span className="text-on-surface font-semibold">{r.make} {r.model} ({r.chassis_code || "—"})</span>
          </nav>
          <div className="flex items-center gap-2">
            <span className="rounded font-mono-sm text-mono-sm bg-surface-container px-2 py-0.5 text-on-surface-variant">SYS_ID: {sysId(r)}</span>
            <button type="button" className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface-variant" onClick={onClose} aria-label="Close">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div>
            <div className="flex flex-wrap items-baseline gap-space-sm">
              <h2 className="font-headline-xl text-headline-xl font-bold text-on-surface tracking-tight">{displayTitle}</h2>
              <span className="font-mono-md text-mono-md text-secondary">{chassisLabel}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded font-mono-sm text-mono-sm bg-surface-container px-2 py-0.5 text-on-surface-variant">
                {r.engine_code || "—"} · {r.engine_displacement_cc ? `${Math.round(Number(r.engine_displacement_cc))} cc` : "—"}
              </span>
              <span className="rounded font-mono-sm text-mono-sm bg-surface-container px-2 py-0.5 text-on-surface-variant">Chassis: {r.chassis_code || "—"}</span>
              {platformId ? (
                <button
                  type="button"
                  className="rounded font-mono-sm text-mono-sm bg-surface-container-high px-2 py-0.5 text-on-surface font-medium hover:bg-surface-variant"
                  onClick={() => onOpenPlatform?.(String(platformId))}
                >
                  Platform: {platformCode || "→"}
                </button>
              ) : null}
              {(r as { market?: string }).market ? (
                <span className="vehicle-market-chip rounded font-mono-sm text-mono-sm bg-secondary-container px-2 py-0.5 text-on-secondary-fixed font-semibold">{(r as { market?: string }).market}</span>
              ) : null}
              <span className={`inline-flex items-center gap-1.5 rounded font-mono-sm text-mono-sm border px-2 py-0.5 font-semibold ${statusChip.className}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${r.source === "pending_approve" ? "bg-amber-600" : "bg-emerald-600"}`} />
                Status: {statusChip.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-space-md bg-surface-container-low px-space-md py-space-sm rounded-lg">
            <div className="flex flex-col">
              <span className="font-mono-sm text-mono-sm text-secondary uppercase">OE Matching Engine</span>
              <span className="font-mono-md text-on-surface font-semibold flex items-center gap-1">
                {health.data?.enabled ? <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" /> : null}
                {pollLabel}
              </span>
            </div>
            <div className="w-px h-7 bg-outline-variant/40" />
            <div className="flex flex-col">
              <span className="font-mono-sm text-mono-sm text-secondary uppercase">Cross Ref Index</span>
              <span className="font-mono-md text-primary-container font-semibold">{crossRefLabel}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-space-lg border-t border-outline-variant/40 pt-3">
          {([
            ["spec", "Specification", null],
            ["factory", "Factory part numbers", factoryCount],
            ["derived", "Derived matches", derivedCount],
            ["audit", "Revision audit", null],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={`pb-2.5 text-body-md font-semibold flex items-center gap-2 relative ${tab === id ? "text-primary" : "text-secondary hover:text-on-surface"}`}
              onClick={() => setTab(id)}
            >
              {label}
              {count != null ? (
                <span className={`px-1.5 py-0.5 rounded-full font-mono-sm text-mono-sm ${tab === id ? "bg-primary-container text-on-primary" : "bg-surface-container text-on-surface-variant"}`}>{count}</span>
              ) : null}
              {tab === id ? <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-container rounded-t-full" /> : null}
            </button>
          ))}
        </div>
      </div>

      {tab === "spec" ? <div className="p-6">{specCards}</div> : null}

      {tab === "factory" ? (
        <div className="p-space-xl bg-background flex flex-col gap-space-lg">
          <div className="bg-surface-container-low px-space-lg py-space-sm rounded-lg flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-primary text-[20px]">info</span>
              <p className="font-body-sm text-body-sm">
                Numbers this car came with from the factory. Dominion uses them to match parts automatically across supplier datasets and tier interchange matrices.
              </p>
            </div>
            <div className="font-mono-sm text-mono-sm text-secondary whitespace-nowrap">
              LAST SYNC: {timeAgo(String(lastRun?.finished_at || lastRun?.started_at || "")).toUpperCase()}
              {runLabel ? ` · RUN #${runLabel}` : ""}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
            <div className="xl:col-span-8 flex flex-col gap-space-md">
              <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md">
                <div className="flex flex-wrap items-center gap-space-sm flex-1">
                  <input
                    className="min-w-[200px] flex-1 h-9 rounded-lg bg-surface px-3 text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest shadow-sm"
                    placeholder="Search part type or number…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {areaChipList.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={`h-8 px-2.5 rounded font-mono-sm text-mono-sm flex items-center gap-1 ${area === chip.id ? "bg-primary-container text-on-primary font-semibold" : "bg-surface-container hover:bg-surface-container-high text-on-surface"}`}
                      onClick={() => setArea(chip.id)}
                    >
                      {chip.label} <span className={area === chip.id ? "opacity-80" : "text-secondary"}>{chip.count}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`h-9 px-3.5 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-label-md inline-flex items-center gap-1.5 disabled:opacity-40 shrink-0 shadow-sm transition-colors ${panelOpen ? "ring-2 ring-primary/30" : ""}`}
                  disabled={!owner}
                  onClick={openAddPanel}
                >
                  <Plus className="h-4 w-4" /> Add number
                </button>
              </div>

              {oe.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading factory numbers…</p>
              ) : filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center bg-surface-container-lowest">
                  <p className="font-headline-md font-semibold text-on-surface">No factory numbers yet</p>
                  <p className="mt-2 text-body-sm text-secondary">Add a factory number or import from CSV.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button type="button" className="rounded-lg bg-primary-container px-3 py-2 text-sm font-semibold text-on-primary disabled:opacity-40" disabled={!owner} onClick={openAddPanel}>
                      + Add number
                    </button>
                    <button type="button" className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold text-on-surface" onClick={openImportCsv}>
                      Open Import CSV
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container-lowest shadow-sm">
                  <div className="factory-oe-grid bg-surface-container-low px-space-md py-2.5 font-label-xs uppercase tracking-wide text-secondary">
                    <div className="min-w-0">Position</div>
                    <div className="min-w-0">Side</div>
                    <div className="min-w-0">Brand</div>
                    <div className="min-w-0">Factory number</div>
                    <div className="min-w-0 font-mono-sm">Years</div>
                    <div className="min-w-0">Source</div>
                    <div className="min-w-0 text-center">Matches</div>
                    <div className="min-w-0 text-right">Actions</div>
                  </div>
                  {grouped.map(([partType, typeRows]) => {
                    const opCode = String(typeRows[0]?.op_code || "");
                    return (
                      <div key={partType}>
                        <div className="flex items-center justify-between bg-surface-container px-space-md py-2">
                          <span className="font-headline-md text-on-surface">{partType} · {pluralNumbers(typeRows.length)}</span>
                          <span className="font-mono-sm text-mono-sm text-on-surface-variant">CATEGORY: {opCode || partType}</span>
                        </div>
                        {typeRows.map((row) => {
                          const norm = normalizePartPositionSide(String(row.position || ""), String(row.side || ""));
                          const num = String(row.oe_number || "");
                          const matchCount = Number(row.match_count ?? 0);
                          const matching = Boolean(row.matching);
                          const superseded = String(row.supersession_note || "");
                          return (
                            <div key={String(row.id)} className="factory-oe-grid items-center border-t border-outline-variant/20 px-space-md py-3 text-body-sm hover:bg-surface-container-low transition-colors">
                              <div className="min-w-0">
                                <span className="px-1.5 py-0.5 rounded font-mono-sm bg-surface-container text-on-surface">{formatPositionChip(norm.position)}</span>
                              </div>
                              <div className="min-w-0">
                                <span className="px-1.5 py-0.5 rounded font-mono-sm bg-surface-container text-secondary">{formatOeSideChip(norm.side)}</span>
                              </div>
                              <div className="min-w-0 text-on-surface">{String(row.oe_brand || "")}</div>
                              <div className="min-w-0 font-mono-lg text-on-surface">
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold tracking-wide">{num}</span>
                                  <button type="button" className="text-outline hover:text-on-surface" onClick={() => { void navigator.clipboard.writeText(num); toast.success("Copied"); }}>
                                    <Copy className="inline h-3.5 w-3.5" />
                                  </button>
                                </div>
                                {superseded ? (
                                  <div className="font-mono-sm text-secondary pt-0.5 flex flex-wrap gap-1">
                                    <span>↳ Changed to</span>
                                    <span className="font-semibold text-primary">{superseded.replace(/.*?(?:to|with)\s+/i, "").split(/[·.]/)[0]?.trim() || superseded}</span>
                                    {/interchange/i.test(superseded) ? <span>· fully interchangeable</span> : null}
                                  </div>
                                ) : null}
                              </div>
                              <div className="min-w-0 font-mono-sm text-on-surface">{row.year_from || row.year_to ? `${row.year_from || "…"}–${row.year_to || "…"}` : "All years"}</div>
                              <div className="min-w-0">
                                {row.evidence_url ? (
                                  <a className="text-primary font-mono-sm inline-flex items-center gap-0.5 hover:underline truncate max-w-full" href={String(row.evidence_url)} target="_blank" rel="noreferrer">
                                    {hostLabel(String(row.evidence_url))} <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : null}
                              </div>
                              <div className="min-w-0 flex justify-center pr-2">
                                {matching ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-mono-sm whitespace-nowrap">
                                    <span className="w-2.5 h-2.5 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                    Matching…
                                  </span>
                                ) : (
                                  <button type="button" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-container/10 hover:bg-primary-container/20 text-primary-container font-mono-sm font-semibold whitespace-nowrap" onClick={openFindPartsMatches}>
                                    {matchCount} parts →
                                  </button>
                                )}
                              </div>
                              <div className="min-w-0 flex justify-end gap-1 text-secondary">
                                <button type="button" className="w-7 h-7 rounded hover:bg-surface-container disabled:opacity-40" disabled={!owner} onClick={() => openEditPanel(row)}><Pencil className="h-4 w-4" /></button>
                                <button type="button" className="w-7 h-7 rounded hover:bg-surface-container text-error disabled:opacity-40" disabled={!owner || busy} onClick={() => { void removeOeNumber(String(row.id)); }}><Trash2 className="h-4 w-4" /></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-surface-container-low p-space-md rounded-lg flex items-center gap-space-sm text-secondary">
                <span className="material-symbols-outlined text-primary text-[20px]">verified_user</span>
                <span className="font-body-sm text-body-sm">
                  Numbers added here are matched within a minute. Removed numbers remove their automatic matches; your own listings are never touched.
                </span>
              </div>
            </div>

            {panelOpen ? (
              <div className="xl:col-span-4 bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-lg p-space-lg flex flex-col gap-space-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1 font-mono-sm text-secondary font-semibold uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
                      Active workflow panel
                    </div>
                    <h3 className="font-headline-lg text-on-surface pt-0.5">{editId ? "Edit factory number" : "Add factory part number"}</h3>
                    <span className="font-mono-sm text-secondary">Target: {r.make} {r.model} ({r.chassis_code || "—"})</span>
                  </div>
                  <button type="button" className="w-7 h-7 rounded-lg bg-surface-container hover:bg-surface-container-high text-secondary flex items-center justify-center" onClick={() => setPanelOpen(false)}>
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
                <label className="flex flex-col gap-1 font-label-xs uppercase text-secondary">
                  Part type
                  <select className="h-9 rounded-lg bg-surface px-3 text-body-md text-on-surface" value={draftComponentId} onChange={(e) => setDraftComponentId(e.target.value)}>
                    <option value="">Pick part type…</option>
                    {componentOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-space-sm">
                  <label className="flex flex-col gap-1 font-label-xs uppercase text-secondary">
                    Position
                    <div className="grid grid-cols-3 p-0.5 bg-surface-container rounded-lg font-mono-sm">
                      {(["front", "rear", "any"] as const).map((p) => (
                        <button key={p} type="button" className={`py-1 rounded ${draftPosition === p ? "bg-surface-container-lowest text-primary font-semibold shadow-sm" : "text-secondary"}`} onClick={() => setDraftPosition(p)}>
                          {p === "any" ? "Any" : p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 font-label-xs uppercase text-secondary">
                    Side
                    <div className="grid grid-cols-4 p-0.5 bg-surface-container rounded-lg font-mono-sm">
                      {([["left", "L"], ["right", "R"], ["both", "Both"], ["any", "Any"]] as const).map(([val, label]) => (
                        <button key={val} type="button" className={`py-1 rounded ${draftSide === val ? "bg-surface-container-lowest text-primary font-semibold shadow-sm" : "text-secondary"}`} onClick={() => setDraftSide(val)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
                <label className="flex flex-col gap-1 font-label-xs uppercase text-secondary">
                  Maker / brand
                  <input className="h-9 rounded-lg bg-surface-container-low px-3 text-body-md text-on-surface" value={draftBrand} onChange={(e) => setDraftBrand(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between font-label-xs uppercase text-secondary">
                    <span>Factory part number</span>
                    {normPreview ? (
                      <span className="font-mono-sm text-mono-sm normal-case rounded px-2 py-0.5 bg-primary-container/10 text-primary font-semibold">
                        CLEANED MATCH ON
                      </span>
                    ) : null}
                  </div>
                  <input
                    className="h-9 rounded-lg bg-surface px-3 font-mono-md text-on-surface"
                    value={draftNumber}
                    onChange={(e) => {
                      setDraftNumber(e.target.value);
                      void refreshNormPreview(e.target.value, draftBrand);
                    }}
                  />
                  {normPreview ? (
                    <div className="flex justify-between font-mono-sm text-secondary px-1 pt-0.5">
                      <span>Canonical format: <strong className="text-on-surface">{normPreview}</strong></span>
                      <span className="text-primary font-medium">{draftNumber.trim().length} chars valid</span>
                    </div>
                  ) : null}
                  {duplicateOeWarning ? (
                    <div className="mt-1 p-2 bg-error/10 rounded-lg flex items-start gap-1.5 text-error font-body-sm">
                      <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                      <span>{duplicateOeWarning}</span>
                    </div>
                  ) : null}
                </label>
                <label className="flex flex-col gap-1 font-label-xs uppercase text-secondary">
                  Years active (from / to)
                  <div className="grid grid-cols-2 gap-space-sm">
                    <input className="h-9 rounded-lg bg-surface px-3 font-mono-md text-on-surface text-center" placeholder="From (YYYY)" value={draftYearFrom} onChange={(e) => setDraftYearFrom(e.target.value)} />
                    <input className="h-9 rounded-lg bg-surface px-3 font-mono-md text-on-surface text-center" placeholder="To (YYYY)" value={draftYearTo} onChange={(e) => setDraftYearTo(e.target.value)} />
                  </div>
                  <span className="font-body-sm text-secondary normal-case">Leave blank to apply to all production years.</span>
                </label>
                <label className="flex flex-col gap-1 font-label-xs uppercase text-secondary">
                  Parts Catalogue Reference URL
                  <input className="h-9 rounded-lg bg-surface px-3 text-body-md" placeholder="https://…" value={draftEvidence} onChange={(e) => setDraftEvidence(e.target.value)} />
                </label>
                <div className="flex gap-2 pt-1">
                  <button type="button" className="flex-1 h-9 rounded-lg border border-outline-variant text-on-surface" onClick={() => setPanelOpen(false)}>Cancel</button>
                  <button type="button" className="flex-1 h-9 rounded-lg bg-primary-container text-on-primary font-semibold disabled:opacity-40" disabled={!owner || busy} onClick={() => { void saveOeNumber(); }}>
                    Save number
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "derived" ? (
        <div className="p-6">
          {derived.isLoading ? <p className="text-sm text-slate-500">Loading derived matches…</p> : null}
          {!derived.isLoading && (derived.data?.rows?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-600">Derived matches for this car appear here after the engine runs. Live: {health.data?.derived?.live ?? 0} · Needs checking: {health.data?.derived?.needsChecking ?? 0}</p>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr><th className="px-3 py-2">Part</th><th className="px-3 py-2">Matched key</th><th className="px-3 py-2">Match status</th><th className="px-3 py-2">Actions</th></tr>
                </thead>
                <tbody>
                  {(derived.data?.rows ?? []).map((row) => (
                    <tr key={String(row.id)} className="border-t border-slate-100">
                      <td className="px-3 py-2">{String(row.part_name || "")}</td>
                      <td className="px-3 py-2 font-mono">{String(row.matched_key || "")}</td>
                      <td className="px-3 py-2">{String(row.match_status || row.status || "")}</td>
                      <td className="px-3 py-2">
                        <button type="button" className="text-primary font-semibold disabled:opacity-40" disabled={!owner} onClick={() => {
                          const note = window.prompt("Note for audit trail (required):")?.trim();
                          if (!note) return;
                          void keepDerivedBatch(token, [String(row.id)], note).then(() => {
                            toast.success("Kept");
                            void derived.refetch();
                          }).catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
                        }}>Keep</button>
                        {" · "}
                        <button type="button" className="text-secondary disabled:opacity-40" disabled={!owner} onClick={() => {
                          const note = window.prompt("Note for audit trail (required):")?.trim();
                          if (!note) return;
                          const run = row.conflict_id
                            ? resolveAutoMatchConflict(token, String(row.conflict_id), "remove", note)
                            : removeDerivedBatch(token, [String(row.id)], note);
                          void run.then(() => {
                            toast.success("Removed");
                            void derived.refetch();
                          }).catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
                        }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="p-6">
          {revisions.isLoading ? <p className="text-sm text-slate-500">Loading revision audit…</p> : null}
          {(revisions.data?.rows?.length ?? 0) === 0 && !revisions.isLoading ? (
            <p className="text-sm text-slate-600">Revision audit entries are recorded when factory numbers change.</p>
          ) : (
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 uppercase text-slate-500">
                <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Field</th><th className="px-3 py-2">From</th><th className="px-3 py-2">To</th></tr>
              </thead>
              <tbody>
                {(revisions.data?.rows ?? []).map((row) => (
                  <tr key={String(row.id)} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.created_at ? new Date(String(row.created_at)).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2">{String(row.field_name || "—")}</td>
                    <td className="px-3 py-2 font-mono">{String(row.old_value || "—")}</td>
                    <td className="px-3 py-2 font-mono">{String(row.new_value || "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </section>
  );
}
