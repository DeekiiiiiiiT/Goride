/**
 * Parameterized smoke for fleet edge functions.
 * Usage: node scripts/smoke-edge-fn.mjs <slug> [--base URL]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/smoke-edge-fn.mjs <slug> [--base URL]");
  process.exit(1);
}

const baseIdx = process.argv.indexOf("--base");
const base =
  (baseIdx >= 0 && process.argv[baseIdx + 1]) ||
  process.env.SMOKE_BASE_URL ||
  `${process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ""}/functions/v1/${slug}`;

if (!base || base.endsWith("/functions/v1/")) {
  console.error("Set SUPABASE_URL or pass --base <url>");
  process.exit(1);
}

const root = base.replace(/\/$/, "");
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}:`, e instanceof Error ? e.message : e);
  }
}

await check("health", async () => {
  const res = await fetch(`${root}/health`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const j = await res.json();
  if (j.status !== "ok" && j.service !== slug) {
    // accept either shape
    if (!j.service) throw new Error(JSON.stringify(j));
  }
});

await check("auth missing path 404-or-401", async () => {
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const res = await fetch(`${root}/zzz-does-not-exist-smoke`, {
    headers: anon
      ? { Authorization: `Bearer ${anon}`, apikey: anon }
      : {},
  });
  // Gateway may 401 before routing; function should not 200
  if (res.status === 200) throw new Error("unexpected 200 for missing path");
});

await check("cors preflight", async () => {
  const res = await fetch(`${root}/health`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,apikey,x-roam-product-line",
    },
  });
  if (![200, 204].includes(res.status)) throw new Error(`status ${res.status}`);
});

const manifestPath = path.join(ROOT, "supabase/functions", slug, "routes.generated.json");
await check("manifest present", async () => {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`missing ${manifestPath} — run edge-route-manifest.mjs ${slug}`);
  }
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(m.routes) || m.routes.length < 1) {
    throw new Error("empty manifest");
  }
});

if (failed) process.exit(1);
console.log(`smoke-edge-fn ${slug}: all checks passed`);
