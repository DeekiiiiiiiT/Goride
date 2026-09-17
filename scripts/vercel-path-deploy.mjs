/**
 * Path → Vercel Deploy Hook router for the Goride monorepo.
 *
 * Commit & Sync is unchanged: push to main → this script runs in Actions →
 * only apps whose paths changed get a Deploy Hook POST.
 *
 * Secrets (GitHub → Settings → Secrets → Actions), one per app you ship:
 *   VERCEL_DEPLOY_HOOK_FLEET
 *   VERCEL_DEPLOY_HOOK_DRIVER
 *   VERCEL_DEPLOY_HOOK_DOMINION
 *   VERCEL_DEPLOY_HOOK_ENTERPRISE
 *   VERCEL_DEPLOY_HOOK_HAUL
 *   VERCEL_DEPLOY_HOOK_RIDES_PASSENGER
 *   VERCEL_DEPLOY_HOOK_RUSH_COMMAND
 *   VERCEL_DEPLOY_HOOK_RUSH_CUSTOMER
 *   VERCEL_DEPLOY_HOOK_RUSH_COURIER
 *   VERCEL_DEPLOY_HOOK_RUSH_PARTNER
 *
 * Missing secrets for non-critical apps are skipped (Hobby — only configure what you use).
 * Cutover-critical apps (fleet / driver / dominion) FAIL the job if selected to fire
 * but their secret is unset — silent skip would leave clients on the old shim.
 */
import { execFileSync } from "node:child_process";

/** @typedef {{ secret: string, paths: string[], label: string }} AppHook */

/** Fleet-core cutover front doors — must never soft-skip when in the fire set. */
const CRITICAL_SECRETS = new Set([
  "VERCEL_DEPLOY_HOOK_FLEET",
  "VERCEL_DEPLOY_HOOK_DRIVER",
  "VERCEL_DEPLOY_HOOK_DOMINION",
]);

/** @type {AppHook[]} */
const APPS = [
  {
    label: "roam-fleet",
    secret: "VERCEL_DEPLOY_HOOK_FLEET",
    paths: ["apps/fleet/", "vercel.json"],
  },
  {
    label: "roam-driver",
    secret: "VERCEL_DEPLOY_HOOK_DRIVER",
    paths: ["apps/driver/"],
  },
  {
    label: "roam-dominion",
    secret: "VERCEL_DEPLOY_HOOK_DOMINION",
    paths: ["apps/admin/"],
  },
  {
    label: "roam-enterprise",
    secret: "VERCEL_DEPLOY_HOOK_ENTERPRISE",
    paths: ["apps/enterprise/"],
  },
  {
    label: "roam-haul",
    secret: "VERCEL_DEPLOY_HOOK_HAUL",
    paths: ["apps/haul/"],
  },
  {
    label: "rides-passenger",
    secret: "VERCEL_DEPLOY_HOOK_RIDES_PASSENGER",
    paths: ["apps/rides-passenger/"],
  },
  {
    label: "roam-rush-command",
    secret: "VERCEL_DEPLOY_HOOK_RUSH_COMMAND",
    paths: ["apps/rush-command/"],
  },
  {
    label: "roam-rush-customer",
    secret: "VERCEL_DEPLOY_HOOK_RUSH_CUSTOMER",
    paths: ["apps/dash-customer/"],
  },
  {
    label: "roam-rush-courier",
    secret: "VERCEL_DEPLOY_HOOK_RUSH_COURIER",
    paths: ["apps/dash-courier/"],
  },
  {
    label: "roam-rush-partner",
    secret: "VERCEL_DEPLOY_HOOK_RUSH_PARTNER",
    paths: ["apps/dash-merchant/"],
  },
];

/**
 * Shared packages wake every *configured* app hook (secrets present).
 * Avoids silent stale UIs after api-client / ui changes without mass-waking
 * apps that have no hook secret set.
 */
const SHARED_PATHS = [
  "packages/",
  "pnpm-lock.yaml",
  "package.json",
  "pnpm-workspace.yaml",
];

function gitDiffNames(base, head) {
  const out = execFileSync(
    "git",
    ["diff", "--name-only", `${base}...${head}`],
    { encoding: "utf8" },
  );
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function pathMatched(file, prefixes) {
  return prefixes.some(
    (p) => file === p.replace(/\/$/, "") || file.startsWith(p),
  );
}

function main() {
  const base =
    process.env.VERCEL_PATH_DEPLOY_BASE ||
    process.env.GITHUB_EVENT_BEFORE ||
    "";
  const head =
    process.env.VERCEL_PATH_DEPLOY_HEAD ||
    process.env.GITHUB_SHA ||
    "HEAD";

  let files;
  if (!base || /^0+$/.test(base)) {
    // First push / unknown before → only look at the tip commit
    files = execFileSync("git", ["show", "--name-only", "--pretty=format:", head], {
      encoding: "utf8",
    })
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } else {
    files = gitDiffNames(base, head);
  }

  console.log(`[vercel-path-deploy] ${files.length} changed file(s) (${base || "tip"}...${head})`);

  const sharedHit = files.some((f) => pathMatched(f, SHARED_PATHS));
  /** @type {Set<string>} */
  const toFire = new Set();

  for (const app of APPS) {
    if (files.some((f) => pathMatched(f, app.paths))) {
      toFire.add(app.secret);
    }
  }

  if (sharedHit) {
    console.log(
      "[vercel-path-deploy] shared packages/workspace changed — will fire every configured app hook",
    );
    for (const app of APPS) {
      // Always select cutover-critical apps so a missing secret fails closed.
      if (process.env[app.secret] || CRITICAL_SECRETS.has(app.secret)) {
        toFire.add(app.secret);
      }
    }
  }

  if (toFire.size === 0) {
    console.log(
      "[vercel-path-deploy] no Vercel app paths matched — skipping all hooks (Supabase/docs-only is fine)",
    );
    return;
  }

  let fired = 0;
  let skippedMissing = 0;
  let criticalMissing = 0;
  for (const app of APPS) {
    if (!toFire.has(app.secret)) continue;
    const url = process.env[app.secret];
    if (!url) {
      const critical = CRITICAL_SECRETS.has(app.secret);
      if (critical) {
        console.error(
          `[vercel-path-deploy] FAIL ${app.label}: required secret ${app.secret} not set (cutover-critical)`,
        );
        criticalMissing++;
        process.exitCode = 1;
      } else {
        console.log(
          `[vercel-path-deploy] skip ${app.label}: secret ${app.secret} not set`,
        );
        skippedMissing++;
      }
      continue;
    }
    console.log(`[vercel-path-deploy] POST ${app.label}`);
    const res = execFileSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST", url], {
      encoding: "utf8",
    }).trim();
    if (res.startsWith("2")) {
      fired++;
      console.log(`[vercel-path-deploy] ok ${app.label} HTTP ${res}`);
    } else {
      console.error(`[vercel-path-deploy] FAIL ${app.label} HTTP ${res}`);
      process.exitCode = 1;
    }
  }

  console.log(
    `[vercel-path-deploy] done: fired=${fired} missingSecret=${skippedMissing} criticalMissing=${criticalMissing}`,
  );
}

main();
