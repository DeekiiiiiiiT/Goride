#!/usr/bin/env node
/**
 * Vercel Ignored Build Step helper (safety net).
 * Primary routing: git.deploymentEnabled off + scripts/vercel-path-deploy.mjs (Deploy Hooks).
 * Keep ignoreCommand so accidental Git auto-deploys still skip when paths are irrelevant.
 *
 * Exit 0 = SKIP build · Exit 1 = RUN build (Vercel convention).
 * Fail OPEN (exit 1 = build) on any unexpected error — never silent-skip.
 *
 * Usage (from apps/<name>/vercel.json when Root Directory is that app):
 *   "ignoreCommand": "node ../../scripts/vercel-should-build.mjs apps/admin"
 *
 * Usage (repo-root vercel.json for fleet):
 *   "ignoreCommand": "node scripts/vercel-should-build.mjs apps/fleet"
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appShouldBuild } from "./vercel-path-deploy-lib.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = process.argv[2];

if (!APP_PATH) {
  console.error("Usage: vercel-should-build.mjs apps/<name>");
  process.exit(1);
}

function changedFiles(prev, head) {
  const out = execFileSync(
    "git",
    ["diff", "--name-only", prev, head],
    { encoding: "utf8", cwd: REPO_ROOT },
  );
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function resolvePrev() {
  const prevEnv = process.env.VERCEL_GIT_PREVIOUS_SHA || "";
  if (prevEnv) {
    try {
      execFileSync("git", ["rev-parse", "--verify", prevEnv], {
        cwd: REPO_ROOT,
        stdio: "ignore",
      });
      return prevEnv;
    } catch {
      // fall through
    }
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD^"], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    return "HEAD^";
  } catch {
    return null;
  }
}

try {
  const prev = resolvePrev();
  if (!prev) {
    console.log(`vercel-should-build: no previous SHA — building ${APP_PATH}`);
    process.exit(1);
  }

  const files = changedFiles(prev, "HEAD");
  const build = appShouldBuild(APP_PATH, files, REPO_ROOT);
  if (build) {
    console.log(
      `vercel-should-build: changes relevant for ${APP_PATH} (vs ${prev}) — building`,
    );
    process.exit(1);
  }
  console.log(
    `vercel-should-build: no relevant changes for ${APP_PATH} (vs ${prev}) — skipping`,
  );
  process.exit(0);
} catch (err) {
  console.error(
    `vercel-should-build: error — building ${APP_PATH} (fail-open)`,
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
}
