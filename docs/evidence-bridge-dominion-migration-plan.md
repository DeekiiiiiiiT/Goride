# Evidence Bridge Analytics — Final Audit & Dominion Migration Plan

**Status:** Implementation complete in repo (Phases 0–5). Ops: confirm `AUDIT_HMAC_SECRET` in prod, run HMAC backfill dry-run then live, monitor RBAC logs 24–48h after deploy.
**Owner decision needed before Phase 4/5:** see "Open Decisions" below — **locked 2026-07-24** (platform staff roles, HMAC backfill, remove fake stress test).
**Related existing docs:** [`docs/fleet-data-isolation-rollout.md`](./fleet-data-isolation-rollout.md), [`docs/auth-rbac.md`](./auth-rbac.md)

---

## 0. TL;DR

"Evidence Bridge Analytics" (the SHA-256 Hardening tab inside Fuel Management on `roamfleet.co`) is a fuel-fraud/GPS-verification audit tool. It was built to aggregate integrity data **across the whole platform**, but it currently ships inside the single-tenant customer product (`apps/fleet`), reachable by any fleet user, and its backend has **zero authentication** on several routes. It also has a half-finished cryptographic migration (two incompatible signing algorithms) and a UI that reports fabricated "0 anomalies" numbers.

Decision confirmed with product owner: move the aggregate/cross-tenant analytics into **Roam Dominion** (`apps/admin`, the platform super-admin app), gate it to real platform staff, and remove it from `roamfleet.co`. The per-transaction verification widget (single fuel log GPS match card) stays in the fleet app — it's legitimately per-org.

This document is the full audit trail plus the phased implementation plan a senior engineer would execute. **No code has been touched.**

---

## 1. Final Audit Findings

Severity scale: **Sev1** (live security exposure), **Sev2** (data integrity / trust issue), **Sev3** (cosmetic / misleading but not exploitable).

### F1 — Sev1: Evidence Bridge / admin fuel routes lack proper authz (corrected 2026-07-24)

**Correction:** The three `fuel_controller.tsx` Evidence Bridge routes are **not** unauthenticated — the controller applies `app.use("*", requireAuth({ strict: true }))` at line 44. Exposure was **any authenticated fleet user** (missing platform-staff gate + org scoping), not anonymous internet access.

| Route | File | Auth before Phase 0 | Gap |
|---|---|---|---|
| `GET /analytics/integrity-metrics` | `fuel_controller.tsx` ~2511 | Controller JWT only | Any fleet user; platform-wide aggregates; no `requirePlatformStaff` |
| `POST /admin/stress-test-evidence-bridge` | `fuel_controller.tsx` ~4571 | Controller JWT only | Any fleet user; `/admin/` prefix misleading |
| `POST /admin/verify-record-forensics` | `fuel_controller.tsx` ~4634 | Controller JWT only | Any fleet user; cross-org record by ID |
| `GET /admin/fuel-audit/summary` | `index.tsx` ~939 | **None** | True unauthenticated + platform-wide |
| `GET /admin/fuel-audit/flagged` | `index.tsx` ~964 | **None** | True unauthenticated + platform-wide |
| `POST /admin/fuel-audit/resolve` | `index.tsx` ~987 | **None** | True unauthenticated write |
| `POST /admin/fuel-audit/recalculate-all` | `index.tsx` ~1008 | **None** | True unauthenticated write |
| `GET /admin-stats` | `index.tsx` ~14697 | **None** | True unauthenticated platform metrics |

**Phase 0 fix:** `requirePlatformStaff` on Evidence Bridge + fuel-audit + admin-stats; org filter on `/dashboard/stats`; `belongsToOrg` on `/ledger/driver-overview`.

### F2 — Sev1: Cross-tenant data aggregation with no org scoping
File: `apps/fleet/src/supabase/functions/server/fuel_controller.tsx:2511-2541`

The `integrity-metrics` query runs raw Supabase selects against `kv_store_37f42386` filtered only by key prefix (`fuel_entry:%`, `station:%`) — **no `organizationId` predicate anywhere**. If more than one org uses `roamfleet.co`, every org's fuel spend, verification counts, and station data are summed into one global number and shown to whoever loads the page.

This is notable because the codebase has a **mature, purpose-built org-scoping layer** for exactly this problem: `apps/fleet/src/supabase/functions/server/org_scope.ts`, exporting `getOrgId()`, `filterByOrg()`, `filterByOrgStrict()`, `filterByOrgSafe()`, `stampOrg()`, `belongsToOrg()`. It's actively used correctly elsewhere:
- `GET /driver-metrics` (`index.tsx:2593`) — calls `filterByOrg`
- `GET /vehicle-metrics` (`index.tsx:2651`) — calls `filterByOrg`
- `GET /ledger/summary`, `/ledger/statement-summary`, `/ledger/drivers-summary`, `/ledger/fleet-summary` — all call `getOrgId`/`filterByOrg` (directly or via `fetchCanonicalFareEarningAll` / `fetchCanonicalLedgerEventsInPeriod` helpers, `index.tsx:6155`/`6177`)

So `integrity-metrics` isn't following an unusual pattern that never existed — it's an outlier that skipped a pattern the rest of the ledger/metrics surface already uses correctly.

**Also unscoped (found during the same survey):**
- `GET /dashboard/stats` (`index.tsx:1907`) — has `requireAuth()` but no org filter on the `trip:%`/`driver:%` aggregation, so any authenticated fleet user (any org, any role including viewer) sees platform-wide trip/driver counts.

### F3 — Sev2: Two incompatible signing algorithms are live simultaneously
Files: `apps/fleet/src/supabase/functions/server/fuel_controller.tsx` and `apps/fleet/src/supabase/functions/server/audit_logic.ts`

- **Old/legacy path** — `signRecord()`, `fuel_controller.tsx:1392`. Bare `crypto.subtle.digest("SHA-256", ...)` over the whole record (minus `signature`). No secret key — **forgeable by anyone who can read the record**, since SHA-256 of known data is trivially reproducible. Still called at lines **1700, 1706, 1768, 1772, 2226, 2260, 2442, 3336, 3684** — i.e. most write paths (bulk station assign, historical backfill, learnt-location promotion) still use this.
- **New/hardened path** — `auditLogic.generateRecordHash()`, `audit_logic.ts:19-55`. HMAC-SHA256 keyed with server-side `AUDIT_HMAC_SECRET`. Its own comment says explicitly: *"bare SHA-256 is forgeable without a server-side key."* Only called at lines **2861, 2906, 2925, 3117** — GPS auto-verify and auto-lock paths.

**Consequence:** `auditLogic.verifyRecordIntegrity()` (`audit_logic.ts:61-68`), used by `POST /admin/verify-record-forensics`, recomputes the HMAC hash and compares it to `record.signature`. For any entry signed via the old bare-SHA256 `signRecord()` path, this comparison **will always fail** — not because of tampering, but because it's the wrong algorithm entirely. The "Verify" button in the Forensic Log tab is expected to report false positives for "Tampered (Signature Mismatch)" on a large share of real, untouched records.

This is a known-in-progress migration, not a one-off mistake: `docs/fleet-data-isolation-rollout.md` (Step 7.6) already documents `AUDIT_HMAC_SECRET` as a required env var for "tamper-evident audit hashes" as part of a security hardening wave — it just was never finished across all `fuel_controller.tsx` write paths.

### F4 — Sev3: Fabricated / dead metrics in the UI
File: `apps/fleet/src/components/fuel/IntegrityGapDashboard.tsx`

- Lines **566-575**: "Retroactive Edit Attempts: 0" and "Signature Mismatches: 0" in the Security Anomalies panel are **hardcoded literal JSX**, not bound to any query. They will read `0` forever regardless of what's actually happening.
- Line **163**: the "Failed" slice of the SHA-256 pie chart is driven by `entries.filter(e => e.metadata?.isTampered)`. Grep across the entire repo confirms `isTampered` is **never set anywhere in the backend** — it's a dead field, so this bucket is structurally always empty, not "empty because nothing is tampered."
- Line **280**: "SYSTEM DRIFT TREND: Stable" badge is a static string, not computed from the drift trend data next to it.

### F5 — Sev3: "Run Pressure Test" doesn't test anything real
File: `apps/fleet/src/supabase/functions/server/fuel_controller.tsx:4571-4624`

Generates synthetic GPS-drift entries **in memory only**. Its own code comment: *"Note: In a real system, we'd call the POST /fuel-entries internally... for the mock, we'll just simulate."* Nothing is written to the ledger, no real detection/signing logic runs, and it returns a canned success message regardless of input. It's a UI demo, not a functional stress test — this matters if Dominion staff start relying on it to validate the detection pipeline.

### F6 — Placement: wrong product surface (the original ask)
File: `apps/fleet/src/pages/FuelManagement.tsx:975-977, 1106-1108`

`IntegrityGapDashboard` renders as a plain tab (`activeTab === 'integrity-gap'`) inside the ordinary customer-facing Fuel Management page — no role gate found around it client-side, consistent with the backend having none either. It sits alongside per-org tabs like Transaction Logs and Card Inventory, in the main left-nav "Fleet Operations" section any fleet user reaches — not in any admin-only surface.

Confirmed this is genuinely a platform-wide monitoring tool, not a per-org one: it reports fleet-wide "dead zones," system-wide immutability ratio, and cross-station drift — conceptually the same category of tool as `apps/admin`'s existing `FuelBrainPage.tsx` ("Dominion → Fuel Management" policy console) and `fleet-admin/storage/overview` (gated via `requireProductAdmin`).

### F7 — Sev2: IDOR on an unrelated ledger endpoint (found incidentally during the survey)
File: `apps/fleet/src/supabase/functions/server/index.tsx:4797`

`GET /ledger/driver-overview` takes an arbitrary `driverId` query parameter, gated only by `requireAuth()` — there is no check that the requested `driverId` belongs to the caller's own organization. Any authenticated fleet user could potentially view another org's driver financial ledger by supplying a different `driverId`. Not part of Evidence Bridge, but it's the same root cause (an endpoint that skipped `org_scope.ts`) and was surfaced by the same sweep, so it's included here for the record. **Recommend fixing this in Phase 0 alongside the zero-auth routes** since it's an active data exposure of the same class.

### F8 — Sev3: Two different "platform role" definitions disagree
Files: `apps/fleet/src/supabase/functions/server/org_scope.ts:28-32` vs `apps/fleet/src/supabase/functions/server/product_admin_guard.ts:9-13`

- `org_scope.ts` `PLATFORM_ROLES` = `platform_owner`, `platform_support`, `platform_analyst`
- `product_admin_guard.ts` `PLATFORM_ROLES` = `platform_owner`, `platform_support`, `superadmin`

`platform_analyst` and `superadmin` are each recognized as "sees everything" in one file but not the other. This needs reconciling **before** gating a genuinely cross-tenant dashboard behind "is this a platform role" — otherwise we bake the inconsistency into a brand-new feature. Also note: `requireProductAdmin(c, "fleet")` (the guard already used by `fleet-admin/storage/overview` etc.) additionally allows `fleet_admin`/`fleet_ops` — i.e. a **single org's own admin**, not company staff. That guard is the wrong tool for gating Evidence Bridge in Dominion; a true platform-role-only check is needed (see Phase 1).

---

## 2. What must NOT change

- **`EvidenceBridgeView.tsx`** (`apps/fleet/src/components/fuel/stations/EvidenceBridgeView.tsx`) and **`ForensicCertificate`** — the per-transaction GPS-match card shown on an individual fuel log. This is inherently single-org, single-transaction data and correctly belongs in the fleet product. Do not move or remove it.
- The underlying signing/locking behavior on `POST /fuel-entries` (`fuel_controller.tsx:2566-2604`) that rejects edits to signed records — that's real tamper protection for financial fields and should stay, just have its signing algorithm unified (Phase 2).
- `apps/admin`'s existing `FuelBrainPage.tsx` (Dominion → Fuel Management → Fuel Brain) — separate feature (deadhead/policy rule config), not touched by this plan.

**Side note (not in scope, flagged for awareness only):** `apps/fleet/src/components/admin/AdminLayout.tsx` is a second, separate embedded "admin panel" living inside the fleet app itself, with its own `fuel-analytics` nav entry — but that one renders `GasStationAnalytics` (pricing/trend analytics), a completely different component from `IntegrityGapDashboard`. It's a pre-existing duplication between the fleet app's internal admin panel and Dominion (`apps/admin`) that predates this work; worth a separate cleanup ticket someday, but do not conflate it with the Evidence Bridge move.

---

## 3. Open decisions needed before implementation

1. **Role gate for the new Dominion page:** confirm the exact role set that should see platform-wide fuel integrity data. Recommendation: reuse/fix `org_scope.ts`'s `PLATFORM_ROLES` (`platform_owner`, `platform_support`, `platform_analyst`) as the single source of truth (see Phase 1) rather than `product_admin_guard.ts`'s set, since `fleet_admin`/`fleet_ops` must NOT see cross-org data.
2. **Historical signature backfill:** once signing is unified on HMAC (Phase 2), do we re-sign all existing bare-SHA256 records so `verify-record-forensics` stops reporting false mismatches on old data? This requires a backfill job and a decision on whether it runs online or requires a maintenance window (existing `docs/fleet-data-isolation-rollout.md` shows the team already has a backfill-and-flag-rollout pattern to reuse).
3. **`AUDIT_HMAC_SECRET` provisioning:** confirm it's already set in the Fleet edge function's production env (it's required for `generateRecordHash` to work at all — if unset, that function throws). If not set, Phase 2 blocks on ops setting it.
4. **Real vs. removed stress test:** does Dominion need a genuinely functional pressure test (wired through the real `/fuel-entries` pipeline against a sandboxed/test org), or should the mock simply be removed/labeled as a demo? Recommendation: remove the fake "success" framing at minimum; building a real one is a larger effort and should be its own ticket if wanted.

---

## 4. Phased Implementation Plan

### Phase 0 — Emergency patch: close the zero-auth routes (do this first, independent of everything else)
**Goal:** stop unauthenticated access immediately; low risk, no UI changes, ships same day.

1. Add `requireAuth({ strict: true })` at minimum, or `requireProductAdmin(c, "fleet")` where admin-only is correct, to:
   - `GET /analytics/integrity-metrics` (`fuel_controller.tsx:2511`)
   - `POST /admin/stress-test-evidence-bridge` (`fuel_controller.tsx:4571`)
   - `POST /admin/verify-record-forensics` (`fuel_controller.tsx:4634`)
   - `GET /admin/fuel-audit/summary` (`index.tsx:939`)
   - `GET /admin/fuel-audit/flagged` (`index.tsx:964`)
   - `GET /admin-stats` (`index.tsx:14697`)
2. Fix the IDOR on `GET /ledger/driver-overview` (`index.tsx:4797`): after loading the requested driver record, verify its `organizationId` matches the caller's via `belongsToOrg()`/`belongsToOrgStrict()` from `org_scope.ts`, return 403/404 on mismatch.
3. Add org filtering to `GET /dashboard/stats` (`index.tsx:1907`) using `filterByOrg()`, matching the pattern already used on `/driver-metrics` and `/vehicle-metrics`.
4. **Testing:** call each patched endpoint with (a) no token → expect 401, (b) a valid token from Org A → expect Org A's data only (for the org-scoped ones), (c) a platform-role token → expect full/global data where that's intended.
5. **Rollback:** trivial — these are additive auth checks; revert the single line if something breaks.

### Phase 1 — Reconcile platform role definitions
**Goal:** one authoritative definition of "platform staff" before gating cross-tenant features behind it.

1. Decide the canonical role list (recommend: `platform_owner`, `platform_support`, `platform_analyst`, and confirm whether `superadmin` is a legacy alias for `platform_owner` or a genuinely distinct role — check user records / `rbac_middleware.ts` role-level table before deciding).
2. Update `product_admin_guard.ts:9-13`'s `PLATFORM_ROLES` and `org_scope.ts:28-32`'s `PLATFORM_ROLES` to match, or better: have one import the other so there's a single source of truth.
3. Add a small `requirePlatformRole()` helper (in `org_scope.ts` or `rbac_middleware.ts`) that Phase 4's new Dominion routes will use — distinct from `requireProductAdmin()`, which intentionally also allows a single org's own `fleet_admin`/`fleet_ops`.
4. **Testing:** unit test that a `fleet_admin` (org-level) token is rejected by `requirePlatformRole()` but accepted by `requireProductAdmin(c, "fleet")`, and that `platform_owner`/`platform_support`/`platform_analyst` tokens are accepted by both.

### Phase 2 — Standardize cryptographic signing
**Goal:** one signing algorithm, so "Verify" is meaningful.

1. Replace all remaining `signRecord()` call sites in `fuel_controller.tsx` (lines 1700, 1706, 1768, 1772, 2226, 2260, 2442, 3336, 3684) with `auditLogic.generateRecordHash()`.
2. Confirm `AUDIT_HMAC_SECRET` is set in every environment that runs this function (local, staging, prod) — `generateRecordHash` throws if it's missing, so this must happen before deploying the call-site swap, not after.
3. Delete `signRecord()` once nothing references it, to remove the footgun for future code.
4. Write/adapt a backfill script (mirroring the pattern in `docs/fleet-data-isolation-rollout.md`) that re-signs existing fuel entries whose `signature` doesn't match the HMAC scheme, so `verify-record-forensics` doesn't report false "Tampered" results on legitimate historical data. Gate this behind a dry-run flag first, same convention as the org-backfill script referenced in that doc.
5. **Testing:** for a sample of existing signed entries, confirm `verifyRecordIntegrity()` returns `true` post-backfill; for a manually-tampered test record, confirm it returns `false`.

### Phase 3 — Fix or remove fabricated metrics
**Goal:** the dashboard should only ever show numbers it can actually back up.

1. `IntegrityGapDashboard.tsx:566-575` — replace hardcoded "Retroactive Edit Attempts: 0" / "Signature Mismatches: 0" with a real query: count of `POST /fuel-entries` requests rejected with the 403 "Cryptographic Integrity Violation" error (`fuel_controller.tsx:2574-2576`) — this will require logging those rejections somewhere queryable (a KV counter or log-based metric) since they aren't currently persisted anywhere.
2. `IntegrityGapDashboard.tsx:163` — either start setting `metadata.isTampered` somewhere meaningful (e.g., when `verifyRecordIntegrity()` returns false) or remove the "Failed" bucket from the pie chart entirely until it's real.
3. `IntegrityGapDashboard.tsx:280` — compute "Stable/Degrading/Improving" from the actual drift trend series instead of a hardcoded "Stable" badge, or remove the badge.
4. Per Open Decision #4: either wire the stress test through a real (sandboxed) write path or relabel it clearly as a simulation in the UI copy.

### Phase 4 — Build Evidence Bridge Analytics in Roam Dominion (`apps/admin`)
**Goal:** the real destination, properly gated.

1. Add a new child route under the existing "Fuel Management" section in Dominion's nav: `apps/admin/src/components/admin/adminNavConfig.ts` — add e.g. `{ id: 'fuel-evidence-bridge', label: 'Evidence Bridge', icon: ShieldCheck }` to `FUEL_MANAGEMENT_CHILDREN` (currently `fuel-brain`, `fuel-stations`, `fuel-analytics` at lines 93-97). Don't reuse the existing `fuel-analytics` id — that already renders `GasStationAnalytics`, a different feature.
2. Port `IntegrityGapDashboard.tsx` from `apps/fleet` into `apps/admin` (e.g. `apps/admin/src/components/admin/fuel-evidence-bridge/EvidenceBridgeAnalytics.tsx`), applying the Phase 3 fixes as part of the port rather than copying the fabricated metrics forward.
3. Route it in `AdminPortal.tsx` alongside the existing `fuel-analytics`/`fuel-stations` cases, matching the pattern at `apps/admin/src/components/admin/AdminPortal.tsx:164,244`.
4. Backend: since `apps/admin` calls the same Fleet edge function backend, reuse the now-fixed `GET /analytics/integrity-metrics` etc. from Phase 0/2/3, but change their guard from `requireAuth({strict:true})` to the new `requirePlatformRole()` from Phase 1 — this is the one place where seeing **all** orgs' data is correct and intentional, so it should explicitly bypass org filtering (which `requirePlatformRole` + the existing `PLATFORM_ROLES` bypass in `filterByOrg`/`getOrgId` already supports).
5. `apps/admin/src/services/api.ts` already mirrors `getIntegrityMetrics`/`runEvidenceBridgeStressTest`/`verifyRecordForensics` method signatures (copied from the fleet client) — verify these point at the correct backend base URL for Dominion and don't need changes beyond what Phase 0-3 already fixed server-side.
6. **Testing:** log in as `platform_analyst`, confirm the page loads with real cross-org data; log in as a fleet customer's `fleet_admin`, confirm the route/nav item is not visible and the underlying endpoint 403s if hit directly.

### Phase 5 — Remove Evidence Bridge Analytics from `roamfleet.co`
**Goal:** the actual removal, done last so nothing is lost mid-migration.

1. Remove the `integrity-gap` tab from `apps/fleet/src/pages/FuelManagement.tsx` (tab button, the `pageTitle`/`pageDescription` branch at lines 975-977, and the render block at lines 1106-1108).
2. Delete `apps/fleet/src/components/fuel/IntegrityGapDashboard.tsx` (superseded by the Dominion copy from Phase 4).
3. Confirm no other fleet-app code imports `IntegrityGapDashboard` before deleting (`grep -r IntegrityGapDashboard apps/fleet`).
4. Leave `EvidenceBridgeView.tsx`, `ForensicCertificate`, and the fuel-entry signing/locking logic untouched (see Section 2).
5. Remove the fleet-app client methods that only existed to feed this page, if `getIntegrityMetrics`/`runEvidenceBridgeStressTest`/`verifyRecordForensics` in `apps/fleet/src/services/api.ts` have no other callers after step 1-2.
6. **Testing:** full regression pass on the remaining Fuel Management tabs (Dashboard, Reconciliation, Review Queue, Card Inventory, Transaction Logs) to confirm nothing else referenced the removed tab/state.

### Phase 6 — Rollout & monitoring
1. Ship Phase 0 immediately/independently — it's a pure security fix with no user-facing change.
2. Ship Phases 1-3 together (role cleanup + signing unification + honest metrics) behind a feature flag if the team's convention (per `docs/fleet-data-isolation-rollout.md`) is to gate behind flags before global enablement — reuse that same dry-run → single-org test → global pattern for the signature backfill specifically, since it touches historical financial records.
3. Ship Phase 4 (Dominion build-out) and verify with real platform-role accounts in staging before Phase 5.
4. Ship Phase 5 (removal from fleet) last, only after Dominion's version has been live and verified for at least one full audit cycle, so there's no gap where the capability disappears from both places at once.
5. Monitor logs for `[filterByOrg]` and `[RBAC]` entries (existing logging convention in `org_scope.ts`/`rbac_middleware.ts`) on the newly-gated routes for 24-48h after each phase ships, same as the existing rollout doc's monitoring step.

---

## 5. File Inventory (everything referenced by this plan)

**Backend (`apps/fleet/src/supabase/functions/server/`):**
- `fuel_controller.tsx` — lines 1392 (`signRecord`), 2511 (`integrity-metrics`), 4571 (stress test), 4634 (verify-record-forensics), plus all `signRecord`/`generateRecordHash` call sites listed in F3
- `index.tsx` — lines 939, 964, 1907, 4797, 14697
- `audit_logic.ts` — `generateRecordHash`, `verifyRecordIntegrity`
- `org_scope.ts` — `PLATFORM_ROLES`, `filterByOrg`, `getOrgId`, `belongsToOrg`
- `product_admin_guard.ts` — `PLATFORM_ROLES`, `requireProductAdmin`
- `rbac_middleware.ts` — `requireAuth`, `hasPlatformStaffAccess`, `hasPlatformOwnerAccess`
- `feature_flags.ts` — `FEATURE_FLAGS.STRICT_ORG_FILTER`, `STRICT_AUTH`

**Frontend, fleet (`apps/fleet/src/`):**
- `pages/FuelManagement.tsx` — lines 975-977, 1106-1108
- `components/fuel/IntegrityGapDashboard.tsx` — whole file (to delete post-migration)
- `components/fuel/stations/EvidenceBridgeView.tsx` — keep, untouched
- `services/api.ts` — `getIntegrityMetrics`, `runEvidenceBridgeStressTest`, `verifyRecordForensics`

**Frontend, Dominion (`apps/admin/src/`):**
- `components/admin/adminNavConfig.ts` — `FUEL_MANAGEMENT_CHILDREN` (lines 93-97)
- `components/admin/AdminPortal.tsx` — routing (lines 164, 244 area)
- `components/admin/fuel-brain/FuelBrainPage.tsx` — existing sibling feature, reference only
- `services/api.ts` — already has mirrored method signatures

**Docs:**
- `docs/fleet-data-isolation-rollout.md` — existing rollout convention to reuse for the signature backfill
- `docs/auth-rbac.md` — reference for role/permission model

---

## 6. Summary Table

| Finding | Severity | Phase that fixes it |
|---|---|---|
| F1 — zero-auth Evidence Bridge routes | Sev1 | 0 |
| F2 — cross-tenant aggregation, no org filter | Sev1 | 0 (patch) → 4 (intentional, gated) |
| F7 — IDOR on `/ledger/driver-overview` | Sev2 | 0 |
| F8 — inconsistent platform-role definitions | Sev3 | 1 |
| F3 — dual signing algorithms | Sev2 | 2 |
| F4 — fabricated/dead metrics | Sev3 | 3 |
| F5 — non-functional stress test | Sev3 | 3 |
| F6 — wrong product surface | (the ask) | 4 + 5 |
