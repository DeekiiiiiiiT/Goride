/**
 * Local bookkeeping for the M4/M5 runs. Everything lands in .r2-migration/ (git-ignored):
 * the copy manifest (what is in R2, ok/not ok) and the reference backup written before M5
 * changes any value. Never contains secrets.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const MIGRATION_DIR = ".r2-migration";

export function migrationDir(root) {
  return resolve(root, MIGRATION_DIR);
}

/** 20261124T225548Z — sortable, no colons (Windows-safe). */
export function stamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return file;
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Writes the copy manifest twice: a timestamped copy and manifest-latest.json (the file M5
 * reads by default). Returns both paths.
 */
export function saveManifest({ dir, entries, script, at = new Date() }) {
  const payload = {
    script,
    createdAt: at.toISOString(),
    counts: countManifest(entries),
    entries,
  };
  const timeStamped = writeJson(resolve(dir, `manifest-${stamp(at)}.json`), payload);
  const latest = writeJson(resolve(dir, "manifest-latest.json"), payload);
  return { manifest: timeStamped, latest };
}

/** Dry-run counterpart of saveManifest: the copy plan, not a claim that anything was copied. */
export function savePlan({ dir, entries, script, at = new Date() }) {
  const payload = {
    script,
    createdAt: at.toISOString(),
    kind: "plan",
    counts: countManifest(entries.filter((e) => !e.skip)),
    entries,
  };
  const timeStamped = writeJson(resolve(dir, `plan-${stamp(at)}.json`), payload);
  const latest = writeJson(resolve(dir, "plan-latest.json"), payload);
  return { plan: timeStamped, latest };
}

export function countManifest(entries) {
  const list = entries ?? [];
  const skipped = list.filter((e) => e.skip).length;
  return {
    total: list.length,
    ok: list.filter((e) => e.ok === true).length,
    failed: list.filter((e) => e.ok === false && !e.skip).length,
    skipped,
    bytes: list.filter((e) => e.ok === true).reduce((sum, e) => sum + Number(e.size ?? 0), 0),
  };
}

/** Newest manifest-*.json (or plan-*.json) in the folder, newest first by name. */
export function newestFile(dir, prefix) {
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  const match = names
    .filter((n) => n.startsWith(prefix) && n.endsWith(".json") && n !== `${prefix}-latest.json`)
    .sort();
  return match.length ? resolve(dir, match[match.length - 1]) : null;
}

export function loadManifestFile(file) {
  const parsed = readJson(file);
  if (!parsed || !Array.isArray(parsed.entries)) throw new Error(`not a manifest: ${file}`);
  return parsed;
}

/**
 * Entries of the copied files: the real manifest when M4 has applied, else the newest dry-run
 * plan (entries that would be copied). Returns [] when neither exists.
 */
export function loadCopiedEntries(dir) {
  const manifestFile = resolve(dir, "manifest-latest.json");
  if (existsSync(manifestFile)) {
    try {
      const parsed = loadManifestFile(manifestFile);
      return parsed.entries.filter((entry) => entry?.ok === true);
    } catch {
      return [];
    }
  }
  const planFile = newestFile(dir, "plan");
  if (!planFile) return [];
  try {
    const parsed = loadManifestFile(planFile);
    return parsed.entries.filter((entry) => !entry.skip).map((entry) => ({ ...entry, ok: true }));
  } catch {
    return [];
  }
}
