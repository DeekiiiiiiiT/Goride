// Stitch: AM-S3 platform_record_shared_components
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import { fetchPartsBrowse } from "../parts-database/partsDatabaseApi";
import {
  createPlatformComponentLink,
  deletePlatformComponentLink,
  exportPlatformMatrix,
  fetchAdminPlatform,
  fetchAdminPlatforms,
  fetchAutoMatchConflicts,
  fetchPartMatchHealth,
} from "../../../services/partsAutoMatchApi";

type PlatformRow = {
  id?: string;
  code?: string;
  label?: string;
  maker?: string;
  carCount?: number;
  sisterCount?: number;
  linkCount?: number;
};

function readPlatformIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("platform");
}

function linkOverlap(
  links: Array<Record<string, unknown>>,
  otherPlatformId: string,
  componentId: string,
  position: string,
  side: string,
): boolean {
  return links.some((link) => {
    const a = String(link.platform_a_id || "");
    const b = String(link.platform_b_id || "");
    const touches = (a === otherPlatformId || b === otherPlatformId);
    if (!touches) return false;
    if (String(link.maintenance_component_id || "") !== componentId) return false;
    return String(link.position || "front") === position && String(link.side || "both") === side;
  });
}

export function PlatformsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { session, role } = useAuth();
  const token = session?.access_token ?? "";
  const owner = role === "platform_owner";
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [maker, setMaker] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => readPlatformIdFromUrl());
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkOtherId, setLinkOtherId] = useState("");
  const [linkComponentId, setLinkComponentId] = useState("");
  const [linkPosition, setLinkPosition] = useState("front");
  const [linkSide, setLinkSide] = useState("both");
  const [linkEvidence, setLinkEvidence] = useState("");
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
      setLatencyMs(Math.round(performance.now() - t0));
      return data;
    },
    enabled: Boolean(token),
  });
  const health = useQuery({
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
    const hay = `${row.code} ${row.label}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });
  const selected = filtered.find((r) => String(r.id) === selectedId) || filtered[0];
  const systemLinkOpen = Number(conflicts.data?.totalsByType?.system_link ?? conflicts.data?.rows?.length ?? 0);
  const linkCount = rows.reduce((sum, row) => sum + Number(row.linkCount ?? 0), 0);

  const platformDetail = detail.data?.platform as Record<string, unknown> | undefined;
  const sisterVehicles = (detail.data?.vehicles ?? detail.data?.sisterVehicles ?? []) as Array<Record<string, unknown>>;
  const sharedLinks = (detail.data?.links ?? []) as Array<Record<string, unknown>>;
  const platformById = useMemo(() => new Map(rows.map((r) => [String(r.id), r])), [rows]);
  const componentLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const sys of browse.data?.systems ?? []) {
      for (const c of sys.components ?? []) map.set(c.id, c.plainName);
    }
    return map;
  }, [browse.data]);

  const indexLabel = health.data?.engineVersion != null
    ? `INDEX v${health.data.engineVersion}`
    : "INDEX";

  async function exportMatrix() {
    if (!selectedId || !token) return;
    try {
      const data = await exportPlatformMatrix(token, selectedId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `platform-${selected?.code || selectedId}-matrix.json`;
      a.click();
      URL.revokeObjectURL(url);
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
    if (linkOverlap(sharedLinks, linkOtherId, linkComponentId, linkPosition, linkSide)) {
      toast.error("A link with the same platform, component, and position already exists.");
      return;
    }
    setLinkBusy(true);
    try {
      await createPlatformComponentLink(token, selectedId, {
        platform_b_id: linkOtherId,
        maintenance_component_id: linkComponentId,
        position: linkPosition,
        side: linkSide,
        evidence_url: linkEvidence.trim(),
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

  return (
    <div className="flex w-full flex-col gap-space-lg p-margin">
      <nav className="font-mono-sm text-mono-sm uppercase tracking-wider text-on-surface-variant">
        DOMINION › MASTER DATA › VEHICLES › PLATFORMS{selected?.code ? ` › ${selected.code}` : ""}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline-xl text-headline-xl text-on-surface">Vehicles Modules: Platforms</h1>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm">{indexLabel}</span>
          </div>
          <p className="text-on-surface-variant text-body-md">Shared platforms, sister cars, and component links.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="rounded-[0.25rem] border border-outline-variant px-3 py-1.5 text-sm"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("page", "pending-motor-vehicles");
              url.searchParams.set("tab", "conflicts");
              window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
          >
            Diff Log
          </button>
          <button type="button" className="rounded-[0.25rem] border border-outline-variant px-3 py-1.5 text-sm" onClick={() => { void exportMatrix(); }}>
            Matrix Graph
          </button>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">ACTIVE CONSOLE</span>
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm">
            SCHEMA v{health.data?.engineVersion ?? "—"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Tracked platforms" value={String(rows.length)} />
        <Tile label="Shared component rules" value={String(linkCount)} />
        <Tile label="Pending validations" value={String(systemLinkOpen)} />
        <Tile label="Sync latency" value={latencyMs != null ? `${latencyMs}ms` : "—"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="rounded-[0.25rem] border border-outline-variant px-3 py-2 text-sm" placeholder="Search platform code" value={q} onChange={(e) => setQ(e.target.value)} />
        {makers.map((m) => (
          <button key={m} type="button" className={`rounded-[0.75rem] px-3 py-1 text-xs ${maker === m ? "bg-primary-container text-on-primary" : "bg-surface-container"}`} onClick={() => setMaker(maker === m ? "" : m)}>
            {m}
          </button>
        ))}
      </div>
      {platforms.isLoading ? (
        <p className="flex items-center gap-2 text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading platforms…</p>
      ) : (
        <div className="overflow-hidden rounded-[0.5rem] border border-outline-variant bg-surface-container-lowest">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface-container-low font-mono-sm text-mono-sm uppercase text-on-surface-variant">
              <tr>
                <th className="px-4 py-2">Platform code</th>
                <th className="px-4 py-2">Family</th>
                <th className="px-4 py-2">Sister models cluster</th>
                <th className="px-4 py-2">Shared platforms</th>
                <th className="px-4 py-2">Maker</th>
                <th className="px-4 py-2">→</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={String(row.id || row.code)}
                  className={`border-t border-outline-variant/40 hover:bg-surface-container-low cursor-pointer ${String(row.id) === String(selected?.id) ? "bg-primary-fixed/20" : ""}`}
                  onClick={() => setSelectedId(String(row.id))}
                >
                  <td className="px-4 py-2 font-mono font-semibold">{row.code}</td>
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2">{row.carCount ?? row.sisterCount ?? 0} cars</td>
                  <td className="px-4 py-2">{row.linkCount ?? 0} links</td>
                  <td className="px-4 py-2">{row.maker ? <span className="rounded bg-surface-container px-1.5 py-0.5 text-xs">{row.maker}</span> : null}</td>
                  <td className="px-4 py-2">
                    <button type="button" className="text-primary font-semibold" onClick={(e) => { e.stopPropagation(); setSelectedId(String(row.id)); }}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected ? (
        <section className="rounded-[0.5rem] border border-outline-variant bg-surface-container-lowest p-space-lg flex flex-col gap-space-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-headline-lg text-headline-lg">{selected.code} · {selected.label}</h2>
              <p className="font-mono-sm text-mono-sm text-secondary mt-1">
                PRIMARY KEY · {String(platformDetail?.id || selected.id)} · Body {String(platformDetail?.body_class || "")} · Market {String(platformDetail?.market || "")}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="rounded-[0.25rem] border border-outline-variant px-3 py-2 text-sm" onClick={() => { void exportMatrix(); }}>Export Matrix</button>
              <button type="button" className="rounded-[0.25rem] bg-primary-container px-3 py-2 text-sm font-semibold text-on-primary disabled:opacity-40" disabled={!owner} onClick={() => setLinkModalOpen(true)}>Add shared component</button>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wider text-secondary">Sister vehicles</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sisterVehicles.length ? sisterVehicles.map((car) => (
                <div key={String(car.id)} className="rounded border border-outline-variant/40 p-3 text-sm">
                  <p className="font-semibold">{String(car.make)} {String(car.model)}</p>
                  <p className="text-secondary text-xs">{String(car.chassis_code || "")} · {String(car.catalog_trim || "")}</p>
                  <p className="text-xs text-secondary mt-1">Role {String(car.platform_role || "sister")} · Verified {String(car.verified_fitment_count ?? car.fitment_count ?? 0)}</p>
                  <button
                    type="button"
                    className="mt-2 text-primary text-xs font-semibold"
                    onClick={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.set("page", "motor-vehicles");
                      url.searchParams.set("vehicle", String(car.id));
                      window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
                      window.dispatchEvent(new PopStateEvent("popstate"));
                      onNavigate("motor-vehicles");
                    }}
                  >
                    Inspect car
                  </button>
                </div>
              )) : (
                <p className="text-sm text-secondary">No sister cars linked yet.</p>
              )}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wider text-secondary">Shared components</h3>
            <table className="mt-2 min-w-full text-left text-xs">
              <thead className="bg-surface-container-low uppercase text-on-surface-variant">
                <tr><th className="px-3 py-2">Component</th><th className="px-3 py-2">Other platform</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">⋮</th></tr>
              </thead>
              <tbody>
                {sharedLinks.map((link) => {
                  const otherId = String(link.platform_a_id) === String(selected.id) ? link.platform_b_id : link.platform_a_id;
                  const other = platformById.get(String(otherId));
                  const comp = componentLabel.get(String(link.maintenance_component_id || "")) || String(link.component_name || link.maintenance_component_id || "");
                  return (
                    <tr key={String(link.id)} className="border-t border-outline-variant/30">
                      <td className="px-3 py-2">{comp}</td>
                      <td className="px-3 py-2 font-mono">{other?.code || String(otherId)}</td>
                      <td className="px-3 py-2">{String(link.scope || "component")} · {String(link.position || "front")}/{String(link.side || "both")}</td>
                      <td className="px-3 py-2">{link.conflict_status === "open" ? "Conflict open" : link.evidence_url ? "Verified" : "Needs source"}</td>
                      <td className="px-3 py-2 relative">
                        <button type="button" className="text-secondary" onClick={() => setMenuLinkId(menuLinkId === String(link.id) ? null : String(link.id))}>⋯</button>
                        {menuLinkId === String(link.id) ? (
                          <div className="absolute right-0 z-10 mt-1 rounded border bg-surface-container-lowest shadow p-2 flex flex-col gap-1">
                            <button type="button" className="text-left text-red-700 text-xs disabled:opacity-40" disabled={!owner} onClick={() => { void removeLink(String(link.id)); }}>Remove link</button>
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
      ) : null}

      {linkModalOpen && selectedId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setLinkModalOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-surface-container-lowest p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-md font-bold">Add shared component link</h3>
            <div className="mt-3 grid gap-2">
              <select className="rounded border px-2 py-1.5 text-sm" value={linkOtherId} onChange={(e) => setLinkOtherId(e.target.value)}>
                <option value="">Other platform…</option>
                {rows.filter((r) => String(r.id) !== String(selectedId)).map((r) => (
                  <option key={String(r.id)} value={String(r.id)}>{r.code} · {r.label}</option>
                ))}
              </select>
              <select className="rounded border px-2 py-1.5 text-sm" value={linkComponentId} onChange={(e) => setLinkComponentId(e.target.value)}>
                <option value="">Component…</option>
                {(browse.data?.systems ?? []).flatMap((sys) =>
                  (sys.components ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.plainName}</option>
                  )),
                )}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded border px-2 py-1.5 text-sm" value={linkPosition} onChange={(e) => setLinkPosition(e.target.value)}>
                  <option value="front">Front</option>
                  <option value="rear">Rear</option>
                </select>
                <select className="rounded border px-2 py-1.5 text-sm" value={linkSide} onChange={(e) => setLinkSide(e.target.value)}>
                  <option value="both">Both sides</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <input className="rounded border px-2 py-1.5 text-sm" placeholder="Evidence URL (required)" value={linkEvidence} onChange={(e) => setLinkEvidence(e.target.value)} />
              {linkOtherId && linkComponentId && linkOverlap(sharedLinks, linkOtherId, linkComponentId, linkPosition, linkSide) ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">Overlap: this platform link already exists for the same component and position.</p>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setLinkModalOpen(false)}>Cancel</button>
              <button type="button" className="rounded bg-primary-container px-3 py-1.5 text-sm font-semibold text-on-primary disabled:opacity-40" disabled={!owner || linkBusy} onClick={() => { void submitLink(); }}>Save link</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.5rem] border border-outline-variant bg-surface-container-lowest p-4">
      <div className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</div>
      <div className="mt-2 font-headline-xl text-headline-xl font-bold">{value}</div>
    </div>
  );
}
