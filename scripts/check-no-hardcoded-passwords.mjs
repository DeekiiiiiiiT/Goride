#!/usr/bin/env node
/**
 * Refuse a hard-coded password that sits next to a production Supabase URL.
 *
 * Why: on 24 Nov 2026 four live test accounts had to be locked because their passwords were
 * committed in this repo. Test-account passwords must come from the environment
 * (scripts/lib/testAccounts.mjs), never from source or docs.
 *
 * Rules:
 *  - a password-ish assignment with a quoted literal, in a file that also points at a production
 *    `<ref>.supabase.co` project, is a failure;
 *  - the same assignment beside a known production smoke-account email is a failure even when the
 *    URL lives in another file;
 *  - local-only fixtures are allowed: a file that mentions 127.0.0.1 / localhost / @local.test /
 *    testcopy is skipped, and so is anything already reading from process.env / Deno.env.
 *
 * Never prints the matched value — only file:line.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage", ".vercel", ".turbo", "vendor",
]);
const EXTS = /\.(mjs|cjs|js|jsx|ts|tsx|md|mdx|sql|yml|yaml|json|sh|ps1)$/;
const MAX_BYTES = 600_000;

/** `<something>password = "literal"` / `password: 'literal'` / `passwd = \`literal\`` */
const ASSIGNMENT = /\b(?:pass(?:word)?|passwd|pwd)\s*[:=]\s*(["'`])([^"'`\s]{6,})\1/gi;
/** Values that are obviously placeholders, not credentials. */
const PLACEHOLDER = /^(?:\$\{|<|your[-_]|changeme|placeholder|example|xxx|todo|\*+|ci-placeholder)/i;
/** A value built at runtime (`${randomUUID()}`, a call, concatenation) is not a hard-coded secret. */
const COMPUTED = /\$\{|[()=+]|\brandomUUID\b/i;
const PROD_URL = /\b[a-z0-9]{15,}\.supabase\.co\b/i;
const LOCAL_ONLY = /127\.0\.0\.1|localhost|@local\.test|testcopy/i;
const PROD_ACCOUNT = /seed-(?:courier|customer|island-grill)@|user-mgmt-smoke@|@roamrush\.app|@roamenterprise\.co/i;
/** Reading from the environment is exactly what we want. */
const FROM_ENV = /process\.env|Deno\.env|import\.meta\.env/;

const findings = [];

function scanFile(abs) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
  let src;
  try { src = fs.readFileSync(abs, "utf8"); } catch { return; }
  const prodUrl = PROD_URL.test(src);
  const prodAccount = PROD_ACCOUNT.test(src);
  const localOnly = LOCAL_ONLY.test(src);
  if (localOnly) return;
  if (!prodUrl && !prodAccount) return;

  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    ASSIGNMENT.lastIndex = 0;
    let m;
    while ((m = ASSIGNMENT.exec(line)) !== null) {
      const value = m[2];
      if (PLACEHOLDER.test(value)) continue;
      if (COMPUTED.test(value)) continue;
      // the same line reading from env is fine (e.g. `const p = process.env.X || "fallback"`)
      if (FROM_ENV.test(line)) continue;
      findings.push({ file: rel, line: i + 1, why: prodUrl ? "prod supabase.co URL" : "prod account" });
    }
  });
}

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { walk(abs); continue; }
    if (!EXTS.test(e.name)) continue;
    try { if (fs.statSync(abs).size > MAX_BYTES) continue; } catch { continue; }
    scanFile(abs);
  }
}

walk(ROOT);

if (findings.length === 0) {
  console.log("No hard-coded password next to a production Supabase URL. OK.");
  process.exit(0);
}

console.error("");
console.error("Hard-coded password next to production credentials — refusing this push.");
console.error("Move the value to an environment variable (see scripts/lib/testAccounts.mjs).");
console.error("");
for (const f of findings.slice(0, 40)) console.error(`  ${f.file}:${f.line}  (${f.why})`);
if (findings.length > 40) console.error(`  … and ${findings.length - 40} more`);
console.error("");
process.exit(1);
