import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const raw = readFileSync(
  "C:/Users/deeki/.cursor/projects/c-Users-deeki-OneDrive-Documents-App-and-Web-design-Roam-Goride/agent-tools/e2c92886-2e3c-4961-b94d-22007bbd2d4f.txt",
  "utf8",
);
const outer = JSON.parse(raw);
const text = String(outer.result || "");
const m = text.match(/<untrusted-data-[^>]+>\n([\s\S]*?)\n<\/untrusted-data/);
if (!m) throw new Error("no untrusted block");
const payload = JSON.parse(m[1]);
const rows = payload[0]?.json_agg || [];
const cols = [
  "id",
  "make",
  "model",
  "vehicle_class",
  "production_start_year",
  "production_end_year",
  "chassis_code",
  "engine_code",
  "source",
  "import_batch_id",
  "created_at",
  "updated_at",
];
const esc = (v) => {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};
const lines = [cols.join(",")];
for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
mkdirSync("ops", { recursive: true });
writeFileSync("ops/vehicle_catalog_restore_2026-09-14.csv", lines.join("\n"));
console.log("restore rows", rows.length);
