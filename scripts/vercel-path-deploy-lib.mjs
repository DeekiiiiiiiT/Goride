/**
 * Pure path → Deploy Hook selection for the Goride monorepo.
 * Used by vercel-path-deploy.mjs (Actions) and vercel-should-build.mjs (Vercel ignore).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** @typedef {{ secret: string, paths: string[], label: string, appDir: string }} AppHook */

/** Fleet-core cutover front doors — must never soft-skip when in the fire set. */
export const CRITICAL_SECRETS = new Set([
  "VERCEL_DEPLOY_HOOK_FLEET",
  "VERCEL_DEPLOY_HOOK_DRIVER",
  "VERCEL_DEPLOY_HOOK_DOMINION",
]);

/** @type {AppHook[]} */
export const APPS = [
  {
    label: "roam-fleet",
    secret: "VERCEL_DEPLOY_HOOK_FLEET",
    appDir: "apps/fleet",
    paths: ["apps/fleet/", "vercel.json"],
  },
  {
    label: "roam-driver",
    secret: "VERCEL_DEPLOY_HOOK_DRIVER",
    appDir: "apps/driver",
    paths: ["apps/driver/"],
  },
  {
    label: "roam-dominion",
    secret: "VERCEL_DEPLOY_HOOK_DOMINION",
    appDir: "apps/admin",
    paths: ["apps/admin/"],
  },
  {
    label: "roam-enterprise",
    secret: "VERCEL_DEPLOY_HOOK_ENTERPRISE",
    appDir: "apps/enterprise",
    paths: ["apps/enterprise/"],
  },
  {
    label: "roam-haul",
    secret: "VERCEL_DEPLOY_HOOK_HAUL",
    appDir: "apps/haul",
    paths: ["apps/haul/"],
  },
  {
    label: "rides-passenger",
    secret: "VERCEL_DEPLOY_HOOK_RIDES_PASSENGER",
    appDir: "apps/rides-passenger",
    paths: ["apps/rides-passenger/"],
  },
  {
    label: "roam-rush-command",
    secret: "VERCEL_DEPLOY_HOOK_RUSH_COMMAND",
    appDir: "apps/rush-command",
    paths: ["apps/rush-command/"],
  },
  {
    label: "roam-rush-customer",
    secret: "VERCEL_DEPLOY_HOOK_RUSH_CUSTOMER",
    appDir: "apps/dash-customer",
    paths: ["apps/dash-customer/"],
  },
  {
    label: "roam-rush-courier",
    secret: "VERCEL_DEPLOY_HOOK_RUSH_COURIER",
    appDir: "apps/dash-courier",
    paths: ["apps/dash-courier/"],
  },
  {
    label: "roam-rush-partner",
    secret: "VERCEL_DEPLOY_HOOK_RUSH_PARTNER",
    appDir: "apps/dash-merchant",
    paths: ["apps/dash-merchant/"],
  },
];

/** Workspace root files that used to fan out to every app — intentionally ignored alone. */
export const WORKSPACE_ROOT_NOISE = new Set([
  "pnpm-lock.yaml",
  "package.json",
  "pnpm-workspace.yaml",
]);

export function pathMatched(file, prefixes) {
  return prefixes.some(
    (p) => file === p.replace(/\/$/, "") || file.startsWith(p),
  );
}

/**
 * @param {string} file
 * @returns {string | null} packages/<dir> folder name
 */
export function packageDirFromFile(file) {
  const m = /^packages\/([^/]+)\//.exec(file);
  return m ? m[1] : null;
}

/**
 * Read packages/<dir>/package.json → npm name (@roam/...).
 * @param {string} repoRoot
 * @param {string} dir
 */
export function readPackageName(repoRoot, dir) {
  const pkgPath = join(repoRoot, "packages", dir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return typeof pkg.name === "string" ? pkg.name : null;
  } catch {
    return null;
  }
}

/**
 * App deps map: appDir → Set of workspace package names it depends on.
 * @param {string} repoRoot
 * @returns {Map<string, Set<string>>}
 */
export function buildAppDependencyMap(repoRoot) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const app of APPS) {
    const pkgPath = join(repoRoot, app.appDir, "package.json");
    /** @type {Set<string>} */
    const deps = new Set();
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
          const block = pkg[section];
          if (!block || typeof block !== "object") continue;
          for (const [name, spec] of Object.entries(block)) {
            if (typeof spec === "string" && spec.startsWith("workspace:")) {
              deps.add(name);
            }
          }
        }
      } catch {
        // fail closed for that app's package deps
      }
    }
    map.set(app.appDir, deps);
  }
  return map;
}

/**
 * Select Deploy Hook secrets that should fire for the given changed files.
 *
 * Rules:
 * - App path hit → that app
 * - packages/<dir>/ → only apps that list that package as a workspace dep
 * - lockfile / root package.json / pnpm-workspace alone → nobody
 *
 * @param {string[]} files
 * @param {{ repoRoot: string, env?: NodeJS.ProcessEnv }} opts
 * @returns {{ secrets: Set<string>, reasons: string[] }}
 */
export function selectSecretsToFire(files, opts) {
  const repoRoot = opts.repoRoot;
  /** @type {Set<string>} */
  const toFire = new Set();
  /** @type {string[]} */
  const reasons = [];

  for (const app of APPS) {
    if (files.some((f) => pathMatched(f, app.paths))) {
      toFire.add(app.secret);
      reasons.push(`app-path:${app.label}`);
    }
  }

  /** @type {Set<string>} */
  const changedPackageDirs = new Set();
  for (const f of files) {
    const dir = packageDirFromFile(f);
    if (dir) changedPackageDirs.add(dir);
  }

  if (changedPackageDirs.size > 0) {
    const appDeps = buildAppDependencyMap(repoRoot);
    for (const dir of changedPackageDirs) {
      const pkgName = readPackageName(repoRoot, dir);
      if (!pkgName) {
        reasons.push(`package-missing-name:${dir}`);
        continue;
      }
      let hit = 0;
      for (const app of APPS) {
        const deps = appDeps.get(app.appDir);
        if (deps && deps.has(pkgName)) {
          toFire.add(app.secret);
          hit++;
        }
      }
      reasons.push(`package:${pkgName}→${hit} apps`);
    }
  }

  const onlyNoise =
    files.length > 0 &&
    files.every(
      (f) =>
        WORKSPACE_ROOT_NOISE.has(f) ||
        f.startsWith("docs/") ||
        f.startsWith(".github/") ||
        f.startsWith("supabase/"),
    );

  if (onlyNoise && toFire.size === 0) {
    reasons.push("workspace-noise-or-non-app:skip");
  }

  return { secrets: toFire, reasons };
}

/**
 * Whether a specific app should build given changed files (ignoreCommand helper).
 * @param {string} appPath e.g. "apps/fleet"
 * @param {string[]} files
 * @param {string} repoRoot
 */
export function appShouldBuild(appPath, files, repoRoot) {
  const app = APPS.find((a) => a.appDir === appPath);
  if (!app) {
    // Unknown app path → build (fail open)
    return true;
  }
  const { secrets } = selectSecretsToFire(files, { repoRoot, env: {} });
  // Without env, critical secrets still get selected when path/package matches
  return secrets.has(app.secret);
}

/** List package dirs under packages/ (for tests / diagnostics). */
export function listPackageDirs(repoRoot) {
  const root = join(repoRoot, "packages");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
