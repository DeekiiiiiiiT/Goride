/**
 * Import COD-AB GeoJSON folder into delivery.admin_boundaries via the admin API.
 *
 * Usage (from repo root, with a dash admin JWT):
 *   deno run -A scripts/import-codab-boundaries.ts --dir "C:/path/to/Roam/Mapping/Jamaica" --token "$TOKEN"
 *   deno run -A scripts/import-codab-boundaries.ts --dir ... --token ... --dry-run
 *   deno run -A scripts/import-codab-boundaries.ts --dir ... --token ... --levels 0,1
 *
 * Expects layout:
 *   admin0-country/*.json
 *   admin1-parishes/*.json
 *   admin2-towns-by-parish/*.json
 *   admin3-communities-by-parish/*.json
 */
import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { parse } from "https://deno.land/std@0.224.0/flags/parse.ts";

const args = parse(Deno.args, {
  string: ["dir", "token", "url", "levels"],
  boolean: ["dry-run", "help"],
  default: {
    url: Deno.env.get("DELIVERY_FUNCTIONS_URL") ??
      "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/delivery",
    levels: "0,1,2,3",
  },
});

if (args.help || !args.dir || !args.token) {
  console.log(`Usage: deno run -A scripts/import-codab-boundaries.ts --dir <COD-AB root> --token <jwt> [--dry-run] [--levels 0,1]`);
  Deno.exit(args.help ? 0 : 1);
}

const allowedLevels = new Set(
  String(args.levels).split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)),
);

type IoVertex = { lat: number; lng: number };
type Part = { outer: IoVertex[]; holes: IoVertex[] };

function dropClosing(ring: IoVertex[]): IoVertex[] {
  if (ring.length < 2) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a.lat === b.lat && a.lng === b.lng) return ring.slice(0, -1);
  return ring;
}

function coordsToRing(coords: unknown): IoVertex[] | null {
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const points: IoVertex[] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    points.push({ lat, lng });
  }
  const ring = dropClosing(points);
  return ring.length >= 3 ? ring : null;
}

function geometryToParts(geometry: Record<string, unknown>): Part[] | null {
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const rings: IoVertex[][] = [];
    for (const r of geometry.coordinates as unknown[]) {
      const ring = coordsToRing(r);
      if (ring) rings.push(ring);
    }
    if (!rings.length) return null;
    return [{ outer: rings[0], holes: rings.slice(1) }];
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    const parts: Part[] = [];
    for (const poly of geometry.coordinates as unknown[]) {
      if (!Array.isArray(poly)) continue;
      const rings: IoVertex[][] = [];
      for (const r of poly) {
        const ring = coordsToRing(r);
        if (ring) rings.push(ring);
      }
      if (rings.length) parts.push({ outer: rings[0], holes: rings.slice(1) });
    }
    return parts.length ? parts : null;
  }
  return null;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\bsaint\b/g, "st").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unnamed";
}

function detectLevel(props: Record<string, unknown>): number | null {
  if (props.adm3_pcode) return 3;
  if (props.adm2_pcode) return 2;
  if (props.adm1_pcode) return 1;
  if (props.adm0_pcode) return 0;
  return null;
}

function featuresFromFile(raw: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (!raw || typeof raw !== "object") return out;
  const g = raw as Record<string, unknown>;
  if (g.type === "FeatureCollection" && Array.isArray(g.features)) {
    for (const f of g.features) {
      if (!f || typeof f !== "object") continue;
      const feat = f as Record<string, unknown>;
      const geom = feat.geometry && typeof feat.geometry === "object"
        ? feat.geometry as Record<string, unknown>
        : null;
      const props = feat.properties && typeof feat.properties === "object"
        ? feat.properties as Record<string, unknown>
        : {};
      if (!geom) continue;
      const parts = geometryToParts(geom);
      if (!parts) continue;
      const level = detectLevel(props);
      if (level == null || !allowedLevels.has(level)) continue;
      const nameKey = level === 3 ? "adm3_name" : level === 2 ? "adm2_name" : level === 1 ? "adm1_name" : "adm0_name";
      const codeKey = level === 3 ? "adm3_pcode" : level === 2 ? "adm2_pcode" : level === 1 ? "adm1_pcode" : "adm0_pcode";
      const parent =
        level === 3 ? props.adm2_pcode : level === 2 ? props.adm1_pcode : level === 1 ? props.adm0_pcode : null;
      const name = String(props[nameKey] ?? props.name ?? "Unnamed");
      out.push({
        admin_level: level,
        pcode: String(props[codeKey] ?? ""),
        parent_pcode: parent ? String(parent) : null,
        name,
        slug: slugify(name),
        multiPolygon: parts,
        area_sqkm: props.area_sqkm ?? null,
        center_lat: props.center_lat ?? null,
        center_lng: props.center_lon ?? props.center_lng ?? null,
        source: "cod-ab",
        source_version: props.version ?? null,
        valid_on: props.valid_on ?? null,
        properties: props,
      });
    }
  }
  return out;
}

const allFeatures: Array<Record<string, unknown>> = [];
for await (const entry of walk(String(args.dir), { exts: [".json", ".geojson"], includeDirs: false })) {
  try {
    const text = await Deno.readTextFile(entry.path);
    const parsed = JSON.parse(text);
    const feats = featuresFromFile(parsed);
    console.log(`${entry.path}: ${feats.length} feature(s)`);
    allFeatures.push(...feats);
  } catch (e) {
    console.error(`Failed ${entry.path}:`, e);
  }
}

console.log(`Total features to upsert: ${allFeatures.length}`);
if (allFeatures.length === 0) Deno.exit(1);

const chunk = 40;
let created = 0;
let updated = 0;
let skipped = 0;
const errors: string[] = [];

for (let i = 0; i < allFeatures.length; i += chunk) {
  const batch = allFeatures.slice(i, i + chunk);
  const res = await fetch(`${args.url}/admin/markets/boundaries/import`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      features: batch,
      dry_run: Boolean(args["dry-run"]),
      link_parishes: true,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("Batch failed", res.status, json);
    Deno.exit(1);
  }
  const report = json.report ?? {};
  created += report.created ?? 0;
  updated += report.updated ?? 0;
  skipped += report.skipped ?? 0;
  if (Array.isArray(report.errors)) errors.push(...report.errors);
  console.log(`Batch ${i / chunk + 1}:`, report);
}

console.log({ created, updated, skipped, errorCount: errors.length });
if (errors.length) console.error(errors.slice(0, 20));
