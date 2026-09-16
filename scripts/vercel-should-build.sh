#!/usr/bin/env bash
# Vercel Ignored Build Step helper.
# Exit 0 = SKIP build · Exit 1 = RUN build (Vercel convention).
#
# Usage (from apps/<name>/vercel.json when Root Directory is that app):
#   "ignoreCommand": "bash ../../scripts/vercel-should-build.sh apps/admin"
#
# Usage (repo-root vercel.json for fleet):
#   "ignoreCommand": "bash scripts/vercel-should-build.sh apps/fleet"
#
# Fail OPEN (exit 1 = build) on any unexpected error — never silent-skip.
set +e
set -u

APP_PATH="${1:?Usage: vercel-should-build.sh apps/<name>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

# Prefer Vercel's previous deployment SHA when present (more reliable than HEAD^).
PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$PREV" ] || ! git rev-parse --verify "$PREV" >/dev/null 2>&1; then
  if git rev-parse --verify HEAD^ >/dev/null 2>&1; then
    PREV="HEAD^"
  else
    echo "vercel-should-build: no previous SHA — building $APP_PATH"
    exit 1
  fi
fi

PATHS=(
  "$APP_PATH"
  "packages"
  "pnpm-lock.yaml"
  "package.json"
  "pnpm-workspace.yaml"
  "scripts/vercel-should-build.sh"
)

# Root vercel.json also owns fleet output paths
if [ "$APP_PATH" = "apps/fleet" ]; then
  PATHS+=("vercel.json")
fi

git diff --quiet "$PREV" HEAD -- "${PATHS[@]}"
DIFF_STATUS=$?

if [ "$DIFF_STATUS" -eq 0 ]; then
  echo "vercel-should-build: no relevant changes for $APP_PATH (vs $PREV) — skipping"
  exit 0
fi

if [ "$DIFF_STATUS" -eq 1 ]; then
  echo "vercel-should-build: changes detected for $APP_PATH (vs $PREV) — building"
  exit 1
fi

# git diff failed unexpectedly → build rather than skip
echo "vercel-should-build: git diff error ($DIFF_STATUS) — building $APP_PATH (fail-open)"
exit 1
