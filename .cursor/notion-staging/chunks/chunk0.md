Source: docs/edge-function-audit.md (synced 2026-07-18)

# Edge Function Audit — Roam / Fleet

Production-readiness audit of all Supabase Deno Edge Functions across both function trees:

- `apps/fleet/src/supabase/functions/` (Fleet management backend)
- `supabase/functions/` (Roam rides/driver platform)

374 `.ts`/`.tsx` files, read in full across 8 independent passes, audited against ten pillars: security/auth, error handling, input validation, performance, redundancy/DRY, CORS, env vars, idempotency/race conditions, logging, and edge-case handling.

**Totals:** 24 critical findings · ~40 high priority · ~35 cleanup items · ~35 things done right.

---

## Executive summary

The same problems kept showing up in slices of the codebase that were audited independently of each other — that repetition is the real finding. These are systemic patterns, not one-off bugs.

### 1. Whole routers are mounted with no auth check at all

This is the headline finding. In the Fleet app, `index.tsx` mounts **eight separate controllers** — audit logs, safety/fatigue data, sync locks, payment-ledger-line import, toll reconciliation, dispute-refund matching, period reset, and driver financial periods — and not one route inside any of them calls `requireAuth()`. That's most of the toll/dispute/ledger surface currently under active development. On the Roam side, `admin-operations/index.ts` has the identical shape: no role check before inviting, deleting, or listing users. Anyone who can reach the URL — no login, not even an API key — can read other drivers' payout history, delete users, or nuke a whole reconciliation period.

> `apps/fleet/src/supabase/functions/server/index.tsx:1451–1460`
> `apps/fleet/src/supabase/functions/admin-operations/index.ts`

### 2. Even the "protected" routes aren't protected by default

On routes that *do* call `requireAuth()`, an invalid or missing token doesn't get rejected — it silently becomes a synthetic `fleet_owner` admin user. A feature flag (`strict_auth`) is supposed to turn on real rejection, but it defaults to **off**. So the safety net for pattern 1 — "well, the rest of the API is at least behind auth" — is itself open by default.

> `apps/fleet/src/supabase/functions/server/rbac_middleware.ts:376–387`
> `apps/fleet/src/supabase/functions/server/feature_flags.ts:344–347`

### 3. Money-moving code checks-then-acts instead of using an atomic guard

Toll charges, ledger events, driver-offer accepts, and ride status transitions are frequently written as "read a flag → decide in JavaScript → write" with no database-level compare-and-swap in between. Two concurrent requests (a retry, a double-click, a race between an automated geofence transition and a manual one) can both pass the check and both write — double-charging a driver, duplicating a ledger event, or double-firing a ride completion. The codebase clearly knows the right pattern — `financial_ledger.ts`'s RPC-based idempotency key + content hash, and the driver-offer-accept atomic RPC, are both textbook — it's just applied inconsistently.

> `driver_toll_charge.ts:158–177` · `ledger_canonical.ts:344–370` · `rideLifecycle.ts:102–244`

### 4. CORS is wildcard-open everywhere, including admin routes

`origin: "*"` (or bare `cors()`, same default) appears in the Fleet server, all five standalone Fleet function apps, the Roam rides app (including its `/admin` subtree), and the driver/fleet-ops/platform-catalog functions. Combined with pattern 1, unauthenticated, cross-origin browser JS can hit the destructive endpoints directly.

### 5. The same helper gets reinvented three, four, five times

`kv_store.tsx` exists as six separate copies. `api_pricing.ts` and `api_usage_logger.ts` exist three times each. Service-role Supabase client construction is reimplemented ad hoc in 25+ files instead of importing one shared factory. Avatar/display-name resolution from a user's auth metadata is copy-pasted near-verbatim into six different Roam files. None of these have drifted into bugs *yet* — but every one is a "the fix landed in one copy and not the other four" incident waiting to happen.

### 6. Env vars are read with `!` or `?? ""`, never validated at boot

`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!` shows up in essentially every file in both trees. If it's ever unset, nothing fails loudly at startup — the function boots fine and then throws an opaque, unhelpful error on the first real request.

### 7. One genuinely alarming one-off: a debug backdoor phoning home in production

Every PIN issuance, every matching wave, every reconcile call, and every driver-offer poll in the Roam rides function fires an uncaught `fetch()` to a hardcoded `http://127.0.0.1:7418/ingest/...` — clearly leftover AI-pair-debugging instrumentation — shipping driver IDs, ride IDs, and PIN-presence flags on every hot-path request. When a `persist` flag is on, it also writes permanent rows into the production audit log. This should come out today; it's the single easiest fix in the whole report.

> `supabase/functions/rides/index.ts:803–828` (and every call site listed under Chunk G below)

---

## Chunk A — Fleet: audit / cache / vendor / catalog / RBAC utils

`apps/fleet/src/supabase/functions/server/` — audit_controller, cache, rate_limiter, safety_controller, sync_controller, vendor_matcher, vehicle_catalog_*, rbac_middleware, org_scope, and 25 more.

### Critical

- **`audit_controller.tsx:1–70`** (mounted at `index.tsx:1452`) — No auth on the audit-log endpoints, and `POST /audit/logs` takes `userId` straight from the request body as the audit actor. Anyone can write a fabricated "admin did this" entry attributed to any user.
  ```ts
  app.post(`${BASE_PATH}/audit/logs`, requireAuth(), requirePermission('data.export'), async (c) => {
    const user = c.get('rbacUser') as RbacUser;
    const { entityId, entityType, action, oldValue, newValue, reason } = await c.req.json();
    const logEntry = { ...{ entityId, entityType, action, oldValue, newValue, reason }, userId: user.userId, ... };
  ```

- **`audit_logic.ts:19–47`** — "Tamper-evident" hashing has no secret, so it's forgeable. `generateRecordHash` is a plain SHA-256 digest with no server-side key. Combined with the open endpoint above, anyone can edit data and recompute a hash that "verifies" as untouched.
  ```ts
  const key = await crypto.subtle.importKey("raw",
    new TextEncoder().encode(Deno.env.get("AUDIT_HMAC_SECRET")!),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, msgUint8);
  ```

- **`safety_controller.tsx:1–10, 13, 94`** (mounted at `index.tsx:1453`) — No auth on driver fatigue/risk data. `GET /fleet/efficiency-baseline` and `GET /safety/fatigue-analysis` leak per-driver risk scores and IDs to anyone.

- **`sync_controller.tsx:1–10, 13–88`** (mounted at `index.tsx:1454`) — No auth, and lock/preference ownership is whatever the client claims it is. Any caller can steal or force-release another user's edit lock, or read/write another user's preferences via a plain `?userId=` query param.
  ```ts
  syncApp.post("/make-server-37f42386/sync/lock", requireAuth(), async (c) => {
    const rbacUser = c.get('rbacUser') as RbacUser;
    const { resourceId, resourceType } = await c.req.json();
    ... userId: rbacUser.userId, userName: rbacUser.email ...
  ```

- **`payment_ledger_line_controller.tsx:1–23, 78–126, 152–219`** (mounted at `index.tsx:1459`) — The widest-open money endpoint in the whole audit. No auth on any route: `POST /payment-ledger-lines/import` writes real payment/earnings data using only the service-role client, and `GET /payment-ledger-lines` hands back every driver's payout history to anyone who can reach it. Wrap every route in `requireAuth()` + `requirePermission(...)`, and derive org/driver scope from the verified JWT, never the request body.

### High priority
