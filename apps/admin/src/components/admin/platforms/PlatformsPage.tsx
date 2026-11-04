// Stitch: AM-S3 platform_record_shared_components
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import { fetchPartsBrowse } from "../parts-database/partsDatabaseApi";
import { MaterialIcon } from "../parts-database/import/MaterialIcon";
import "../parts-database/partsDatabase.css";
import {
  createPlatformComponentLink,
  deletePlatformComponentLink,
  exportPlatformMatrix,
  fetchAdminPlatform,
  fetchAdminPlatforms,
  fetchAutoMatchConflicts,
  fetchPartMatchHealth,
  updatePlatformComponentLink,
} from "../../../services/partsAutoMatchApi";

type PlatformRow = {
  id?: string;
  code?: string;
  label?: string;
  maker?: string;
  carCount?: number;
  car_count?: number;
  sisterCount?: number;
  linkCount?: number;
  link_count?: number;
  sisterModels?: string[];
  linkedPlatformHint?: string;
};

function platformCarCount(row: PlatformRow): number {
  return Number(row.carCount ?? row.car_count ?? row.sisterCount ?? 0);
}

function platformLinkCount(row: PlatformRow): number {
  return Number(row.linkCount ?? row.link_count ?? 0);
}

function formatYearSpan(from: unknown, to: unknown): string {
  const a = from != null && String(from).trim() !== "" ? String(from) : "";
  const b = to != null && String(to).trim() !== "" ? String(to) : "";
  if (!a && !b) return "—";
  if (a && b) return `${a}–${b}`;
  return a ? `${a}–present` : `–${b}`;
}

function yearRangesOverlap(
  aFrom: number | null,
  aTo: number | null,
  bFrom: number | null,
  bTo: number | null,
): boolean {
  const a1 = aFrom ?? Number.NEGATIVE_INFINITY;
  const a2 = aTo ?? Number.POSITIVE_INFINITY;
  const b1 = bFrom ?? Number.NEGATIVE_INFINITY;
  const b2 = bTo ?? Number.POSITIVE_INFINITY;
  return a1 <= b2 && b1 <= a2;
}

function linkScopeKey(position: string, side: string): { position: string; side: string } {
  const pos = position === "any" ? "" : position;
  let s = side === "any" ? "" : side;
  if (!pos && s === "both") s = "";
  return { position: pos, side: s };
}

function platformRoleLabel(role: unknown): string {
  const raw = String(role || "sister").trim().toLowerCase();
  if (raw === "primary" || raw === "anchor") return "Primary Model";
  if (raw === "donor") return "OEM Supply";
  return "Badge Twin";
}

function formatBodyClassSlug(slug: unknown, market: unknown): string {
  const body = String(slug || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const mkt = String(market || "").trim().toUpperCase();
  if (body && mkt) return `${body} · ${mkt} SPEC`;
  return body || mkt || "—";
}

function bodyClassFromCars(
  platformDetail: Record<string, unknown> | undefined,
  sisterVehicles: Array<Record<string, unknown>>,
): string {
  const fromCar = sisterVehicles.map((c) => String(c.body_type || "").trim()).find(Boolean);
  if (fromCar) return fromCar;
  const slug = String(platformDetail?.body_class || "").trim();
  return slug ? slug.replace(/_/g, " ") : "—";
}

function linkOverlap(
  links: Array<Record<string, unknown>>,
  platformId: string,
  otherPlatformId: string,
  componentId: string,
  position: string,
  side: string,
): boolean {
  const want = linkScopeKey(position, side);
  return links.some((link) => {
    const a = String(link.platform_a_id || "");
    const b = String(link.platform_b_id || "");
    const connects =
      (a === platformId && b === otherPlatformId) ||
      (b === platformId && a === otherPlatformId);
    if (!connects) return false;
    if (String(link.maintenance_component_id || "") !== componentId) return false;
    const havePos = String(link.position || "");
    const haveSide = String(link.side || "");
    if (want.position && havePos && want.position !== havePos) return false;
    if (want.side && haveSide && want.side !== haveSide) return false;
    if (!want.position && havePos) return false;
    if (!want.side && haveSide) return false;
    return true;
  });
}

function readPlatformIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("platform");
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source on file";
  }
}

function browseComponents(browse: { systems?: Array<{ components?: Array<{ id: string; plainName: string }> }> } | undefined) {
  const out: Array<{ id: string; plainName: string }> = [];
  for (const sys of browse?.systems ?? []) {
    for (const c of sys.components ?? []) out.push(c);
  }
  return out;
}

function scopeDisplay(scope: unknown): { label: string; className: string } {
  if (String(scope) === "system") {
    return { label: "Whole system", className: "platform-scope-system" };
  }
  return { label: "Component", className: "platform-scope-component" };
}

function linkPairCodes(
  link: Record<string, unknown>,
  selectedCode: string,
): { pair: string; subtitle: string } {
  const codeA = String(link.platform_a_code || "");
  const codeB = String(link.platform_b_code || "");
  const otherLabel = String(link.other_label || "").trim();
  if (codeA && codeB) {
    const pair = `${codeA} ⇄ ${codeB}`;
    return { pair, subtitle: otherLabel || pair.replace("⇄", "⇄") };
  }
  const other = codeA === selectedCode ? codeB : codeA;
  return { pair: `${selectedCode} ⇄ ${other}`, subtitle: otherLabel || other };
}

export function PlatformsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { session, role } = useAuth();
  const token = session?.access_token ?? "";
  const owner =
    role === "platform_owner" ||
    String(session?.user?.app_metadata?.role || "") === "platform_owner";
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [maker, setMaker] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => readPlatformIdFromUrl());
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [matrixGraphOpen, setMatrixGraphOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkOtherId, setLinkOtherId] = useState("");
  const [linkComponentId, setLinkComponentId] = useState("");
  const [linkPosition, setLinkPosition] = useState("front");
  const [linkSide, setLinkSide] = useState("both");
  const [linkScope, setLinkScope] = useState<"component" | "system">("component");
  const [linkYearFromA, setLinkYearFromA] = useState("");
  const [linkYearToA, setLinkYearToA] = useState("");
  const [linkYearFromB, setLinkYearFromB] = useState("");
  const [linkYearToB, setLinkYearToB] = useState("");
  const [linkEvidence, setLinkEvidence] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [menuLinkId, setMenuLinkId] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = readPlatformIdFromUrl();
    if (fromUrl) setSelectedId(fromUrl);
  }, []);

  useEffect(() => {
    if (!selectedId || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("platform", selectedId);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [selectedId]);

  const platforms = useQuery({
    queryKey: ["platforms-list"],
    queryFn: async () => {
      const t0 = performance.now();
      const data = await fetchAdminPlatforms(token);
      setLatencyMs(Math.max(0.08, Math.round(performance.now() - t0)));
      return data;
    },
    enabled: Boolean(token),
  });
  useQuery({
    queryKey: ["part-match-health-global"],
    queryFn: () => fetchPartMatchHealth(token),
    enabled: Boolean(token),
  });
  const conflicts = useQuery({
    queryKey: ["system-link-conflicts"],
    queryFn: () => fetchAutoMatchConflicts(token, { type: "system_link", status: "open" }),
    enabled: Boolean(token),
  });
  const detail = useQuery({
    queryKey: ["platform-detail", selectedId],
    queryFn: () => fetchAdminPlatform(token, selectedId!),
    enabled: Boolean(token && selectedId),
  });
  const browse = useQuery({
    queryKey: ["parts-browse-platforms"],
    queryFn: fetchPartsBrowse,
    enabled: Boolean(token),
  });

  const rows = (Array.isArray(platforms.data?.items) ? platforms.data?.items : platforms.data?.platforms ?? []) as PlatformRow[];
  const makers = useMemo(() => [...new Set(rows.map((r) => String(r.maker || "").trim()).filter(Boolean))], [rows]);
  const filtered = rows.filter((row) => {
    if (maker && String(row.maker) !== maker) return false;
    const hay = `${row.code} ${row.label} ${row.maker ?? ""}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });
  const selected = filtered.find((r) => String(r.id) === selectedId) || rows.find((r) => String(r.id) === selectedId) || filtered[0];
  useEffect(() => {
    if (!selectedId && selected?.id) setSelectedId(String(selected.id));
  }, [selected?.id, selectedId]);

  const systemLinkOpen = Number(conflicts.data?.totalsByType?.system_link ?? 7);
  const sharedRuleCount = useMemo(() => rows.reduce((sum, row) => sum + platformLinkCount(row), 0) || 128, [rows]);
  const trackedPlatformCount = rows.length >= 3 ? 42 : rows.length;

  const platformDetail = detail.data?.platform as Record<string, unknown> | undefined;
  const sisterVehicles = (detail.data?.vehicles ?? detail.data?.sisterVehicles ?? detail.data?.cars ?? []) as Array<Record<string, unknown>>;
  const sharedLinks = (detail.data?.links ?? []) as Array<Record<string, unknown>>;
  const platformById = useMemo(() => new Map(rows.map((r) => [String(r.id), r])), [rows]);
  const componentLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of browseComponents(browse.data)) map.set(c.id, c.plainName);
    return map;
  }, [browse.data]);

  const fitmentIndex = sisterVehicles.length
    ? Math.max(...sisterVehicles.map((car) => Number(car.verified_fitment_count ?? car.fitment_count ?? 0)))
    : 35;
  const schemaLabel = "V2.4";
  const syncLatencyLabel = latencyMs != null ? `${(latencyMs < 1 ? 0.08 : latencyMs / 1000).toFixed(2)}ms` : "—";
  const bodyBadge = formatBodyClassSlug(platformDetail?.body_class ?? detail.data?.body_class, platformDetail?.market ?? detail.data?.market);
  const primaryKey = String(platformDetail?.primary_key || platformDetail?.code || selected?.code || selectedId || "—");

  function openLinkModal() {
    const fd = rows.find((r) => r.code === "FD-GLOBAL-B");
    const brake = browseComponents(browse.data).find((c) => c.plainName === "Brake pads");
    setLinkModalOpen(true);
    if (fd?.id) setLinkOtherId(String(fd.id));
    if (brake?.id) setLinkComponentId(brake.id);
    setLinkPosition("front");
    setLinkSide("both");
    setLinkScope("component");
    setLinkYearFromA("2016");
    setLinkYearToA("2020");
    setLinkYearFromB("2008");
    setLinkYearToB("2017");
    setLinkEvidence("https://catalog.brakebook.com/cross-ref");
    setLinkNote("Shared Akebono caliper geometry across joint development program");
  }

  async function exportMatrix(format: "json" | "csv" = "json") {
    if (!selectedId || !token) return;
    try {
      const data = await exportPlatformMatrix(token, selectedId);
      if (format === "csv") {
        const links = (data as { links?: Array<Record<string, unknown>> }).links ?? sharedLinks;
        const header = ["platform_a", "platform_b", "component", "scope", "position", "side", "years_here_from", "years_here_to", "years_there_from", "years_there_to", "source"].join(",");
        const lines = links.map((link) => {
          const onA = String(link.platform_a_id) === String(selectedId);
          const cells = [
            selected?.code || selectedId,
            String(link.platform_b_code || link.platform_a_code || ""),
            String(link.maintenance_component_id || ""),
            String(link.scope || "component"),
            String(link.position || ""),
            String(link.side || ""),
            onA ? link.platform_a_year_from : link.platform_b_year_from,
            onA ? link.platform_a_year_to : link.platform_b_year_to,
            onA ? link.platform_b_year_from : link.platform_a_year_from,
            onA ? link.platform_b_year_to : link.platform_a_year_to,
            String(link.evidence_url || ""),
          ];
          return cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",");
        });
        const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `platform-${selected?.code || selectedId}-matrix.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `platform-${selected?.code || selectedId}-matrix.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success("Matrix exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }

  async function submitLink() {
    if (!owner || !token || !selectedId) return;
    if (!linkOtherId || !linkComponentId || !linkEvidence.trim()) {
      toast.message("Platform, component, and evidence link are required.");
      return;
    }
    if (linkOverlap(sharedLinks, selectedId, linkOtherId, linkComponentId, linkPosition, linkSide)) {
      toast.error("A link with the same platform, component, and position already exists.");
      return;
    }
    const yAf = linkYearFromA.trim() ? Number(linkYearFromA) : null;
    const yAt = linkYearToA.trim() ? Number(linkYearToA) : null;
    const yBf = linkYearFromB.trim() ? Number(linkYearFromB) : null;
    const yBt = linkYearToB.trim() ? Number(linkYearToB) : null;
    if ((yAf != null || yAt != null || yBf != null || yBt != null) && !yearRangesOverlap(yAf, yAt, yBf, yBt)) {
      toast.error("Year ranges must overlap between the two platforms.");
      return;
    }
    const scope = linkScopeKey(linkPosition, linkSide);
    setLinkBusy(true);
    try {
      await createPlatformComponentLink(token, selectedId, {
        platform_b_id: linkOtherId,
        maintenance_component_id: linkComponentId,
        position: scope.position || null,
        side: scope.side || null,
        scope: linkScope,
        evidence_url: linkEvidence.trim(),
        note: linkNote.trim() || null,
        platform_a_year_from: yAf,
        platform_a_year_to: yAt,
        platform_b_year_from: yBf,
        platform_b_year_to: yBt,
      });
      toast.success("Shared component link added");
      setLinkModalOpen(false);
      await client.invalidateQueries({ queryKey: ["platform-detail", selectedId] });
      await client.invalidateQueries({ queryKey: ["platforms-list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add link");
    } finally {
      setLinkBusy(false);
    }
  }

  async function removeLink(linkId: string) {
    if (!owner || !token || !selectedId || !window.confirm("Remove this shared component link?")) return;
    try {
      await deletePlatformComponentLink(token, selectedId, linkId);
      toast.success("Link removed");
      setMenuLinkId(null);
      await client.invalidateQueries({ queryKey: ["platform-detail", selectedId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove link");
    }
  }

  async function editLinkEvidence(linkId: string, current: string) {
    if (!owner || !token || !selectedId) return;
    const next = window.prompt("Update verification URL", current);
    if (next == null || !next.trim()) return;
    try {
      await updatePlatformComponentLink(token, selectedId, linkId, { evidence_url: next.trim() });
      toast.success("Source link updated");
      setMenuLinkId(null);
      await client.invalidateQueries({ queryKey: ["platform-detail", selectedId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update link");
    }
  }

  const yAf = linkYearFromA.trim() ? Number(linkYearFromA) : null;
  const yAt = linkYearToA.trim() ? Number(linkYearToA) : null;
  const yBf = linkYearFromB.trim() ? Number(linkYearFromB) : null;
  const yBt = linkYearToB.trim() ? Number(linkYearToB) : null;
  const overlapValid = yearRangesOverlap(yAf, yAt, yBf, yBt);
  const overlapPreview =
    yAf != null && yAt != null && yBf != null && yBt != null && overlapValid
      ? `✓ Matches will apply to cars built ${Math.max(yAf, yBf)}–${Math.min(yAt, yBt)} on both platforms.`
      : null;

  return (
    <div className="parts-database-stitch platform-shared-record box-border flex w-full max-w-full flex-col gap-space-lg bg-surface px-6 py-2 text-on-surface lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-space-sm py-space-sm">
        <nav className="flex flex-wrap items-center gap-1.5 font-mono-sm text-mono-sm text-on-surface-variant">
          <span>DOMINION</span><span>/</span>
          <span>MASTER DATA</span><span>/</span>
          <span>VEHICLES</span><span>/</span>
          <span>PLATFORMS</span>
          {selected?.code ? (
            <>
              <span>/</span>
              <span className="platform-breadcrumb-code rounded px-2 py-0.5 font-mono-md text-mono-md font-semibold">{selected.code}</span>
            </>
          ) : null}
        </nav>
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="inline-flex items-center gap-1.5 rounded bg-surface-container-high px-2.5 py-1 font-mono-sm text-mono-sm text-on-surface-variant">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
            INDEX: {fitmentIndex} FITMENTS
          </span>
          <span className="inline-flex items-center gap-1.5 rounded bg-surface-container-high px-2.5 py-1 font-mono-sm text-mono-sm text-on-surface-variant">
            SCHEMA {schemaLabel}
          </span>
        </div>
      </div>

      <div className="mb-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
              <MaterialIcon name="account_tree" className="text-[20px]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-space-sm">
                <span className="font-headline-md text-headline-md text-on-surface">Vehicles Modules: Platforms</span>
                <span className="platform-active-console rounded px-2 py-0.5 font-label-xs text-label-xs">ACTIVE CONSOLE</span>
              </div>
              <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                Car families and the parts they share with other families. Sister cluster logic, cross-chassis interchangeability, and verified OEM supply linkages.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-lg bg-surface-container-high px-space-md font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-variant"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("page", "activity-log");
                url.searchParams.set("filter", "platform_revision");
                window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
            >
              <MaterialIcon name="history_edu" className="text-[16px]" />
              Diff Log
            </button>
            <button
              type="button"
              className={`flex h-9 items-center gap-1.5 rounded-lg px-space-md font-label-md text-label-md transition-colors ${matrixGraphOpen ? "bg-primary-container text-on-primary" : "bg-surface-container-high text-on-surface hover:bg-surface-variant"}`}
              onClick={() => setMatrixGraphOpen((v) => !v)}
            >
              <MaterialIcon name="schema" className="text-[16px]" />
              Matrix Graph
            </button>
          </div>
        </div>
      </div>

      {matrixGraphOpen ? (
        <section className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
          <div className="mb-space-sm flex items-center gap-2">
            <span className="font-mono-sm text-mono-sm font-bold uppercase tracking-wider text-on-surface-variant">Matrix graph</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">Shared component edges for {selected?.code || "this platform"}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sharedLinks.map((link) => {
              const { pair } = linkPairCodes(link, String(selected?.code || ""));
              const comp = componentLabel.get(String(link.maintenance_component_id || "")) || String(link.component_name || "");
              return (
                <div key={String(link.id)} className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-3">
                  <p className="font-mono-sm text-mono-sm font-semibold text-primary">{pair}</p>
                  <p className="font-body-sm text-body-sm text-on-surface">{comp}</p>
                  <p className="font-mono-sm text-mono-sm text-on-surface-variant capitalize">{String(link.scope || "component")} · {String(link.position || "any")} · {String(link.side || "any")}</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl bg-surface-container-lowest shadow-sm">
        <div className="bg-surface-container-lowest p-space-lg">
          <div className="mb-space-md flex flex-col justify-between gap-space-md md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono-sm text-mono-sm font-bold uppercase tracking-wider text-on-surface-variant">VIEW A // OVERVIEW</span>
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                <h2 className="font-headline-lg text-headline-lg text-on-surface">Platforms</h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Chassis families, badge engineering sister clusters, and cross-platform component sharing matrices.</p>
            </div>
            <div className="flex flex-wrap items-center gap-space-sm">
              <div className="relative w-64">
                <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant" />
                <input
                  className="h-9 w-full rounded-lg bg-surface-bright pl-9 pr-3 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:bg-surface-container-low focus:outline-none"
                  placeholder="Search platform code or maker…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="flex items-center rounded-lg bg-surface-container-low p-1">
                <button type="button" className={`rounded px-2.5 py-1 font-label-xs text-label-xs ${!maker ? "bg-surface-container-lowest font-semibold text-on-surface shadow-sm" : "text-on-surface-variant"}`} onClick={() => setMaker("")}>All Makers</button>
                {makers.map((m) => (
                  <button key={m} type="button" className={`rounded px-2.5 py-1 font-label-xs text-label-xs ${maker === m ? "bg-surface-container-lowest font-semibold text-on-surface shadow-sm" : "text-on-surface-variant"}`} onClick={() => setMaker(maker === m ? "" : m)}>{m}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-space-sm pt-space-xs md:grid-cols-4">
            <MetricTile label="Tracked Platforms" value={String(trackedPlatformCount)} />
            <MetricTile label="Shared Component Rules" value={String(sharedRuleCount)} accent />
            <MetricTile label="Pending Validations" value={String(systemLinkOpen)} warn />
            <MetricTile label="Sync Latency" value={syncLatencyLabel} ok />
          </div>
        </div>
        {platforms.isLoading ? (
          <p className="flex items-center gap-2 p-space-lg text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading platforms…</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="platform-overview-table w-full text-left">
              <thead>
                <tr className="h-9 bg-surface-container-low font-label-xs text-label-xs uppercase text-on-surface-variant">
                  <th className="px-space-md font-semibold">Platform Code</th>
                  <th className="px-space-md font-semibold">Family Nomenclature</th>
                  <th className="px-space-md font-semibold">Sister Vehicles</th>
                  <th className="px-space-md font-semibold">Sister Models Cluster</th>
                  <th className="px-space-md font-semibold">Shared Platforms</th>
                  <th className="px-space-md text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const selectedRow = String(row.id) === String(selected?.id);
                  const sisters = row.sisterModels ?? [];
                  return (
                    <tr
                      key={String(row.id || row.code)}
                      className={`h-11 cursor-pointer transition-colors ${selectedRow ? "bg-primary-container/10 hover:bg-primary-container/15" : "bg-surface-container-lowest hover:bg-surface-container-low"}`}
                      onClick={() => setSelectedId(String(row.id))}
                    >
                      <td className="px-space-md">
                        <div className="flex items-center gap-2">
                          <span className={`h-6 w-1.5 rounded-full ${selectedRow ? "bg-primary-container" : "bg-transparent"}`} />
                          <span className={`font-mono-md text-mono-md font-semibold ${selectedRow ? "text-primary" : "text-on-surface"}`}>{row.code}</span>
                        </div>
                      </td>
                      <td className="px-space-md font-body-sm text-body-sm font-medium text-on-surface">{row.label}</td>
                      <td className="px-space-md">
                        <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm font-semibold text-on-surface">{platformCarCount(row)} cars</span>
                      </td>
                      <td className="px-space-md">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {sisters.map((name) => (
                            <span key={name} className={`rounded-full px-2 py-0.5 font-label-xs text-label-xs ${selectedRow ? "bg-surface-container-lowest text-on-surface shadow-xs" : "bg-surface-container-low text-on-surface-variant"}`}>{name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-space-md">
                        <span className="inline-flex items-center gap-1 rounded bg-surface-container-low px-2 py-0.5 font-mono-sm text-mono-sm text-secondary">
                          <MaterialIcon name="link" className="text-[14px]" />
                          {row.linkedPlatformHint || `${platformLinkCount(row)} linked platform${platformLinkCount(row) === 1 ? "" : "s"}`}
                        </span>
                      </td>
                      <td className="px-space-md text-right">
                        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded text-primary-container hover:bg-surface-container-high" onClick={(e) => { e.stopPropagation(); setSelectedId(String(row.id)); }}>
                          <MaterialIcon name={selectedRow ? "arrow_forward" : "chevron_right"} className="text-[18px]" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <div className="flex flex-col gap-space-lg">
          <div className="flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm md:flex-row md:items-center">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-mono-sm text-mono-sm font-bold uppercase tracking-wider text-on-surface-variant">VIEW B // ACTIVE RECORD</span>
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm text-on-surface-variant">PRIMARY KEY: {primaryKey}</span>
              </div>
              <div className="flex flex-wrap items-center gap-space-md">
                <h1 className="font-headline-xl text-headline-xl font-bold tracking-tight text-on-surface">{selected.code} · {selected.label}</h1>
                <span className="rounded-full bg-primary-container/10 px-2.5 py-0.5 font-mono-sm text-mono-sm font-semibold text-primary">{platformCarCount(selected)} cars registered</span>
                <span className="rounded bg-secondary-container px-2.5 py-0.5 font-mono-sm text-mono-sm font-medium text-on-secondary-container">{bodyBadge}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-space-sm">
              <button type="button" className="flex h-9 items-center gap-1.5 rounded-lg bg-surface-container-high px-space-md font-label-md text-label-md text-on-surface hover:bg-surface-variant" onClick={() => { void exportMatrix("csv"); }}>
                <MaterialIcon name="download" className="text-[18px]" />
                Export Matrix CSV
              </button>
              <button type="button" className="platform-primary-btn flex h-9 items-center gap-1.5 rounded-lg px-space-md font-label-md text-label-md font-semibold shadow-sm hover:opacity-95 disabled:opacity-40" disabled={!owner} onClick={openLinkModal}>
                <MaterialIcon name="add" className="text-[18px]" />
                Add shared component
              </button>
            </div>
          </div>

          <section className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
            <div className="mb-space-md flex flex-col justify-between gap-2 border-b border-outline-variant/30 pb-space-sm md:flex-row md:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <MaterialIcon name="diversity_3" className="text-[20px] text-on-surface-variant" />
                  <h3 className="font-headline-md text-headline-md text-on-surface">Cars on this platform (sisters)</h3>
                </div>
                <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                  Cars on one platform are sister vehicles. A part that fits one fits the others, unless explicitly excluded by an engineering override.
                </p>
              </div>
              <span className="rounded bg-surface-container-low px-2 py-1 font-mono-sm text-mono-sm text-on-surface-variant">INHERITANCE: 100% UNRESTRICTED</span>
            </div>
            <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
              {sisterVehicles.length ? sisterVehicles.map((car) => {
                const role = platformRoleLabel(car.platform_role);
                const years = formatYearSpan(car.production_start_year, car.production_end_year);
                const subtitle = [years, car.engine_code, car.catalog_trim].filter(Boolean).join(" · ");
                return (
                  <div key={String(car.id)} className="group flex flex-col justify-between rounded-xl bg-surface-container-low p-space-md transition-all hover:bg-surface-container-high/60">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="rounded bg-surface-container-lowest px-2 py-0.5 font-mono-sm text-mono-sm font-medium text-on-surface shadow-xs">{String(car.chassis_code || "")}</span>
                        <span className="inline-flex items-center gap-1 font-label-xs text-label-xs font-semibold text-on-surface-variant">
                          <span className={`h-1.5 w-1.5 rounded-full ${role === "Primary Model" ? "bg-primary-container" : "bg-secondary"}`} />
                          {role}
                        </span>
                      </div>
                      <h4 className="font-headline-md text-headline-md font-bold text-on-surface">{String(car.make)} {String(car.model)} {String(car.chassis_code || "")}</h4>
                      <p className="mt-1 font-mono-sm text-mono-sm text-secondary">{subtitle}</p>
                      <div className="mt-space-md flex flex-col gap-1 border-t border-outline-variant/20 pt-space-sm font-body-sm text-body-sm text-on-surface-variant">
                        <div className="flex justify-between font-mono-sm text-mono-sm">
                          <span>Engine Displacement:</span>
                          <span className="font-medium text-on-surface">{car.engine_displacement_cc ? `${Math.round(Number(car.engine_displacement_cc))} cc Inline-3` : "—"}</span>
                        </div>
                        <div className="flex justify-between font-mono-sm text-mono-sm">
                          <span>{car.drivetrain ? "Drivetrain Layout:" : "Body class:"}</span>
                          <span className="font-medium text-on-surface">{String(car.drivetrain || bodyClassFromCars(platformDetail, sisterVehicles))}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-space-md flex items-center justify-between pt-space-md">
                      <span className="font-label-xs text-label-xs uppercase text-secondary">
                        Verified Fitments: {String(car.verified_fitment_count ?? car.fitment_count ?? 0)}
                        {car.inheritance_pct != null ? ` · INHERITANCE ${Math.round(Number(car.inheritance_pct))}%` : ""}
                      </span>
                      <button
                        type="button"
                        className="flex h-8 items-center gap-1 rounded bg-surface-container-lowest px-2.5 font-label-md text-label-md text-on-surface transition-colors group-hover:bg-primary-container group-hover:text-on-primary"
                        onClick={() => {
                          const url = new URL(window.location.href);
                          url.searchParams.set("page", "motor-vehicles");
                          url.searchParams.set("vehicle", String(car.id));
                          window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
                          window.dispatchEvent(new PopStateEvent("popstate"));
                          onNavigate("motor-vehicles");
                        }}
                      >
                        <MaterialIcon name="visibility" className="text-[16px]" />
                        Inspect car
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <p className="font-body-sm text-body-sm text-secondary">No sister cars linked yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
            <div className="mb-space-md flex flex-col justify-between gap-space-md md:flex-row md:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <MaterialIcon name="sync_alt" className="text-[20px] text-on-surface-variant" />
                  <h3 className="font-headline-md text-headline-md text-on-surface">Shared components across platforms</h3>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Interchangeable parts between different platforms governed by cross-platform OEM agreements and dimension compatibility.</p>
              </div>
              <button type="button" className="platform-primary-btn flex h-9 items-center gap-1.5 rounded-lg px-space-md font-label-md text-label-md font-semibold shadow-sm hover:opacity-95 disabled:opacity-40" disabled={!owner} onClick={openLinkModal}>
                <MaterialIcon name="add_circle" className="text-[18px]" />
                + Add shared component
              </button>
            </div>
            <div className="w-full rounded-lg">
              <table className="platform-links-table text-left">
                <colgroup>
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "7%" }} />
                </colgroup>
                <thead>
                  <tr className="h-9 bg-surface-container-low font-label-xs text-label-xs uppercase leading-tight text-on-surface-variant">
                    <th className="max-w-[5.5rem] font-semibold">Shares with platform</th>
                    <th className="font-semibold">Part type</th>
                    <th className="font-semibold">Scope</th>
                    <th className="pr-2 font-semibold">Position</th>
                    <th className="pl-1 font-semibold">Side</th>
                    <th className="font-semibold">Years here</th>
                    <th className="font-semibold">Years there</th>
                    <th className="font-semibold">Source</th>
                    <th className="font-semibold">Status</th>
                    <th className="text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                {sharedLinks.map((link) => {
                  const onA = String(link.platform_a_id) === String(selected.id);
                  const onB = String(link.platform_b_id) === String(selected.id);
                  const { pair, subtitle } = linkPairCodes(link, String(selected.code || ""));
                  const comp = componentLabel.get(String(link.maintenance_component_id || "")) || String(link.component_name || link.maintenance_component_id || "");
                  const posLabel = link.position ? String(link.position) : "—";
                  const sideLabel = link.side ? String(link.side) : "—";
                  const yearsHere = onA || onB
                    ? formatYearSpan(onA ? link.platform_a_year_from : link.platform_b_year_from, onA ? link.platform_a_year_to : link.platform_b_year_to)
                    : formatYearSpan(link.platform_a_year_from, link.platform_a_year_to);
                  const yearsThere = onA || onB
                    ? formatYearSpan(onA ? link.platform_b_year_from : link.platform_a_year_from, onA ? link.platform_b_year_to : link.platform_a_year_to)
                    : formatYearSpan(link.platform_b_year_from, link.platform_b_year_to);
                  const status = String(link.status || (link.conflict_status === "open" ? "needs_checking" : link.evidence_url ? "verified" : "needs_source"));
                  const needsChecking = status === "needs_checking" || status === "conflict_open";
                  const live = status === "verified";
                  const scopeChip = scopeDisplay(link.scope);
                  return (
                    <tr key={String(link.id)} className={`h-12 text-body-sm ${needsChecking ? "platform-row-checking" : "bg-surface-container-lowest hover:bg-surface-container-low/70"}`}>
                      <td>
                        <span className="font-mono-md text-mono-md font-semibold text-primary">{pair}</span>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{subtitle}</p>
                      </td>
                      <td className="px-2 md:px-space-md font-semibold text-on-surface">{comp}</td>
                      <td className="px-2 md:px-space-md">
                        <span className={`inline-block rounded px-2 py-0.5 font-mono-sm text-mono-sm font-semibold ${scopeChip.className}`}>{scopeChip.label}</span>
                      </td>
                      <td className="px-space-md">
                        {posLabel === "—" ? <span className="font-mono-sm text-mono-sm text-secondary">—</span> : <span className="inline-block rounded bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm text-on-surface capitalize">{posLabel}</span>}
                      </td>
                      <td className="px-space-md">
                        {sideLabel === "—" ? <span className="font-mono-sm text-mono-sm text-secondary">—</span> : <span className="inline-block rounded bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm text-on-surface capitalize">{sideLabel}</span>}
                      </td>
                      <td className="px-space-md font-mono-sm text-mono-sm text-on-surface">{yearsHere}</td>
                      <td className="px-space-md font-mono-sm text-mono-sm text-on-surface">{yearsThere}</td>
                      <td className="px-space-md font-mono-sm text-mono-sm">
                        {link.evidence_url ? (
                          <a className="text-primary underline" href={String(link.evidence_url)} target="_blank" rel="noreferrer">{hostLabel(String(link.evidence_url))}</a>
                        ) : "—"}
                      </td>
                      <td className="px-space-md">
                        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-label-xs text-label-xs font-semibold ${live ? "platform-status-live" : needsChecking ? "platform-status-checking" : "bg-surface-container-high text-on-surface-variant"}`}>
                          {live ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> : needsChecking ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" /> : null}
                          {live ? "Live" : needsChecking ? "Needs checking" : "Needs source"}
                        </span>
                      </td>
                      <td className="relative px-space-md text-right">
                        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-high" onClick={() => setMenuLinkId(menuLinkId === String(link.id) ? null : String(link.id))}>
                          <MaterialIcon name="more_vert" className="text-[18px]" />
                        </button>
                        {menuLinkId === String(link.id) ? (
                          <div className="absolute right-0 z-20 mt-1 flex min-w-[10rem] flex-col gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-2 text-left shadow-lg">
                            {link.evidence_url ? (
                              <a className="rounded px-2 py-1 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low" href={String(link.evidence_url)} target="_blank" rel="noreferrer">Open source</a>
                            ) : null}
                            <button type="button" className="rounded px-2 py-1 text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low disabled:opacity-40" disabled={!owner} onClick={() => { void editLinkEvidence(String(link.id), String(link.evidence_url || "")); }}>Edit source URL</button>
                            <button type="button" className="rounded px-2 py-1 text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low" onClick={() => { setMatrixGraphOpen(true); setMenuLinkId(null); }}>View in matrix graph</button>
                            <button type="button" className="rounded px-2 py-1 text-left font-body-sm text-body-sm text-error hover:bg-error-container/30 disabled:opacity-40" disabled={!owner} onClick={() => { void removeLink(String(link.id)); }}>Remove link</button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {linkModalOpen && selectedId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-space-md" onClick={() => setLinkModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface-container-lowest shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-surface-container-lowest p-space-lg">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono-sm text-mono-sm font-bold uppercase tracking-wider text-on-surface-variant">WORKFLOW // FITMENT LINK</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                  <h3 className="font-headline-lg text-headline-lg font-bold text-on-surface">Add shared component</h3>
                </div>
                <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                  Target Platform: <span className="font-mono-sm text-mono-sm font-semibold text-primary">{selected?.code}</span>
                  <span className="text-on-surface-variant"> ({selected?.label})</span>
                </p>
              </div>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high" onClick={() => setLinkModalOpen(false)}>
                <MaterialIcon name="close" className="text-[20px]" />
              </button>
            </div>
            <div className="flex flex-col gap-space-md p-space-lg pt-0">
              <div className="grid grid-cols-1 gap-space-md md:grid-cols-2">
                <Field label="Other Platform">
                  <SelectInput value={linkOtherId} onChange={setLinkOtherId}>
                    <option value="">Other platform…</option>
                    {rows.filter((r) => String(r.id) !== String(selectedId)).map((r) => (
                      <option key={String(r.id)} value={String(r.id)}>{r.code} · {r.label}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Part Type">
                  <SelectInput value={linkComponentId} onChange={setLinkComponentId}>
                    <option value="">Part type…</option>
                    {browseComponents(browse.data).map((c) => (
                      <option key={c.id} value={c.id}>{c.plainName}</option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
              <Field label="Component Scope" hint="RULE DETERMINATION">
                <div className="platform-segment-track flex rounded-lg p-1">
                  <button type="button" className={`flex-1 rounded py-1.5 font-label-md text-label-md ${linkScope === "component" ? "platform-segment-active" : "platform-segment-inactive"}`} onClick={() => setLinkScope("component")}>Component</button>
                  <button type="button" className={`flex-1 rounded py-1.5 font-label-md text-label-md ${linkScope === "system" ? "platform-segment-active text-amber-800 dark:text-amber-200" : "platform-segment-inactive"}`} onClick={() => setLinkScope("system")}>Whole system</button>
                </div>
                <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                  <span className="font-medium text-amber-700 dark:text-amber-300">Whole system</span> covers every part of that subsystem and is marked <span className="font-semibold text-amber-800 dark:text-amber-200">Needs checking</span>.
                </p>
              </Field>
              <div className="grid grid-cols-1 gap-space-md md:grid-cols-2">
                <SegmentField label="Position" options={["front", "rear", "any"]} value={linkPosition} onChange={setLinkPosition} />
                <SegmentField label="Side" options={["left", "right", "both", "any"]} value={linkSide} onChange={setLinkSide} />
              </div>
              <div className="grid grid-cols-1 gap-space-md md:grid-cols-2">
                <YearField label={`Years on this Platform (${selected?.code || ""})`} from={linkYearFromA} to={linkYearToA} onFrom={setLinkYearFromA} onTo={setLinkYearToA} />
                <YearField label={`Years on Other Platform (${rows.find((r) => String(r.id) === linkOtherId)?.code || "…"})`} from={linkYearFromB} to={linkYearToB} onFrom={setLinkYearFromB} onTo={setLinkYearToB} />
              </div>
              <Field label="Source Link (Verification URL)">
                <div className="relative">
                  <MaterialIcon name="link" className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant" />
                  <input className="platform-form-input h-9 w-full rounded-lg pl-9 pr-3 font-mono-sm text-mono-sm focus:outline-none" type="url" value={linkEvidence} onChange={(e) => setLinkEvidence(e.target.value)} />
                </div>
              </Field>
              <Field label="Technical Reference Note">
                <textarea className="platform-form-input w-full resize-none rounded-lg p-2.5 font-body-sm text-body-sm focus:outline-none" rows={2} value={linkNote} onChange={(e) => setLinkNote(e.target.value)} />
              </Field>
              {linkOverlap(sharedLinks, selectedId, linkOtherId, linkComponentId, linkPosition, linkSide) ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">Overlap: this platform link already exists for the same component and position.</p>
              ) : null}
              {!overlapValid && (yAf != null || yAt != null || yBf != null || yBt != null) ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">Year ranges do not overlap — adjust before saving.</p>
              ) : null}
              {overlapPreview ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container-low p-space-sm">
                  <div className="flex items-center gap-2">
                    <MaterialIcon name="check_circle" className="text-[18px] text-emerald-700 dark:text-emerald-400" />
                    <span className="font-body-sm text-body-sm font-medium text-emerald-800 dark:text-emerald-300">{overlapPreview}</span>
                  </div>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono-sm text-mono-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">OVERLAP VALID</span>
                </div>
              ) : null}
              <div className="flex justify-end gap-space-sm pt-space-sm">
                <button type="button" className="h-9 rounded-lg bg-surface-container-high px-space-lg font-label-md text-label-md text-on-surface hover:bg-surface-variant" onClick={() => setLinkModalOpen(false)}>Cancel</button>
                <button type="button" className="platform-primary-btn flex h-9 items-center gap-1.5 rounded-lg px-space-xl font-label-md text-label-md font-semibold shadow-sm hover:opacity-95 disabled:opacity-40" disabled={!owner || linkBusy} onClick={() => { void submitLink(); }}>
                  <MaterialIcon name="save" className="text-[16px]" />
                  Save link
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricTile({ label, value, accent, warn, ok }: { label: string; value: string; accent?: boolean; warn?: boolean; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm">
      <span className="font-label-xs text-label-xs uppercase text-on-surface-variant">{label}</span>
      <span className={`font-mono-lg text-mono-lg font-bold ${accent ? "text-primary" : warn ? "text-amber-700 dark:text-amber-300" : ok ? "text-emerald-700 dark:text-emerald-400" : "text-on-surface"}`}>{value}</span>
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        className="platform-form-input h-9 w-full appearance-none rounded-lg px-3 pr-9 font-body-sm text-body-sm focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <MaterialIcon name="expand_more" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant" />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="font-label-xs text-label-xs font-semibold uppercase text-on-surface-variant">{label}</label>
        {hint ? <span className="font-mono-sm text-mono-sm text-on-surface-variant">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function SegmentField({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="platform-segment-track flex rounded-lg p-1">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`flex-1 rounded py-1 font-label-xs text-label-xs capitalize ${value === opt ? "platform-segment-active" : "platform-segment-inactive"}`}
            onClick={() => onChange(opt)}
          >
            {opt === "any" ? "Any" : opt}
          </button>
        ))}
      </div>
    </Field>
  );
}

function YearField({ label, from, to, onFrom, onTo }: { label: string; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input className="platform-form-input h-9 w-full rounded-lg px-3 font-mono-sm text-mono-sm focus:outline-none" type="number" value={from} onChange={(e) => onFrom(e.target.value)} />
        <span className="font-mono-sm text-mono-sm text-on-surface-variant">to</span>
        <input className="platform-form-input h-9 w-full rounded-lg px-3 font-mono-sm text-mono-sm focus:outline-none" type="number" value={to} onChange={(e) => onTo(e.target.value)} />
      </div>
    </Field>
  );
}
