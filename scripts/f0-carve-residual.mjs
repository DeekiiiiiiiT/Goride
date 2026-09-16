/**
 * F0 carve: move monolith body (helpers + routes + nested registrars) into
 * register_residual_monolith_routes.tsx. Boot keeps kernel + Deno.serve only.
 *
 * Usage: node scripts/f0-carve-residual.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const bootPath = path.join(
  ROOT,
  "supabase/functions/_fleet-server/make_server_legacy_boot.tsx",
);
const outPath = path.join(
  ROOT,
  "supabase/functions/_fleet-server/register_residual_monolith_routes.tsx",
);

const lines = fs.readFileSync(bootPath, "utf8").split(/\r?\n/);

const createIdx = lines.findIndex((l) =>
  l.startsWith("const app = createFleetFunction"),
);
const createEnd = (() => {
  for (let i = createIdx; i < lines.length; i++) {
    if (lines[i].trim() === "});") return i;
  }
  return -1;
})();
const tailIdx = lines.findIndex((l) =>
  l.includes("Global handler for unhandled promise"),
);

if (createIdx < 0 || createEnd < 0 || tailIdx < 0) {
  console.error({ createIdx, createEnd, tailIdx });
  process.exit(1);
}

// Everything before createFleetFunction, minus kernel/env imports kept on boot
const head = lines.slice(0, createIdx);
const body = lines.slice(createEnd + 1, tailIdx);
const tail = lines.slice(tailIdx);

const residual = [];
residual.push("/**");
residual.push(
  " * F0 carve — full residual monolith body (helpers, nested registrars, inline routes).",
);
residual.push(
  " * Behavior unchanged. Boot file is kernel + this registrar + Deno.serve only.",
);
residual.push(" */");
residual.push('import type { Hono } from "npm:hono@4.3.11";');

const skipImport = (t) =>
  t.includes("createFleetFunction") ||
  t.includes("assertRequiredEnv") ||
  t === 'import { Hono } from "npm:hono@4.3.11";' ||
  t.startsWith("import type { Hono }");

for (const line of head) {
  const t = line.trim();
  if (t.startsWith("import ") && skipImport(t)) continue;
  residual.push(line);
}

residual.push("");
residual.push("export function registerResidualMonolithRoutes(app: Hono) {");
for (const line of body) {
  residual.push(line.length ? `  ${line}` : "");
}
residual.push("}");
residual.push("");

fs.writeFileSync(outPath, residual.join("\n"));
console.log("Wrote residual", residual.length, "lines");

const boot = [];
boot.push("/**");
boot.push(
  " * Fleet monolith boot — F0 thin entry: kernel + registerResidualMonolithRoutes + Deno.serve.",
);
boot.push(" * See register_residual_monolith_routes.tsx for handlers (ADR-0021 / audit C1).");
boot.push(" */");
boot.push('import { createFleetFunction } from "../_shared/edgeKernel.ts";');
boot.push('import { assertRequiredEnv } from "./env_boot.ts";');
boot.push('import * as kv from "./kv_store.tsx";');
boot.push('import * as memCache from "./memory_cache.ts";');
boot.push(
  'import { registerResidualMonolithRoutes } from "./register_residual_monolith_routes.tsx";',
);
boot.push("");
boot.push("assertRequiredEnv();");
boot.push("");
boot.push("const app = createFleetFunction({");
boot.push('  slug: "make-server-37f42386",');
boot.push('  pathStyle: "monolith",');
boot.push("  serve: false,");
boot.push("});");
boot.push("");
boot.push("registerResidualMonolithRoutes(app);");
boot.push("");
boot.push(...tail);
boot.push("");

fs.writeFileSync(bootPath, boot.join("\n"));
console.log("Wrote boot", boot.length, "lines");
