import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatPartPositionSideLabel, normalizePartPositionSide } from "@roam/types/partPositionNorm";
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
  resolveAutoMatchConflict,
  updateVehicleOeNumber,
} from "../../../services/partsAutoMatchApi";
import { fetchPartsBrowse } from "../parts-database/partsDatabaseApi";
import { goDominionPage, writeCatalogSearch } from "../parts-database/partsCatalogUrl";
import { formatCatalogProductionWindow, type VehicleCatalogRecord } from "../../../types/vehicleCatalog";

type TabId = "spec" | "factory" | "derived" | "audit";

const AREA_CHIPS = [
  { id: "all", label: "All" },
  { id: "brakes", label: "Brakes", match: (row: Record<string, unknown>) => /^(BRK|PAD|DSC|ROT)/i.test(String(row.op_code || "")) || /brake|pad|disc|rotor/i.test(String(row.part_type_name || "")) },
  { id: "engine", label: "Engine", match: (row: Record<string, unknown>) => /^(ENG|BLT|SPK|GSK)/i.test(String(row.op_code || "")) || /engine|belt|spark|gasket/i.test(String(row.part_type_name || "")) },
  { id: "filters", label: "Filters", match: (row: Record<string, unknown>) => /^(FLT|OIL)/i.test(String(row.op_code || "")) || /filter|oil/i.test(String(row.part_type_name || "")) },
  { id: "suspension", label: "Suspension", match: (row: Record<string, unknown>) => /^(SUS|SHK|STR)/i.test(String(row.op_code || "")) || /susp|shock|strut/i.test(String(row.part_type_name || "")) },
  { id: "fluids", label: "Fluids", match: (row: Record<string, unknown>) => /^(FLU|CLT)/i.test(String(row.op_code || "")) || /fluid|coolant/i.test(String(row.part_type_name || "")) },
] as const;

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

function catalogStatusChip(r: VehicleCatalogRecord): { label: string; className: string } {
  const lifecycle = String((r as { catalog_status?: string }).catalog_status || (r as { lifecycle?: string }).lifecycle || "").toLowerCase();
  if (lifecycle.includes("pending") || lifecycle === "draft") {
    return { label: "Pending approval", className: "border-amber-200 bg-amber-50 text-amber-900" };
  }
  if (lifecycle.includes("archived") || lifecycle === "inactive") {
    return { label: "Archived", className: "border-slate-200 bg-slate-100 text-slate-700" };
  }
  return { label: "Active catalog", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
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

  const titleModel = [r.model, r.catalog_trim].filter(Boolean).join(" ") || r.model;
  const yearLabel = formatCatalogProductionWindow(r);
  const title = `${r.make} ${titleModel} ${yearLabel}${r.trim_series ? ` · ${r.trim_series}` : ""}${r.full_model_code ? ` · ${r.full_model_code}` : ""}`;

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
  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length };
    for (const chip of AREA_CHIPS) {
      if (chip.id === "all") continue;
      counts[chip.id] = rows.filter((row) => chip.match(row)).length;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const name = String(row.part_type_name || "");
      if (area !== "all") {
        const chip = AREA_CHIPS.find((c) => c.id === area);
        if (chip && chip.id !== "all" && !chip.match(row)) return false;
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
  const engineLive = health.data?.enabled ? "Live" : "Off";
  const lastErr = health.data?.lastRun?.error;

  async function refreshNormPreview(number: string, brand: string) {
    if (!token || !number.trim()) {
      setNormPreview("");
      return;
    }
    try {
      const out = await normalizeOeNumberPreview(token, {
        brand,
        oe_number: number,
        position: draftPosition,
        side: draftSide,
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
    setDraftPosition(String(row.position || "front"));
    setDraftSide(String(row.side || "both"));
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
      && String(row.id) !== String(editId || ""),
    );
    if (!hit) return "";
    return `This factory number is already on file for ${String(hit.part_type_name || "this part type")}.`;
  }, [draftNumber, draftComponentId, normPreview, rows, editId]);

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
        position: draftPosition,
        side: draftSide,
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
    <section className="mt-6 overflow-hidden rounded-[0.75rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/90 px-6 py-4">
        <nav className="mb-3 flex flex-wrap items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          <span>DOMINION</span><span>/</span><span>MASTER DATA</span><span>/</span><span>VEHICLES</span><span>/</span>
          <span className="text-slate-800">{r.make} {r.model} ({r.chassis_code || "—"})</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] text-slate-500">SYS_ID {sysId(r)}</p>
            <h2 className="font-headline text-lg font-bold text-slate-900">{title}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-[0.25rem] border border-slate-200 bg-white px-2 py-0.5 text-[11px]">
                {r.engine_code || "—"} · {r.engine_displacement_cc ? `${Math.round(Number(r.engine_displacement_cc))} cc` : "—"}
              </span>
              <span className="rounded-[0.25rem] border border-slate-200 bg-white px-2 py-0.5 text-[11px]">Chassis {r.chassis_code || "—"}</span>
              {platformId ? (
                <button
                  type="button"
                  className="rounded-[0.25rem] border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800"
                  onClick={() => onOpenPlatform?.(String(platformId))}
                >
                  Platform {platformCode ? platformCode : "→"}
                </button>
              ) : null}
              {(r as { market?: string }).market ? (
                <span className="rounded-[0.25rem] border border-slate-200 px-2 py-0.5 text-[11px]">{(r as { market?: string }).market}</span>
              ) : null}
              <span className={`rounded-[0.25rem] border px-2 py-0.5 text-[11px] ${statusChip.className}`}>{statusChip.label}</span>
            </div>
          </div>
          <button type="button" className="rounded-[0.25rem] p-1 text-slate-400 hover:bg-slate-200/60" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[0.5rem] border border-slate-200 bg-white p-3 text-xs">
            <div className="font-semibold uppercase tracking-wider text-slate-500">OE matching engine</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className={`rounded-[0.25rem] px-2 py-0.5 font-mono ${health.data?.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100"}`}>
                {engineLive}
              </span>
              <span className="text-slate-600">Last run {timeAgo(String(lastRun?.finished_at || lastRun?.started_at || ""))}</span>
            </div>
          </div>
          <div className="rounded-[0.5rem] border border-slate-200 bg-white p-3 text-xs">
            <div className="font-semibold uppercase tracking-wider text-slate-500">Cross ref index</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono">v{health.data?.engineVersion ?? "—"}</span>
              <span className={`rounded-[0.25rem] px-2 py-0.5 ${lastErr ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                {lastErr ? "ERROR" : "OK"}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-200 pt-3">
          {([
            ["spec", "Specification", null],
            ["factory", "Factory part numbers", factoryCount],
            ["derived", "Derived matches", derivedCount],
            ["audit", "Revision audit", null],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={`border-b-2 pb-2 text-sm font-semibold ${tab === id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}
              onClick={() => setTab(id)}
            >
              {label}{count != null ? ` (${count})` : ""}
            </button>
          ))}
        </div>
      </div>

      {tab === "spec" ? <div className="p-6">{specCards}</div> : null}

      {tab === "factory" ? (
        <div className="p-6">
          <div className="mb-4 rounded-[0.5rem] border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-slate-700">
            Numbers this car came with from the factory. Dominion uses them to match parts automatically across supplier datasets and tier interchange matrices.
            <div className="mt-2 font-mono text-xs text-slate-600">
              LAST SYNC: {timeAgo(String(lastRun?.finished_at || lastRun?.started_at || "")).toUpperCase()}
              {lastRun?.run_id ? ` · RUN #${String(lastRun.run_id).slice(0, 8)}` : ""}
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              className="min-w-[200px] flex-1 rounded-[0.25rem] border border-slate-200 px-3 py-2 text-sm"
              placeholder="Search part type or number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {AREA_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`rounded-[0.75rem] px-3 py-1 text-xs font-semibold ${area === chip.id ? "bg-blue-600 text-white" : "bg-slate-100"}`}
                onClick={() => setArea(chip.id)}
              >
                {chip.label} {chip.id === "all" ? areaCounts.all : areaCounts[chip.id] ?? 0}
              </button>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-[0.25rem] bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              disabled={!owner}
              onClick={openAddPanel}
            >
              <Plus className="h-4 w-4" /> Add number
            </button>
          </div>

          {oe.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading factory numbers…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-[0.5rem] border border-dashed border-slate-300 p-8 text-center">
              <p className="font-semibold text-slate-800">No factory numbers yet</p>
              <p className="mt-2 text-sm text-slate-500">Import Vehicle OE numbers from the parts import templates.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className="rounded-[0.25rem] bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!owner} onClick={openAddPanel}>
                  + Add number
                </button>
                <button type="button" className="rounded-[0.25rem] border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={openImportCsv}>
                  Open Import CSV
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[0.5rem] border border-slate-200">
              <div className="grid grid-cols-12 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <div className="col-span-2">Position</div>
                <div className="col-span-1">Side</div>
                <div className="col-span-1">Brand</div>
                <div className="col-span-3">Factory number</div>
                <div className="col-span-1">Years</div>
                <div className="col-span-2">Source</div>
                <div className="col-span-1">Matches</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              {grouped.map(([partType, groupRows]) => {
                const opCode = String(groupRows[0]?.op_code || "");
                return (
                  <div key={partType}>
                    <div className="flex items-center justify-between bg-slate-100 px-3 py-2 text-sm font-semibold">
                      <span>{partType} · {pluralNumbers(groupRows.length)}</span>
                      <span className="font-mono text-xs text-slate-500">CATEGORY: {opCode || partType}</span>
                    </div>
                    {groupRows.map((row) => {
                      const norm = normalizePartPositionSide(String(row.position || ""), String(row.side || ""));
                      const posOnly = formatPartPositionSideLabel(norm.position, null);
                      const sideOnly = norm.side ? formatPartPositionSideLabel(null, norm.side) : "Both sides";
                      const num = String(row.oe_number || "");
                      const matchCount = Number(row.match_count ?? 0);
                      const matching = Boolean(row.matching);
                      const superseded = String(row.supersession_note || row.changed_line || "");
                      return (
                        <div key={String(row.id)} className="grid grid-cols-12 items-center border-t border-slate-100 px-3 py-2 text-xs">
                          <div className="col-span-2"><span className="rounded bg-slate-100 px-1.5 py-0.5">{posOnly}</span></div>
                          <div className="col-span-1">{sideOnly}</div>
                          <div className="col-span-1">{String(row.oe_brand || "")}</div>
                          <div className="col-span-3 font-mono">
                            {num}
                            {superseded ? <div className="text-[10px] text-slate-500 mt-0.5">↳ {superseded}</div> : null}
                            <button type="button" className="ml-1 text-blue-600" onClick={() => { void navigator.clipboard.writeText(num); toast.success("Copied"); }}>
                              <Copy className="inline h-3 w-3" />
                            </button>
                          </div>
                          <div className="col-span-1">{row.year_from || row.year_to ? `${row.year_from || "…"}–${row.year_to || "…"}` : "All years"}</div>
                          <div className="col-span-2">
                            {row.evidence_url ? (
                              <a className="text-blue-600 inline-flex items-center gap-0.5" href={String(row.evidence_url)} target="_blank" rel="noreferrer">
                                Source <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                          <div className="col-span-1 text-blue-600">
                            {matching ? (
                              <span>Matching…</span>
                            ) : (
                              <button type="button" className="font-semibold hover:underline" onClick={openFindPartsMatches}>
                                {matchCount} parts →
                              </button>
                            )}
                          </div>
                          <div className="col-span-1 flex justify-end gap-1">
                            <button type="button" className="text-slate-500 disabled:opacity-40" disabled={!owner} onClick={() => openEditPanel(row)}><Pencil className="h-4 w-4" /></button>
                            <button type="button" className="text-red-500 disabled:opacity-40" disabled={!owner || busy} onClick={() => { void removeOeNumber(String(row.id)); }}><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {panelOpen ? (
            <div className="mt-4 rounded-[0.5rem] border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-semibold text-sm">{editId ? "Edit factory number" : "Add factory number"}</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input className="rounded border px-2 py-1.5 text-sm" placeholder="Brand" value={draftBrand} onChange={(e) => setDraftBrand(e.target.value)} />
                <input
                  className="rounded border px-2 py-1.5 text-sm font-mono"
                  placeholder="Factory number"
                  value={draftNumber}
                  onChange={(e) => {
                    setDraftNumber(e.target.value);
                    void refreshNormPreview(e.target.value, draftBrand);
                  }}
                />
                <input className="rounded border px-2 py-1.5 text-sm sm:col-span-2" placeholder="Source link (required)" value={draftEvidence} onChange={(e) => setDraftEvidence(e.target.value)} />
                <select className="rounded border px-2 py-1.5 text-sm sm:col-span-2" value={draftComponentId} onChange={(e) => setDraftComponentId(e.target.value)}>
                  <option value="">Part type…</option>
                  {componentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
                <input className="rounded border px-2 py-1.5 text-sm" placeholder="Year from" value={draftYearFrom} onChange={(e) => setDraftYearFrom(e.target.value)} />
                <input className="rounded border px-2 py-1.5 text-sm" placeholder="Year to" value={draftYearTo} onChange={(e) => setDraftYearTo(e.target.value)} />
                <select className="rounded border px-2 py-1.5 text-sm" value={draftPosition} onChange={(e) => setDraftPosition(e.target.value)}>
                  <option value="front">Front</option>
                  <option value="rear">Rear</option>
                </select>
                <select className="rounded border px-2 py-1.5 text-sm" value={draftSide} onChange={(e) => setDraftSide(e.target.value)}>
                  <option value="both">Both sides</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
              {normPreview ? <p className="mt-2 font-mono text-xs text-slate-600">Normalize preview: {normPreview}</p> : null}
              {duplicateOeWarning ? <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">{duplicateOeWarning}</p> : null}
              <div className="mt-3 flex gap-2">
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setPanelOpen(false)}>Cancel</button>
                <button type="button" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" disabled={!owner || busy} onClick={() => { void saveOeNumber(); }}>
                  Save
                </button>
              </div>
            </div>
          ) : null}

          <p className="mt-4 text-[11px] text-slate-500">Factory numbers drive tier-1 auto-matching. Edit only with a source link on file.</p>
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
                        <button type="button" className="text-secondary disabled:opacity-40" disabled={!owner || !row.conflict_id} onClick={() => {
                          const note = window.prompt("Note for audit trail (required):")?.trim();
                          if (!note || !row.conflict_id) return;
                          void resolveAutoMatchConflict(token, String(row.conflict_id), "remove", note).then(() => {
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
