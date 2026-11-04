import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const envPath = join(root, "supabase", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      const key = line.slice(0, i);
      let val = line.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return [key, val];
    }),
);
const url = env.DATABASE_URL || env.SUPABASE_DB_URL;
if (!url) {
  console.error("No DATABASE_URL or SUPABASE_DB_URL in supabase/.env.local");
  process.exit(1);
}
const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: node scripts/run-add-a-part-sql-check.mjs <sql-file>");
  process.exit(1);
}
const r = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", sqlFile], { encoding: "utf8" });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
