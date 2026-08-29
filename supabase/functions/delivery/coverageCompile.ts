/**
 * Compile market polygons → delivery.coverage_cells (res 7 + 8).
 * Mirror of ADR 0013 boundary policy via @roam/spatial / geoIndex.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  COMPILE_H3_RESOLUTIONS,
  DEFAULT_H3_RESOLUTION,
  h3DiskFromCell,
  kRingForRadiusKmWithMargin,
  latLngToH3,
  polygonToH3Cells,
  type LatLng,
} from "../_shared/h3/geoIndex.ts";
import { filterLiveCoverageZones } from "./admin/coverageEval.ts";

type ZoneRow = {
  kind?: string | null;
  source?: string | null;
  market_id?: string | null;
  polygon?: unknown;
};

function parsePolygon(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  // MultiPolygon parts form: [{ outer, holes }]
  if (raw.length > 0 && raw[0] && typeof raw[0] === "object" && "outer" in (raw[0] as object)) {
    const out: LatLng[] = [];
    for (const part of raw as Array<{ outer?: unknown; holes?: unknown }>) {
      if (!Array.isArray(part.outer)) continue;
      for (const v of part.outer) {
        if (!v || typeof v !== "object") continue;
        const lat = Number((v as { lat?: unknown }).lat);
        const lng = Number((v as { lng?: unknown }).lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
      }
    }
    return out;
  }
  const out: LatLng[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const lat = Number((v as { lat?: unknown }).lat);
    const lng = Number((v as { lng?: unknown }).lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
  }
  return out;
}

/** Compile each polygon part separately so MultiPolygon islands get H3 coverage. */
function polygonsForCompile(raw: unknown): LatLng[][] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 0 && raw[0] && typeof raw[0] === "object" && "outer" in (raw[0] as object)) {
    const parts: LatLng[][] = [];
    for (const part of raw as Array<{ outer?: unknown }>) {
      const ring = parsePolygon(Array.isArray(part.outer) ? part.outer : []);
      if (ring.length >= 3) parts.push(ring);
    }
    return parts;
  }
  const ring = parsePolygon(raw);
  return ring.length >= 3 ? [ring] : [];
}

export async function compileMarketCoverageCells(
  db: SupabaseClient,
  marketId: string,
  zones: ZoneRow[],
): Promise<{ include: number; exclude: number }> {
  await db.from("coverage_cells").delete().eq("market_id", marketId);

  const liveZones = filterLiveCoverageZones(
    zones.map((z) => ({
      ...z,
      market_id: z.market_id ?? marketId,
      source: z.source ?? "manual",
    })),
  );

  const rows: Array<{ market_id: string; h3_cell: string; h3_res: number; kind: string }> = [];
  let include = 0;
  let exclude = 0;

  for (const res of COMPILE_H3_RESOLUTIONS) {
    for (const z of liveZones) {
      const kind = z.kind === "exclude" ? "exclude" : "include";
      for (const poly of polygonsForCompile(z.polygon)) {
        const cells = polygonToH3Cells(poly, res, kind);
        for (const cell of cells) {
          rows.push({ market_id: marketId, h3_cell: cell, h3_res: res, kind });
          if (kind === "exclude") exclude += 1;
          else include += 1;
        }
      }
    }
  }

  // Dedupe by PK
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const k = `${r.market_id}|${r.h3_res}|${r.h3_cell}|${r.kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (unique.length > 0) {
    const chunk = 500;
    for (let i = 0; i < unique.length; i += chunk) {
      const { error } = await db.from("coverage_cells").insert(unique.slice(i, i + chunk));
      if (error) throw new Error(error.message);
    }
  }

  return { include, exclude };
}

export async function recomputeMerchantCoverageCells(
  db: SupabaseClient,
  merchantId: string,
  opts: {
    lat: number;
    lng: number;
    deliveryRadiusKm: number;
    marketId: string | null;
  },
): Promise<number> {
  await db.from("merchant_coverage_cells").delete().eq("merchant_id", merchantId);
  if (!opts.marketId || !Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) return 0;

  const radius = Math.max(1, Math.min(50, Number(opts.deliveryRadiusKm) || 8));
  let inserted = 0;

  for (const res of COMPILE_H3_RESOLUTIONS) {
    const storeCell = latLngToH3(opts.lat, opts.lng, res);
    const k = kRingForRadiusKmWithMargin(radius, res);
    const disk = new Set(h3DiskFromCell(storeCell, k));

    const { data: marketCells } = await db
      .from("coverage_cells")
      .select("h3_cell")
      .eq("market_id", opts.marketId)
      .eq("h3_res", res)
      .eq("kind", "include");

    const include = new Set((marketCells ?? []).map((r) => String(r.h3_cell)));
    const { data: excludeRows } = await db
      .from("coverage_cells")
      .select("h3_cell")
      .eq("market_id", opts.marketId)
      .eq("h3_res", res)
      .eq("kind", "exclude");
    const exclude = new Set((excludeRows ?? []).map((r) => String(r.h3_cell)));

    const rows: Array<{ merchant_id: string; h3_cell: string; h3_res: number }> = [];
    for (const cell of disk) {
      if (!include.has(cell)) continue;
      if (exclude.has(cell)) continue;
      rows.push({ merchant_id: merchantId, h3_cell: cell, h3_res: res });
    }

    if (rows.length > 0) {
      const { error } = await db.from("merchant_coverage_cells").insert(rows);
      if (error) throw new Error(error.message);
      inserted += rows.length;
    }
  }

  void DEFAULT_H3_RESOLUTION;
  return inserted;
}

export type CoverageDiff = {
  added: number;
  removed: number;
  include_cells: number;
  exclude_cells: number;
};

export async function previewCoverageDiff(
  db: SupabaseClient,
  marketId: string,
  zones: ZoneRow[],
): Promise<CoverageDiff> {
  const { data: existing } = await db
    .from("coverage_cells")
    .select("h3_cell, h3_res, kind")
    .eq("market_id", marketId)
    .eq("h3_res", DEFAULT_H3_RESOLUTION);

  const before = new Set(
    (existing ?? []).map((r) => `${r.kind}:${r.h3_cell}`),
  );

  const after = new Set<string>();
  let include = 0;
  let exclude = 0;
  for (const z of zones) {
    const kind = z.kind === "exclude" ? "exclude" : "include";
    for (const poly of polygonsForCompile(z.polygon)) {
      const cells = polygonToH3Cells(poly, DEFAULT_H3_RESOLUTION, kind);
      for (const cell of cells) {
        after.add(`${kind}:${cell}`);
        if (kind === "exclude") exclude += 1;
        else include += 1;
      }
    }
  }

  let added = 0;
  let removed = 0;
  for (const k of after) if (!before.has(k)) added += 1;
  for (const k of before) if (!after.has(k)) removed += 1;

  return { added, removed, include_cells: include, exclude_cells: exclude };
}
