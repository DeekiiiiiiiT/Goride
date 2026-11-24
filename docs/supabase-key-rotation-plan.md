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
| Edge functions with `verify_jwt = true` | gateway checks a legacy JWT | **done — zero functions on the project require one** (all flipped off; the 5 legacy ones were deleted from prod, see phase 3) |
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
4. `rush-trip-recon-daily` — resolved in the phase 3 review: it fails in SQL before sending
   anything (`app.settings.supabase_url` is null), so it is a scheduling fault, not a key
   problem. See "Separate faults" at the end of the phase 3 review.

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
| **Kernel** | fleet-fuel, fleet-toll, fleet-ops, fleet-claims, fleet-pay (all via `_shared/edgeKernel.ts`) | Global chain is CORS, path rewrite, request-id, error boundary, maintenance mode only. `/health` and `/ready` are public by design. `/internal/*` requires `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. Every other route must guard itself; the kernel adds no user auth. |
| **Kernel + mounted login gate** | **fleet-core** | fleet-core also mounts `inventory_controller.tsx` at `/` (`fleet-core/src/main.ts:26`), and that controller does `app.use("*", requireAuth({ strict: true }))` (`inventory_controller.tsx:729`). Because it is mounted at the root, **every** fleet-core route passes through it except the explicit skip list in `rbac_middleware.ts:475-507`. Proven live with the anon key: `/financials`, `/admin/scan-corrupted-types`, `/admin/export-data` all return `401 AUTH_REQUIRED`. |
| **Router guard** | delivery, driver, rides, explorer, freight, logistics, matching, platform-catalog, notifications, toll-brain, fuel-brain, haul, identity | Each Hono sub-app does `use("*", guard)` (e.g. `requireProductAdmin`, `requireAnyProductAdmin`, `requirePassenger`) and handlers add finer checks (`requireDashWrite`, `requirePermission`, merchant/station device checks). |
| **Handler check** | same set | Many routes compare a header themselves, e.g. `notifications` requires `x-service-role` to equal `SUPABASE_SERVICE_ROLE_KEY`; `evidence-cleanup` and `order-chat-retention` require the fleet cron secret. |
| **Nothing** | listed below | No check anywhere in the handler and no router guard. |

### Would become open — must be fixed before the flag comes off

**fleet-core.** The earlier draft of this review called 22 fleet-core routes "open". That was
wrong: they all sit behind `requireAuth({ strict: true })` from the mounted inventory
controller, and return `401 AUTH_REQUIRED` to the anon key today. The routes that are genuinely
reachable with no user session are only the ones `requireAuth` skips, and of those, four do an
upload/OCR and are worth closing:

These are the six routes the review flags. The first four need a login check or a rate limit; the
last three are unauthenticated **server-side key proxies** (they spend your Google Maps/Places
quota), so keep them public but put a rate limit on them:

| Route | Line | What it does with no login | Suggested |
|---|---|---|---|
| `POST /scan-receipt` | 3997 | uploads a file, calls OpenAI, returns a parsed receipt | login or rate limit |
| `POST /scan-receipt` (second registration) | 8734 | same | same |
| `POST /scan-odometer` | 4084 | uploads a file, calls OpenAI | login or rate limit |
| `POST /upload` | 4875 | accepts a file; its `getUser` check only runs `if (token)`, so a request with **no** Authorization header skips the check | enforce the check or rate limit |
| `GET /places/autocomplete` | — | proxy to Google Places, key stays server-side | public, rate limit |
| `GET /places/:placeId/details` | — | same | public, rate limit |
| `GET /maps-config` | — | returns the browser Maps key | public, rate limit |

Everything else on the skip list is public **by design**:

- `POST /fleet-login` (9636), `POST /driver-login` (9858), `POST /admin-login` (9954),
  `POST /admin-check`, `POST /signup` (7364), `/recover-platform-owner`, `/admin-seed` (retired),
  `GET /platform-status`, `GET /platform-feature-flags`, `GET /health`,
  `GET /v1/extraction-status`, `GET /make-server-37f42386/v1/extraction-status`
- `GET /maps-config` (browser Maps key only), `GET /places/autocomplete`,
  `GET /places/:placeId/details` — listed in the table above; public but should be rate limited
- machine callers that do their own check: `/internal/seal-*`, `/internal/activity/*`,
  `/internal/vehicle-pictures/*`, `/fuel/period-jobs/sweep`, `/fuel/periods/auto-close`

**The kernel `/internal/*` gate never applies to fleet-core.** fleet-core uses
`pathStyle: "fleet-core"`, so `normalizeFleetCorePathname` rewrites `/fleet-core/...` to
`/make-server-37f42386/...` **before** the kernel's `use("/internal/*")` middleware would match.
fleet-core's internal routes therefore rely on their own handler checks — which is exactly why
`requireAuth` has to skip them. Do not assume the service-key gate protects anything on
fleet-core.

**Public by design elsewhere** (verified: they return catalogue/marketing/rate data, so opening
them changes nothing that is not already public — confirm each is meant to be):

| Function | Routes |
|---|---|
| delivery | `GET /merchants`, `/merchants/:id`, `/merchants/:id/pricing`, `/merchants/:id/hours`, `GET /promotions`, `GET /app-config`, `GET /maps-config`, `GET /geo/*` reads, `GET /health`, `GET /health/dash-golden-path` |
| platform-catalog | `GET /stations`, `/stations/:id`, `/places`, `/places/taxonomy`, `/places/search`, `/places/:id`, `/geo/parishes`, `/tolls`, `/schedules`, `/parts`, `GET /health` |
| fleet-toll | `GET /toll-info/rate`, `GET /toll-info/versions` |
| freight | `POST /trn/validate`, `GET /public/pod*` (token-in-link proof of delivery) |
| driver | `GET /health` (the `/play-store*`, `/stats`, `/presence` routes sit behind `admin.use("*", requireProductAdmin("driver"))`) |
| explorer | `GET /health` only (`/push/public-key` is **not** public — it calls `requireExplorer`) |
| haul, identity, fuel-brain, toll-brain, matching, logistics, fleet-ops, fleet-fuel, fleet-pay, fleet-claims | `GET /health` (and `/ready`); `/internal/*` on these fleet functions **is** covered by the kernel's service-key gate (fleet-core is the exception described above) |

**Previously listed as "to confirm" — all checked, all guarded.** Nothing here becomes open:

| Function | Routes | Actual check |
|---|---|---|
| rides | `/v1/internal*` | `requireCronSecret` / `RIDES_CRON_SECRET` |
| matching | `/v1/internal*` | its own internal secret |
| toll-brain | `/v1/internal*` | `X-Toll-Brain-Internal-Secret` |
| fuel-brain | `/v1/internal` | its own internal secret |
| logistics | `/internal/reconcile-job`, `/internal/reconcile-all-matching`, `/internal/sync-from-shipment` | its own internal secret |
| fleet-ops | `/maintenance/nightly-run`, `/maintenance/overdue-digest` | maintenance cron secret, or org scope |
| delivery | `GET /presence`, `GET /ledger/deliveries`, `GET /settings*` | under `requireProductAdmin` (`admin.use("*")`) |
| explorer | `GET /admin/register`, `/admin/register/nearby`, `/admin/register/export` | `allowRead` |
| explorer | `POST /demand` | open by design, harmless |
| delivery | `POST /promotions/redeem` | open by design, harmless |

### Two key-comparison bugs this phase must also fix

Both compare a header to `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` with an exact string
match. **A crucial consequence:** if that env var is still populated after phase 8 (the platform
keeps injecting it while the legacy key exists in any form), then the leaked key itself still
opens `/internal/*` and the notifications routes even though the flag is off and the key is
supposedly dead. The fix must therefore accept **the new secret key or the cron secret only** —
not "whatever value is in the legacy env var".

1. `notifications` (`/courier-offer`, `/customer-order-status`, `/order-sms`, `/order-chat`)
   and `order-chat-retention` compare the `x-service-role` header to
   `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` with `!==`. Once callers send the new secret key
   these return 403. They must use `_shared/serviceKey.ts` candidates — and stop honouring the
   legacy value.
2. `edgeKernel.ts` (line ~246) gates `/internal/*` the same way — exact string match against
   `SUPABASE_SERVICE_ROLE_KEY`. When the legacy key dies, **every** internal call to
   fleet-fuel / fleet-toll / fleet-ops / fleet-claims / fleet-pay breaks, including the cron
   relays. This must accept the secret key before phase 8, and must not keep honouring the
   legacy value.

### Per-function tables

Route counts are registrations found in the source tree (a registration can serve several
paths, so treat them as scope, not exact endpoint counts). "Callers" lists the apps/scripts
that reference the function; `pg_cron` means a database job wakes it, `function` means another
edge function calls it.

The second number in each heading is the static scan's *no guard detected* count. It is an
**upper bound, not a finding**: it misses guards applied by a router defined in another file, by
`deps.requireX`, by a header compare, or after the scan's window. Every route in it was
re-checked by hand for the sections above; the tables record what the route actually does.

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
| `/internal/*` | own handler checks (the kernel gate never applies to fleet-core) |
| `make-server-37f42386/**` domain routes | `resolveActor`, `requirePermission`, `requireProductAdmin`, `verifySettingsAccess`, `requireOrg` per route |
| AI/scan/parse/vendor/admin-scan routes | `requireAuth({ strict: true })` from the mounted inventory controller — signed-in only, no role check (see the separate fault at the end) |
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
| `/health` only (`/push/public-key` requires a login) | guarded: `requireExplorer` |
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

#### Legacy functions — DELETED from prod (24 Nov ~14:25 UTC)

`admin-operations`, `ai-services`, `financial-operations`, `fleet-management` and
`fuel-maintenance` were **deleted from the project** by Claude at the owner's request. They no
longer exist as functions: a call to any of them now answers **404**. Their source stays in
`apps/fleet/src/supabase/functions/`, outside `supabase/functions/` and outside `ALL_FNS`, so it is
not deployed by the normal path and nothing in this repo recreates them.

Before deletion they were the only functions left on `verify_jwt = true`. With them gone,
**no function on the project has `verify_jwt = true`** — confirmed against the API: 39 live
functions, 0 requiring a login at the gateway.

### Fix stage — code done, nothing deployed (24 Nov 2026)

The changes below are written and committed but **not deployed and no flag was changed**.

| Fix | Where | What changed |
|---|---|---|
| OCR/upload need a login | `_fleet-server/rbac_middleware.ts` | `/scan-receipt`, `/scan-odometer`, `/upload` removed from the `requireAuth` skip list, so the mounted login gate answers `401` when there is no session. Live callers are signed-in app screens (`apps/driver`); `apps/admin` defines `scanReceipt` but never calls it. |
| Rate limits on the public proxies | `_fleet-server/register_maps_places_routes.ts` | `assertRateLimit` per caller IP: `maps-config` and `maps-config-rides` 120/min, `places/autocomplete` and `places/:placeId/details` 60/min. |
| Callers must show a secret key | `notifications/index.ts`, `order-chat-retention/index.ts`, `_shared/edgeKernel.ts` | All three now use `authorizeInternalRequest` with `secretKeyCandidates()` + the cron secrets. **The legacy `service_role` JWT is no longer accepted**, so the leaked value cannot keep these routes open after phase 8. New `secretKeyCandidates()` in `_shared/serviceKey.ts` returns only `SUPABASE_SECRET_KEYS` entries. |
| Callers updated to match | `delivery/courierConsumerRoutes.ts` (3), `delivery/orderChatNotify.ts`, `_shared/dashOrderSms.ts`, `_fleet-server/fuel_seal_http.ts`, `_fleet-server/earnings_seal_http.ts` | Each now sends the new secret key on `x-service-role` / `x-service-key`, while keeping the legacy JWT in `Authorization` — the gateway still needs a JWT until the targets' flags come off. |
| `fleet-toll-cron` must send the cron secret | `fleet-toll-cron/index.ts` | It previously sent only the legacy JWT + `apikey` to `fleet-toll/internal/toll-matcher-sweep`. With the new `/internal/*` gate that call would **401** on the next `toll-v2-matcher-sweep` run (every 10 min). It now also sends `X-Fleet-Cron-Secret`, the same as `fleet-fuel-cron`, and keeps the legacy JWT in `Authorization` for the gateway. |
| Kernel unit test updated | `_shared/edgeKernel.test.ts` | The test that sent `Bearer <legacy key>` and expected `200` now asserts the new contract: legacy key → **401**, secret key (header or Bearer) → **200**, cron secret → **200**. `deno test` 6/6. |
| Smoke script note | `scripts/smoke-fleet-fuel-auth.mjs` | Its seal call is a deliberate negative test ("no internal credential → 401"); it stays 401 under the new gate. Comment added, and it must not be changed to send a real key because that route actually seals a week. |

**Deploy order matters when this goes live — one group:**
`fleet-core`, `fleet-fuel`, `fleet-toll`, `fleet-ops`, `fleet-claims`, `fleet-pay`,
**`fleet-toll-cron`**, together with `delivery`, `notifications` and `order-chat-retention`.
`edgeKernel.ts` is bundled into each fleet function, so they all carry the new gate; deploying
one side alone makes that path answer 403/401. `fleet-toll-cron` must ship in the same group as
`fleet-toll`, otherwise the 10-minute toll sweep starts failing.

**Deploy-day check list** (run after the group is deployed, before any flag is turned off):

```sql
-- 1. toll matcher sweep: fleet-toll-cron -> fleet-toll /internal/toll-matcher-sweep
select private.invoke_toll_matcher_sweep();        -- returns a pg_net request id, or null when
                                                    -- toll.match_queue is empty (job is a no-op)
-- 2. fuel period sweep: fleet-fuel-cron -> fleet-fuel /fuel/period-jobs/sweep
select private.invoke_fuel_period_job_sweep();

-- 3. both responses must be 2xx
select id, status_code, left(content, 120) as body
from net._http_response
where id in (<id from 1>, <id from 2>);
```

If `invoke_toll_matcher_sweep()` returns null because the queue is empty, call the door directly
instead (it does not check the queue) and expect **not** 401:

```sql
select net.http_post(
  url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/fleet-toll-cron',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Fleet-Cron-Secret', (select value from private.fleet_ops_secrets where name = 'fleet_cron_secret')),
  body := '{}'::jsonb);
```

4. **Notifications path accepts the credential.** `notifications` still has
   `verify_jwt = true` (no block in `config.toml`, so the default applies), so this **cannot** be
   tested from `net.http_post`: a call with no `Authorization` header is refused by the gateway
   with 401 before the function runs, which looks like a failure but is not one. Run it from a
   shell instead, with the gateway JWT and the internal credential:

```bash
# Both values come from places that already hold them. Neither is echoed, pasted or logged.
SUPABASE_URL=https://csfllzzastacofsvcdsc.supabase.co
ANON=$(grep -m1 '^VITE_SUPABASE_ANON_KEY=' apps/fleet/.env.local | cut -d= -f2- | tr -d '"'"'"')
# Cron secret: read it straight out of the database, or `read -rs CRON_SECRET` if psql isn't to hand.
CRON_SECRET=$(psql "$SUPABASE_DB_URL" -tAc "select value from private.fleet_ops_secrets where name='fleet_cron_secret'")

curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST "$SUPABASE_URL/functions/v1/notifications/customer-order-status" \
  -H "Authorization: Bearer $ANON" \
  -H "apikey: $ANON" \
  -H "x-fleet-cron-secret: $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"customerUserId":"00000000-0000-0000-0000-000000000000","orderId":"00000000-0000-0000-0000-000000000000"}'
```

Expected status codes:

| Code | Meaning |
|---|---|
| **403** | `notifications` refused the credential — the helper rejects it. **This is the failure to act on: callers and callee are out of step.** |
| **401** | the gateway refused it — `Authorization` is missing or not a valid JWT (wrong/expired anon key). Fix the header, not the function. |
| **200 / 400 / 404** | the gate accepted the credential and the route ran. Any of these is a pass; 400/404 just means the dummy ids were rejected or the path differs. |

The anon key is the legacy one today. Once phase 8 turns the legacy keys off, the same check
needs the publishable key in `Authorization` instead.

Also run `node scripts/smoke-fleet-fuel-auth.mjs` — its seal case must stay **401**.

Fleet bundles were regenerated locally so the working tree matches the sources.

### Phase 3 — deploy (done 24 Nov 2026, 13:19–13:20 UTC)

Deployed from `f43fccdb` with a clean working tree, in six steps, each checked before the next.
No `verify_jwt` flag moved: 26 functions still require a login, exactly as before, and every
deployed function is `ACTIVE`.

| Step | Function | Version | Check and result |
|---|---|---|---|
| 1 | **fleet-core** | v343 → **v344** | anon-only `POST /fleet-core/scan-receipt` **400 → 401** `AUTH_REQUIRED`; `GET /fleet-core/places/autocomplete?q=ab` **200**; anon `POST /fleet-core/financials` **401** |
| 2 | **fleet-fuel** | v263 → **v264** | `private.invoke_fuel_period_job_sweep()` → response **200** `{"processed":0}` |
| 2 | **fleet-pay** | v218 → **v219** | (same group; no job to fire) |
| 3 | **fleet-toll-cron** | v28 → **v29** | door called directly (queue empty): **200** `{"reports":[]}` — the extra cron header is ignored by the old gate, so nothing broke |
| 4 | **fleet-toll** | v212 → **v213** | same door call after the new `/internal/*` gate: **200** `{"reports":[]}` (not 401) |
| 4 | **fleet-ops** | v440 → **v441** | (same group) |
| 4 | **fleet-claims** | v195 → **v196** | (same group) |
| 5 | **delivery** | v951 → **v952** | quiet hour confirmed first: 0 orders in 2 h, 0 chat messages in 30 min |
| 6 | **notifications** | v154 → **v155** | `POST /notifications/customer-order-status` with the anon JWT + cron secret → **400** `{"error":"customerUserId and status required"}` = credential **accepted**, route ran |
| 6 | **order-chat-retention** | v10 → **v11** | deployed 2 s after notifications |

Steps 5 and 6 went out 13:20:19 → 13:20:25 UTC (a ~6 s gap), so the unavoidable mixed-version
window was seconds long during zero order traffic.

**Seal refusal.** `node scripts/smoke-fleet-fuel-auth.mjs` needs a real user login
(`FLEET_USER_JWT` or `FLEET_SMOKE_EMAIL` + password), which this run did not have. Its seal
assertion was run directly instead — `POST /fleet-fuel/internal/seal-fuel-week` with a valid JWT
and no internal credential → **401** `{"error":"unauthorized"}`, which is the result the script
requires.

**Health sweep after the deploys** (14-minute window): all **18** `net._http_response` rows were
**200** — no 401s and no 500s — and every `cron.job_run_details` row was `succeeded`, including
`toll-v2-matcher-sweep` at 13:20, `fuel-period-job-sweep` at 13:17, `vehicle-picture-worker`,
`catalog-research-worker` and `parts-sourcing-outbox-drain` (20 runs each).

**How the credential was handled.** The notifications check needed the cron secret and a gateway
JWT. The JWT is the public anon key from `apps/fleet/.env.local`; the cron secret was read through
the Management API inside the script, so both values stayed in memory — the output printed only
their lengths and the HTTP status, never a value.

### Phase 3 — flags off (in progress, 24 Nov 2026)

Turning `verify_jwt` off one function at a time, machine-only callers first, the apps last.
Nothing else about a function changes — the flag is set in `config.toml` and the function is
redeployed (that is the only reliable way; the CLI applies `config.toml` on deploy).

Order, and **stop at the first failure**:

| # | Functions | Status |
|---|---|---|
| 1 | `evidence-cleanup` | **done** (flag off; real run 03:00 UTC tomorrow) |
| 2 | `order-chat-retention`, `notifications` | **done** |
| 3 | `toll-brain`, `fuel-brain`, `matching`, `logistics`, `identity` | **done** |
| 4 | `fleet-claims`, `fleet-pay`, `fleet-ops`, `fleet-toll`, `fleet-fuel` | **done** |
| 5 | `haul`, `freight`, `explorer`, `driver`, `rides`, `platform-catalog` | **done** |
| 6 | `fleet-core`, `delivery` (busiest — quiet hour) | **done** |

Never flipped: `admin-operations`, `ai-services`, `financial-operations`, `fleet-management`,
`fuel-maintenance` — they had 0 calls in 24 h, so they were **deleted from the project instead**
(~14:25 UTC, owner's request). They now 404; their source stays in
`apps/fleet/src/supabase/functions/`.

**After every flip**, all four must hold before the next function:

1. exactly that one function's `verify_jwt` changed, nothing else;
2. anon key + no login on one protected route → still **401/403 from the function**, not the
   gateway (a gateway 401 would mean the flag did not take effect);
3. no `Authorization` at all → `GET /health` → **200**;
4. `net._http_response` for the next scheduled call → **2xx**.

#### Step 1 — evidence-cleanup: done (flag off, pending tonight's real run)

Why this one was special: it was `verify_jwt = true` while its 03:00 job sends only
`X-Fleet-Cron-Secret`, so the gateway rejected it every night and **the nightly cleanup had never
deleted anything**.

Dry run before the flip — 17 files due (7 odometer, 7 toll receipt, 3 fuel receipt; uploaded
20 Jul–29 Oct; all past the 14-day delete date; none linked to a toll dispute). Owner approved the
deletion.

```json
{"success":true,"purged":0,"kvPatched":0,"errors":[],"dryRun":true,
 "wouldPurge":17,"retentionDays":90,"retentionSource":"enterprise.privacy.retention"}
```

Flag flipped: **v415 → v416**, `verify_jwt = false`.

- anon key, no login → **401** `{"error":"Unauthorized"}` — the function refused it, not the gateway
- no `Authorization` at all → **401** `{"error":"Unauthorized"}` — the function answered, so the
  gateway no longer blocks the scheduled call (this function has no `/health` route)
- **the scheduled path now works without any JWT:** `POST /evidence-cleanup?dryRun=true` with the
  cron secret only → **200** with the same `wouldPurge: 17`. That is exactly what the 03:00 job
  sends, and nothing was deleted (dry run).

**Tomorrow, record the 03:00 run** — expected `purged: 17`, `errors: []`. No real cleanup was run
by hand, on purpose. If it does not show 17, stop before the next flip.

#### Steps 2–3 — done (7 functions)

Each flipped one at a time by adding its `[functions.<name>] verify_jwt = false` block in
`supabase/config.toml` and redeploying only that function. After every single flip the audit showed
exactly one function changed (`26 → 18` required a login; none newly true), and the two probes
below passed.

| Function | Version | anon key, no login (must be the function's own refusal) | no `Authorization` |
|---|---|---|---|
| `order-chat-retention` | v10 → **v12** | **401** `{"error":"Unauthorized"}` | **401** `{"error":"Unauthorized"}` (no `/health`; function answered) |
| `notifications` | v154 → **v156** | **403** `{"error":"Forbidden"}` from `serviceCallerDenied` | `GET /health` → **200** |
| `toll-brain` | v193 → **v194** | **401** `{"error":"Unauthorized"}` | `GET /health` → **200** |
| `fuel-brain` | v184 → **v185** | **401** `{"error":"unauthorized"}` | `GET /health` → **200** |
| `matching` | v203 → **v204** | **401** `{"error":"Unauthorized: invalid token"}` | `GET /health` → **200** |
| `logistics` | v162 → **v163** | **401** `{"error":"Unauthorized: invalid token"}` | `GET /health` → **200** |
| `identity` | v176 → **v177** | **401** `{"error":"Unauthorized"}` | `GET /health` → **200** |

Scheduled-call check: `order-chat-retention`, `notifications`, `toll-brain`, `fuel-brain`,
`matching`, `logistics` and `identity` have **no pg_cron caller** — they are woken by other
functions or by the apps, so there is no `net._http_response` row to read. For `notifications` the
server-to-server path was proven directly instead: cron secret only, no JWT →
**400** `{"error":"customerUserId and status required"}` (credential accepted, route ran).

**Health after the eight flips** (25-minute window): all **30** `net._http_response` rows were
**200**, and no `cron.job_run_details` row failed.

#### Step 4 — done (5 Fleet functions)

Flipped one at a time, `fleet-fuel` last as instructed. Same config-block-then-redeploy method.
Every flip moved exactly one flag (`26 → 13` require a login overall; none newly true).

| Function | Version | normal route, no login / with anon key | `/health` without Authorization | `/internal/*` with no credential |
|---|---|---|---|---|
| `fleet-claims` | v196 → **v197** | `/claims` → **401** "No token provided" / **401** `AUTH_REQUIRED` | **200** | none on this function |
| `fleet-pay` | v219 → **v220** | `/cash-held` → **401** / **401** `AUTH_REQUIRED` | **200** | `/internal/seal-earnings-week` → **401** `unauthorized` |
| `fleet-ops` | v441 → **v442** | `/admin/maintenance-categories` → **401** / **401** `AUTH_REQUIRED` | **200** | none on this function |
| `fleet-toll` | v213 → **v214** | `/toll-info` → **401** / **401** `AUTH_REQUIRED` | **200** | `/internal/toll-matcher-sweep` → **401** `unauthorized` |
| `fleet-fuel` | v264 → **v265** | `/fuel-entries` → **401** / **401** `AUTH_REQUIRED` | **200** | `/internal/seal-fuel-week` → **401** `unauthorized` |

**The 14:00 UTC fuel run was checked before flipping `fleet-fuel`** (its first run since the job
moved off GitHub Actions):

- `cron.job_run_details` — `fuel-period-auto-close` at `14:00:00.351` → `succeeded`
- `net._http_response` `22273` at `14:00:00.404` → **200**, `timed_out = false`,
  `{"ok":true,"enqueued":1,"skipped":2,"skipByReason":{"skip_prior_weeks_open":2},"orgs":1}`

Both OK, so the flip went ahead.

**Sweeps after the flips**

- after `fleet-toll`: `toll.match_queue` empty (helper returns null by design) → door call
  `22258` → **200** `{"reports":[]}`
- after `fleet-fuel`: `private.invoke_fuel_period_job_sweep()` → `22276` → **200**
  `{"processed":1}`, `timed_out = false`

**Health after group 4** (20-minute window): all **23** `net._http_response` rows **200**, no failed
`cron.job_run_details` rows.

#### Steps 5–6 — done (all 8), after the owner cleared the `/push/public-key` mislabel

| Function | Version | normal route, no login / with anon key | `/health` w/o auth | public-route confirmation |
|---|---|---|---|---|
| `haul` | v169 → **v170** | `/admin` → **401** "missing Authorization header" / **401** "invalid token" | **200** | n/a — haul has no public route |
| `freight` | v210 → **v211** | `/shipments` → **401** / **401** | **200** | `/public/pod/fake-token-phase3` → **404** `{"error":"Invalid link"}` ✔ |
| `explorer` | v76 → **v77** | `/garage` → **400** `{"error":"Sign in required"}` / **400** same | **200** | `/push/public-key` → **401** — see the mislabel note below |
| `driver` | v617 → **v618** | `/admin/drivers` → **401** / **401** | **200** | n/a |
| `rides` | v788 → **v789** | `/v1/requests/me/active` → **401** / **401** | **200** | `/v1/vehicle-types` → **200** ✔ |
| `platform-catalog` | v220 → **v221** | `/admin/consumers` → **401** / **401** | **200** | `/stations` → **200** ✔ |
| `fleet-core` | v344 → **v345** | `POST /financials` → **401** `No token provided` / **401** `AUTH_REQUIRED` | **200** | scheduled path: `fleet-activity-cron/drift-check` → `22285` → **200** `{"success":true,"driftCount":0}` |
| `delivery` | v952 → **v953** | `/admin/pricing/overview` → **401** / **401** | **200** | `private.invoke_rush_delivery('/internal/geo/reconcile')` → `22287` → **200** `{"healed":0}`, not timed out |

Group 6 went out at a quiet hour, checked rather than assumed: **0 orders in 30 min and 2 h, 0 order
messages, 0 ride requests**.

**The `/push/public-key` mislabel (owner cleared it).** It is listed as "public by design" in the
review but the handler is:

```ts
app.get("/push/public-key", async (c) => {
  try {
    await requireExplorer(c);      // always required a login
```

So it was never public: `apps/plug/src/push.ts` calls it from `enablePlugPush()`, which runs inside a
signed-in flow, so a 401 without a session is correct and unchanged by the flip. The review's
explorer rows were corrected in place. Both `/garage` and `/push/public-key` answer **400/401 from
the function** (its own `requireExplorer` throwing inside a try/catch), not from the gateway.

Two probe errors of my own, corrected rather than counted as failures: `rides /v1/profile` returned
**404** because that route does not exist (the real protected route is `/v1/requests/me/active`), and
`explorer /garage` answers **400**, not 401, because the handler catches the guard's throw.

#### Phase 3 result

`verify_jwt` is off for **every function this repo deploys**, and the five legacy functions that
were the last ones holding it `true` were deleted from the project at ~14:25 UTC (see the phase 3
review). **No function on the project has `verify_jwt = true`** — confirmed against the API:
39 live functions, 0 requiring a login at the gateway.

That means the gateway no longer requires a legacy JWT anywhere the apps call, which is the
precondition for phases 7 and 8 (revoking the JWT secret / deactivating the legacy keys).

#### Separate fix in the same session — rush job timeout

`private.invoke_rush_delivery` used pg_net's default 5 s request timeout while delivery answers in
about 6 s, so `rush-pass-renew` (13:00) and `rush-money-recon` (06:30) were recording a timeout
even though delivery had answered 200. Evidence: response `22206` at 13:00:00 —
`Timeout of 5000 ms reached. Total time: 5000.187 ms`.

Migration `supabase/migrations/20261124132804_rush_delivery_timeout_30s.sql` raises
`timeout_milliseconds` to **30000** on the same URL/headers/body, and was applied live with its
logbook row in `supabase_migrations.schema_migrations` (version `20261124132804`). Grants unchanged
(`{postgres=X/postgres}`). Verified after applying: `private.invoke_rush_delivery('/internal/geo/reconcile')`
→ request `22240` → **200** `{"healed":0,"failed":[]}`, not timed out.

### Phase 3.5 — edge DB clients off the legacy key (done 24 Nov 2026)

Every live edge function now builds its database client from `_shared/serviceKey.ts` instead of
reading `SUPABASE_SERVICE_ROLE_KEY` itself. **25 source files changed**, mechanically, with the old
expression swapped for `serviceKey()` (soft) or `requireServiceKey()` (throws when nothing is
configured — used where the code already had a fail-fast check).

The `jsr:@supabase/supabase-js@2.49.8` pin was the other half: 2.49.8 predates the new key format
and would try to parse `sb_secret_…` as a JWT. **10 runtime files** now import
`jsr:@supabase/supabase-js@^2.49.8`, which resolves to **2.119.2** (the current JSR release, same as
npm) — a version that sends the secret key on `apikey` only, never `Authorization`. Test files keep
the old pin; the generated bundles were rebuilt, not hand-edited.

Files: `_fleet-server/` (service_client, kv_store, fleet_sql_bridge, financial_ledger,
ledger_canonical, unified_ledger_dual_write, odometer_ledger, earnings_period_materialize,
driver_financial_periods, station_merchant_aliases, plug_public_price, fuel_controller,
supabase_platform_usage), `_shared/` (featureFlags, rushSettings/getSetting), and
`before-user-created`, `catalog-research`, `custom-access-token`, `delivery/inventoryRoadClearanceGate`,
`delivery/merchant_application_routes`, `explorer`, `parts-sourcing-drain`, `platform-catalog`,
`rides`, `rides/fare/resolveLocation`.

#### Proven on fleet-core first, alone

Deployed fleet-core only, then:

- unauthenticated `POST /fleet-core/financials` → **401** "No token provided"; with the anon key →
  **401** `AUTH_REQUIRED`; `/health` → **200**
- **the DB-using internal path**: `fleet-activity-cron/drift-check` → `22302` → **200**
  `{"success":true,"day":"2026-11-24","driftCount":0}` — that route reads the activity tables
  through the migrated client, so a successful read proves the new key works against PostgREST

`fleet-picture-cron/run` → `22303` → **500**, which is the pre-existing vehicle-pictures fault
(same endpoint failed at 05:15, hours before this change), not a migration regression.

#### The remaining 18 functions, in the same groups

| Group | Functions | Deploy + probe |
|---|---|---|
| 1 | `catalog-research`, `parts-sourcing-drain`, `evidence-cleanup` | anon call refused by the function: **401 / 403 / 401** |
| 2–3 | `order-chat-retention`, `before-user-created`, `custom-access-token`, `matching`, `logistics`, `payments` | **401** hook refusal ×3, `/health` **200** ×3 |
| 4 | `fleet-claims`, `fleet-pay`, `fleet-ops`, `fleet-toll`, `fleet-fuel` | `/health` **200** ×5 |
| 5 | `explorer`, `rides`, `platform-catalog` | `/health` **200** ×3 |
| 6 | `delivery` (traffic checked first: 0 orders, 0 chats, 0 ride requests in 30 min) | `/health` **200** |

**DB reads after the migration** (each exercises a migrated client):

- `platform-catalog /stations` → **200** with real station rows
- `explorer /places/taxonomy` → **200** with brands
- `rides /v1/places/reverse?lat=17.9970&lng=-76.7936` → **200** `{"address":"13 Lyndhurst Rd…"}` (the
  fare/geo client)
- `private.invoke_rush_delivery('/internal/geo/reconcile')` → `22307` → **200** `{"healed":0,"failed":[]}`

**Health across the whole migration:** 30 × **200** in `net._http_response`, and the only non-200 was
the `22303` picture-cron 500 above. No failed `cron.job_run_details` rows in the window.

**Typecheck is unchanged by this work.** `deno check` on the 25 files reports 445 pre-existing
`TS` errors; the same files checked out from `HEAD` report the **identical counts**
(162 / 78 / 38 / 22 / 14 / 1 / 1), so nothing was introduced — the bump is type-neutral and CI's
`deno check` step stays `continue-on-error` for its own debt.

#### What still mentions the legacy key (Phase 8 gap, not a DB client)

A re-run of the grep finds **8 edge files**, none of which builds a client from it:

- `_fleet-server/service_client.ts` — the error message text only
- `_shared/authorizeCronOrServiceRole.ts` — still *accepts* the legacy key on `delivery`'s 9
  `/internal/*` routes (it also accepts the cron secret)
- `_shared/orderToFleetTrip.ts`, `_shared/rideToFleetTrip.ts`, `platform-catalog/geoRoutes.ts`,
  `delivery/courierConsumerRoutes.ts` — send it in an `Authorization`/`apikey` header
- `petrojam-prices/index.ts` — compares it for its `/cron/sync-latest` gate
- `rides/index.ts` — only the local variable *name* (its value comes from the helper now)

**One concrete dependency for Phase 8:** `rush-cron` calls `delivery`'s `/internal/*` with
`Authorization: Bearer <legacy key>` and does **not** send the cron header. `authorizeCronOrServiceRole`
already accepts the cron secret, so the fix is one header in `rush-cron` (send
`X-Fleet-Cron-Secret`) — do that before the legacy keys are switched off, or every Rush job breaks.

Left alone on purpose: the **26 local scripts** and `recon-worker` (Phase 4), and the ten files of
the deleted legacy functions (dead code).

### Phase 3.5 cleanup — exact pin, Rush relay, legacy acceptors removed (24 Nov 2026)

#### 1. SDK pinned to the exact live version

`jsr:@supabase/supabase-js@^2.49.8` → **`@2.119.2`** in **18 files** (10 runtime + 8 test). A caret
range would have let the next deploy pull an untested version; the exact pin is the version running
now. The six Fleet bundles were rebuilt (each carries 3–8 specifiers, all exactly `2.119.2`) and
redeployed: `fleet-core`, `fleet-fuel`, `fleet-pay`, `fleet-ops`, `fleet-toll`, `fleet-claims` —
`/health` **200** on all six. No non-exact jsr specifier remains under `supabase/functions`.

*(The dead `apps/fleet/src/supabase/functions/*/kv_store.tsx` copies still say 2.49.8; they belong
to the deleted functions and are never deployed.)*

#### 2. `rush-cron` no longer needs the legacy key

It sent `Authorization: Bearer <legacy key>` to `delivery`. It now sends **`X-Fleet-Cron-Secret`**
(the configured cron secret) and sends no JWT at all.

Proven through the real relay:
`private.invoke_rush_delivery('/internal/geo/reconcile')` → `22314` → **200** `{"healed":0}`,
`('/internal/in-house/sweep')` → `22315` → **200** `{"released":0,…}`.

#### 3. Nothing accepts the legacy key value any more

| Where | Before | Now |
|---|---|---|
| `_shared/authorizeCronOrServiceRole.ts` (delivery's 9 `/internal/*` routes, fleet fuel-period and vehicle-pictures routes) | cron secret **or** the legacy key **or** a verified legacy `service_role` JWT | cron secret **or** a current secret key (`x-service-role` / `x-service-key` / `apikey` / Bearer). Legacy key and legacy JWT are **refused** |
| `delivery` `/courier/offers/redispatch` | compared the header to the legacy key | cron secret or a current secret key |
| `petrojam-prices` `/cron/sync-latest` | legacy key match, plus a legacy JWT fallback | cron secret or a current secret key; the JWT decode/verify helpers are deleted |

Negative proof (an arbitrary Bearer must not pass): `delivery /internal/geo/reconcile` → **403**,
`delivery /courier/offers/redispatch` → **403**, `petrojam /cron/sync-latest` → **401**.

Positive proof with only the cron secret: redispatch `22323` → **200** `{"ok":true,"expired":0,
"redispatched":0}`; petrojam `22324` → **200** with real refinery runs; fleet fuel sweep `22321` →
**200** `{"processed":0}`; fleet-core drift `22322` → **200**.

#### 4. The remaining senders were switched

- `_shared/orderToFleetTrip.ts` — `apikey` + `x-service-key` = current secret key; the legacy Bearer is gone
- `_shared/rideToFleetTrip.ts` — same (and its `ANON_KEY || SERVICE_ROLE_KEY` fallback is gone)
- `platform-catalog/geoRoutes.ts` — `apikey` + `x-service-key`; no Bearer
- `delivery/courierConsumerRoutes.ts` — the three `notifications` calls dropped the legacy Bearer and
  keep `x-service-role` = current secret key

Deployed with their targets in one pass: the six fleet bundles, then `delivery`, `rides`,
`platform-catalog`, `petrojam-prices` — all `/health` **200**.

**Health across the cleanup:** 29 × **200** in `net._http_response` over 20 minutes; the only non-200
is the pre-existing `vehicle-pictures/run` 500 at 14:23 (before this step); no failed
`cron.job_run_details` rows.

**Typecheck unchanged:** `geoRoutes.ts` 11 errors at HEAD and 11 now, `petrojam-prices` 2 and 2,
`recon-worker.ts` 58 and 58 — all pre-existing.

### Phase 4 (part) — local scripts and the recon worker (24 Nov 2026)

**Scripts.** New `scripts/lib/serverKey.mjs` resolves the key as
`SUPABASE_SECRET_KEYS.default` → `SUPABASE_SECRET_KEY` → legacy `SUPABASE_SERVICE_ROLE_KEY`, and works
under both Node and Deno. **39 script files** that read the key directly now call `serverKey()`; no
`process.env.SUPABASE_SERVICE_ROLE_KEY` or `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` read remains in
`scripts/`. Seven files only *pass the variable name* to a child process (`smoke-*-all`, `run-week-recon-done-tests`,
`seed-week-recon-done-tests`, `vehicle-pictures-preprod*`); their children resolve through the helper and
fall back to the name the parent sets, so they keep working either way. `node --check` is clean on
every changed script.

**recon-worker (Cloud Run).** Its code never reads the key — it is a pure week calculator. The only
link is the Cloud Run secret mount, now switched in `cloudbuild.recon-worker.yaml` to
`SUPABASE_SECRET_KEYS`. One-time step before the next worker deploy, or Cloud Run refuses the revision:

```
gcloud secrets create SUPABASE_SECRET_KEYS --replication-policy=automatic
printf '%s' "$SUPABASE_SECRET_KEYS" | gcloud secrets versions add SUPABASE_SECRET_KEYS --data-file=-
```

**Where the key actually lives now (owner did this, verified).**

- **Google Cloud secret** `SUPABASE_SECRET_KEYS` — the compute service account can read it, so the
  next `recon-worker` revision picks it up from the mount above.
- **GitHub repo secret** `SUPABASE_SECRET_KEYS`.
- **`apps/fleet/.env.local`** — set as `SUPABASE_SECRET_KEY` (the single-key form the scripts'
  resolver reads).

**The four `.env.testcopy` files must NOT get the new key.** `apps/admin`, `apps/driver`,
`apps/fleet` and `apps/plug` `.env.testcopy` point at the **local stack** (`127.0.0.1:54321`), so a
production key there is both useless and a leak risk. Leave them alone.

**Phase 4 is done** apart from phase 5–9 below: the scripts resolve the key through
`scripts/lib/serverKey.mjs`, the worker takes it from Secret Manager, and the three GitHub workflows
are on the cron secret. Nothing in this phase is still waiting on code.

#### The three GitHub workflows switched to the cron secret

`fuel-period-auto-close-cron`, `fuel-period-job-sweep` and `petrojam-weekly-sync` no longer take
`secrets.SUPABASE_SERVICE_ROLE_KEY` at all: the env line, the `SERVICE_KEY` variable and both
`Authorization: Bearer` / `apikey` headers are gone. Each sends **only** `X-Fleet-Cron-Secret`
(`FLEET_CRON_SECRET`, falling back to `CRON_SECRET`), and each now fails early if that secret is
missing instead of silently sending an empty credential. They are `workflow_dispatch`-only, so no
run was needed; the same routes were exercised directly from the database (`22320`–`22324`, all
**200**).

### Phase 5 — plan: the web apps move to the publishable key (code done, nothing deployed)

**Eleven apps, not twelve.** Vercel deploy hooks cover ten of them (`apps/plug` is not in
`scripts/vercel-path-deploy-lib.mjs`, so it is not part of the path-triggered deploys).

| App | Vercel project (deploy-hook secret) | Where the Supabase key is read |
|---|---|---|
| `apps/fleet` | **roam-fleet** (`VERCEL_DEPLOY_HOOK_FLEET`) | shared `supabaseInfo.ts`; `vite.config.ts` |
| `apps/driver` | **roam-driver** (`VERCEL_DEPLOY_HOOK_DRIVER`) | shared; `vite.config.ts` |
| `apps/admin` | **roam-dominion** (`VERCEL_DEPLOY_HOOK_DOMINION`) | shared; a help-text mention in `src/main.tsx` |
| `apps/enterprise` | **roam-enterprise** | shared only |
| `apps/haul` | **roam-haul** | shared only |
| `apps/rides-passenger` | **rides-passenger** (`VERCEL_DEPLOY_HOOK_RIDES_PASSENGER`) | shared; `src/admin/services/ridesAdminService.ts` (already sends it on `apikey`) |
| `apps/rush-command` | **roam-rush-command** | shared; `vitest.config.ts` (tests only) |
| `apps/dash-customer` | **roam-rush-customer** | shared; `vitest.config.ts` (tests only) |
| `apps/dash-courier` | **roam-rush-courier** | shared; `src/vite-env.d.ts` (type declaration) |
| `apps/dash-merchant` | **roam-rush-partner** | shared; `vitest.config.ts` (tests only) |
| `apps/plug` | **no hook — deployed by hand** | shared; `vite.config.ts` |

Every app funnels through one choke point: **`packages/api-client/src/supabaseInfo.ts`**. It is the
only place that reads the key for the running app — `publicAnonKey` is exported from there and
`packages/auth-client/src/supabase.ts` builds the client with it.

#### Code change made (no Vercel env touched, no deploy)

- `resolvePublicKey()` reads **`VITE_SUPABASE_PUBLISHABLE_KEY`** first and falls back to
  `VITE_SUPABASE_ANON_KEY`, so an app keeps working before its Vercel environment is switched —
  the code is safe to ship ahead of the env change.
- new `isLegacyJwtKey()`: only an `eyJ…` key is a JWT.
- `supabaseAnonFunctionHeaders()` now sends the key on **`apikey`**, and adds
  `Authorization: Bearer …` **only when the key is a legacy JWT**. A publishable key
  (`sb_publishable_…`) is opaque — sending it as a Bearer presents a string where the gateway and
  PostgREST expect a token.
- `.env.example` documents the new variable in the 9 apps that have one (`plug` and `rush-command`
  do not), `apps/dash-courier/src/vite-env.d.ts` declares it, and the admin startup hint names it.
- `@supabase/supabase-js` is already `^2` (2.119.2), which understands publishable keys, so no app
  dependency changes.

**Verified:** `pnpm check` 11/11, and an app typecheck reports no error in `api-client` or
`supabaseInfo.ts`.

#### What phase 5 still needs (owner/next session)

1. **The publishable key already exists** — `default`, type `publishable`, `sb_publishable_…`. Do not
   create another one.
2. Add `VITE_SUPABASE_PUBLISHABLE_KEY` to each of the eleven Vercel projects (and keep
   `VITE_SUPABASE_ANON_KEY` until the app is redeployed on the new key). **Done for `roam-haul`.**
3. Redeploy each app (see the execution note below — the CLI route is currently blocked on this
   machine).
4. Re-check each app loads, signs in, and calls one function.

#### Phase 5 execution — started, blocked on the deploy step (24 Nov 2026)

**`apps/haul` / `roam-haul`: the env var is in place.** `VITE_SUPABASE_PUBLISHABLE_KEY` was added to
**Production** (Config, 46 chars) and `VITE_SUPABASE_ANON_KEY` is still there. Nothing was removed.
**Resume by deploying haul — do not re-add the variable.**

The deploy itself is blocked from this machine, for two separate reasons:

1. **`vercel --prod` at the repo root uploads the whole monorepo (251 MB) and the free plan's daily
   API upload quota is spent** — `Too many requests - try again in 24 hours (more than 5000, code:
   "api-upload-free")`. One root deploy is enough to exceed it, so repeating this eleven times is not
   viable even after the reset.
2. **Deploying from the app directory does not work either**: every project sets *Root Directory* to
   `apps/<app>`, so a scoped upload looks for `apps/haul/apps/haul` —
   `The specified Root Directory "apps/haul" does not exist`.
3. **The prebuilt route (the one that only uploads the build output) fails on Windows**: `vercel build`
   cannot create the symlinks its builder cache needs —
   `EPERM: operation not permitted, symlink '..\..\~npm~@emnapi+core…'`.

What unblocks it, in order of preference:

- **Windows Developer Mode on** (Settings → Privacy & security → For developers), then per app
  `vercel build --prod` + `vercel deploy --prebuilt --prod`. That uploads only `.vercel/output`
  (tens of files) instead of 251 MB, so the daily quota is not a problem after it resets.
- **Or deploy from git** (Vercel dashboard / the existing deploy hooks) — that needs the Phase 5
  commit pushed, which is the owner's call; nothing here pushes.
- Root-dir deploys after the quota resets remain impractical (251 MB each).

No other app was touched: haul got its variable, the deploys stopped there as instructed.

### Pre-phase-8 item: files still reading `SUPABASE_SERVICE_ROLE_KEY`

**Not fixed here — this is the gate in front of phase 8.** This is the **original audit from before
the migration above**; the edge DB clients in it have since moved to the helper (see phase 3.5), so
read it together with that section. A grep over source files (bundles and
tests excluded) found **106 files / 185 occurrences**, not the ~35 first estimated. **67 of
them build a database client** — that is the part that stops working when the legacy key dies.
Ten of those files belong to the five legacy functions that were deleted from prod, so they are now
dead code; **the live count was 96 files, 57 of them DB clients — of which the 31 edge ones are now
migrated**, leaving the 26 local scripts and `recon-worker` for phase 4. The rest only put the legacy
JWT in an `Authorization` header, which is now redundant because no function has `verify_jwt` on.

Move every DB client onto `_shared/serviceKey.ts`, and bump the `jsr:@supabase/supabase-js@2.49.8`
pin at the same time — that version predates the new key format and would send an `sb_secret_…` key
as a Bearer JWT. The files the owner named are all in the list below: `service_client.ts`,
`kv_store.tsx`, `fleet_sql_bridge.ts`, the ledger files, `explorer/index.ts` (its `admin()` helper),
the rides fare clients, the delivery merchant files, and `orderToFleetTrip.ts` / `rideToFleetTrip.ts`.

#### Helper + its expected legacy fallback (2)
- `supabase/functions/_shared/authorizeCronOrServiceRole.ts` — DB client
- `supabase/functions/_shared/serviceKey.ts`

#### Edge functions (48)
- `supabase/functions/_fleet-server/api_command_center.tsx`
- `supabase/functions/_fleet-server/driver_financial_periods.ts` — DB client
- `supabase/functions/_fleet-server/earnings_period_materialize.ts` — DB client
- `supabase/functions/_fleet-server/earnings_seal_http.ts`
- `supabase/functions/_fleet-server/env_boot.ts`
- `supabase/functions/_fleet-server/financial_ledger.ts` — DB client
- `supabase/functions/_fleet-server/fleet_sql_bridge.ts` — DB client
- `supabase/functions/_fleet-server/fuel_controller.tsx` — DB client
- `supabase/functions/_fleet-server/fuel_seal_http.ts`
- `supabase/functions/_fleet-server/kv_store.tsx` — DB client
- `supabase/functions/_fleet-server/ledger_canonical.ts` — DB client
- `supabase/functions/_fleet-server/ledger_ensure_routes.ts`
- `supabase/functions/_fleet-server/odometer_ledger.ts` — DB client
- `supabase/functions/_fleet-server/plug_public_price.ts` — DB client
- `supabase/functions/_fleet-server/service_client.ts` — DB client
- `supabase/functions/_fleet-server/station_merchant_aliases.ts` — DB client
- `supabase/functions/_fleet-server/supabase_platform_usage.ts` — DB client
- `supabase/functions/_fleet-server/team_staff_service.ts`
- `supabase/functions/_fleet-server/unified_ledger_dual_write.ts` — DB client
- `supabase/functions/_shared/dashOrderSms.ts`
- `supabase/functions/_shared/featureFlags.ts` — DB client
- `supabase/functions/_shared/orderToFleetTrip.ts` — DB client
- `supabase/functions/_shared/rideToFleetTrip.ts` — DB client
- `supabase/functions/_shared/rushSettings/getSetting.ts` — DB client
- `supabase/functions/before-user-created/index.ts` — DB client
- `supabase/functions/catalog-research/index.ts` — DB client
- `supabase/functions/custom-access-token/index.ts` — DB client
- `supabase/functions/delivery/courierConsumerRoutes.ts` — DB client
- `supabase/functions/delivery/dashHealthRoutes.ts`
- `supabase/functions/delivery/inventoryRoadClearanceGate.ts` — DB client
- `supabase/functions/delivery/merchant_application_routes.ts` — DB client
- `supabase/functions/delivery/merchantStationDevice.ts`
- `supabase/functions/delivery/merchantStationPin.ts`
- `supabase/functions/delivery/orderChatNotify.ts`
- `supabase/functions/explorer/index.ts` — DB client
- `supabase/functions/fleet-activity-cron/index.ts`
- `supabase/functions/fleet-fuel-cron/index.ts`
- `supabase/functions/fleet-picture-cron/index.ts`
- `supabase/functions/fleet-toll-cron/index.ts`
- `supabase/functions/parts-sourcing-drain/index.ts` — DB client
- `supabase/functions/petrojam-prices/index.ts` — DB client
- `supabase/functions/platform-catalog/geoRoutes.ts` — DB client
- `supabase/functions/platform-catalog/index.ts` — DB client
- `supabase/functions/rides/fare/resolveLocation.ts` — DB client
- `supabase/functions/rides/fare/tollBrainClient.ts`
- `supabase/functions/rides/index.ts` — DB client
- `supabase/functions/rides/matchingBrainClient.ts`
- `supabase/functions/rush-cron/index.ts`

#### Legacy function sources — dead code now, the functions were deleted from prod (10)
- `apps/fleet/src/supabase/functions/admin-operations/index.ts` — DB client
- `apps/fleet/src/supabase/functions/admin-operations/kv_store.tsx` — DB client
- `apps/fleet/src/supabase/functions/ai-services/index.ts` — DB client
- `apps/fleet/src/supabase/functions/ai-services/kv_store.tsx` — DB client
- `apps/fleet/src/supabase/functions/financial-operations/index.ts` — DB client
- `apps/fleet/src/supabase/functions/financial-operations/kv_store.tsx` — DB client
- `apps/fleet/src/supabase/functions/fleet-management/index.ts` — DB client
- `apps/fleet/src/supabase/functions/fleet-management/kv_store.tsx` — DB client
- `apps/fleet/src/supabase/functions/fuel-maintenance/index.ts` — DB client
- `apps/fleet/src/supabase/functions/fuel-maintenance/kv_store.tsx` — DB client

#### Local scripts — not runtime, but they break after phase 8 (46)
- `scripts/backfill_settlement_transactions.mjs` — DB client
- `scripts/backfill-rush-settings.mjs` — DB client
- `scripts/backfill-week-statements.mjs` — DB client
- `scripts/cleanup-sync-restatement-drafts.mjs` — DB client
- `scripts/dash-golden-path-load-probe.mjs`
- `scripts/e2e/toll-reconciliation-smoke.mjs` — DB client
- `scripts/export-periods-baseline.mjs` — DB client
- `scripts/export-vehicle-catalog-restore.ts` — DB client
- `scripts/finance-doctor.mjs` — DB client
- `scripts/finance-recon.mjs` — DB client
- `scripts/gas-card-rev7-p4-remediate.mjs` — DB client
- `scripts/gas-card-v12-restate-weeks.ts` — DB client
- `scripts/heal-fuel-service-line-backlog.mjs`
- `scripts/heal-week-close-sync.mjs`
- `scripts/heal-week-close-sync.ts`
- `scripts/import-catalog-expansion.ts` — DB client
- `scripts/import-codab-via-sql.ts`
- `scripts/ledger-dual-read-compare.mjs`
- `scripts/ledger-retire-backup.mjs` — DB client
- `scripts/ledger-retire-hard-delete.mjs` — DB client
- `scripts/ledger-soak-check.mjs` — DB client
- `scripts/load-test-trip-projector.mjs`
- `scripts/provision-fleet-test-driver.mjs`
- `scripts/provision-indep-and-passenger-test.mjs`
- `scripts/provision-play-review-accounts.mjs`
- `scripts/provision-rush-courier-test.mjs`
- `scripts/provision-rush-customer-test.mjs`
- `scripts/provision-rush-partner-test.mjs`
- `scripts/report_fare_events_parity.mjs` — DB client
- `scripts/rev4-stage0-heal-2026-08-24.ts` — DB client
- `scripts/rev6-reheal-g5-aliases.ts`
- `scripts/run-vehicle-picture-worker-once.ts` — DB client
- `scripts/run-week-recon-done-tests.mjs`
- `scripts/seed-warehouse-door-user.mjs` — DB client
- `scripts/seed-week-recon-done-tests.ts`
- `scripts/shadow-week-statements.mjs` — DB client
- `scripts/smoke-courier-all.mjs`
- `scripts/smoke-customer-all.mjs`
- `scripts/smoke-merchant-all.mjs`
- `scripts/smoke/_shared.mjs`
- `scripts/unstick-domino-engine.mjs` — DB client
- `scripts/vehicle-pictures-preprod-c4b.mjs` — DB client
- `scripts/vehicle-pictures-preprod.mjs` — DB client
- `scripts/vehicle-pictures-reset-t22.mjs` — DB client
- `scripts/vehicle-pictures-reset.mjs` — DB client
- `scripts/verify_settlement_tx_parity.mjs` — DB client

### Separate faults (not key problems)

**1. `rush-trip-recon-daily` never sends anything.** (`cron.job` #65) It fails in SQL first:
`current_setting('app.settings.supabase_url', true)` is null, so the URL concatenates to null and
`net.http_post` never fires, so it never reaches `fleet-core`. Fix by setting the GUC or moving
the job onto a `private.invoke_*`-style helper. Out of scope for the key rotation.

**2. fleet-core's login gate checks *that* you are signed in, never *who* you are.**
`requireAuth({ strict: true })` only resolves the user (and rejects anon/banned tokens); it
applies no role, permission or organisation check. Combined with `POST /signup`, which is on
the skip list and public, **anyone can create an account and then reach the fleet-core "admin"
routes** — e.g. `POST /admin/fix-corrupted-types` (9273, rewrites data),
`DELETE /check-ins/:id`, the `unverified-vendors` family, `PUT /admin/platform-settings`
(that one does add `verifySettingsAccess`, but most do not). These routes are not *unauthenticated*,
they are *under-authorised*. This pre-dates the rotation and is not fixed by it; it needs its own
fix (a platform-staff or role check on `/admin/*` in the residual monolith).

## Done-tests

1. The leaked key returns 401 on `/rest/v1/` and on a function call.
2. Fleet, Dominion (admin), Driver app, Rush apps, Rides, Haul, Plug: sign in and load a main screen.
3. Every pg_cron job that calls a function returns 2xx the next morning (`net._http_response`).
4. Merchant gets the new-order push.
5. recon-worker run succeeds; Week Reconciliation page loads numbers.
