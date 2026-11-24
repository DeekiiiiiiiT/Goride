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

### Phase 1 — done (24 Nov 2026)

The `default` secret key (`sb_secret_…`) already existed in Settings > API Keys, so there was
nothing to create.

- Supabase injects `SUPABASE_SECRET_KEYS` (`{"default":"sb_secret_…"}`) into every Edge
  Function as a **default secret** — confirmed in `docs/guides/functions/secrets` and
  `docs/guides/getting-started/migrating-to-new-api-keys`. No dashboard secret has to be added
  for it.
- Prove it works: merchant-push (deployed in phase 0) builds its client from
  `_shared/serviceKey.ts`, which resolves `SUPABASE_SECRET_KEYS.default` and only falls back to
  the legacy JWT when that is absent. It queried `delivery.merchant_push_subscriptions` and
  answered `200 {"ok":true,"sent":0}`, so **the new secret key is already serving live traffic**.

#### Two rules learned from the docs that change later phases

1. **Secret / publishable keys go on the `apikey` header, never `Authorization: Bearer`.**
   The gateway tries to parse a Bearer value as a JWT and fails with `Invalid JWT`. Modern
   supabase-js already sends `sb_secret_…` on `apikey` only (proven by the 200 above), so
   Node/Deno code is fine. **Raw `pg_net` calls, DB webhooks and curl-style callers must send
   `apikey`, not `Authorization`** — this matters for phase 4 (recon-worker) and for any
   remaining `net.http_post` that carries a key.
2. **`verify_jwt` only understands legacy JWT keys.** Every function that must accept a
   secret or publishable key has to run with `verify_jwt = false` and check the caller itself,
   which is exactly what phase 3 does.

### Phase 2 — done (24 Nov 2026)

**Code.** 146 `createClient(...)` key arguments across 110 files now come from
`_shared/serviceKey.ts` — `serviceKey()` where the old code tolerated an empty value
(`?? ""`), `requireServiceKey()` where the old code asserted non-null (`!`). Nothing else in
those files changed: no header, route, query or logic. Verified mechanically — no added line
contains `Authorization`, `Bearer` or `apikey`, and no file gained key material.

**What deliberately still sends the legacy JWT**, because its target keeps `verify_jwt = true`
until phase 3: delivery/courierConsumerRoutes (×3) → notifications; delivery/orderChatNotify →
notifications; _shared/dashOrderSms → notifications; _shared/orderToFleetTrip → fleet-core;
_fleet-server/fuel_seal_http → fleet-fuel; _fleet-server/earnings_seal_http → fleet-pay;
rides/fare/tollBrainClient → toll-brain; rides/matchingBrainClient → matching;
platform-catalog/geoRoutes → delivery; fleet-fuel-cron → fleet-fuel; fleet-toll-cron →
fleet-toll; fleet-picture-cron → fleet-core; fleet-activity-cron → fleet-core; rush-cron →
delivery. Also untouched: _fleet-server/team_staff_service (Auth admin API) and the 8
`_fleet-server` files pinned to `jsr:@supabase/supabase-js@2.49.8`, which predates the new key
format and would send a secret key as a Bearer JWT — those wait for an SDK bump.

**Deployed — 30 functions, in six groups, by hand with the Supabase CLI** (`--use-api`,
telemetry off; the native CLI binary cannot write files inside this agent's sandbox, so
`DO_NOT_TRACK=1` is required, and the access token is read from the user environment block).
Every deploy was followed by the job that normally wakes the function, started on demand
instead of waiting for the schedule. `verify_jwt` was checked before and after: **0 of 44
functions changed flag**, 30 versions bumped.

| Group | Functions | Proof |
|---|---|---|
| 1 | catalog-research, parts-sourcing-drain, spatial-index-canary | cron-secret calls: **200** `{"ok":true,"skipped":"empty"}` and **200** `{"claimed":0,…}` |
| 2 | toll-brain, fuel-brain, matching | internal only; verified in phase 3 when their flags come off |
| 3 | delivery, notifications, payments, driver | `invoke_rush_delivery('/internal/geo/reconcile')` → **200** `{"healed":0}`; payments answers its own **404** route |
| 4 | rides, haul, freight, logistics, explorer, identity, custom-access-token | boot probe: every route answers (404 own router, custom-access-token **401** `Hook verification failed`) |
| 5 | fleet-core, fleet-fuel, fleet-toll, fleet-ops, fleet-claims, fleet-pay | fleet-core **200** `{"success":true,"driftCount":0}` via fleet-activity-cron; fleet-fuel **200** `{"processed":0}`; fleet-toll **200** `{"reports":[]}` via fleet-toll-cron |
| 6 | platform-catalog, petrojam-prices, evidence-cleanup, finance-doctor, finance-recon, gct-admin, order-chat-retention | petrojam sync **200** (20 weeks); the rest answer their own 401/404 |

Fleet bundles were regenerated from source. The committed `fleet-toll` bundle was stale: it
still carried the retired `/make-server-37f42386/recon` routes and lacked the vehicle-pictures
relay and toll driver-dispute routes, so the rebuild drops those six dead strings and adds
three live ones — that is the source's current state, not a change of intent.

**Faults found that this work did not cause** (all pre-date the rotation):
1. `fleet-evidence-cleanup-daily` has **never run**: `evidence-cleanup` has
   `verify_jwt = true`, but `private.invoke_evidence_cleanup()` sends only
   `X-Fleet-Cron-Secret`, so the gateway answers **401** `UNAUTHORIZED_NO_AUTH_HEADER`.
   Phase 3 gives it its own check and turns the flag off, which fixes it.
2. `spatial-index-canary` answers **500**: it queries `courier_availability` through the
   default `public` client, but that table lives in schema `delivery`.
3. `fleet-core /internal/vehicle-pictures/fill` answers **500**. Proven pre-existing: the
   scheduled 05:15 fill returned the same 500 (response `21714`) before fleet-core was
   redeployed at 05:38.
4. Suspect, needs a look in phase 3: `rush-trip-recon-daily` posts `Authorization: Bearer
   <cron secret>` straight to `fleet-core`, which has `verify_jwt = true`.

**Checks.** `pnpm check --all` 15/15; `lint-edge-kernel`, `edge-route-manifest --all --check`,
`check-edge-manifest-overlap` pass; `deno check` on the CI-listed edge files passes;
`deno test supabase/functions` → 2035 passed, 1 failed, and that one is
`_shared/menuEngine/exports.drift.test.ts`, which compares two files this work never touched
that differ only by CRLF vs LF in this Windows checkout.

## Phase 3 — review

**Review only. No flag was changed and nothing was deployed for this section.**

26 live functions still have `verify_jwt = true`. The review answers one question for each:
*if the flag went off, what could a caller reach without a login?*

### What `verify_jwt` actually protects

It only asks for *a* valid JWT. The public `anon` key is a valid JWT and it is in the leaked
repo, so today every one of these routes is already reachable by anyone who read the repo.
Turning the flag off changes one thing: it removes the last requirement that *some* key be
present. After phase 8 the legacy `anon` key dies, so the flag would then reject the apps
themselves — which is why the flag has to come off for every function the apps call.

Consequence for this review: a route with no check of its own is **already effectively open**,
and gets *fully* open when the flag comes off. Those are listed as "would become open".

### Guard models found

| Model | Where | Meaning |
|---|---|---|
| **Kernel** | fleet-core, fleet-fuel, fleet-toll, fleet-ops, fleet-claims, fleet-pay (all via `_shared/edgeKernel.ts`) | Global chain is CORS, path rewrite, request-id, error boundary, maintenance mode only. `/health` and `/ready` are public by design. `/internal/*` requires `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. Every other route must guard itself; there is no global user auth. |
| **Router guard** | delivery, driver, rides, explorer, freight, logistics, matching, platform-catalog, notifications, toll-brain, fuel-brain, haul, identity | Each Hono sub-app does `use("*", guard)` (e.g. `requireProductAdmin`, `requireAnyProductAdmin`, `requirePassenger`) and handlers add finer checks (`requireDashWrite`, `requirePermission`, merchant/station device checks). |
| **Handler check** | same set | Many routes compare a header themselves, e.g. `notifications` requires `x-service-role` to equal `SUPABASE_SERVICE_ROLE_KEY`; `evidence-cleanup` and `order-chat-retention` require the fleet cron secret. |
| **Nothing** | listed below | No check anywhere in the handler and no router guard. |

### Would become open — must be fixed before the flag comes off

**fleet-core (blocker).** These legacy monolith routes have no check at all in their handler
(verified by reading each full body) and no router guard. Several spend money (OpenAI) or write
data. `supabase/functions/_fleet-server/register_residual_monolith_routes.tsx`:

| Route | Line | What it does with no login |
|---|---|---|
| `POST /scan-receipt` | 3997 | uploads a file, calls OpenAI, returns parsed receipt |
| `POST /scan-odometer` | 4084 | uploads a file, calls OpenAI |
| `POST /ai/map-csv` | 6070 | OpenAI CSV mapping |
| `POST /ai/parse-toll-csv` | 7038 | OpenAI toll parse |
| `POST /ai/parse-toll-image` | 7132 | OpenAI toll image parse |
| `POST /analyze-fleet` | 6359 | 228-line handler, fleet analysis |
| `POST /parse-invoice` | 6733 | OpenAI invoice parse |
| `POST /parse-inspection` | 6824 | OpenAI inspection parse |
| `POST /financials` | 6722 | financial read |
| `POST /fleet/sync` | 6587 | writes fleet sync state |
| `POST /map-match` | 8400 | map matching |
| `PATCH /anchors/:id` | 7279 | writes an anchor |
| `POST /check-ins/review` | 9149 | writes a check-in review |
| `DELETE /check-ins/:id` | 9177 | deletes a check-in |
| `POST /unverified-vendors` | 13689 | creates a vendor row |
| `POST /unverified-vendors/bulk` | 13729 | bulk vendor insert |
| `PUT /unverified-vendors/:id/resolve` | 13777 | resolves a vendor |
| `POST /unverified-vendors/:id/create-station` | 13816 | creates a station |
| `DELETE /unverified-vendors/:id` | 13861 | deletes a vendor |
| `GET /admin/scan-corrupted-types` | 9193 | reads corrupted type report |
| `POST /admin/fix-corrupted-types` | 9273 | **repairs/rewrites data** |
| `GET /admin/scan-anomaly-flags` | 9330 | reads anomaly flags |

By design public (leave as is): `POST /fleet-login` (9636), `POST /driver-login` (9858),
`POST /admin-login` (9954), `POST /signup` (7364), `GET /v1/extraction-status`,
`GET /make-server-37f42386/v1/extraction-status`, `GET /health`, `GET /ready`.

**Public by design elsewhere** (verified: they return catalogue/marketing/rate data, so opening
them changes nothing that is not already public — confirm each is meant to be):

| Function | Routes |
|---|---|
| delivery | `GET /merchants`, `/merchants/:id`, `/merchants/:id/pricing`, `/merchants/:id/hours`, `GET /promotions`, `GET /app-config`, `GET /maps-config`, `GET /geo/*` reads, `GET /health`, `GET /health/dash-golden-path` |
| platform-catalog | `GET /stations`, `/stations/:id`, `/places`, `/places/taxonomy`, `/places/search`, `/places/:id`, `/geo/parishes`, `/tolls`, `/schedules`, `/parts`, `GET /health` |
| fleet-toll | `GET /toll-info/rate`, `GET /toll-info/versions` |
| freight | `POST /trn/validate`, `GET /public/pod*` (token-in-link proof of delivery) |
| driver | `GET /health` (the `/play-store*`, `/stats`, `/presence` routes sit behind `admin.use("*", requireProductAdmin("driver"))`) |
| explorer | `GET /health`, `GET /push/public-key` |
| haul, identity, fuel-brain, toll-brain, matching, logistics, fleet-ops, fleet-fuel, fleet-pay, fleet-claims | `GET /health` (and `/ready`); `/internal/*` on the fleet functions is covered by the kernel's service-key gate |

**To confirm before flipping** (registered in a shared registrar, or a guard may come from a
router defined in another file — read these individually):

| Function | Routes | Why flagged |
|---|---|---|
| explorer | `POST /demand` (index.ts:1055), `GET /admin/register`, `/admin/register/nearby`, `/admin/register/export` (place_admin.ts:282,297,328) | no auth in the handler body; check the router they mount on |
| rides | `GET/POST /v1/internal*` (3) | expected to use an internal secret; confirm |
| matching | `/v1/internal*` (5) | same |
| toll-brain | `/v1/internal*` (5) | same |
| fuel-brain | `/v1/internal` (1) | same |
| logistics | `/internal/reconcile-job`, `/internal/reconcile-all-matching`, `/internal/sync-from-shipment` | same |
| fleet-ops | `/maintenance/nightly-run`, `/maintenance/overdue-digest` | same |
| delivery | `POST /promotions/redeem`, `GET /presence`, `GET /ledger/deliveries`, `GET /settings*` | handler did not read an actor; some are under `admin.use("*")`, confirm which |

### Two key-comparison bugs this phase must also fix

1. `notifications` (`/courier-offer`, `/customer-order-status`, `/order-sms`, `/order-chat`)
   and `order-chat-retention` compare the `x-service-role` header to
   `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` with `!==`. Once callers send the new secret key
   these return 403. They must use `_shared/serviceKey.ts` candidates.
2. `edgeKernel.ts` (line ~246) gates `/internal/*` the same way — exact string match against
   `SUPABASE_SERVICE_ROLE_KEY`. When the legacy key dies, **every** internal call to
   fleet-core / fleet-fuel / fleet-toll / fleet-ops / fleet-claims / fleet-pay breaks, including
   the cron relays. This must accept the secret key before phase 8.

### Per-function tables

Route counts are registrations found in the source tree (a registration can serve several
paths, so treat them as scope, not exact endpoint counts). "Callers" lists the apps/scripts
that reference the function; `pg_cron` means a database job wakes it, `function` means another
edge function calls it.

#### delivery — 383 checked / 106 without a detected guard
| Route group | Own check |
|---|---|
| `/admin/*` (market, pricing, customer, merchant, order, courier, settings, support, identity, chat, menu-price) | router `use("*", requireProductAdmin("dash"/"courier"))`, writes add `requireDashWrite` |
| `/merchant/*`, `/merchant/enterprise-inventory/*` | `requireResolvedMerchantWithPermission`, `requireOwner`, `requireStationDevice` |
| `/courier/*`, `/customer/*` | `requireCourierUser` / `requireActiveCourier`, customer auth |
| `/internal/*` | `authorizeCronOrServiceRole` |
| public catalogue + config + geo reads | none (by design, listed above) |
| Callers | dash-customer, dash-merchant, dash-courier, dash-admin, rush-command, fleet, gct-core; `pg_cron` via rush-cron; `function` from platform-catalog (legacy key Bearer) |

#### fleet-core — 179 / 43
| Route group | Own check |
|---|---|
| `/internal/*` | kernel: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` |
| `make-server-37f42386/**` domain routes | `resolveActor`, `requirePermission`, `requireProductAdmin`, `verifySettingsAccess`, `requireOrg` per route |
| AI/scan/parse/vendor/admin-scan routes | **none — see blocker table** |
| login / signup / health / ready / extraction-status | none (by design) |
| Callers | admin (Dominion), fleet, driver, rides-passenger, roam-shared, ui; `function` from fleet-picture-cron, fleet-activity-cron, orderToFleetTrip, fuel_seal_http (legacy key Bearer); `pg_cron` vehicle-picture-*, fleet-activity-*, rush-trip-recon-* |

#### rides — 188 / 18
| Route group | Own check |
|---|---|
| `/v1/*` passenger routes | `requirePassenger`, `deps.requireUser(authHeader)`, `requireAuth` |
| `/internal/*`, `/ledger/*` | to confirm (see table above) |
| Callers | driver, enterprise, haul, rides-passenger, business-config; `pg_cron` (SQL-only jobs); `function` from admin/matchingBrainClient/tollBrainClient |

#### platform-catalog — 184 / 41
| Route group | Own check |
|---|---|
| `/geo/*` | `app.use("/geo/*", requireAnyProductAdmin)` |
| `make-server-37f42386/admin/parts-import/*` | `requireAuth()` + `requirePermission("catalog.import")` |
| `make-server-37f42386/admin/*` rest | to confirm |
| catalogue reads (`/stations`, `/places`, `/tolls`, `/schedules`, `/parts`) | none (public catalogue) |
| Callers | rides-passenger, plug (stand-in + public load script), fleet find-parts e2e; `function` from geoRoutes → delivery |

#### driver — 15 / 11
| Route group | Own check |
|---|---|
| `/admin/*` incl. `/admin/play-store*`, `/admin/stats`, `/admin/presence` | `admin.use("*", requireProductAdmin("driver"))` |
| `/health` | none (by design) |
| Callers | driver app, fleet, haul, enterprise, play-store-launch scripts |

#### explorer — 50 / 8
| Route group | Own check |
|---|---|
| `/admin/*` | `deps.requirePlatformAdmin` / `deps.requireOwner` |
| `/profile`, `/vehicles`, `/pins`, `/notifications`, `/fuel-logs` … | user auth via handler |
| `/push/public-key`, `/health` | none (by design) |
| `POST /demand`, `/admin/register*` | to confirm |
| Callers | plug app; verify scripts |

#### notifications — 7 / 0
| Route group | Own check |
|---|---|
| `/courier-offer`, `/customer-order-status`, `/order-sms`, `/order-chat` | `x-service-role === SUPABASE_SERVICE_ROLE_KEY` (**must move to the helper**) |
| Callers | `function` only: delivery/courierConsumerRoutes, delivery/orderChatNotify, _shared/dashOrderSms (legacy key Bearer) |

#### fleet-fuel — 5 / 3 · fleet-toll — 21 / 5 · fleet-pay — 1 / 2 · fleet-ops — 121 / 3 · fleet-claims — 1 / 1
| Route group | Own check |
|---|---|
| `/internal/*` (seal-fuel-week, toll-matcher-sweep, seal-earnings-week, nightly-run) | kernel service-key gate |
| domain routes | `resolveActor` + `requirePermission(...)` per route |
| `GET /health`, `/ready` | none (by design) |
| fleet-toll `/toll-info/rate`, `/toll-info/versions` | none (public rate lookup) |
| Callers | fleet app; `function` from the cron relays and from fleet-core's seal helpers (legacy key Bearer); `pg_cron` fuel-period-job-sweep, toll-v2-matcher-sweep, vehicle-picture-* |

#### freight — 109 / 5 · logistics — 18 / 1 · matching — 16 / 2 · haul — 8 / 1 · toll-brain — 8 / 1 · fuel-brain — 5 / 1 · identity — 2 / 1
| Route group | Own check |
|---|---|
| freight `/public/pod*`, `/trn/validate` | none (token-in-link / public lookup) |
| logistics `/v1/drivers`, `/internal/*` | to confirm |
| matching `/v1/internal*` | to confirm (own internal secret expected) |
| identity `/permissions*` | `getUser(authHeader)` then 401 |
| elsewhere | `GET /health` only |
| Callers | freight/haul/enterprise apps; matching/toll-brain/fuel-brain from admin and rides; logistics from scripts |

#### evidence-cleanup — single handler
| Route | Own check |
|---|---|
| `POST /` (whole function) | `requireInternalSecret(["FLEET_CRON_SECRET","RIDES_CRON_SECRET"])` — **but the flag is on, so the gateway rejects it first** (see fault 1) |
| Callers | `pg_cron` fleet-evidence-cleanup-daily |

#### order-chat-retention — single handler
| Route | Own check |
|---|---|
| `POST /` | `requireInternalSecret(["FLEET_CRON_SECRET","SUPABASE_SERVICE_ROLE_KEY"])` |
| Callers | none found in `pg_cron` or apps (rush-settings scripts reference it) |

#### Legacy functions also on `verify_jwt = true`
`admin-operations`, `ai-services`, `financial-operations`, `fleet-management`,
`fuel-maintenance` are live but have **no source folder in the repo** and are not in `ALL_FNS`.
They cannot be reviewed or redeployed from this repo. They must be deactivated or left alone
deliberately — do not assume they are current.

### Separate fault (not a key problem)

`rush-trip-recon-daily` (`cron.job` #65) fails in SQL before it sends anything:
`current_setting('app.settings.supabase_url', true)` is null, so the URL concatenates to null and
`net.http_post` never fires. It therefore never reaches `fleet-core`. Fix by setting the GUC or
moving the job onto `private.invoke_*`-style helper. Out of scope for the key rotation.

## Done-tests

1. The leaked key returns 401 on `/rest/v1/` and on a function call.
2. Fleet, Dominion (admin), Driver app, Rush apps, Rides, Haul, Plug: sign in and load a main screen.
3. Every pg_cron job that calls a function returns 2xx the next morning (`net._http_response`).
4. Merchant gets the new-order push.
5. recon-worker run succeeds; Week Reconciliation page loads numbers.
