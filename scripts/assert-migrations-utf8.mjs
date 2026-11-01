#!/usr/bin/env node
/**
 * Postgres rejects migration files that are not valid UTF-8. Catch Windows-1252
 * smart punctuation (e.g. em dash as 0x97) before supabase db reset in CI.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");
const decoder = new TextDecoder("utf-8", { fatal: true });

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
const invalid = [];
const bom = [];

for (const file of files) {
  const bytes = await readFile(join(migrationsDir, file));
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bom.push(file);
    continue;
  }
  try {
    decoder.decode(bytes);
  } catch {
    invalid.push(file);
  }
}

if (bom.length) {
  console.error("Migration files must not start with a UTF-8 BOM (Postgres rejects EF BB BF on fresh replay):");
  for (const file of bom) {
    console.error(`  ${file}`);
  }
  console.error("Create migrations with supabase migration new; do not use PowerShell Out-File / Set-Content -Encoding utf8.");
  process.exit(1);
}

if (invalid.length) {
  console.error("Migration files are not valid UTF-8 (Postgres will reject them on fresh replay):");
  for (const file of invalid) {
    console.error(`  ${file}`);
  }
  console.error("Use ASCII punctuation in comments and save as UTF-8 without BOM.");
  process.exit(1);
}

console.log(`OK: ${files.length} migration files are valid UTF-8.`);
