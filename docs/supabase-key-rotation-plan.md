# Supabase master key replacement — plan

Rev 1 · 24 Nov 2026 · project `csfllzzastacofsvcdsc`

## Why

- The legacy `service_role` key (full database control, skips every access rule) sits in
  `supabase/migrations/20260320000000_baseline_prod_schema.sql` (line ~37479). The repo was public
  until 16 Nov. GitHub traffic: 77–144 different computers cloned the whole repo **every day**
  9–16 Nov; 2 a day after it went private. Treat the key as copied. It still works.
- Supabase retires the legacy `anon` / `service_role` keys at the **end of 2026** anyway
  (docs: "Migrating to publishable and secret API keys"). This work is due within weeks regardless.

## What kills the leaked key

The leaked key is a JWT signed with the project's legacy JWT secret. It only stops working when
**both** happen: legacy API keys deactivated **and** the legacy JWT secret revoked (after moving to
JWT signing keys). Both legacy keys (`anon` and `service_role`) die together — there is no way to
kill only `service_role`. So every app that uses `anon` moves too.

## What uses the keys today

| Where | Uses | Count |
|---|---|---|
| Edge functions | `SUPABASE_SERVICE_ROLE_KEY` env | 242 files read it; 45 live functions |
| Edge functions with `verify_jwt = true` | gateway checks a legacy JWT | 28 functions (fleet-core, fleet-fuel, delivery, rides, driver, payments…) |
| DB webhook `notify-merchant-new-order` | ~~service_role JWT hard-coded in trigger args~~ → fleet cron secret (**done: phase 0**) | 1 |
| Web apps (Vercel) | `VITE_SUPABASE_ANON_KEY` | 12 apps |
| Driver app (Android/iOS, Capacitor) | anon key baked in at build | needs a store release |
| recon-worker (Cloud Run us-east1) | service key in env | 1 |
| GitHub secrets | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY` | 3 |
| Local `.env` files, scripts | service / anon | several |
| Already present | `sb_publishable_…` (default) exists; code partly reads `sb_secret_` | — |

## Phases (old key switched off last, only after everything is checked on the new keys)

| # | Phase | Who | Downtime |
|---|---|---|---|
| 0 | Merchant-push webhook stops carrying the JWT (cron-secret pattern) | Claude | none |
| 1 | Create the `default` secret key (`sb_secret_…`) | owner: 1 click (or Claude via Management API) | none |
| 2 | One shared helper reads the secret key (new first, legacy fallback); all 242 files use it; deploy all functions | Claude | none |
| 3 | Every function does its own login check; turn `verify_jwt` off on the 28 (security review per function first — a function without its own check would become open) | Claude | none if reviewed |
| 4 | recon-worker, GitHub secrets, local `.env`, scripts → secret key | Claude (gcloud, gh signed in) | none |
| 5 | Web apps → publishable key; redeploy all 12 | Claude (vercel CLI) | none |
| 6 | Driver app rebuild with publishable key; Play Store / App Store release; drivers update | Claude builds, owner uploads | none; old app keeps working until step 8 |
| 7 | JWT signing keys: "Migrate JWT secret", rotate to the new key | owner: dashboard clicks | none (users stay signed in) |
| 8 | Deactivate legacy API keys, revoke legacy JWT secret | owner: dashboard clicks | old driver-app versions stop working |
| 9 | Test every app; nightly checks; logs | Claude | — |

## Status log

### Phase 0 — done (24 Nov 2026)

The leaked key is no longer in the database, the function, or the repo.

- **Trigger** — `delivery.orders."notify-merchant-new-order"` now calls a new
  `private.notify_merchant_new_order()` trigger function instead of
  `supabase_functions.http_request(...)` with `Authorization: Bearer <service_role JWT>`.
  The function reads `private.fleet_ops_secrets('fleet_cron_secret')` and posts to
  `merchant-push` with header `X-Fleet-Cron-Secret` — the `private.invoke_rush_delivery`
  pattern. It is `SECURITY DEFINER`, and an enqueue failure is caught so an order insert is
  never blocked. Migration: `supabase/migrations/20261124044708_merchant_push_trigger_cron_secret.sql`
  (applied live; version row written to `supabase_migrations.schema_migrations`).
- **Baseline** — the same JWT literal was removed from
  `supabase/migrations/20260320000000_baseline_prod_schema.sql` (line ~37479 now a comment),
  so a local `db reset` cannot recreate a working copy of the stolen key.
- **merchant-push** — deployed as version **377** with `verify_jwt = false`
  (`supabase/config.toml`). It is the only function so far with the flag off, and only because
  its own check now covers every path: `_shared/requireInternalSecret.ts`
  `authorizeInternalRequest` accepts any configured secret (push secret, fleet/rides cron
  secret) by header or Bearer, plus the server key, and returns 500 when nothing is
  configured. Previously only the *first* secret env var that happened to be set was honoured,
  so a cron-secret call could be refused once two secrets existed.
- **New shared helper** — `supabase/functions/_shared/serviceKey.ts` returns
  `JSON.parse(SUPABASE_SECRET_KEYS).default` when present, else `SUPABASE_SERVICE_ROLE_KEY`.
  merchant-push already uses it; phase 2 switches the other 241 files onto it.
- **Verified live**
  - cron secret + empty body → `400 {"error":"merchantId or record.merchant_id required"}`
    (secret accepted, nothing sent)
  - no auth + empty body → `401 {"error":"Unauthorized"}` (fails closed)
  - order insert inside a rolled-back transaction → trigger queued exactly 1 request to
    `merchant-push`, header present and byte-identical to the DB cron secret (48 chars);
    test order and queue row both rolled back (0 leftovers)
  - trigger-shaped body with the cron secret → `200 {"ok":true,"sent":0,"stale":0}`
- **Note** — `delivery.merchant_push_subscriptions` has **0 rows** (no merchant device has ever
  subscribed), so "a merchant gets the push" cannot be observed end to end today; the 200 above
  is as far as it can be proven until a merchant subscribes.
- **Checks** — `pnpm check --all` 15/15, `validate-migration-sql`, `check:edge-imports`,
  `check:edge-manifest`, `check:edge-overlap` all pass.


## Done-tests

1. The leaked key returns 401 on `/rest/v1/` and on a function call.
2. Fleet, Dominion (admin), Driver app, Rush apps, Rides, Haul, Plug: sign in and load a main screen.
3. Every pg_cron job that calls a function returns 2xx the next morning (`net._http_response`).
4. Merchant gets the new-order push.
5. recon-worker run succeeds; Week Reconciliation page loads numbers.
