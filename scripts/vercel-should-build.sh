#!/usr/bin/env bash
# Vercel Ignored Build Step helper.
# Exit 0 = SKIP build · Exit 1 = RUN build (Vercel convention).
#
# Usage (from apps/<name>/vercel.json when Root Directory is that app):
#   "ignoreCommand": "bash ../../scripts/vercel-should-build.sh apps/admin"
#
# Usage (repo-root vercel.json for fleet):
#   "ignoreCommand": "bash scripts/vercel-should-build.sh apps/fleet"
set -euo pipefail

APP_PATH="${1:?Usage: vercel-should-build.sh apps/<name>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# First commit / shallow clone without parent → always build
if ! git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  echo "vercel-should-build: no HEAD^ — building $APP_PATH"
  exit 1
fi

PATHS=(
  "$APP_PATH"
  "packages"
  "pnpm-lock.yaml"
  "package.json"
  "pnpm-workspace.yaml"
)

# Root vercel.json also owns fleet output paths
if [ "$APP_PATH" = "apps/fleet" ]; then
  PATHS+=("vercel.json")
fi

if git diff --quiet HEAD^ HEAD -- "${PATHS[@]}"; then
  echo "vercel-should-build: no relevant changes for $APP_PATH — skipping"
  exit 0
fi

echo "vercel-should-build: changes detected for $APP_PATH — building"
exit 1
