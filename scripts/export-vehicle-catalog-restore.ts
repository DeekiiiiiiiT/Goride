/**
 * Phase D restore-point export: dump vehicle_catalog to CSV before expansion import.
 * Usage: npx --yes tsx scripts/export-vehicle-catalog-restore.ts
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1]!;
      let val = m[2]!.trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), "apps/admin/.env.local"));
  loadEnvFile(resolve(process.cwd(), "supabase/.env"));

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";

  if (!url || !key) {
    console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — cannot export restore CSV.");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const PAGE = 500;
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("vehicle_catalog")
      .select("*")
      .order("make")
      .order("model")
      .order("production_start_year", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const cols = rows.length
    ? Object.keys(rows[0]!)
    : ["id", "make", "model", "production_start_year", "source", "import_batch_id"];
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => csvEscape(r[c])).join(","));
  }

  const outDir = resolve(process.cwd(), "ops");
  mkdirSync(outDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const outPath = resolve(outDir, `vehicle_catalog_restore_${today}.csv`);
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Exported ${rows.length} catalog rows → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
