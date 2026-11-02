#!/usr/bin/env node
/**
 * CI guard: Supabase CLI version and v3 flag conventions (Rev 22 / docs/ci-red-root-cause.md).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function readText(path) {
  return readFileSync(path, "utf8");
}

function walkFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules") continue;
      walkFiles(p, acc);
    } else {
      acc.push(p);
    }
  }
  return acc;
}

// 1. Exact semver pin in package.json
const pkg = JSON.parse(readText(join(root, "package.json")));
const supabaseVer = pkg.devDependencies?.supabase;
if (!supabaseVer || !/^\d+\.\d+\.\d+$/.test(supabaseVer)) {
  errors.push(
    `package.json devDependencies.supabase must be exact semver x.y.z (got ${JSON.stringify(supabaseVer)})`,
  );
}

// 2. Workflows must not duplicate CLI install patterns
const workflowsDir = join(root, ".github", "workflows");
for (const file of readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))) {
  const text = readText(join(workflowsDir, file));
  if (text.includes("supabase/setup-cli")) {
    errors.push(`${file}: must not use supabase/setup-cli (use ./.github/actions/setup-supabase-cli)`);
  }
  if (/SUPABASE_CLI_VERSION\s*:/.test(text)) {
    errors.push(`${file}: must not set SUPABASE_CLI_VERSION (pin is only in package.json)`);
  }
  if (/setup-cli@v[\d]+[\s\S]*?version:\s*latest/m.test(text) || /uses:\s*supabase\/setup-cli[\s\S]*?version:\s*latest/m.test(text)) {
    errors.push(`${file}: must not use version: latest for Supabase CLI`);
  }
}

// 3. Jobs that run supabase must use composite action first
function parseWorkflowJobs(yamlText) {
  const jobs = [];
  const jobRe = /^  (\w[\w-]*):\s*\n/gm;
  let m;
  while ((m = jobRe.exec(yamlText)) !== null) {
    const jobName = m[1];
    const start = m.index;
    const next = yamlText.indexOf("\n  ", start + 1);
    const chunk = next === -1 ? yamlText.slice(start) : yamlText.slice(start, next);
    if (!chunk.includes("steps:")) continue;
    jobs.push({ jobName, chunk });
  }
  return jobs;
}

for (const file of readdirSync(workflowsDir).filter((f) => f.endsWith(".yml"))) {
  const text = readText(join(workflowsDir, file));
  for (const { jobName, chunk } of parseWorkflowJobs(text)) {
    const runsSupabase = /\brun:\s*[|>]?[\s\S]*?\bsupabase\b/m.test(chunk) || /\brun:\s*[^\n|]*\bsupabase\b/.test(chunk);
    if (!runsSupabase) continue;
    const stepBlocks = chunk.split(/\n      - name:/);
    let sawComposite = false;
    let firstSupabaseRun = false;
    for (let i = 0; i < stepBlocks.length; i++) {
      const block = stepBlocks[i];
      if (block.includes("uses: ./.github/actions/setup-supabase-cli")) {
        sawComposite = true;
      }
      const isRunWithSupabase =
        /\brun:\s*[|>]?[\s\S]*?\bsupabase\b/m.test(block) ||
        (/\brun:\s*/.test(block) && /\bsupabase\b/.test(block) && !block.includes("supabase/functions"));
      if (isRunWithSupabase && /\bsupabase (start|db|functions|migration|link)\b/.test(block)) {
        firstSupabaseRun = true;
        if (!sawComposite) {
          errors.push(`${file} job ${jobName}: runs supabase CLI without ./.github/actions/setup-supabase-cli earlier in the job`);
        }
        break;
      }
    }
    void firstSupabaseRun;
  }
}

// 4. Forbidden flags in package.json, scripts/, .github/
const scanRoots = [
  join(root, "package.json"),
  join(root, ".github"),
  join(root, "scripts"),
];

function isAllowedProjectRef(line) {
  return /\blink\b/.test(line) && /--project-ref\b/.test(line);
}

function scanContent(relPath, text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bsupabase\b/.test(line) && !/\bnpx supabase\b/.test(line)) continue;
    if (/--linked\b/.test(line)) {
      errors.push(`${relPath}:${i + 1}: must not use --linked (use --remote)`);
    }
    if (/--db-url\b/.test(line)) {
      errors.push(`${relPath}:${i + 1}: must not use --db-url`);
    }
    if (/--project-ref\b/.test(line) && !isAllowedProjectRef(line)) {
      errors.push(`${relPath}:${i + 1}: must not use --project-ref except on supabase link`);
    }
    if (/\bsupabase\b[\s\S]*--local\b/.test(line) || /--local\b[\s\S]*\bsupabase\b/.test(line)) {
      if (/\bsupabase (start|db|stop|status)\b/.test(line)) {
        errors.push(`${relPath}:${i + 1}: must not use --local on supabase commands`);
      }
    }
  }
}

scanContent("package.json", readText(join(root, "package.json")));

for (const dir of [join(root, "scripts"), join(root, ".github")]) {
  for (const file of walkFiles(dir)) {
    if (file.endsWith(".md")) continue;
    const rel = relative(root, file).replace(/\\/g, "/");
    if (rel === "scripts/assert-supabase-cli-pin.mjs") continue;
    const text = readText(file);
    if (!/\bsupabase\b/.test(text)) continue;
    scanContent(rel, text);
  }
}

if (errors.length) {
  console.error("assert-supabase-cli-pin failed:\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`OK — Supabase CLI pin ${supabaseVer} and v3 flag conventions.`);
process.exit(0);
