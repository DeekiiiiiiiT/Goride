/**
 * Secret-free environment loading for the M4/M5 migration scripts.
 *
 * The scripts read SUPABASE_URL, SUPABASE_SECRET_KEY, FILE_LINK_SECRET and R2_* from
 * .env.local (the same file the apps use). Real process env wins, so CI or one-off runs can
 * pass them without editing the file.
 *
 * Rule: never print, log or write a secret. Only names are ever reported.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root — one level above scripts/. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Minimal .env parser: NAME=value, optional `export`, optional single/double quotes. */
export function parseDotEnv(text) {
  const out = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let name = line.slice(0, eq).trim();
    if (name.startsWith("export ")) name = name.slice("export ".length).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    let value = line.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2);
    if (quoted) value = value.slice(1, -1);
    out[name] = value;
  }
  return out;
}

/** Values from .env.local (empty object when the file is absent). Values are never logged. */
export function readDotEnvLocal(file = resolve(REPO_ROOT, ".env.local")) {
  if (!existsSync(file)) return {};
  try {
    return parseDotEnv(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Resolve the named variables (process env first, then .env.local).
 * Returns every name's value (undefined when missing) and the sorted missing names.
 */
export function resolveEnv(names, { file, env = process.env } = {}) {
  const dotEnv = readDotEnvLocal(file);
  const values = {};
  const missing = [];
  for (const name of names) {
    const fromProcess = env?.[name];
    const value = fromProcess !== undefined && String(fromProcess).trim() !== ""
      ? String(fromProcess).trim()
      : String(dotEnv[name] ?? "").trim();
    if (!value) {
      missing.push(name);
      values[name] = undefined;
    } else {
      values[name] = value;
    }
  }
  return { values, missing };
}

/** Thrown when the run cannot start. The message names variables, never values. */
export class MissingSecretsError extends Error {
  constructor(missing) {
    super(
      `Missing ${missing.join(", ")} in .env.local (or the environment). ` +
        `The scripts never ask for or handle secret values — add the names to .env.local and re-run.`,
    );
    this.name = "MissingSecretsError";
    this.missing = missing;
  }
}

/** Resolve or throw. `label` is used in the error to say which step needed them. */
export function requireEnv(names, { file, env, label } = {}) {
  const { values, missing } = resolveEnv(names, { file, env });
  if (missing.length) {
    const err = new MissingSecretsError(missing);
    if (label) err.message = `[${label}] ${err.message}`;
    throw err;
  }
  return values;
}

/**
 * The Supabase server key. SUPABASE_SECRET_KEY is the documented name (and what the stop
 * message names); SUPABASE_SERVICE_ROLE_KEY is accepted as the older name some repo scripts use.
 */
export function requireSupabaseSecretKey({ file, env, label } = {}) {
  const { values } = resolveEnv(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"], { file, env });
  const key = values.SUPABASE_SECRET_KEY || values.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    const err = new MissingSecretsError(["SUPABASE_SECRET_KEY"]);
    if (label) err.message = `[${label}] ${err.message}`;
    throw err;
  }
  return key;
}

/** SUPABASE_URL from .env.local, else the project URL (not a secret) derived from the project ref. */
export function supabaseUrlOrProjectUrl(values, projectRef = "csfllzzastacofsvcdsc") {
  const given = String(values?.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  return given || `https://${projectRef}.supabase.co`;
}
