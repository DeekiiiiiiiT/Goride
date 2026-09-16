/**
 * Pin npm:hono → npm:hono@4.3.11 under _fleet-server (Phase H2).
 * Run: node scripts/pin-fleet-hono.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "functions",
  "_fleet-server",
);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(root)) {
  const raw = fs.readFileSync(file, "utf8");
  let next = raw;
  // Already-pinned paths first — avoid double-pin
  next = next.replaceAll("npm:hono@4.3.11@", "npm:hono@4.3.11");
  next = next.replace(
    /from\s+(["'])npm:hono(?!@)(\/[^"']*)?\1/g,
    (_m, q, sub = "") => `from ${q}npm:hono@4.3.11${sub}${q}`,
  );
  next = next.replace(
    /from\s+(["'])https:\/\/deno\.land\/x\/hono@v4\.3\.11\/mod\.ts\1/g,
    `from $1npm:hono@4.3.11$1`,
  );
  if (next !== raw) {
    fs.writeFileSync(file, next, "utf8");
    changed += 1;
    console.log("pinned", path.relative(root, file));
  }
}
console.log(`Done. Updated ${changed} files.`);
