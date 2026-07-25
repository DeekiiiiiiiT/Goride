# Path-based deploys (monorepo)

## What you do day-to-day

**Nothing special.** Keep using Commit + Sync as usual.

After this ships:

| You change… | What deploys |
|-------------|----------------|
| Only Admin UI | Only Admin on Vercel (other apps skip) |
| Only `supabase/functions/delivery/` | Only the `delivery` edge function |
| Shared edge helpers (`_shared/`) | All 18 edge functions |
| Fleet server (`_fleet-server/`) | `make-server`, `evidence-cleanup`, `fleet-ops` |
| Docs only | No edge deploy; Vercel apps skip |

## Force-deploy everything (rare)

GitHub → Actions → **Deploy Supabase Edge Function** → **Run workflow** → tick **Deploy all 18 edge functions**.

## Files

- `scripts/vercel-should-build.sh` — Vercel ignore-build helper
- `.github/workflows/deploy-supabase-edge.yml` — path + changed-function deploy
- each app’s `vercel.json` → `ignoreCommand`
