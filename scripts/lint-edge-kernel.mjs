/**
 * Fail if any supabase/functions slash-star /src/main.ts constructs Hono
 * outside createFleetFunction. ADR-0020 — structural parity for fleet edge.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FUNCS = path.join(ROOT, "supabase/functions");

const SKIP = new Set(["_shared", "_fleet-server"]);

let failed = false;

for (const name of fs.readdirSync(FUNCS)) {
  if (SKIP.has(name) || name.startsWith(".")) continue;
  const mainPath = path.join(FUNCS, name, "src", "main.ts");
  if (!fs.existsSync(mainPath)) continue;
  const src = fs.readFileSync(mainPath, "utf8");
  const usesKernel = /createFleetFunction\s*\(/.test(src);
  const handHono = /new\s+Hono\s*\(/.test(src);
  if (!usesKernel) {
    console.error(`[lint-edge-kernel] ${name}/src/main.ts must call createFleetFunction`);
    failed = true;
  }
  if (handHono) {
    console.error(
      `[lint-edge-kernel] ${name}/src/main.ts must not call new Hono() — use createFleetFunction only`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log("[lint-edge-kernel] ok");
