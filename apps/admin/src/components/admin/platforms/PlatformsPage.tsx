// Stitch: AM-S3 platform_record_shared_components
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import {
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

export function PlatformsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [q, setQ] = useState("");
  const [maker, setMaker] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => readPlatformIdFromUrl());
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

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

  const rows = (Array.isArray(platforms.data?.items) ? platforms.data?.items : platforms.data?.platforms ?? []) as PlatformRow[];
  const makers = useMemo(() => [...new Set(rows.map((r) => String(r.maker || "").trim()).filter(Boolean))], [rows]);
  const filtered = rows.filter((row) => {
    if (maker && String(row.maker) !== maker) return false;
    const hay = `${row.code} ${row.label}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });
  const selected = filtered.find((r) => String(r.id) === selectedId) || filtered[0];
  const systemLinkOpen = Number(conflicts.data?.totalsByType?.system_link ?? conflicts.data?.rows?.length ?? 0);
  const linkCount = rows.reduce((sum, row) => sum + Number(row.linkCount ?? 0), 0) || Number(detail.data?.linkCount ?? 0);

  const platformDetail = detail.data?.platform as Record<string, unknown> | undefined;
  const sisterVehicles = (detail.data?.vehicles ?? detail.data?.sisterVehicles ?? []) as Array<Record<string, unknown>>;
  const sharedLinks = (detail.data?.links ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="flex w-full flex-col gap-space-lg p-margin">
      <nav className="font-mono-sm text-mono-sm uppercase tracking-wider text-on-surface-variant">
        DOMINION › MASTER DATA › VEHICLES › PLATFORMS{selected?.code ? ` › ${selected.code}` : ""}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline-xl text-headline-xl text-on-surface">Vehicles Modules: Platforms</h1>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm">INDEX</span>
          </div>
          <p className="text-on-surface-variant text-body-md">Shared platforms, sister cars, and component links.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-[0.25rem] border border-outline-variant px-3 py-1.5 text-sm">Diff Log</button>
          <button type="button" className="rounded-[0.25rem] border border-outline-variant px-3 py-1.5 text-sm">Matrix Graph</button>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">ACTIVE CONSOLE</span>
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm">SCHEMA v{health.data?.engineVersion ?? "—"}</span>
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
                  <td className="px-4 py-2 font-mono font-semibold">{row.code || "—"}</td>
                  <td className="px-4 py-2">{row.label || "—"}</td>
                  <td className="px-4 py-2">{row.carCount ?? row.sisterCount ?? "—"} cars</td>
                  <td className="px-4 py-2">{row.linkCount ?? "—"} links</td>
                  <td className="px-4 py-2 text-primary">Open</td>
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
                PRIMARY KEY · {String(platformDetail?.id || selected.id)} · Body {String(platformDetail?.body_class || "—")} · Market {String(platformDetail?.market || "—")}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="rounded-[0.25rem] border border-outline-variant px-3 py-2 text-sm">Export Matrix</button>
              <button type="button" className="rounded-[0.25rem] bg-primary-container px-3 py-2 text-sm font-semibold text-on-primary">Add shared component</button>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wider text-secondary">Sister vehicles</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sisterVehicles.length ? sisterVehicles.map((car) => (
                <div key={String(car.id)} className="rounded border border-outline-variant/40 p-3 text-sm">
                  <p className="font-semibold">{String(car.make)} {String(car.model)}</p>
                  <p className="text-secondary text-xs">{String(car.chassis_code || "")} · {String(car.catalog_trim || "")}</p>
                  <button type="button" className="mt-2 text-primary text-xs font-semibold" onClick={() => onNavigate("motor-vehicles")}>Inspect car</button>
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
                <tr><th className="px-3 py-2">Component</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">⋮</th></tr>
              </thead>
              <tbody>
                {sharedLinks.map((link) => (
                  <tr key={String(link.id)} className="border-t border-outline-variant/30">
                    <td className="px-3 py-2">{String(link.maintenance_component_id || "—").slice(0, 8)}…</td>
                    <td className="px-3 py-2">{String(link.scope || "component")}</td>
                    <td className="px-3 py-2">{link.evidence_url ? "Verified" : "Needs source"}</td>
                    <td className="px-3 py-2">⋯</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
