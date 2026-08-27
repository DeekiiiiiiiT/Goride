/**
 * Import COD-AB GeoJSON into delivery.admin_boundaries via upsert_admin_boundary RPC
 * using the Supabase service role (no dash-admin JWT required).
 *
 * Usage:
 *   set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or pass --url --key)
 *   deno run -A scripts/import-codab-via-sql.ts --dir "<Mapping/Jamaica>" --levels 0,1
 *   deno run -A scripts/import-codab-via-sql.ts --dir "…" --levels 0,1 --dry-run
 */
import { walk } from "jsr:@std/fs@1/walk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function flag(name: string, fallback = ""): string {
  const i = Deno.args.indexOf(`--${name}`);
  if (i >= 0 && Deno.args[i + 1] && !Deno.args[i + 1].startsWith("--")) return Deno.args[i + 1];
  return fallback;
}

const args = {
  dir: flag("dir"),
  url: flag("url", Deno.env.get("SUPABASE_URL") ?? "https://csfllzzastacofsvcdsc.supabase.co"),
  key: flag("key", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""),
  levels: flag("levels", "0,1,2,3"),
  "dry-run": Deno.args.includes("--dry-run"),
  help: Deno.args.includes("--help"),
  "link-parishes": Deno.args.includes("--link-parishes") || !Deno.args.includes("--no-link-parishes"),
};

if (args.help || !args.dir || !args.key) {
  console.log(
    `Usage: deno run -A scripts/import-codab-via-sql.ts --dir <COD-AB root> [--key $SUPABASE_SERVICE_ROLE_KEY] [--levels 0,1] [--dry-run]`,
  );
  Deno.exit(args.help ? 0 : 1);
}

const allowedLevels = new Set(
  String(args.levels).split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)),
);

function slugify(name: string): string {
  return name.toLowerCase().replace(/\bsaint\b/g, "st").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "unnamed";
}

function detectLevel(props: Record<string, unknown>): number | null {
  if (props.adm3_pcode) return 3;
  if (props.adm2_pcode) return 2;
  if (props.adm1_pcode) return 1;
  if (props.adm0_pcode) return 0;
  return null;
}

type FeatureRow = {
  admin_level: number;
  pcode: string;
  parent_pcode: string | null;
  name: string;
  slug: string;
  geojson: Record<string, unknown>;
  area_sqkm: number | null;
  center_lat: number | null;
  center_lng: number | null;
  source_version: string | null;
  valid_on: string | null;
  properties: Record<string, unknown>;
};

function featuresFromFile(raw: unknown): FeatureRow[] {
  const out: FeatureRow[] = [];
  if (!raw || typeof raw !== "object") return out;
  const g = raw as Record<string, unknown>;
  if (g.type !== "FeatureCollection" || !Array.isArray(g.features)) return out;
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
    const level = detectLevel(props);
    if (level == null || !allowedLevels.has(level)) continue;
    const nameKey = level === 3
      ? "adm3_name"
      : level === 2
      ? "adm2_name"
      : level === 1
      ? "adm1_name"
      : "adm0_name";
    const codeKey = level === 3
      ? "adm3_pcode"
      : level === 2
      ? "adm2_pcode"
      : level === 1
      ? "adm1_pcode"
      : "adm0_pcode";
    const parent =
      level === 3 ? props.adm2_pcode : level === 2 ? props.adm1_pcode : level === 1 ? props.adm0_pcode : null;
    const name = String(props[nameKey] ?? props.name ?? "Unnamed");
    const pcode = String(props[codeKey] ?? "");
    if (!pcode) continue;
    out.push({
      admin_level: level,
      pcode,
      parent_pcode: parent ? String(parent) : null,
      name,
      slug: slugify(name),
      geojson: geom,
      area_sqkm: typeof props.area_sqkm === "number" ? props.area_sqkm : null,
      center_lat: typeof props.center_lat === "number" ? props.center_lat : null,
      center_lng: typeof props.center_lon === "number"
        ? props.center_lon
        : typeof props.center_lng === "number"
        ? props.center_lng
        : null,
      source_version: props.version != null ? String(props.version) : null,
      valid_on: props.valid_on != null ? String(props.valid_on) : null,
      properties: props,
    });
  }
  return out;
}

const all: FeatureRow[] = [];
for await (const entry of walk(String(args.dir), { exts: [".json", ".geojson"], includeDirs: false })) {
  try {
    const text = await Deno.readTextFile(entry.path);
    const feats = featuresFromFile(JSON.parse(text));
    console.log(`${entry.path}: ${feats.length}`);
    all.push(...feats);
  } catch (e) {
    console.error(`Failed ${entry.path}:`, e);
  }
}

console.log(`Total: ${all.length}`);
if (all.length === 0) Deno.exit(1);
if (args["dry-run"]) {
  const byLevel = new Map<number, number>();
  for (const f of all) byLevel.set(f.admin_level, (byLevel.get(f.admin_level) ?? 0) + 1);
  console.log("Dry-run counts by level:", Object.fromEntries(byLevel));
  const kingston = all.find((f) => f.slug === "kingston" && f.admin_level === 1);
  console.log("Kingston admin1:", kingston?.pcode, kingston?.name);
  Deno.exit(0);
}

const sb = createClient(String(args.url), String(args.key), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let ok = 0;
let fail = 0;
const errors: string[] = [];

for (const f of all) {
  const { data, error } = await sb.schema("delivery").rpc("upsert_admin_boundary", {
    p_admin_level: f.admin_level,
    p_pcode: f.pcode,
    p_parent_pcode: f.parent_pcode,
    p_name: f.name,
    p_slug: f.slug,
    p_geojson: f.geojson,
    p_area_sqkm: f.area_sqkm,
    p_center_lat: f.center_lat,
    p_center_lng: f.center_lng,
    p_source: "cod-ab",
    p_source_version: f.source_version,
    p_valid_on: f.valid_on,
    p_properties: f.properties,
  });
  if (error) {
    fail++;
    errors.push(`${f.pcode}: ${error.message}`);
    console.error("FAIL", f.pcode, error.message);
  } else {
    ok++;
    if (ok % 25 === 0) console.log(`Upserted ${ok}…`);
  }
}

// Link admin1 → service_parishes by slug (same as HTTP importer)
if (args["link-parishes"]) {
  const admin1 = all.filter((f) => f.admin_level === 1);
  for (const f of admin1) {
    const { data: parish } = await sb.schema("delivery").from("service_parishes").select("id").eq(
      "slug",
      f.slug,
    ).maybeSingle();
    if (!parish?.id) {
      console.warn(`No parish slug match for ${f.slug} (${f.pcode})`);
      continue;
    }
    const { error } = await sb.schema("delivery").rpc("promote_boundary_to_parish", {
      p_parish_id: parish.id,
      p_pcode: f.pcode,
    });
    if (error) {
      console.error(`Promote ${f.slug}:`, error.message);
      errors.push(`promote ${f.slug}: ${error.message}`);
    } else {
      console.log(`Promoted parish ${f.slug} ← ${f.pcode}`);
    }
  }
}

console.log({ ok, fail, errorCount: errors.length });
if (errors.length) console.error(errors.slice(0, 30));
Deno.exit(fail ? 1 : 0);
