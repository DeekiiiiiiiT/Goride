# Vercel path deploy — one-time setup (Hobby monorepo)

**Goal:** Commit & Sync still does GitHub + Vercel + Supabase. Only the app you changed goes live. Other apps’ users are not disrupted. Stops burning the 100 deploys/day limit on Canceled no-ops.

## What already landed in the repo

- Workflow: `.github/workflows/vercel-path-deploy.yml`
- Router: `scripts/vercel-path-deploy.mjs` + shared logic in `scripts/vercel-path-deploy-lib.mjs`
- Ignore helper: `scripts/vercel-should-build.mjs` (safety net if Git still wakes a project)
- Each app `vercel.json` has:
  - `"git": { "deploymentEnabled": { "main": false } }` — no auto Git deploy on `main` (Deploy Hooks / CLI still work)
  - `ignoreCommand` → node path helper (skip irrelevant accidental Git wakes)
  - Do **not** set `"github": { "enabled": false }` — that kills Deploy Hooks too (legacy kill-switch)

Supabase deploy workflows are **unchanged**.

**Hobby note:** Vercel “deployment policies” (API block of Git vs Deploy Hook) require Pro. We rely on `vercel.json` + Deploy Hooks + path routing.

## Do this once for **all** Roam apps (recommended)

You work across apps — set up **all 10** hooks now so any Commit & Sync only deploys what you touched.

### Cutover-critical hooks (must exist)

These three **fail the path-deploy job** if their own app path (or a `packages/` they depend on) would fire them but the secret is missing:

| Project | GitHub secret | Why required |
|---------|---------------|--------------|
| roam-fleet | `VERCEL_DEPLOY_HOOK_FLEET` | Fleet residual → `fleet-core` |
| roam-driver | `VERCEL_DEPLOY_HOOK_DRIVER` | Driver residual → `fleet-core` |
| roam-dominion | `VERCEL_DEPLOY_HOOK_DOMINION` | Admin (`apps/admin/`) residual → `fleet-core` |

Other hooks still soft-skip when unset (Hobby — only configure apps you ship).

### Optional: soak log push token

If branch protection blocks `github-actions[bot]` from pushing the daily F5 soak log, add repo secret `SOAK_LOG_GIT_TOKEN` (classic PAT or fine-grained token with **Contents: Read and write** on this repo). The soak workflow prefers it over `GITHUB_TOKEN`.

### 1) Create a Deploy Hook on each Vercel project

For **each** project in the table below:

1. Open the project → **Settings** → **Git**
2. Confirm GitHub repo `DeekiiiiiiiT/Goride` is linked
3. Confirm **Root Directory** matches the app folder (e.g. `apps/driver`)
4. Scroll to **Deploy Hooks**
5. Name: `main-path-deploy` · Branch: `main` → **Create Hook**
6. **Copy the URL** (treat like a password)

| Project | Root Directory | Open | GitHub secret name |
|---------|----------------|------|--------------------|
| roam-fleet | `apps/fleet` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-fleet/settings/git) | `VERCEL_DEPLOY_HOOK_FLEET` |
| roam-driver | `apps/driver` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-driver/settings/git) | `VERCEL_DEPLOY_HOOK_DRIVER` |
| roam-dominion | `apps/admin` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-dominion/settings/git) | `VERCEL_DEPLOY_HOOK_DOMINION` |
| roam-enterprise | `apps/enterprise` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-enterprise/settings/git) | `VERCEL_DEPLOY_HOOK_ENTERPRISE` |
| roam-haul | `apps/haul` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-haul/settings/git) | `VERCEL_DEPLOY_HOOK_HAUL` |
| rides-passenger | `apps/rides-passenger` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/rides-passenger/settings/git) | `VERCEL_DEPLOY_HOOK_RIDES_PASSENGER` |
| roam-rush-command | `apps/rush-command` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-rush-command/settings/git) | `VERCEL_DEPLOY_HOOK_RUSH_COMMAND` |
| roam-rush-customer | `apps/dash-customer` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-rush-customer/settings/git) | `VERCEL_DEPLOY_HOOK_RUSH_CUSTOMER` |
| roam-rush-courier | `apps/dash-courier` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-rush-courier/settings/git) | `VERCEL_DEPLOY_HOOK_RUSH_COURIER` |
| roam-rush-partner | `apps/dash-merchant` | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-rush-partner/settings/git) | `VERCEL_DEPLOY_HOOK_RUSH_PARTNER` |

### 2) Add all 10 GitHub secrets

GitHub → **Goride** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Paste each hook URL into the matching secret name from the table.

Skip only if you truly never ship that app — missing secrets just mean that app won’t auto-deploy.

**Exception:** `VERCEL_DEPLOY_HOOK_FLEET`, `VERCEL_DEPLOY_HOOK_DRIVER`, and `VERCEL_DEPLOY_HOOK_DOMINION` are cutover-critical. If a push would wake them and the secret is missing, **`vercel-path-deploy` fails** instead of skipping.

### 3) Confirm Git creates **zero** deployment rows

After this config is on `main`:

1. Open Vercel → **Deployments** (team view)
2. Make a tiny change only in one app (or only in `docs/`) and Commit & Sync
3. **Pass**
   - Untouched apps: **no new row at all** (not even Queued / Canceled — those still burn Hobby’s 100/day)
   - Touched app: **one** new deploy via Deploy Hook (GitHub Action **Vercel path deploy** logs `POST <app>`)
4. **Fail** = every project still gets a new row → tell Cursor; we re-check

Also check the Action log: fleet-only push must show only `POST roam-fleet`.

## How it behaves after setup

| You change… | What deploys |
|-------------|--------------|
| `apps/fleet/**` only | Fleet only |
| `apps/driver/**` only | Driver only |
| `supabase/**` only | Supabase Actions only (no Vercel) |
| `docs/**` / `.github/**` only | Nothing on Vercel |
| `pnpm-lock.yaml` / root `package.json` alone | Nothing on Vercel |
| `packages/fuel-core/**` | Only apps that depend on `@roam/fuel-core` (fleet, driver, dominion) |
| `packages/ui/**` | Every app that lists `@roam/ui` as a workspace dep |

## Verify selection locally

```bash
node --test scripts/vercel-path-deploy-lib.test.mjs
```

## Manual override

Vercel → project → **Deployments** → **Create Deployment** from `main` still works anytime.
