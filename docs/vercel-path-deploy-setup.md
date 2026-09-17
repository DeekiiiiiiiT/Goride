# Vercel path deploy — one-time setup (Hobby monorepo)

**Goal:** Commit & Sync still does GitHub + Vercel + Supabase. Only the app you changed goes live. Other apps’ users are not disrupted. Stops burning the 100 deploys/day limit on Canceled no-ops.

## What already landed in the repo

- Workflow: `.github/workflows/vercel-path-deploy.yml`
- Router: `scripts/vercel-path-deploy.mjs`
- Each app `vercel.json` has `"git": { "deploymentEnabled": false }` so **Git pushes no longer auto-wake every project**

Supabase deploy workflows are **unchanged**.

## Do this once for **all** Roam apps (recommended)

You work across apps — set up **all 10** hooks now so any Commit & Sync only deploys what you touched.

### 1) Create a Deploy Hook on each Vercel project

For **each** project in the table below:

1. Open the project → **Settings** → **Git**
2. Confirm GitHub repo `DeekiiiiiiiT/Goride` is linked
3. Scroll to **Deploy Hooks**
4. Name: `main-path-deploy` · Branch: `main` → **Create Hook**
5. **Copy the URL** (treat like a password)

| Project | Open | GitHub secret name |
|---------|------|--------------------|
| roam-fleet | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-fleet/settings/git) | `VERCEL_DEPLOY_HOOK_FLEET` |
| roam-driver | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-driver/settings/git) | `VERCEL_DEPLOY_HOOK_DRIVER` |
| roam-dominion | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-dominion/settings/git) | `VERCEL_DEPLOY_HOOK_DOMINION` |
| roam-enterprise | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-enterprise/settings/git) | `VERCEL_DEPLOY_HOOK_ENTERPRISE` |
| roam-haul | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-haul/settings/git) | `VERCEL_DEPLOY_HOOK_HAUL` |
| rides-passenger | [Settings → Git](https://vercel.com/sadiki-thomas-projects/rides-passenger/settings/git) | `VERCEL_DEPLOY_HOOK_RIDES_PASSENGER` |
| roam-rush-command | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-rush-command/settings/git) | `VERCEL_DEPLOY_HOOK_RUSH_COMMAND` |
| roam-rush-customer | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-rush-customer/settings/git) | `VERCEL_DEPLOY_HOOK_RUSH_CUSTOMER` |
| roam-rush-courier | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-rush-courier/settings/git) | `VERCEL_DEPLOY_HOOK_RUSH_COURIER` |
| roam-rush-partner | [Settings → Git](https://vercel.com/sadiki-thomas-projects/roam-rush-partner/settings/git) | `VERCEL_DEPLOY_HOOK_RUSH_PARTNER` |

### 2) Add all 10 GitHub secrets

GitHub → **Goride** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Paste each hook URL into the matching secret name from the table.

Skip only if you truly never ship that app — missing secrets just mean that app won’t auto-deploy.

### 3) Confirm auto Git deploy is off

There is **no “Auto deploy” toggle** on the Vercel Git settings page (that’s normal). Auto-off is the `git.deploymentEnabled: false` line already in each app’s `vercel.json` in this repo.

It only becomes live **after you Commit & Sync** those files to `main`.

**How to confirm after that push:**

1. Open any Roam app on Vercel → **Deployments**
2. Note the newest deployment time
3. Make a tiny change only in one app (or only in `docs/`) and Commit & Sync again
4. Pass = untouched apps get **no** new Git push deployment; only the app you touched gets one (via the **Vercel path deploy** GitHub Action + Deploy Hook)
5. Fail = every project wakes on that push again → tell Cursor; we re-check

Until the path-deploy Commit & Sync is on GitHub, auto Git deploy is **still on** (old behavior).

## How it behaves after setup

| You change… | What deploys |
|-------------|--------------|
| `apps/fleet/**` only | Fleet only |
| `apps/driver/**` only | Driver only |
| `supabase/**` only | Supabase Actions only (no Vercel) |
| `docs/**` only | Nothing on Vercel |
| `packages/**` (shared) | Every app that has a hook secret configured |

## After Hobby quota resets (~next morning)

1. Finish steps 1–2 for **all 10** apps above  
2. Commit & Sync a change in whichever app you’re working on  
3. Confirm **only that app** shows a new Ready deploy on Vercel  

## Manual override

Vercel → project → **Deployments** → **Create Deployment** from `main` still works anytime.
