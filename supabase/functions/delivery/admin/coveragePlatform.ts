/**
 * Enterprise coverage publish / readiness helpers for Rush Markets.
 */
import {
  filterLiveCoverageZones,
  pointInPolygon,
  type CoverageMultiPolygon,
  type CoverageVertex,
  type CoverageZone,
} from "./coverageEval.ts";

export type ZoneRow = Record<string, unknown>;

export function normalizeKind(input: unknown): "include" | "exclude" {
  return String(input || "include").toLowerCase() === "exclude" ? "exclude" : "include";
}

function asMulti(raw: unknown): CoverageMultiPolygon | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!first || typeof first !== "object" || !("outer" in first)) return null;
  return raw as CoverageMultiPolygon;
}

function liveZoneRows(zones: unknown[]): Record<string, unknown>[] {
  return filterLiveCoverageZones(
    (zones as Record<string, unknown>[]).map((z) => ({
      ...z,
      kind: normalizeKind(z.kind),
      source: z.source != null ? String(z.source) : "manual",
      market_id: z.market_id != null ? String(z.market_id) : undefined,
    })),
  );
}

export function hasValidInclude(zones: unknown[]): boolean {
  return liveZoneRows(zones).some((row) => {
    const kind = normalizeKind(row.kind);
    if (kind !== "include") return false;
    const multi = asMulti(row.multiPolygon);
    if (multi && multi.some((p) => Array.isArray(p.outer) && p.outer.length >= 3)) return true;
    if (row.geom != null) return true;
    const poly = row.polygon;
    return Array.isArray(poly) && poly.length >= 3;
  });
}

export function zoneSnapshotPayload(z: ZoneRow) {
  const multi = asMulti(z.multiPolygon);
  return {
    id: z.id,
    market_id: z.market_id,
    name: z.name,
    kind: normalizeKind(z.kind),
    polygon: z.polygon,
    multiPolygon: multi,
    boundary_pcode: z.boundary_pcode ?? null,
    priority: z.priority ?? 0,
    source: z.source ?? "manual",
    center_lat: z.center_lat ?? null,
    center_lng: z.center_lng ?? null,
    radius_m: z.radius_m ?? null,
    is_active: z.is_active !== false,
    effective_from: z.effective_from ?? null,
    effective_to: z.effective_to ?? null,
    category: z.category ?? null,
    reason: z.reason ?? null,
    zone_policy: z.zone_policy ?? { action: "block" },
    schedules: z.schedules ?? null,
  };
}

export function zonesFromSnapshot(zonesJson: unknown): CoverageZone[] {
  if (!Array.isArray(zonesJson)) return [];
  return zonesJson.map((raw, idx) => {
    const z = raw as Record<string, unknown>;
    const multi = asMulti(z.multiPolygon);
    const polygon = Array.isArray(z.polygon) ? (z.polygon as CoverageVertex[]) : [];
    return {
      id: String(z.id ?? `snap-${idx}`),
      name: String(z.name ?? ""),
      market_id: z.market_id != null ? String(z.market_id) : undefined,
      kind: normalizeKind(z.kind),
      source: z.source != null ? String(z.source) : "manual",
      polygon: multi?.[0]?.outer?.length ? multi[0].outer : polygon,
      multiPolygon: multi ?? undefined,
      priority: z.priority != null ? Number(z.priority) : 0,
      is_active: z.is_active !== false,
      effective_from: z.effective_from != null ? String(z.effective_from) : null,
      effective_to: z.effective_to != null ? String(z.effective_to) : null,
      category: z.category != null ? String(z.category) : null,
      reason: z.reason != null ? String(z.reason) : null,
      schedules: Array.isArray(z.schedules) ? z.schedules as CoverageZone["schedules"] : undefined,
      zone_policy: z.zone_policy && typeof z.zone_policy === "object"
        ? z.zone_policy as CoverageZone["zone_policy"]
        : { action: "block" },
    };
  });
}

export function polygonSummary(polygon: unknown) {
  const poly = Array.isArray(polygon) ? (polygon as CoverageVertex[]) : [];
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const p of poly) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  return {
    vertexCount: poly.length,
    bounds: Number.isFinite(south)
      ? { south, west, north, east }
      : null,
  };
}

/** Cutouts must intersect at least one live include (any service area / official fallback). */
export function cutoutsIntersectDelivery(zones: ZoneRow[]): boolean {
  const live = liveZoneRows(zones);
  const includes = live.filter((z) => normalizeKind(z.kind) === "include");
  const excludes = live.filter((z) => normalizeKind(z.kind) === "exclude");
  if (includes.length === 0) return excludes.length === 0;
  const rings = includes
    .map((inc) => (Array.isArray(inc.polygon) ? (inc.polygon as CoverageVertex[]) : []))
    .filter((r) => r.length >= 3);
  if (!rings.length) return false;
  for (const ex of excludes) {
    const poly = Array.isArray(ex.polygon) ? (ex.polygon as CoverageVertex[]) : [];
    if (poly.length < 3) continue;
    const hits = poly.some((p) => rings.some((ring) => pointInPolygon(p.lat, p.lng, ring)));
    if (!hits) return false;
  }
  return true;
}

export type ReadinessCheck = {
  id: string;
  ok: boolean;
  label: string;
  detail?: string;
};

export function buildReadinessChecks(opts: {
  publishedZones: ZoneRow[];
  draftDirty: boolean;
  merchantCount: number;
  courierCount: number;
  merchantsMin: number;
  couriersMin: number;
}): { ready: boolean; checks: ReadinessCheck[] } {
  const checks: ReadinessCheck[] = [];
  const hasInclude = hasValidInclude(opts.publishedZones);
  checks.push({
    id: "delivery_area",
    ok: hasInclude,
    label: "Published delivery area",
    detail: hasInclude ? "Town has a published delivery border" : "Publish a delivery area first",
  });
  const orphansOk = cutoutsIntersectDelivery(opts.publishedZones);
  checks.push({
    id: "no_orphan_cutouts",
    ok: orphansOk,
    label: "Cutouts inside delivery area",
    detail: orphansOk ? "All cutouts intersect the delivery area" : "A cutout sits outside the town border",
  });
  checks.push({
    id: "draft_clean",
    ok: !opts.draftDirty,
    label: "Draft published",
    detail: opts.draftDirty ? "Unpublished draft changes — publish before activating" : "No unpublished changes",
  });
  const merchantsOk = opts.merchantCount >= opts.merchantsMin;
  checks.push({
    id: "merchants_ready",
    ok: merchantsOk,
    label: `Merchants ready (≥${opts.merchantsMin})`,
    detail: `${opts.merchantCount} merchant(s) matched`,
  });
  const couriersOk = opts.courierCount >= opts.couriersMin;
  checks.push({
    id: "couriers_ready",
    ok: couriersOk,
    label: `Couriers ready (≥${opts.couriersMin})`,
    detail: `${opts.courierCount} courier(s) matched`,
  });
  return { ready: checks.every((c) => c.ok), checks };
}

export { evaluateCoverage, evaluateLiveCoverage } from "./coverageEval.ts";
