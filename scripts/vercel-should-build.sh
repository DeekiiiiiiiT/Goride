#!/usr/bin/env bash
# Compatibility wrapper — prefer node scripts/vercel-should-build.mjs from vercel.json.
# Exit 0 = SKIP build · Exit 1 = RUN build.
set +e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/vercel-should-build.mjs" "$@"
