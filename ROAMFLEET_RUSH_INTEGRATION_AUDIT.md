# RoamFleet × Roam Rush — Multi-Service-Line Integration Audit

**Date:** 2026-08-31 (design audit — [Part I](#0-executive-summary)) · **2026-09-01** ([Part II](#part-ii--implementation-verification-2026-09-01), [Part III](#part-iii--remediation-verification-2026-09-01), [Part IV](#part-iv--remediation-round-2--workforce-signup-architecture-2026-09-01), [Part V](#part-v--x1--signup-remediation-verification-2026-09-01))
**Scope:** How to add the Roam Rush product family (`roamrush.app`, `courier.roamrush.app`, `partner.roamrush.app`) into `roamfleet.co` as a second service line, serving three customer shapes: rideshare-only, delivery-only, and both.
**Method:** Static read of `apps/fleet` (1,081 TS/TSX files), `apps/dash-courier` (175), `apps/dash-customer` (163), `apps/rush-command` (277), `apps/enterprise` (196), `supabase/functions/_fleet-server`, `supabase/functions/delivery`, `supabase/functions/matching`, and 437 migrations. **No code was changed by either pass.**
**Companions:** [ROAMRUSH_SYSTEM_AUDIT.md](ROAMRUSH_SYSTEM_AUDIT.md) · [docs/FINANCIAL_INTEGRITY_AUDIT.md](docs/FINANCIAL_INTEGRITY_AUDIT.md) · [docs/MULTI_VERTICAL_COMPATIBILITY.md](docs/MULTI_VERTICAL_COMPATIBILITY.md) · [RUSH_MARKETPLACE_PRICING_MIGRATION.md](RUSH_MARKETPLACE_PRICING_MIGRATION.md)

> **STATUS — 2026-09-01 (after remediation round 3).** Parts 0–12 are the original design audit and remain the target architecture. Parts II–V are successive verification passes; **[Part V](#part-v--x1--signup-remediation-verification-2026-09-01) is current.**
>
> **The Rush integration itself is now essentially done.** X1 is fixed and Rush nav is reachable; V9 (scope filtering) and V12 (per-service-line earnings) — open since Part II — are both closed. Build green: 175 test files / 1,105 tests, platform-settings 24, Rush-spine typecheck 0 errors, all guards pass.
>
> **The remaining risk has moved to the signup work.** The driver app's *hybrid* path was migrated to invite codes, but the **Google path was not** — it still joins fleets by pasting the org UUID — and `POST /driver/join-fleet` remains live and unflagged, so S1 is not closed. Separately, the new invite path writes only `driver_profiles`, so **a rideshare driver who joins by invite code never appears on the fleet owner's roster.**
>
> **Gate: Rush flags are clear to enable. Do not retire the legacy driver-join path or announce invite-code onboarding for rideshare until [§26](#26-new-defects) Y1–Y3 are closed.**

---

## 0. Executive summary

**The good news is bigger than you probably think.** RoamFleet was not built as a rideshare app that you now have to bend. It was built as a *fleet operations and settlement platform* that happens to have been shipped with rideshare hard-wired as the only enabled vertical. The multi-vertical scaffolding is already in the repo and already works:

- `packages/business-config/src/businessTypes.ts` already defines `delivery` as a first-class business type, with a `SIDEBAR_VISIBILITY` matrix that already knows which pages a delivery operator should and shouldn't see.
- `apps/fleet/src/utils/vocabulary.ts` already carries a complete `delivery` vocabulary — Trip→Delivery, Fare→Delivery Fee, Rider→Customer.
- `public.organizations` already carries `product_line`, `business_type` (including `'delivery'`), and `enabled_modules jsonb`.
- `supabase/functions/_fleet-server/enterprise_modules.ts` already implements a 40-key module catalog with per-org override resolution (`resolveEffectiveModules`).
- `apps/fleet/src/types/data.ts:11` already declares `serviceCategory?: 'ride' | 'courier'` on `Trip`.

**The bad news is that one line of code turns all of it off.** In [`BusinessConfigContext.tsx:33-38`](apps/fleet/src/components/auth/BusinessConfigContext.tsx#L33), on the Fleet product line the business type is force-set to `'rideshare'` before preferences, metadata, or local storage are even consulted. Everything downstream — vocabulary, sidebar, dashboards — is therefore permanently in rideshare mode for every customer on `roamfleet.co`.

**The real work is not the UI. It is four structural gaps**, in descending order of how much they will hurt:

1. **`business_type` is a scalar.** `organizations.business_type TEXT CHECK (...)` can hold `'rideshare'` *or* `'delivery'`, never both. Your third customer shape — the one doing rides *and* deliveries — is not expressible in the data model at all. This is the single decision that shapes everything else.
2. **Rush has no concept of a courier belonging to anyone.** `delivery.courier_profiles` is keyed on `user_id` and has no org column, no fleet column, no `mode` field. `delivery.orders.courier_id` is a bare `uuid` with no foreign key. Rideshare solved this in `public.driver_profiles` (`mode ∈ {fleet, independent}`, `fleet_id → organizations(id)`). Rush never got that migration. **Today there is no way for a fleet owner to own a courier.**
3. **Per-customer entitlement does not exist on the Fleet line.** `GET /platform-feature-flags` ([`index.tsx:716`](supabase/functions/_fleet-server/index.tsx#L716)) is unauthenticated and resolves modules *per product line only* — it never reads `organizations.enabled_modules`. And it fails open on both sides. You cannot sell Rush as a paid add-on to individual fleet customers on the current flag path.
4. **There is no bridge from a Rush order to the fleet books.** Fleet revenue arrives exclusively through CSV import batches (`fleet.import_batches` → `fleet.trips`). Rush is first-party data sitting in the same database — it should arrive live, not as a spreadsheet — but nothing connects `delivery.orders` to `fleet.trips`.

**Recommended architecture, in one line:** *One portal, multiple service lines, module-gated per org, with a single canonical revenue-event spine.* Extend `apps/fleet`. Do **not** fork a third app.

**Severity counts:** 3 Critical · 9 High · 11 Medium · 6 Enhancement.

**Effort:** roughly 6 phases. Phases 0–2 are the load-bearing ones and are mostly backend + migration work. Phase 4 (UI) looks like the big one and is actually the cheapest, because the vocabulary and sidebar matrices already exist.

---

## 1. What RoamFleet.co actually is today

### 1.1 Identity and deployment

`roamfleet.co` is `apps/fleet`, a Vite/React SPA. It is one of **two** front-ends built from the same shell concept and served by the same edge backend:

| Domain | App | Files | `VITE_PRODUCT_LINE` |
|---|---|---|---|
| `roamfleet.co` | `apps/fleet` | 1,081 | `fleet` (default) |
| `roamenterprise.co` | `apps/enterprise` | 196 | `enterprise` |

Both talk to `supabase/functions/_fleet-server` and both send `X-Roam-Product-Line` on every request ([`packages/api-client/src/productLine.ts:40-47`](packages/api-client/src/productLine.ts#L40)). `apps/fleet` additionally hosts the Dominion product-admin portal at `/admin` ([`App.tsx:604`](apps/fleet/src/App.tsx#L604)).

**Note this precedent carefully.** Enterprise was added by *forking a second app*. That fork now carries its own shell, its own auth wiring, and its own navigation, and it re-implements surfaces that `apps/fleet` already had. §4.1 explains why Rush must not repeat it.

### 1.2 What the product actually does

RoamFleet is a **fleet operations and weekly-settlement platform**. Its spine:

```
organization
  └─ drivers ──── assigned ────> vehicles
        │                          │
        │                          ├─ maintenance logs, equipment, check-ins, odometer
        │                          ├─ fuel entries, fuel cards, consumption reconciliation
        │                          └─ toll tags, toll ledger, plaza rate drift
        │
        └─ trips (imported) ──> earnings policy ──> weekly driver settlement
                                       │
                                       └──> Business Finance (P&L, expense hub, bank recon)
```

Verified surface inventory, from [`App.tsx`](apps/fleet/src/App.tsx) and [`AppSidebar.tsx`](apps/fleet/src/components/layout/AppSidebar.tsx):

| Domain | Pages | Backing tables |
|---|---|---|
| Dashboard | `dashboard` | aggregate |
| Imports | `imports` (batches, delete center, re-import, quarantine) | `fleet.import_batches`, `fleet.import_insights` |
| Driver Ops | `drivers`, `driver-analytics`, `earnings-policy` | `fleet.drivers`, `fleet.driver_metrics`, `fleet.earnings_policies` |
| Vehicle Ops | `vehicles`, `vehicle-analytics`, `maintenance-hub`, `fleet` | `fleet.vehicles`, `fleet.maintenance_logs`, `fleet.equipment`, `fleet.checkins` |
| Trips | `trips` | `fleet.trips` |
| Fuel Desk | 6 pages (analytics, review queue, reconciliation, cards, logs, config) | `fleet.fuel_entries`, `fleet.fuel_cards`, `fleet.stations`, `fleet.fuel_disputes` |
| Toll Desk | 6 pages (logs, reconciliation, tag inventory, low balance, rate drift, analytics) | `fleet.toll_ledger`, `fleet.toll_tags`, `fleet.toll_plazas` |
| Business Finance | `business-finance`, `expense-hub`, `fleet-financials`, `driver-settlements`, `indrive-wallet`, `transaction-list` | `fleet.transactions`, `fleet.expense_journal`, `fleet.fixed_expenses`, `fleet.payment_ledger_lines`, `fleet.bank_statements` |
| System | `user-management`, `settings`, `reports` | `fleet.preferences`, `fleet.organization_settings` |

That is roughly **35 distinct pages**. Every single one is service-line-agnostic in principle — a courier on a motorbike burns fuel, crosses tolls, needs maintenance, and gets settled weekly in exactly the same shape a rideshare driver does.

### 1.3 Tenancy model

- `public.organizations` — `id uuid`, `owner_id → auth.users`, `name`, `product_line CHECK IN ('fleet','enterprise')`, `business_type CHECK IN ('rideshare','delivery','taxi','trucking','shipping','other')` (later widened for `warehouse`), `status`, `subscription_tier`, `enabled_modules jsonb`.
- Every `fleet.*` table carries **`organization_id text`** — not a UUID, not a foreign key ([`20260811200000_fleet_schema_foundation.sql`](supabase/migrations/20260811200000_fleet_schema_foundation.sql)). Isolation is enforced in the edge layer behind feature flags (`strict_org_filter`, `product_line_filter`), not by database constraints. See [`docs/fleet-data-isolation-rollout.md`](docs/fleet-data-isolation-rollout.md).
- Workforce identity lives in **`public.driver_profiles`**: `user_id`, `mode CHECK IN ('fleet','independent')`, `fleet_id UUID REFERENCES organizations(id)`, `fleet_joined_at`, `fleet_role`. This is the join between a human's Roam Driver login and the fleet that employs them.
- `fleet.drivers.id` is `text` and, for Roam-native drivers, holds the **auth user id** — confirmed by `.eq("user_id", driverId)` against `driver_profiles` at [`index.tsx:12119`](supabase/functions/_fleet-server/index.tsx#L12119).

### 1.4 Revenue ingestion

`fleet.trips` is the canonical revenue event. Its shape ([`apps/fleet/src/types/data.ts:3-48`](apps/fleet/src/types/data.ts#L3)):

```ts
platform: 'Uber' | 'Lyft' | 'Bolt' | 'InDrive' | 'Roam' | 'GoRide' | 'Private' | 'Cash' | 'Other';
serviceCategory?: 'ride' | 'courier';   // already there — InDrive Courier
batchId?: string;                       // every trip belongs to an import batch
```

Trips arrive by CSV upload into `fleet.import_batches`. Everything downstream — settlement, toll matching, fuel reconciliation, expense allocation, the whole Business Finance stack — reads `fleet.trips`. **This table is the spine. Any second service line has to land on it or fork seven money engines.**

### 1.5 Entitlement today

Client: `FeatureFlagProvider` fetches `/platform-feature-flags` and knows exactly seven modules — `fuelManagement`, `tollManagement`, `driverPortal`, `fleetEquipment`, `claimableLoss`, `performanceAnalytics`, `businessFinance` ([`FeatureFlagContext.tsx:6-23`](apps/fleet/src/components/auth/FeatureFlagContext.tsx#L6)).

Server: the route is **unauthenticated**, resolves platform settings for the product line, and merges six defaults ([`index.tsx:716-735`](supabase/functions/_fleet-server/index.tsx#L716)). It never reads `organizations.enabled_modules`.

Meanwhile `enterprise_modules.ts` has the mature version — 40+ keys, legacy aliasing, `resolveEffectiveModules(productLine, orgOverrides)` where explicit `false` at either level wins, and `allModulesOff()` for fail-closed. **The good implementation exists and the Fleet line doesn't use it.**

---

## 2. What Roam Rush actually is today

### 2.1 The family

| Surface | App | Files | Role |
|---|---|---|---|
| `roamrush.app` | `apps/dash-customer` | 163 | Customer ordering |
| `partner.roamrush.app` | `apps/dash-merchant` | 207 | Merchant/restaurant |
| `courier.roamrush.app` | `apps/dash-courier` | 175 | Courier |
| Roam Command | `apps/rush-command` | 277 | Merchant multi-store ops |
| Dominion `/admin` | `packages/dash-admin` | — | Platform ops (couriers, orders, finance, markets, pricing) |

Backend: `supabase/functions/delivery` (~45 modules), `supabase/functions/payments`, `supabase/functions/matching` (`dispatch/`, `supply/`, `policy/`).

### 2.2 The courier data model — and the hole in it

```sql
delivery.courier_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name, phone, email,
  status CHECK IN ('pending','active','suspended','deactivated'),
  onboarding_complete, vehicle_type,
  background_check_status, documents_verified_at, approved_at, approved_by,
  rating, total_deliveries, acceptance_rate_pct, completion_rate_pct,
  suspended_*, deactivated_*
);
delivery.courier_documents  (user_id → courier_profiles)
delivery.courier_vehicles   (user_id → courier_profiles)
delivery.courier_availability (driver_id, is_online, current_lat/lng, active_order_id)
delivery.courier_cash_balances (courier_id, balance_jmd, pause_threshold_jmd DEFAULT 10000, is_paused)
payments.courier_payouts (courier_id, ...)
delivery.orders (..., courier_id uuid, delivery_fee, platform_fee, tip, tax, total, ...)
```

**Grep result: zero occurrences of `fleet_id`, `organization_id`, or `org_id` in any courier or delivery migration.** A courier is a lone individual contracting directly with the platform. There is no employer, no roster, no company. `delivery.orders.courier_id` is not even a foreign key.

The only "courier company" concept anywhere in the repo lives in the **freight/enterprise** world (`warehouse_courier_marketplace`, `warehouseCourierAccess.ts`) — a completely different business relationship, not reusable here.

### 2.3 Rush economics

Money splits on capture: platform fee, merchant cut, courier earning, GCT — via `computeDashCaptureSplit` and `_shared/dashPricing.ts`. Per [RUSH_MARKETPLACE_PRICING_MIGRATION.md](RUSH_MARKETPLACE_PRICING_MIGRATION.md), this engine was migrated and verified, with the merchant cut *computed* rather than taken as a residual, and any new fee having to be threaded through four places.

COD is handled by `delivery/courierCashLedger.ts`: cash collected raises `courier_cash_balances.balance_jmd`; crossing `pause_threshold_jmd` (default J$10,000) auto-pauses the courier from receiving offers.

**There is no fleet-owner party anywhere in this model, and §5.4 argues hard that you should not add one to the platform split.**

### 2.4 Prerequisite: a known Critical in Rush

[ROAMRUSH_SYSTEM_AUDIT.md §B1](ROAMRUSH_SYSTEM_AUDIT.md) documents that `POST /payments/wipay/complete` marks an order paid on a client-supplied `status` string with no server-side verification against WiPay. Today that is a consumer-fraud bug.

**The moment a fleet owner's weekly settlement is computed from Rush order revenue, it becomes a B2B accounting-integrity bug** — a fleet owner would be paid, and would pay their courier, out of revenue that was never collected. Fix before Phase 3. This is not scope creep; it is a hard dependency.

---

## 3. Gap analysis

Severity: **C**ritical / **H**igh / **M**edium / **E**nhancement.

### Identity & tenancy

| # | Sev | Finding | Evidence |
|---|---|---|---|
| G1 | **C** | **`business_type` is a scalar.** No fleet owner can be recorded as doing both rideshare and delivery. The "both" customer is unrepresentable. | `organizations.business_type TEXT CHECK (...)` |
| G2 | **C** | **No courier↔fleet relationship exists.** `courier_profiles` has no org/fleet column and no `mode`. Rideshare's equivalent (`driver_profiles.fleet_id`) was never mirrored to Rush. | [`20260620120000_courier_profiles.sql`](supabase/migrations/20260620120000_courier_profiles.sql) |
| G3 | **H** | **Business type is hard-pinned to `rideshare`** on the Fleet product line, short-circuiting prefs, metadata, and localStorage. | [`BusinessConfigContext.tsx:33-38`](apps/fleet/src/components/auth/BusinessConfigContext.tsx#L33) |
| G4 | **H** | **Setting `businessType: 'delivery'` can lock a fleet owner out.** `inferClientProductLine` returns `'enterprise'` for any business type other than `rideshare` when `user_metadata.productLine` is absent, and `WrongProductLineGate` then bounces the user off `roamfleet.co`. Accounts with explicit `productLine` are safe; older or partially-provisioned ones are not. | [`App.tsx:75-79`](apps/fleet/src/App.tsx#L75), [`App.tsx:369-376`](apps/fleet/src/App.tsx#L369) |
| G5 | **M** | Roster identity is service-shaped, not person-shaped. A human who drives *and* couriers would land as one `fleet.drivers` row and one `courier_profiles` row with no link — double-counting fuel, tolls, and settlement. | `fleet.drivers` has no `user_id` column; linkage is by convention only |
| G6 | **M** | `fleet.*` tenancy is `organization_id text` with no FK and edge-layer-only filtering, while `delivery.*` is UUID + RLS. Any bridge crosses an impedance mismatch. | `fleet_schema_foundation.sql` vs `delivery_schema.sql` |

### Entitlement & access

| # | Sev | Finding | Evidence |
|---|---|---|---|
| G7 | **C** | **No per-org module entitlement on the Fleet line.** `/platform-feature-flags` is unauthenticated and product-line-wide; `organizations.enabled_modules` is never consulted. Rush cannot be sold or scoped per customer. | [`index.tsx:716-735`](supabase/functions/_fleet-server/index.tsx#L716) |
| G8 | **H** | **Flags fail open on both sides.** Client defaults to `ALL_ENABLED` and its `catch` keeps everything on; the server `catch` returns all-true. For a free feature that is fine. For a paid add-on it is revenue leakage — and if Rush ever ships unfinished, it leaks unfinished UI to every customer. | [`FeatureFlagContext.tsx:16-23, 51-57`](apps/fleet/src/components/auth/FeatureFlagContext.tsx#L16) |
| G9 | **H** | **No courier-facing roles exist in the Fleet RBAC.** `Role` has `fleet_owner/manager/accountant/viewer` and `driver`. There is no `courier`, and no permission keys for courier or delivery pages. | [`apps/fleet/src/utils/permissions.ts`](apps/fleet/src/utils/permissions.ts) |
| G10 | **M** | **The permission catalog is duplicated and has already drifted.** `packages/auth-client/src/permissions.ts` carries product-admin roles (`courier_admin`, `courier_ops`, `dash_admin`…) that `apps/fleet/src/utils/permissions.ts` does not. Adding Rush permissions to one copy will silently not apply to the other. | both files, same header comment |

### Data & money

| # | Sev | Finding | Evidence |
|---|---|---|---|
| G11 | **H** | **No Rush→Fleet revenue bridge.** All fleet revenue arrives via CSV `import_batches`. Rush lives in the same Postgres and should stream, but nothing connects the two. | `fleet.trips.batch_id`, `ImportsPage.tsx` |
| G12 | **H** | **`fleet.trips` has no Rush platform value.** `platform` union covers Uber/Lyft/Bolt/InDrive/Roam/GoRide/Private/Cash/Other. `serviceCategory: 'courier'` exists but was built for *InDrive Courier CSV*, not for first-party Rush orders. | [`types/data.ts:5-11`](apps/fleet/src/types/data.ts#L5) |
| G13 | **H** | **The batch model assumes uploads.** Delete-preview, re-import, quarantine, and batch-scoped reconciliation all key on `batch_id`. Live-streamed deliveries have no batch and will break these tools unless given synthetic ones. | `GET /batches/:id/delete-preview`, `TripReImportFlow.tsx` |
| G14 | **H** | **Settlement is single-line.** `EarningsPolicy` (tiers/quotas/personal allowance) and the weekly driver settlement assume one revenue stream. A person doing both lines needs **one** combined weekly statement, not two. | [`types/earningsPolicy.ts`](apps/fleet/src/types/earningsPolicy.ts), `packages/finance-core/driverPeriodSettlement.ts` |
| G15 | **M** | **COD cash has two owners and no bridge.** `courier_cash_balances` is a courier↔platform liability; fleet has its own cash-in-hand model (`tripPhysicalCash.ts`, `payoutCashC1.ts`). A courier holding J$9k of Roam's cash is also the fleet owner's exposure, but the fleet owner can't see it. | `courierCashLedger.ts` vs `packages/finance-core` |
| G16 | **M** | **Cost allocation is single-line.** One motorbike used for rides on weekdays and deliveries on weekends has no way to split fuel, toll, depreciation, or maintenance across lines. | `fleet.fuel_entries`, `fleet.expense_journal` — no service-line dimension |
| G17 | **M** | Per [docs/FINANCIAL_INTEGRITY_AUDIT.md](docs/FINANCIAL_INTEGRITY_AUDIT.md), there are already **7 money engines with 4 different week rules and no shared accounting layer.** Rush adds an 8th unless it is deliberately routed onto the existing spine. | that audit |

### UI & platform

| # | Sev | Finding | Evidence |
|---|---|---|---|
| G18 | **M** | **No router.** Navigation is a `currentPage` string plus a 665-line `App.tsx` conditional chain with legacy-redirect `useEffect`s. Adding ~10 Rush pages makes this materially worse, and there are no deep links to hand to a fleet owner ("open this delivery"). | [`App.tsx`](apps/fleet/src/App.tsx) |
| G19 | **M** | **Sidebar visibility matrix is stale for delivery.** `SIDEBAR_VISIBILITY` excludes `delivery` from `toll-management`, `earnings-policy`, `tier-config`, and `performance` — defensible for a third-party courier import, wrong for Rush couriers who cross tolls and need earnings tiers. | [`businessTypes.ts:118-215`](packages/business-config/src/businessTypes.ts#L118) |
| G20 | **E** | Vocabulary is a flat `Record<BusinessType, …>`, so a "both" customer cannot get mixed labels. Needs per-scope resolution. | [`utils/vocabulary.ts`](apps/fleet/src/utils/vocabulary.ts) |
| G21 | **M** | **Fleet owners cannot approve couriers.** Courier compliance (background check, documents) is a platform/Dominion function in `packages/dash-admin/pages/couriers`. There is no delegated-approval model, so a fleet owner will hit a wall onboarding their own staff. | `courier_profiles.approved_by`, dash-admin courier pages |
| G22 | **E** | Dispatch is entirely platform-owned (`matching/dispatch/candidatePool.ts`). Fleet owners get no supply visibility and no explanation for why a courier isn't receiving offers. | `matching/` |
| G23 | **H** | **Signup collects a name and nothing else.** No vertical selection, no company details, no service-line choice. `provisionFleetOwner` is called with `{ name, alsoDrive: true }`. | [`FleetOwnerSignupComplete.tsx:33-37`](apps/fleet/src/components/auth/signup/FleetOwnerSignupComplete.tsx#L33) |

---

## 4. Recommended architecture

### 4.1 The decision: extend `apps/fleet`. Do not fork.

Three options were considered.

| Option | Verdict |
|---|---|
| **A. Fork a third app** (`apps/rush-fleet` on e.g. `rushfleet.co`) | **Reject.** This is what happened with Enterprise, and Enterprise is 196 files that re-solve the shell, auth, nav, and parts of finance. Fleet's value — fuel, toll, maintenance, expense hub, settlement — is service-line agnostic; forking means maintaining it twice and guarantees the two copies drift, exactly as `permissions.ts` already has (G10). It also makes the "both" customer log into two portals to run one business. |
| **B. Ship Rush as an "enterprise" business type** and push those customers to `roamenterprise.co` | **Reject.** Enterprise is freight-forwarding/warehouse-shaped. A Rush courier fleet is operationally identical to a rideshare fleet — same vehicles, same fuel, same tolls, same weekly settlement. Wrong product, wrong pricing, wrong nav. |
| **C. One portal, multiple service lines, module-gated per org** | **Adopt.** |

### 4.2 The three axes — currently two, conflated

Today the code has two dimensions and treats them as one thing:

- `productLine ∈ {fleet, enterprise}` — deployment/domain/branding
- `businessType ∈ {rideshare, delivery, taxi, …}` — labels + sidebar, but pinned to `rideshare`

Make it **three explicit axes**:

| Axis | Cardinality | Means | Where it lives |
|---|---|---|---|
| **Product line** | one | Which portal/domain/brand | `organizations.product_line`, `VITE_PRODUCT_LINE` |
| **Service lines** | **many** | What the customer actually operates | **new** `organizations.service_lines text[]` |
| **Modules** | many | What features they are entitled to | `organizations.enabled_modules` (already exists) |

`service_lines` is the one that unlocks everything. Proposed initial values: `'rideshare'`, `'rush_delivery'`. Keep `business_type` populated as the *primary* line for backward compatibility; derive it, never read it as the source of truth once `service_lines` exists.

```
service_lines = {rideshare}                   → today's app, byte-for-byte
service_lines = {rush_delivery}               → courier-only portal
service_lines = {rideshare, rush_delivery}    → unified portal + scope switcher
```

### 4.3 The revenue spine: one table, typed extensions

**Rush deliveries must land in `fleet.trips`.** This is the most consequential technical recommendation in this document, so here is the reasoning explicitly:

Every fleet money surface reads `fleet.trips` — weekly settlement, toll crossing matching, fuel consumption reconciliation, expense allocation, Business Finance P&L, driver period snapshots. Creating a parallel `fleet.deliveries` table would require forking all of them. Per [docs/FINANCIAL_INTEGRITY_AUDIT.md](docs/FINANCIAL_INTEGRITY_AUDIT.md) you already have seven money engines and four week rules with no shared accounting layer; an eighth parallel revenue table is how that becomes unrecoverable.

The mapping:

| `fleet.trips` column | Rush source |
|---|---|
| `platform` | `'Roam Rush'` (new union member) |
| `serviceCategory` | `'courier'` (already exists) |
| `date` | `orders.delivered_at::date` |
| `driver_id` | `orders.courier_id` (auth user id — same convention as Roam-native drivers) |
| `vehicle_id` | resolved from the fleet's courier→vehicle assignment |
| `amount` | courier gross earning for the order |
| `status` | mapped from `orders.status` |
| `payment_method` | `'Cash'` for COD, `'Card'` otherwise |
| `batch_id` | **synthetic** — one live-sync batch per org per week per platform (see G13) |
| `payload_json` | full delivery detail |

Plus a new queryable side table for the fields that must be filtered and joined rather than buried in JSON:

```
fleet.delivery_details (
  trip_id, order_id, order_number, merchant_id, merchant_name,
  delivery_fee, tip, cod_collected, platform_due, merchant_due,
  stack_group_id, drop_sequence, distance_km, accepted_at, picked_up_at, delivered_at
)
```

**Direction of truth is one-way.** Rush stays the system of record for orders, dispatch, and platform payouts. Fleet holds a *projection* and never writes back. This keeps release cadences independent and keeps the verified Rush pricing engine untouched.

### 4.4 Bridge mechanism

An **event-driven projection**, not a nightly batch:

1. Order reaches a terminal state (`delivered` / `cancelled` with courier compensation).
2. A trigger or edge hook enqueues a projection event.
3. The projector resolves `courier_id → courier_profiles.fleet_id`. **If null, do nothing** — an independent courier generates no fleet row, which is exactly right.
4. Upsert into `fleet.trips` + `fleet.delivery_details`, keyed idempotently on `order_id` (reuse `packages/finance-core/importIdempotency.ts`).
5. Attach to the current week's synthetic batch, creating it if absent.

Plus a **reconciliation job** (mirror the existing `finance-recon` function) that daily compares delivered order count and courier gross per fleet against the projection and alerts on drift. Do not ship the bridge without this — a silently lossy projection means silently wrong settlements.

---

## 5. Detailed design

### 5.1 Data model changes

**A. Organizations — express multiple lines**
```sql
ALTER TABLE public.organizations
  ADD COLUMN service_lines text[] NOT NULL DEFAULT ARRAY['rideshare'];
-- backfill from business_type; keep business_type as the derived primary line
```

**B. Couriers — mirror `driver_profiles` exactly**
```sql
ALTER TABLE delivery.courier_profiles
  ADD COLUMN mode text NOT NULL DEFAULT 'independent'
      CHECK (mode IN ('fleet','independent')),
  ADD COLUMN fleet_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN fleet_joined_at timestamptz,
  ADD COLUMN fleet_role text CHECK (fleet_role IN ('courier','lead_courier','trainer'));
```
Deliberately identical in shape to `driver_profiles` so the existing attach/detach logic at [`index.tsx:12107-12170`](supabase/functions/_fleet-server/index.tsx#L12107) can be generalised rather than duplicated.

**C. Orders — denormalise the fleet at assignment time**
```sql
ALTER TABLE delivery.orders ADD COLUMN courier_fleet_id uuid;
```
Stamped when the courier accepts. This is deliberate denormalisation: if a courier leaves a fleet on Tuesday, Monday's deliveries must still settle to the fleet that owned them. Historical attribution must not follow the current membership.

**D. Roster — person-centric, not service-centric (G5)**
```sql
ALTER TABLE fleet.drivers
  ADD COLUMN service_lines text[] NOT NULL DEFAULT ARRAY['rideshare'],
  ADD COLUMN user_id text;   -- explicit auth link; today it is convention only
```
**One human = one `fleet.drivers` row.** Someone who drives rides and runs deliveries has `service_lines = {rideshare, rush_delivery}` — one roster entry, one vehicle assignment, one fuel ledger, one toll exposure, one weekly settlement. Two rows would double-count everything, and there is no downstream engine that would catch it.

**E. Cost allocation dimension (G16)**
```sql
ALTER TABLE fleet.trips           ADD COLUMN service_line text;
ALTER TABLE fleet.fuel_entries    ADD COLUMN service_line text;   -- nullable = shared, allocate pro-rata
ALTER TABLE fleet.expense_journal ADD COLUMN service_line text;
ALTER TABLE fleet.toll_ledger     ADD COLUMN service_line text;
```
Nullable is meaningful: `null` = shared cost, allocated pro-rata by revenue or distance. That default keeps every existing row valid and every existing report correct.

**F. Invites**
```sql
CREATE TABLE fleet.workforce_invites (
  id, organization_id, service_line, invite_code, invited_email, invited_phone,
  status, created_by, created_at, expires_at, accepted_by, accepted_at
);
```
One invite mechanism for both drivers and couriers — do not build a second one.

### 5.2 Entitlement (fixes G7, G8)

1. **Add Rush module keys** to the shared catalog: `rush_couriers`, `rush_deliveries`, `rush_courier_settlements`, `rush_supply_health`, `rush_merchant_link`.
2. **Unify the catalog.** `enterprise_modules.ts` is misnamed and misplaced — it is the *platform* module catalog. Rename to `platform_modules.ts` and have both product lines resolve through `resolveEffectiveModules(productLine, orgOverrides)`.
3. **Add an authenticated per-org endpoint**, `GET /org-feature-flags`, returning `resolveEffectiveModules(platformSettings, org.enabled_modules)`. Keep the unauthenticated `/platform-feature-flags` for the pre-login shell only.
4. **Fail closed for `rush_*`.** Existing modules keep failing open (that behaviour is load-bearing for current customers and changing it is a separate risk). New paid modules must default `false` in both the client default map and the server `catch`.
5. **Entitlement ≠ configuration.** `service_lines` says what the customer *does*; `enabled_modules` says what they have *bought*. Rush nav requires both. Keeping them separate is what lets you run a trial, a downgrade, or a grace period without mutating the customer's operational profile.

### 5.3 RBAC (fixes G9, G10)

- **Delete the duplicate.** Make `apps/fleet/src/utils/permissions.ts` a thin re-export of `@roam/auth-client`. This is prerequisite work — do it before adding Rush permissions, not after, or you will add them twice and they will drift a third time.
- **New permission keys:** `nav.couriers`, `nav.courier_analytics`, `nav.deliveries`, `nav.delivery_analytics`, `nav.courier_settlements`, `nav.supply_health`, `courier.invite`, `courier.assign_vehicle`, `courier.view_cash_balance`.
- **Roles:** no new customer role tier is needed. Map the new keys onto the existing ladder (`fleet_owner` full, `fleet_manager` operational, `fleet_accountant` read-only financial, `fleet_viewer` dashboard). Fleet-owner permissions must **not** include courier *approval* — see §5.6.

### 5.4 The money model — the rule that matters most

**Do not add a fleet-owner party to the Rush platform split.**

Per [RUSH_MARKETPLACE_PRICING_MIGRATION.md](RUSH_MARKETPLACE_PRICING_MIGRATION.md), the marketplace split is complete and verified, the merchant cut is *computed* rather than residual, and adding a new fee requires touching four places. Injecting a fifth party reopens a settled, verified engine and puts merchant and courier payouts at risk for a change that has nothing to do with the marketplace.

Instead — **two tiers**:

```
TIER 1 (unchanged, Rush owns it)
  customer payment → platform fee + merchant cut + courier gross earning + GCT

TIER 2 (new, Fleet owns it)
  courier gross earning → fleet owner cut + courier net
       computed by the existing earnings-policy engine
       on fleet.trips rows, in the weekly settlement
```

This is *exactly* how rideshare already works: Uber pays the driver, and the fleet's tier policy then splits that between fleet and driver. Rush becomes another platform paying a gross number that the same engine splits. **Zero changes to `computeDashCaptureSplit`. Zero changes to merchant payouts.** That property is what makes this design safe to ship.

Consequences to handle:
- **Payout routing.** Today Rush pays the courier directly. If the fleet owner takes a cut, either (a) Rush keeps paying the courier and the fleet invoices/collects — same as an Uber fleet today, lowest risk, **recommended for v1**; or (b) Rush pays the fleet and the fleet pays the courier — cleaner for the owner, but this makes Roam a money transmitter for B2B payroll and per [docs/dash-launch-compliance-checklist.md](docs/dash-launch-compliance-checklist.md) the Jamaica money-transmission question is still open. **Do not choose (b) without legal sign-off.**
- **COD (G15).** Project `courier_cash_balances` into fleet as **read-only** with a clear "owed to Roam, not to you" label. The fleet owner must see the exposure and the pause risk. They must never be able to clear it — that balance is Roam's receivable.
- **One statement (G14).** A person on both lines gets a single weekly settlement listing both revenue streams and one net. Two statements would be operationally wrong and would double-apply the personal allowance and quota logic.

### 5.5 Navigation & IA

**Rule: a rideshare-only customer's portal must not change by a single pixel.** That is the acceptance criterion for the whole UI phase.

| Customer | Nav |
|---|---|
| **Rideshare only** | Exactly today. `service_lines = {rideshare}` → current behaviour. |
| **Delivery only** | Dashboard, **Couriers**, Vehicles, **Deliveries**, Fuel Desk, Toll Desk, Business Finance, Reports, Settings. Rideshare-only surfaces (Imports, inDrive Wallet) hidden. |
| **Both** | Full nav plus a **service-line scope switcher** in the header. |

**The scope switcher** — `[ All Operations ▾ | Rideshare | Rush Delivery ]` — is the key UX decision. It behaves like a global date range: persisted per user, applied as a filter parameter to every query, reflected in every export.

Rejected alternative: separate sidebar sections per line. It duplicates ~20 near-identical pages and makes "how did my business do this week" unanswerable — which is the fleet owner's actual primary question.

**Prerequisite (G18):** introduce real routing, or at minimum extract a page registry from the `App.tsx` conditional chain, *before* adding ten pages to it. Deep links (`/deliveries/:id`) are also a hard requirement for support workflows and push notifications.

**Also update `SIDEBAR_VISIBILITY` (G19):** `delivery` must be added to `toll-management`, `earnings-policy`, and `performance`. The current exclusions were written for third-party courier CSV imports, not for a first-party courier workforce that crosses tolls and needs earnings tiers.

### 5.6 Compliance & approval boundary (G21)

**Roam approves couriers. Fleet owners nominate them.** Background checks and document verification are a platform liability and must stay with Dominion (`courier_profiles.approved_by`, the dash-admin courier compliance queue).

Give the fleet owner a **sponsored onboarding** flow:
1. Owner invites → `fleet.workforce_invites` row, code issued.
2. Courier signs up in Roam Rush Courier and enters the code (or follows a deep link).
3. `courier_profiles.fleet_id` set, `mode = 'fleet'`, status stays `pending`.
4. Owner uploads/collects documents on the courier's behalf.
5. **Roam** reviews and approves.
6. Courier goes active; appears on the fleet roster as available for vehicle assignment.

The fleet owner sees live compliance status and blockers (`CourierComplianceBlocker` already exists in `packages/types/src/courier.ts` — reuse it verbatim) so "why can't my courier work?" is self-service. They never see the approve button.

### 5.7 Dispatch & supply (G22)

**Fleet owners do not dispatch. Roam does.** Do not build fleet-controlled dispatch in v1 — it would fork `matching/dispatch/candidatePool.ts` and put marketplace integrity at risk.

Ship a read-only **Supply Health** panel instead: who is online now (`courier_availability`), acceptance and completion rates, active compliance blockers, cash-pause status, offers received vs accepted this week.

**Explicitly out of scope for v1: fleet-preference dispatch** ("offer to my couriers first"). It is a marketplace-fairness and antitrust-shaped decision, not an engineering one. Park it as a commercial question, and if it is ever built, build it as an auditable, disclosed dispatch policy — not a quiet weighting.

---

## 6. End-to-end flows

### 6.1 Signup (fixes G23)

Current: auth → name → `provisionFleetOwner({ name, alsoDrive: true })`. That is the entire flow.

Proposed, as a wizard on `/signup`:

```
STEP 1  Authenticate                 Google · Email · Phone            [exists]
STEP 2  Company                      Legal name, trading name, parish,
                                     contact, TRN/GCT registration      [new]
STEP 3  What do you operate?         ☑ Rideshare  ☑ Deliveries          [new — multi-select]
STEP 4  Per-line detail
          Rideshare → which platforms (Roam / Uber / inDrive / other),
                      fleet size, vehicle count
          Delivery  → parishes served, courier count, vehicle types
                      (car / bike / bicycle / foot)                     [new]
STEP 5  Plan                         Modules derived from Step 3;
                                     paid add-ons shown explicitly      [new]
STEP 6  Provision                    org created with product_line='fleet',
                                     service_lines=[…], enabled_modules=…
STEP 7  Guided setup checklist       vertical-aware — see below
```

**Step 3 is the whole point of this document.** It must be multi-select, it must be changeable later from Settings without re-signup, and adding a line must be additive-only — removing a line hides navigation and **never** deletes data.

Guarantee for existing customers: any org without `service_lines` is treated as `['rideshare']`. Their signup, login, nav, and reports are unchanged.

### 6.2 Day one — three customers

**Customer A — rideshare only (existing behaviour, unchanged)**
Signup → Step 3 = Rideshare → Add vehicles → Add/invite drivers → Assign vehicles → Import first Uber/inDrive CSV → Configure earnings policy → Issue toll tags, set up fuel cards → First weekly settlement → Business Finance P&L.

**Customer B — delivery only (new)**
Signup → Step 3 = Deliveries → Add vehicles (bikes/cars) → **Invite couriers** (code or deep link) → Courier signs up in Roam Rush Courier, enters code → Fleet uploads courier documents → **Roam approves** → Assign vehicle to courier → Courier goes online, receives offers from Roam dispatch → Deliveries complete and **stream live into the fleet books** — no CSV, ever → Fuel and toll tracked identically to rideshare → Configure earnings policy (delivery tiers) → **Weekly courier settlement** → COD cash exposure visible, read-only → Business Finance P&L.

**Customer C — both (the reason for the architecture)**
Signup → Step 3 = both → Vehicles added once, tagged by primary line or shared → Roster in one place with a service-line column → **A person on both lines is one roster entry** → Revenue arrives by two paths (CSV for rideshare, live stream for Rush) into one `fleet.trips` table → Fuel and toll are per-vehicle and split across lines pro-rata → **One earnings policy** with per-line tiers → **One weekly settlement per person**, both streams, one net → **Scope switcher** answers "how is Rush doing vs rideshare" → Business Finance P&L segmented by service line with shared costs allocated.

### 6.3 Weekly operating rhythm (both lines)

| Day | Rideshare | Rush |
|---|---|---|
| Mon | Import last week's CSVs | *(nothing — already streamed)* |
| Mon | Reconcile fuel consumption | same |
| Tue | Toll reconciliation, low-balance queue | same |
| Tue | — | Review COD cash exposure, unpause requests |
| Wed | Review driver settlements | same, one combined statement |
| Wed | Expense hub — recurring, vehicle costs | same, with service-line allocation |
| Thu | Approve payouts | same |
| Fri | Business Finance P&L review | same, segmented by line |
| Ongoing | Maintenance schedule, check-ins, claims | same |
| Ongoing | — | Supply health: online couriers, compliance blockers |

The point of the table: **the operating rhythm is almost identical.** That is the strongest evidence that this belongs in one portal.

---

## 7. Phased delivery plan

Each phase is independently shippable and independently reversible.

### Phase 0 — Foundations (no user-visible change)
1. Add `organizations.service_lines text[]`; backfill from `business_type`.
2. Unpin `BusinessConfigContext` (G3); resolve from `service_lines`, defaulting to `['rideshare']`.
3. Fix `inferClientProductLine` so a non-rideshare business type on a fleet org can never route to Enterprise (G4).
4. Collapse the duplicate permission catalog into `@roam/auth-client` (G10).
5. Rename `enterprise_modules.ts` → `platform_modules.ts`; add authenticated `GET /org-feature-flags` reading `organizations.enabled_modules` (G7).
6. Add `rush_*` module keys, defaulted **off** and **fail-closed** (G8).

**Exit criteria:** every existing customer's portal is byte-identical. Snapshot tests on nav and dashboards prove it.

### Phase 1 — Identity
1. Migrate `courier_profiles` with `mode` / `fleet_id` / `fleet_joined_at` / `fleet_role` (G2).
2. Add `orders.courier_fleet_id`, stamped at acceptance.
3. Add `fleet.drivers.service_lines` and `user_id` (G5).
4. Build `fleet.workforce_invites` + invite/accept endpoints.
5. Add the courier-code entry screen to `apps/dash-courier` onboarding.
6. Generalise the existing driver attach/detach logic to cover couriers.

**Exit criteria:** a fleet owner can invite a courier, the courier joins, and the roster shows them — with no financial data flowing yet.

### Phase 2 — Data bridge
1. Add `'Roam Rush'` to the `platform` union (G12).
2. Build the order→trip projector, idempotent on `order_id` (G11).
3. Add `fleet.delivery_details`.
4. Add synthetic weekly live-sync batches; audit every batch-scoped tool (delete preview, re-import, quarantine) for correctness against them (G13).
5. Build the daily reconciliation job (orders vs projection) with drift alerting.
6. Backfill historical orders for pilot fleets.

**Exit criteria:** delivered orders appear as trips within minutes; reconciliation reports zero drift for 7 consecutive days.

### Phase 3 — Money
> **Blocked on** the WiPay verification fix ([ROAMRUSH_SYSTEM_AUDIT §B1](ROAMRUSH_SYSTEM_AUDIT.md)). Do not settle fleet owners against self-confirmable revenue.

1. Extend the earnings-policy engine with per-service-line tiers (G14).
2. One combined weekly settlement per person across lines.
3. Add the `service_line` dimension to fuel, toll, and expense journal; implement pro-rata allocation for shared costs (G16).
4. Project `courier_cash_balances` read-only into the fleet cash view (G15).
5. Segment Business Finance P&L by service line.

**Exit criteria:** a pilot "both" fleet reconciles a full week manually against the system to the cent.

### Phase 4 — UI
1. Introduce routing / a page registry (G18).
2. Build the service-line scope switcher.
3. Build Couriers, Courier Analytics, Deliveries, Delivery Analytics, Courier Settlements, Supply Health.
4. Make vocabulary scope-aware (G20).
5. Update `SIDEBAR_VISIBILITY` for delivery (G19).
6. Compliance-blocker surfacing on the courier detail page (G21).

### Phase 5 — Self-serve
1. The signup wizard (G23).
2. Settings → add/remove a service line post-signup.
3. Plan/entitlement selection and billing for the Rush add-on.
4. Vertical-aware guided setup checklists.

### Phase 6 — Hardening
1. Playwright golden paths for all three customer shapes (per [docs/ROAM_RUSH_TEAM_ROLES_AUDIT.md](docs/ROAM_RUSH_TEAM_ROLES_AUDIT.md), the QA gap is already the top-ranked risk in this repo).
2. Rollback drills for each phase.
3. Load test the projector at peak order volume.
4. RLS review of every new cross-schema path (see [docs/rls-audit.md](docs/rls-audit.md)).

---

## 8. Rollout, flags, and rollback

Reuse the existing pattern from [docs/fleet-data-isolation-rollout.md](docs/fleet-data-isolation-rollout.md): deploy dark → enable per-org → enable globally.

| Flag | Guards | Default |
|---|---|---|
| `service_lines_enabled` | Reading `service_lines` instead of `business_type` | off |
| `rush_courier_link` | Courier↔fleet invite + membership | off |
| `rush_trip_projection` | The order→trip bridge | off |
| `rush_settlement` | Delivery revenue entering settlement | off |
| `rush_ui` | Rush navigation and pages | off |

**Rollback per phase**
- Phase 0–1: flags off; new columns are additive and inert.
- Phase 2: flag off stops projection. Projected trips are identifiable by `platform = 'Roam Rush'` and are removable by synthetic batch — reuse the existing batch delete tooling. Migrations stay forward-only (per [docs/MULTI_VERTICAL_COMPATIBILITY.md](docs/MULTI_VERTICAL_COMPATIBILITY.md)).
- Phase 3: highest risk. Settlement runs must be reproducible and re-runnable; snapshot inputs before each run.
- Phase 4–5: pure client rollback via flag.

**The invariant to test on every deploy:** an org with `service_lines = ['rideshare']` renders and computes identically to pre-integration. Make it a CI assertion, not a manual check.

---

## 9. Risk register

| Risk | Sev | Mitigation |
|---|---|---|
| Fleet settlement computed from unverified Rush revenue | **C** | Phase 3 blocked on the WiPay fix |
| Double-counting a human who drives *and* couriers | **C** | One roster row, `service_lines[]`; add a uniqueness assertion on `user_id` |
| Regression for existing rideshare customers | **H** | `service_lines` defaults to `['rideshare']`; CI snapshot assertion |
| Projection drift (orders exist, trips missing) | **H** | Daily reconciliation job with alerting; do not ship the bridge without it |
| Courier leaves a fleet mid-week, revenue misattributed | **H** | `orders.courier_fleet_id` stamped at acceptance, never recomputed |
| Fleet owner clears COD cash they don't own | **H** | Read-only projection; no write path exists |
| An 8th money engine appears | **H** | Land on `fleet.trips`; no parallel revenue table |
| Adding Rush permissions to only one of two catalogs | **M** | Collapse the duplicate in Phase 0, before any Rush work |
| `App.tsx` becomes unmaintainable | **M** | Routing/page registry before the Rush pages |
| Money-transmission exposure if Roam pays fleets who pay couriers | **M** | v1 keeps direct courier payouts; option (b) requires legal sign-off |
| Marketplace fairness if fleet-preference dispatch ships | **M** | Explicitly out of scope for v1 |
| Fleet owners expect to approve their own couriers | **M** | Sponsored onboarding + visible blockers; set the expectation in-product |

---

## 10. Open decisions — these need you, not the code

1. **Payout routing.** Does Roam keep paying couriers directly (fleet invoices separately — the Uber model, low risk), or does Roam pay the fleet who then pays the courier (cleaner UX, money-transmission exposure)? Recommendation: direct for v1, revisit with counsel.
2. **Commercial packaging.** Is Rush a paid add-on module, a separate plan tier, or bundled? This determines whether `enabled_modules` needs to carry trial/grace state.
3. **Independent couriers who later join a fleet.** Does their delivery history follow them into the fleet's books, or does the fleet only see deliveries from the join date onward? Recommendation: join date onward — cleaner, and avoids retroactively changing a settled period.
4. **Merchant-owned couriers.** Can a Rush *merchant* also be a fleet owner running their own couriers? The data model allows it; the commercial model may not want it.
5. **Fleet-preference dispatch.** Commercial and fairness decision, not technical. Recommendation: not in v1.
6. **`roamfleet.co` branding.** Does the domain and name still fit when a third of customers never touch a rideshare trip? Recommendation: keep the domain, soften the in-product language from "fleet management" toward "operations".

---

## 11. What NOT to do

- **Do not fork a third app.** Enterprise already showed what that costs.
- **Do not create a parallel `fleet.deliveries` revenue table.** It forks seven money engines.
- **Do not add a fleet party to `computeDashCaptureSplit`.** The marketplace split is verified; keep the fleet cut in tier-2 settlement.
- **Do not give fleet owners courier approval rights.** That is a platform liability.
- **Do not build fleet-controlled dispatch in v1.**
- **Do not make `business_type` do more work.** It is a scalar; the problem is plural. Add `service_lines`.
- **Do not ship the projection without reconciliation.** A silently lossy bridge is worse than no bridge.
- **Do not change anything a rideshare-only customer sees.** That is the acceptance criterion for the entire programme.

---

## 12. Closing assessment

The instinct to put Roam Rush into RoamFleet is right, and the codebase agrees with it more than it disagrees. The vocabulary map, the sidebar visibility matrix, the `delivery` business type, the `serviceCategory: 'courier'` field, the org-level module catalog with per-org override resolution — someone already built the scaffolding for exactly this. Most of it has simply never been switched on.

What is genuinely missing is narrower than it looks and lands in four places: **a plural service-line model** (because your best customer runs both), **a courier↔fleet relationship** (which rideshare has and Rush never got), **per-org entitlement on the Fleet line** (because you cannot sell what you cannot scope), and **a live bridge from Rush orders into `fleet.trips`** (because first-party data should never arrive as a spreadsheet).

Get those four right, in that order, and the remaining ~35 pages of RoamFleet work for couriers on day one — because a courier on a motorbike burns fuel, crosses tolls, needs maintenance, and gets settled on a Monday, exactly like a driver in a Toyota.

> **Postscript (2026-09-01).** All four were subsequently built, and the architecture above was followed faithfully — Rush lands on `fleet.trips`, the marketplace split was left untouched, and no third app was forked. The defects found on verification are execution defects, not architectural ones: an unauthenticated invite endpoint, a projection that fires on one of three accept paths, a column name that does not exist, and a set of gates that confuse *service line* with *entitlement* with *view scope*. See [Part II](#part-ii--implementation-verification-2026-09-01).

---

# Part II — Implementation verification (2026-09-01)

**Reviewed:** 16 commits, `ce4e0d35..HEAD` on `main` (160 files, +8,218/−4,676). Rush-attributable subset only; a concurrent settlement-calculation program shares the range and was not re-audited here.
**Checks run:** `pnpm --filter @roam/fleet typecheck` (exit 0) · `pnpm --filter @roam/fleet test` (171 files, 1,094 passed, 1 skipped, exit 0) · `deno check` on the four new Rush edge modules · full read of the four Rush migrations, the projector, the new routes, and the new UI surfaces.
**Result:** the architecture was followed. The execution has defects that block rollout.

---

## 13. What was built, and what it closed

### 13.1 Verified working

| Area | Evidence |
|---|---|
| **WiPay Critical genuinely fixed** — the Phase 3 blocker | [`payments/index.ts:705-708`](supabase/functions/payments/index.ts#L705) now gates on `intent.status` (server state), not `body.status`. This was a real fix, not a cosmetic one. |
| Build and tests green | fleet typecheck exit 0; 1,094 unit tests pass; no dangling imports left by the deletions |
| Migrations additive and idempotent | all four Rush migrations use `IF NOT EXISTS`; `service_lines` defaults to `ARRAY['rideshare']` |
| Rideshare-only data invariant holds | an org with no `service_lines` row change resolves to `['rideshare']` in both `BusinessConfigContext` and the server |
| Historical fleet attribution designed correctly | `delivery.orders.courier_fleet_id` is denormalised and stamped at accept, not joined live — matches §5.1(C) |
| COD framed correctly | `CourierSettlementsPage` is read-only and labelled "COD owed to Roam — Roam pays couriers directly", matching the §5.4 two-tier rule |
| Platform split untouched | no fleet party was added to `computeDashCaptureSplit`; the fleet cut stays a tier-2 concern, exactly as §5.4 required |

### 13.2 Original gap register — current status

| # | Gap | Status |
|---|---|---|
| G1 | `business_type` scalar | **Closed** — `organizations.service_lines text[]` ([`20260901130000`](supabase/migrations/20260901130000_organizations_service_lines.sql)) |
| G2 | No courier↔fleet relationship | **Closed at the schema layer** — `mode`/`fleet_id`/`fleet_joined_at`/`fleet_role` on `courier_profiles` ([`20260901130100`](supabase/migrations/20260901130100_rush_fleet_identity_phase1.sql)). Write path is unsafe — see V1. |
| G3 | Business type pinned to rideshare | **Closed** — [`BusinessConfigContext.tsx`](apps/fleet/src/components/auth/BusinessConfigContext.tsx) now resolves from `service_lines` |
| G4 | Delivery type could route to Enterprise | **Closed** — `inferClientProductLine` accepts `delivery` and any `serviceLines` array ([`App.tsx:82-89`](apps/fleet/src/App.tsx#L82)) |
| G5 | Roster service-shaped | **Closed** — `fleet.drivers.service_lines` + `user_id` + `(organization_id, user_id)` unique index |
| G6 | Tenancy impedance mismatch | **Partly** — bridge exists; RLS half of it is broken (V7) |
| G7 | No per-org entitlement | **Closed server-side** — authenticated `GET /enterprise/me/modules` reads `organizations.enabled_modules`. Undermined at the nav layer (V4) and by the override bypass (V6). |
| G8 | Flags fail open | **Closed for `rush_*`** — `allModulesOff()` base + explicit `false` default in `isModuleEnabled` |
| G9 | No courier permissions | **Closed** — 9 new keys in [`packages/auth-client/src/permissions.ts`](packages/auth-client/src/permissions.ts) |
| G10 | Duplicated permission catalog | **Closed** — [`apps/fleet/src/utils/permissions.ts`](apps/fleet/src/utils/permissions.ts) is now a re-export (487 lines deleted) |
| G11 | No Rush→Fleet bridge | **Built but non-functional** — see V2 |
| G12 | No Rush platform value | **Closed** — `platform: 'Roam Rush'`, `service_line` column on `fleet.trips` |
| G13 | Batch model assumes uploads | **Not closed** — synthetic batches are never created on the live path (V11) |
| G14 | Single-line settlement | **Not closed** — the `serviceLine` parameter is dead code (V12); no combined per-person statement exists |
| G15 | COD has no bridge | **Built but broken** — wrong column name (V3) |
| G16 | Single-line cost allocation | **Partly** — `service_line` columns added to `fuel_entries`, `expense_journal`, `toll_ledger`; nothing writes or allocates on them yet |
| G17 | Risk of an 8th money engine | **Avoided** — Rush lands on `fleet.trips` as designed |
| G18 | No router | **Closed** — [`navigation/pageRegistry.ts`](apps/fleet/src/navigation/pageRegistry.ts) + `pushState` + `popstate` |
| G19 | Sidebar matrix stale for delivery | **Closed in the matrix, defeated in the shell** — `delivery` added to `toll-management`/`earnings-policy`/`performance`, but those desks are now gated on `rideshareVisible` (V5) |
| G20 | Vocabulary not scope-aware | **Not closed** — a both-lines org derives `businessType = 'rideshare'` and gets rideshare labels everywhere |
| G21 | Fleet owners can't approve couriers | **Partly** — the invite flow leaves `status: 'pending'` for Roam to approve, which is right; but it force-resets already-active couriers (V1) |
| G22 | No supply visibility | **Closed** — `SupplyHealthPage` added, read-only |
| G23 | Signup collects only a name | **Closed** — 3-step wizard (company → service lines → owner). The plan/entitlement step from §6.1 was not built. |

---

## 14. CRITICAL

### V1 · `POST /workforce/invites/accept` is unauthenticated and trusts a body-supplied `userId`

[`workforce_invite_routes.ts:73`](supabase/functions/_fleet-server/workforce_invite_routes.ts#L73)

```ts
app.post("/make-server-37f42386/workforce/invites/accept", async (c) => {   // ← no requireAuth()
  const body = await c.req.json();
  const code = String(body.inviteCode ?? body.code ?? "").trim().toUpperCase();
  const userId = String(body.userId ?? "");                                  // ← caller-supplied identity
  …
  await deps.supabase.schema("delivery").from("courier_profiles").upsert({
    user_id: userId, mode: "fleet", fleet_id: fleetId, status: "pending",    // ← forces status
  }, { onConflict: "user_id" });
```

The other two routes in the same file carry `deps.requireAuth()`. This one does not. Three separate consequences:

1. **Identity spoofing.** Anyone holding a valid code can attach *any* `auth.users` id to a fleet. That courier's deliveries then project into the attacker's books.
2. **Unauthenticated denial of service against live couriers.** The upsert forces `status: 'pending'`, so calling it with a victim's id takes an **active** courier offline — they stop receiving offers. The same branch does this to `driver_profiles` for rideshare.
3. **Weak token.** `randomInviteCode` uses `Math.random()`, not `crypto.getRandomValues`. There is no rate limiting on the endpoint.

The client already sends a bearer token ([`FleetInviteCodePage.tsx:32`](apps/dash-courier/src/pages/onboarding/FleetInviteCodePage.tsx#L32)) — the server simply never checks it.

**Also a plain functional bug:** an already-`active` courier who legitimately joins a fleet is knocked back to `pending`. Accepting an invite must not touch `status`, and must not clear an existing approval.

**Fix:** add `deps.requireAuth()`; take the user id from `rbacUser`, never the body; drop `status` from the upsert payload; use `crypto.getRandomValues` for codes; bind the invite to `invited_email`/`invited_phone` when present.

### V2 · Most fleet deliveries will never project — `courier_fleet_id` is stamped on only one of three accept paths

`courier_fleet_id` is set in exactly one place, `POST /orders/:id/accept-delivery` ([`delivery/index.ts:1757-1773`](supabase/functions/delivery/index.ts#L1757)).

The courier app has three accept paths ([`courierApi.ts:108, 120, 490`](apps/dash-courier/src/lib/courierApi.ts#L108)):

| Path | Route | Stamps `courier_fleet_id`? |
|---|---|---|
| Direct claim | `POST /orders/:id/accept-delivery` | **yes** |
| Single offer accept | `POST /courier/offers/:id/accept` — [`courierConsumerRoutes.ts:581`](supabase/functions/delivery/courierConsumerRoutes.ts#L581) | **no** |
| Stacked offer accept | `POST /courier/offers/stack/accept` — [`courierConsumerRoutes.ts:1296`](supabase/functions/delivery/courierConsumerRoutes.ts#L1296) | **no** |

The offer-based paths are the primary dispatch flow (`matching/dispatch/runMatchingWave` → `courier_offers` → accept). With `courier_fleet_id` null, `syncOrderToFleetKv` returns at its first guard ([`orderToFleetTrip.ts:77`](supabase/functions/_shared/orderToFleetTrip.ts#L77)) and the delivery silently never reaches the fleet books.

> **Correction (Part III).** This finding originally also named `delivery/admin/courierRoutes.ts:143` as a fourth unstamped path. That was wrong — the `courier_id` occurrences in that file are response-row builders, not `orders` updates. There are exactly three assignment paths, all three now fixed.

**Fix:** extract the courier→fleet resolution into one helper and call it from every path that writes `orders.courier_id`. Add a CI guard (in the spirit of `check-projection-flags-wired.mjs`) asserting no `update({courier_id …})` without `courier_fleet_id`.

### V3 · The COD balances route queries a column that does not exist

[`rush_settlement_routes.ts:44`](supabase/functions/_fleet-server/rush_settlement_routes.ts#L44)

```ts
.select("courier_id, balance_minor, updated_at")   // ← no such column
…
owedToRoam: Number(b.balance_minor ?? 0) / 100,    // ← and the unit conversion is wrong too
```

`delivery.courier_cash_balances` defines **`balance_jmd numeric`** ([`20260823120000_dash_pricing_engine.sql:102`](supabase/migrations/20260823120000_dash_pricing_engine.sql#L102)); no later migration renames it, and [`courierCashLedger.ts`](supabase/functions/delivery/courierCashLedger.ts) reads `balance_jmd` throughout. PostgREST returns `42703` → the route throws → **500**. `GET /rush/courier-cash-balances` has never worked.

Even after renaming, `/100` is wrong: `balance_jmd` is already in major units, so the fix is `balance_jmd`, no division. Getting this backwards understates a fleet's COD exposure by 100×.

Not caught because there is no Deno typecheck in CI and no integration test hits the route.

---

## 15. HIGH

### V4 · The paid-module gate on courier navigation is dead code

[`AppSidebar.tsx`](apps/fleet/src/components/layout/AppSidebar.tsx#L123)

```ts
const canSeeCourierOps =
  hasRushDeliveryLine &&
  ( …canView() checks… ) &&
  (isModuleEnabled('rush_couriers') ||
   isModuleEnabled('rush_deliveries') ||
   isModuleEnabled('rush_courier_settlements') ||
   isModuleEnabled('rush_supply_health') ||
   hasRushDeliveryLine);          // ← always true; the whole chain above is unreachable
```

`hasRushDeliveryLine` is already required by the leading `&&`, so the trailing `|| hasRushDeliveryLine` short-circuits the entire entitlement check. Any org whose `service_lines` contains `rush_delivery` sees the Rush nav regardless of what they have bought. This undoes G7/G8 at the only layer the customer experiences, and it violates §5.2's rule that Rush nav requires **both** the service line and the module.

**Fix:** delete the trailing `|| hasRushDeliveryLine`.

### V5 · Delivery-only orgs lose Vehicles, Fuel, Toll and Maintenance

[`AppSidebar.tsx`](apps/fleet/src/components/layout/AppSidebar.tsx#L115)

```ts
const canSeeFleetOps   = rideshareVisible && (canSeeFuelDesk || canSeeTollDesk);
const canSeeDriverOps  = rideshareVisible && (…);
const canSeeVehicleOps = rideshareVisible && (…);
```

For `service_lines = ['rush_delivery']`, `rideshareVisible` is `false`, so the Fuel Desk, Toll Desk, Vehicle Ops and Maintenance Hub all disappear. A both-lines org loses them too whenever the scope switcher is set to Rush.

This contradicts the delivery-only nav specified in §5.5 ("Dashboard, **Couriers**, Vehicles, **Deliveries**, Fuel Desk, Toll Desk, Business Finance, Reports, Settings"), and it makes the G19 matrix fix unreachable — `delivery` was correctly added to `toll-management` in [`businessTypes.ts:206`](packages/business-config/src/businessTypes.ts#L206), but the shell hides the desk before the matrix is ever consulted.

The premise of the whole programme is that couriers burn fuel, cross tolls and need maintenance. **Fix:** gate shared infrastructure on `serviceLines.length > 0`, not on `rideshareVisible`. Only genuinely rideshare-specific surfaces (Imports, inDrive Wallet, Driver Settlements) should key off `rideshareVisible`.

### V6 · The Rush kill switch is defeated in three places

`resolveEffectiveModules` is contractually `lineOn && orgOn` — explicit `false` at *either* level wins. Three separate patches re-enable `rush_*` after that resolution:

1. Server — [`index.tsx:14958-14965`](supabase/functions/_fleet-server/index.tsx#L14958): `if (key.startsWith('rush_') && value === true) effectiveModules[key] = true`
2. Client merge — `rushModulesFromOrg` spread *after* `data.effectiveModules` in [`FeatureFlagContext.tsx`](apps/fleet/src/components/auth/FeatureFlagContext.tsx#L131)
3. Client read — `isModuleEnabled` falls back to `orgOverridesRef.current[module] === true`

Net effect: turning a Rush module off at the product-line level no longer turns it off for any org that has the override set. §8's rollback plan — "Phase 4–5: pure client rollback via flag" — does not work. The comment calls this "belt-and-suspenders"; it is the opposite, since it removes the only global brake.

**Fix:** delete all three overrides. If a per-org purchase must survive a product-line default of `false`, model that as a distinct `rush_addon_purchased` field, not by inverting the module resolver.

### V7 · The new RLS policies use the wrong JWT claim and match nothing

[`20260901130300_rush_fleet_rls_phase6.sql:11`](supabase/migrations/20260901130300_rush_fleet_rls_phase6.sql#L11)

```sql
organization_id = COALESCE(
  (auth.jwt() -> 'app_metadata' ->> 'organization_id'),   -- ← snake_case
  (auth.jwt() -> 'user_metadata' ->> 'organization_id')
)
```

The claim this codebase writes is **`organizationId`** — see [`fleet_owner_provision.ts`](supabase/functions/_fleet-server/fleet_owner_provision.ts#L51) and the existing precedent at [`20260826140000_vehicle_remediation_templates_parts_requests.sql:40`](supabase/migrations/20260826140000_vehicle_remediation_templates_parts_requests.sql#L40), which uses `'organizationId'`. The `user_metadata` fallback cannot rescue it either: [`custom-access-token/index.ts`](supabase/functions/custom-access-token/index.ts) strips both spellings from `user_metadata` as privileged claims.

Both `SELECT` policies therefore evaluate `organization_id = NULL` and return zero rows for every authenticated client. Currently invisible because all reads go through service-role edge functions — which means this will surface the first time anything queries `fleet_delivery_details` or `fleet_workforce_invites` from the browser.

**Secondary:** the `INSERT` policy on `fleet_workforce_invites` lets *any* authenticated principal with a matching org claim create invites — a `fleet_viewer` or a `driver`, not just an owner. Gate on role, or drop the policy and keep writes service-role-only.

**Also check** the `public.fleet_delivery_details` / `public.fleet_workforce_invites` views created in [`20260901130200`](supabase/migrations/20260901130200_rush_fleet_bridge_phase2.sql): they are `CREATE OR REPLACE VIEW … SELECT *` without `security_invoker = true`, so they run as owner and bypass the underlying RLS. Grants are service-role-only today, but this repo already carries an inventory of anon-reachable `public` views (`docs/rls-audit.md`) — set `security_invoker` explicitly rather than relying on the grant.

### V8 · The reconciliation job cannot detect drift for a both-lines org

[`rush_trip_recon.ts:19-24`](supabase/functions/_fleet-server/rush_trip_recon.ts#L19)

```ts
const { count: tripCount } = await db
  .from("fleet_trips")
  .select("id", { count: "exact", head: true })
  .eq("organization_id", fleetOrgId)      // ← no platform / service_line filter
  .gte("date", sinceIso.slice(0, 10));    // ← no status filter
```

The order side filters `status IN ('delivered','completed')` and `courier_fleet_id`; the trip side counts **every** trip in the org. For a both-lines fleet, `drift = deliveries − (rides + deliveries)` — a large negative number on a healthy system, and structurally incapable of revealing a lossy projection. §4.4 made this job a hard prerequisite for shipping the bridge precisely so a silent loss could not happen; as written it cannot do that job.

**Fix:** add `.eq("service_line", "rush_delivery")` (or `.eq("platform", "Roam Rush")`) and `.eq("status", "Completed")`, and compare per-courier as well as per-org so a single mis-attributed courier is visible.

### V9 · The service-line scope switcher is cosmetic

`filterTripsByServiceLineScope`, `tripMatchesServiceLineScope` and `inferTripServiceLine` ([`serviceLineTripFilter.ts`](apps/fleet/src/utils/serviceLineTripFilter.ts)) have **no production callers** — a repo-wide grep finds only `serviceLineTripFilter.test.ts`. `useServiceLineScope` is consumed by exactly two files: `AppSidebar` and the switcher itself.

So selecting "Rideshare" or "Rush Delivery" changes which nav items render and nothing else. Trips, dashboards, Business Finance, driver settlements, reports and exports are unfiltered. §5.5 specified the switcher behaves "like a global date range: persisted per user, applied as a filter parameter to every query, reflected in every export."

**Fix:** thread `scope` into the query keys and request params of the trip, dashboard, finance and report services. Until then the switcher is misleading and should arguably be hidden.

### V10 · COD cash on the projected trip is the wrong number

[`orderToFleetTrip.ts:60-70`](supabase/functions/_shared/orderToFleetTrip.ts#L60)

```ts
netPayout: amount,
cashCollected: paymentMethod === "Cash" && !isCancelled ? amount : 0,   // ← courier's earning
```

versus, for the same order, [`orderToFleetTrip.ts:161`](supabase/functions/_shared/orderToFleetTrip.ts#L161):

```ts
cod_collected: order.payment_method === "cash" ? Number(order.total ?? 0) : 0,   // ← correct
```

On a COD delivery the courier physically collects **`order.total`**, of which they owe platform + merchant and retain their earning. Setting `cashCollected` to the earning understates fleet cash-in-hand by the entire merchant and platform portion, and puts `fleet.trips` and `fleet.delivery_details` in disagreement about the same order.

It also breaks the documented invariant on the `Trip` type ([`types/data.ts:27-28`](apps/fleet/src/types/data.ts#L27)): `netPayout = amount − cashCollected`. Here both are set to `amount`.

**Fix:** `cashCollected = order.total` for COD; let `netPayout` follow the existing formula rather than being hardcoded.

### V11 · The live path never creates its synthetic batch

`ensureRushSyntheticBatch` ([`rush_projection_helpers.ts:26`](supabase/functions/_fleet-server/rush_projection_helpers.ts#L26)) is called from **`backfillRushOrdersToFleet` only**. The live projector computes the id inline and posts it without creating the record:

```ts
const syntheticBatchId = order._syntheticBatchId ?? rushLiveSyncBatchId(fleetId, eventIso);
```
([`orderToFleetTrip.ts:99-102`](supabase/functions/_shared/orderToFleetTrip.ts#L99))

Every live-projected trip therefore carries a `batchId` with no corresponding row in KV or `fleet.import_batches`. This is G13 landing exactly as predicted: `GET /batches/:id/delete-preview`, `TripReImportFlow`, quarantine and batch-scoped reconciliation all key on that id.

Compounding it, `rushLiveSyncBatchId` is **duplicated with divergent signatures** — `(orgId, eventIso)` in `_shared/orderToFleetTrip.ts:17` and `(orgId, weekStartYmd)` in `rush_projection_helpers.ts:12`. They agree today only because each caller happens to pass the right thing.

**Fix:** call `ensureRushSyntheticBatch` from the live path; delete one of the two copies and import the survivor.

---

## 16. MEDIUM

| # | Finding | Evidence |
|---|---|---|
| V12 | **Per-service-line earnings policies are dead code.** No production caller passes `serviceLine` to `resolveActiveEarningsBundleForDriverWeek` — only the new test. The real callers (`buildPersonalAllowanceReconContext.ts:120`, `loadResolvedEarningsBundle.ts:46`, edge `driver_financial_periods.ts:687`, `index.tsx:5882`) omit it. The **edge mirror** [`earnings_policy_runtime.ts:141`](supabase/functions/_fleet-server/earnings_policy_runtime.ts#L141) never received the parameter, so client and edge have silently diverged despite `earningsPolicyRuntimeParity.test.ts`. G14 is not closed. |
| V13 | **Week boundaries are computed in UTC.** `weekStartYmdFromIso` uses `getUTCDay`/`setUTCDate`. Jamaica is UTC−5, so a delivery completed Sunday evening local time lands in the *following* week's synthetic batch and settlement period. | `orderToFleetTrip.ts:9-14`, `rush_projection_helpers.ts:17-23` |
| V14 | **Backfill over-reports success.** `synced++` runs even though `syncOrderToFleetKv` returns `void` and exits early on any of five conditions (no fleet id, wrong status, no courier, flag off, failed POST). `skipped = length − synced − errors` is therefore structurally always 0. Also `.limit(500)` with no pagination or cursor. | `rush_projection_helpers.ts:52-95` |
| V15 | **No cron is scheduled for the daily recon.** The endpoint exists but, unlike the repo's four other cron jobs (`*_cron.sql` migrations), no `pg_cron` schedule was added. The "daily" reconciliation never runs. Separately `if (cronSecret && auth !== …)` leaves the endpoint **fully open when `CRON_SECRET` is unset**. | `index.tsx:14880-14894` |
| V16 | **Deno type errors in new code, and no Deno check in CI.** `deno check` reports two `TS2769` in `rush_settlement_routes.ts` (the `requireAuth: () => unknown` typing) and a `getOrgId` signature that is declared incompatibly in the two new register functions (`{get}` vs `{req:{header}}` for what is a Hono `Context`). CI runs `typecheck` for Vite apps only — which is also why V3 shipped. | `rush_settlement_routes.ts:23,71`; `.github/workflows/ci.yml` |
| V17 | **Customer PII is copied into the fleet tenant.** `payload_json: order` stores the entire order — line items, delivery address, `customer_id`, instructions — in `fleet.delivery_details`. A fleet owner needs the money and timing fields, not the customer's order contents. | `orderToFleetTrip.ts:170` |
| V18 | **The `service_lines` backfill ignores `product_line`.** `delivery` is a valid **Enterprise** business type ([`businessTypes.ts:73`](packages/business-config/src/businessTypes.ts#L73)), so enterprise delivery orgs are backfilled to `['rush_delivery']`. Add `WHERE product_line = 'fleet'`. | `20260901130000_organizations_service_lines.sql:11-19` |
| V19 | **Two of the five new tests are vacuous.** `rollbackFlags.test.ts` asserts `false && true === false` and that an array literal contains what was just written into it. `wipayPollOnly.test.ts` asserts over local variables, never touching the handler — **it would pass unchanged if the WiPay fix were reverted.** These create false assurance on the two things most worth verifying. | `apps/fleet/src/components/rush/__tests__/` |
| V20 | **`e2e/fleet-rush-integration.spec.ts` is not an end-to-end test.** Three of its four cases are pure unit assertions over the page registry with no `page` fixture. None of the three customer shapes from §6.2 is exercised in a browser, which was the §7 Phase-6 exit criterion. | `e2e/fleet-rush-integration.spec.ts` |
| V21 | **Unrelated deletions rode along in the same commits.** The 45-second `/health` keep-alive (cold-start protection, `App.tsx`) and the entire alerts/notifications system (`alertEngine`, `NotificationCenter`, `FleetAlertsPanel`, `AlertsConfigView`, `BroadcastMessageModal`, `useAlertPusher`) were removed across fleet, driver and admin. The removals are clean — no dangling imports — but they are not Rush work and were not reviewed as part of it. | `git diff ce4e0d35..HEAD` |
| V22 | **The projector writes through an unauthenticated route using the anon key.** `syncOrderToFleetKv` POSTs to `/trips`, which carries only `requireCatalogMatched` — no `requireAuth` — and trusts `organizationId` from the body. The hole is **pre-existing**, not introduced here, but a production path now depends on it, so it can no longer be closed without breaking Rush projection. | `orderToFleetTrip.ts:112-127`; `index.tsx:2210-2225` |
| V23 | **Scope selection is stored globally.** `localStorage['roam_fleet_service_line_scope']` is not namespaced by user or org, so it survives account switching on a shared browser. It degrades safely today only because `showScopeSwitcher` is false for single-line orgs. | `ServiceLineScopeContext.tsx:6` |
| V24 | **`FleetInviteCodePage` calls `onContinue()` during render** (`if (skipped) { onContinue(); return null; }`), a state update in another component's render phase. | `FleetInviteCodePage.tsx:45-48` |
| V25 | **Invite audit trail records the org, not the actor.** `created_by: orgId` should be the acting user id. | `workforce_invite_routes.ts:42` |
| V26 | **`delivery-settlement-summary` counts cancelled trips** as deliveries (no status filter), inflating the per-courier delivery count. | `rush_settlement_routes.ts:78-96` |

---

## 17. Remediation order

Sequenced by blast radius, not by file.

1. **V1** — unauthenticated account takeover / courier DoS against a live product. Nothing else matters until this is closed.
2. **V2 + V11** together — the projection is inert without both, and fixing either alone yields orphaned or missing data.
3. **V3** — the COD surface has never returned a result.
4. **V4, V5, V6** as one pass over gating — they are three symptoms of the same confusion between *service line*, *entitlement*, and *view scope*.
5. **V7 and V8** before any pilot org is enabled. These are the two defects that would let a real error go unobserved.
6. **V10, V13** before `rush_settlement` is enabled for anyone — both are money-correctness bugs.
7. **V16** — add `deno check` for `supabase/functions/**` to CI. It would have caught V3 and V16 before review.
8. **V19, V20** — replace the vacuous tests with ones that exercise the handlers, and build the three-customer-shape browser tests §7 Phase 6 asked for.
9. Remainder as cleanup.

**Do not enable `rush_trip_projection`, `rush_settlement` or `rush_ui` for any org until items 1–5 are closed.** The flags are correctly defaulted off today, and V6 means turning them back off later is not currently reliable.

---

---

# Part III — Remediation verification (2026-09-01)

**Reviewed:** commit `82853c0e` (42 files, +1,301/−292) — the response to Part II.
**Checks run:** `pnpm --filter @roam/fleet typecheck` (exit 0) · `pnpm --filter @roam/fleet test` (174 files, 1,099 passed, 1 skipped, exit 0) · `deno check` on the four Rush edge modules · `node scripts/check-courier-fleet-stamp.mjs`, `check-fleet-edge-duplicates.mjs`, `check-projection-flags-wired.mjs` (all pass) · full read of the two new migrations, the rewritten projector, and the new tests.
**Result:** all three Criticals fixed; 16 of 24 findings closed. Four new defects, one of them a widened regression.

---

## 18. Part II findings — disposition

### 18.1 Fixed and verified

| # | Fix | Evidence |
|---|---|---|
| **V1** | `requireAuth()` added to `/workforce/invites/accept`; identity now taken from `rbacUser.userId` instead of the body; `status` removed from both upserts so an active courier is no longer reset to `pending`; `crypto.getRandomValues` replaces `Math.random`; invites bound to `invited_email`/`invited_phone` when set; `created_by` is now the acting user (V25). The courier client stopped sending `userId` at all. | [`workforce_invite_routes.ts`](supabase/functions/_fleet-server/workforce_invite_routes.ts), [`FleetInviteCodePage.tsx`](apps/dash-courier/src/pages/onboarding/FleetInviteCodePage.tsx) |
| **V2** | `resolveCourierFleetId` / `courierAssignmentFields` extracted to [`courierFleetAttribution.ts`](supabase/functions/delivery/courierFleetAttribution.ts) and spread into **all three** assignment paths. CI guard `check-courier-fleet-stamp.mjs` added (but see W7). | `courierConsumerRoutes.ts:582,1298`; `delivery/index.ts:1756` |
| **V3** | `balance_jmd` replaces the nonexistent `balance_minor`; the erroneous `/100` removed; `is_paused` surfaced as a bonus. | [`rush_settlement_routes.ts:47,59`](supabase/functions/_fleet-server/rush_settlement_routes.ts#L47) |
| **V4** | The trailing `|| hasRushDeliveryLine` removed from `canSeeCourierOps` **and** from all five `courierItems` entries, which carried the same bypass individually. Entitlement now genuinely gates Rush nav. | [`AppSidebar.tsx:134,274-295`](apps/fleet/src/components/layout/AppSidebar.tsx#L134) |
| **V5** | `hasSharedOps = rushVisible \|\| rideshareVisible` now gates Fleet Ops (Fuel/Toll) and Vehicle Ops, so a delivery-only org keeps its shared infrastructure. `canSeeDriverOps` correctly stays rideshare-only — but see W6. | `AppSidebar.tsx:115-124` |
| **V7** | Claim corrected to camelCase `organizationId`; invite `INSERT` policy now additionally requires role ∈ {`fleet_owner`,`fleet_manager`}; both `public.fleet_*` views recreated `WITH (security_invoker = true)`. | [`20260901140000_rush_fleet_rls_remediation.sql`](supabase/migrations/20260901140000_rush_fleet_rls_remediation.sql) |
| **V8** | Recon now filters `service_line = 'rush_delivery'` **and** `status = 'Completed'`, and reports `perCourier` drift alongside the org total — so a single mis-attributed courier is visible. | [`rush_trip_recon.ts`](supabase/functions/_fleet-server/rush_trip_recon.ts) |
| **V10** | `cashCollected = order.total` for COD; `netPayout = amount − cashCollected`; a shared `isCashPayment()` now handles both `cash` and `cod` on **both** sides, so `fleet.trips` and `fleet.delivery_details` finally agree. Covered by a real test that imports the real function. But see W5. | [`orderToFleetTrip.ts:33-43`](supabase/functions/_shared/orderToFleetTrip.ts#L33) |
| **V11** | `ensureRushSyntheticBatch` is now called on the live path. The duplicate `rushLiveSyncBatchId`/`weekStartYmdFromIso` pair collapsed into one shared [`rushBatchIds.ts`](supabase/functions/_shared/rushBatchIds.ts); `rush_projection_helpers.ts` re-exports rather than re-implements. A `check-fleet-edge-duplicates.mjs` CI guard was added. | `orderToFleetTrip.ts:100-102` |
| **V13** | Week boundaries now computed in `America/Jamaica` via `Intl.DateTimeFormat`, not UTC. *(Correct on a UTC runtime; the intermediate `new Date("…T12:00:00")` is parsed in runtime-local time, so it would drift on a UTC+13 host. Acceptable for Deno Deploy; worth a `Z` suffix.)* | `rushBatchIds.ts:6-27` |
| **V16** | The two `TS2769` errors in `rush_settlement_routes.ts` are gone — `getOrgId` now imports the real `Context`-typed function from `org_scope.ts` with an optional override. A `deno check` step was added to CI, though the step itself is broken (W4). | `rush_settlement_routes.ts:5-27` |
| **V17** | `trimOrderPayload()` replaces `payload_json: order`. Customer id, address, instructions and line items no longer land in the fleet tenant. | `orderToFleetTrip.ts:139-154` |
| **V18** | Backfill corrected — enterprise `delivery` orgs reset to `['rideshare']`. | `20260901140000_…sql:4-8` |
| **V23** | Scope storage key namespaced `…:{orgId}:{userId}`. | `ServiceLineScopeContext.tsx:28-31` |
| **V24** | `onContinue()` moved out of render into a `useEffect`. | `FleetInviteCodePage.tsx:17-19` |
| **V26** | `.eq("status", "Completed")` added to the settlement summary — cancelled deliveries no longer inflate courier counts. | `rush_settlement_routes.ts:86` |
| **G20** | Bonus, beyond Part II scope: `useVocab` is now scope-aware, so a both-lines org gets delivery vocabulary when scoped to Rush. | [`vocabulary.ts:240-256`](apps/fleet/src/utils/vocabulary.ts#L240) |

### 18.2 Partly fixed — still open

| # | What was done | What remains |
|---|---|---|
| **V9** | `scope` now reaches `TripLogsPage` (with a genuine **server-side** `serviceLine` filter at [`index.tsx:1980-1984`](supabase/functions/_fleet-server/index.tsx#L1980), so pagination stays correct) and `useVocab`. | Dashboard, Business Finance, Driver Settlements, Reports and every export are still unfiltered. §5.5 asks for "every query… every export". Four of five surfaces remain. |
| **V12** | Client/edge parity restored — `earnings_policy_runtime.ts` now accepts `serviceLine`, matching `earningsPolicyResolve.ts`. | **Still no production caller passes it.** `loadResolvedEarningsBundle`, `buildPersonalAllowanceReconContext` and `driver_financial_periods` all omit it. Per-service-line policies remain dead code and G14 (one combined per-person statement) is unimplemented. Acceptable only while `rush_settlement` is off. |
| **V14** | `syncOrderToFleetKv` now returns a typed `SyncOrderResult` with a `reason`, so `synced`/`skipped` are finally accurate. Pagination was attempted. | The pagination is broken in a worse way — see **W2**. |
| **V15** | A `pg_cron` migration was added. | It never schedules on a fresh database — see **W3**. |
| **V19** | The two worst tautologies replaced: `rollbackFlags` now exercises the real `resolveEffectiveModules`, and `orderToFleetTrip.test.ts` imports and asserts against the real projector. | Two **new** vacuous tests were added, and one old one survives — see **W8**. |

### 18.3 Not addressed

| # | Finding | Note |
|---|---|---|
| **V20** | `e2e/fleet-rush-integration.spec.ts` untouched. Still no browser test of the three customer shapes — the §7 Phase 6 exit criterion. |
| **V21** | The unrelated keep-alive and alerts/notification deletions stand. Not re-litigated; flagging only so the decision is recorded rather than forgotten. |
| **V22** | `POST /trips` remains unauthenticated and the projector still posts to it with the anon key. Accepted as pre-existing, but it is now a production dependency. |

---

## 19. NEW defects introduced by the remediation

### W1 · HIGH — the kill switch was not restored, it was moved — and now regresses Enterprise too

The three ad-hoc `rush_*` bypasses flagged as V6 were correctly deleted from `FeatureFlagContext.tsx` and `index.tsx`. But the same behaviour was then written into `resolveEffectiveModules` itself, in **both** the shared package and the Deno mirror:

```ts
for (const key of catalogKeys) {
  // Paid add-ons: explicit org true turns module on even when product-line default is off.
  if (org[key] === true) { effective[key] = true; continue; }   // ← org true beats platform false
  if (org[key] === false) { effective[key] = false; continue; }
  effective[key] = pl[key] !== false;
}
```
([`packages/platform-settings/src/modules.ts`](packages/platform-settings/src/modules.ts) and [`enterprise_modules.ts:141-159`](supabase/functions/_fleet-server/enterprise_modules.ts#L141))

Three problems, in ascending order of seriousness:

1. **The doc comment directly above it is now false.** It still reads *"Intersection: a module is on only when product-line allows it AND org override is not explicitly false."* The function is no longer an intersection.
2. **V6 is not fixed.** Setting `rush_couriers: false` at the product line still does not turn Rush off for any org holding a `true` override. §8's stated rollback path — "Phase 4–5: pure client rollback via flag" — remains unavailable.
3. **The blast radius is now every module, not just Rush.** `catalogKeys` defaults to the whole 45-key `ENTERPRISE_MODULE_KEYS`. So `freight_*`, `warehouse_*`, `fuelManagement`, `tollManagement` — and the three `grocery_*` keys explicitly documented as *"Reserved — not enabled"* — all now let an org override defeat the platform default. A Rush bug fix silently changed Enterprise entitlement semantics.

`rollbackFlags.test.ts` now **encodes the regression as intended behaviour**:

```ts
it('org purchase enables module when platform default is off', () => {
  expect(resolveEffectiveModules(allModulesOff(), { rush_couriers: true }).rush_couriers).toBe(true);
});
```

**Fix:** restore the intersection. If a paid add-on genuinely must survive a product-line default of `false`, model that explicitly — a separate `purchased_modules` map, or a `catalogKeys`-scoped override limited to `RUSH_MODULE_KEYS` — never by inverting the shared resolver for all 45 keys. Delete or invert that test.

### W2 · HIGH — the backfill now loops forever instead of truncating

[`rush_projection_helpers.ts:42-51`](supabase/functions/_fleet-server/rush_projection_helpers.ts#L42)

```ts
let cursor: string | null = sinceIso;
while (cursor) {
  const { data: orders, error } = await delivery
    .from("orders")
    .select("*")
    .eq("courier_fleet_id", fleetOrgId)
    .gte("updated_at", sinceIso)      // ← sinceIso, not cursor
    .order("updated_at", { ascending: true })
    .limit(pageSize);
  …
  if (orders.length < pageSize) break;
  cursor = String(orders[orders.length - 1]!.updated_at);   // ← computed, never used
```

The cursor is advanced but the query never reads it, so every iteration fetches **the same first 500 rows**. The only exit is `orders.length < pageSize`. For any fleet with ≥ 500 matching orders the loop never terminates — it re-projects the same 500 orders until the edge function times out, inflating `synced` without bound.

The original bug merely truncated at 500. This is strictly worse: `POST /rush/backfill-trips` becomes a hang for exactly the large pilot fleets it exists for.

**Fix:** `.gt("updated_at", cursor)` and seed `cursor = sinceIso` with a `gte` on the first page only — or paginate on `.range()`.

### W3 · MEDIUM — the recon cron never schedules on a fresh database

[`20260901140100_rush_trip_recon_cron.sql`](supabase/migrations/20260901140100_rush_trip_recon_cron.sql)

```sql
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('rush-trip-recon-daily');   -- raises when the job doesn't exist
    PERFORM cron.schedule(…);                            -- never reached on first run
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;                                 -- swallows it silently
END;
$cron$;
```

`cron.unschedule(name)` raises `could not find valid entry for job` when the job is absent. The only handler is the **outer** one, so on first run the exception aborts the block before `cron.schedule` and the bare `NULL` hides it. The daily reconciliation is never created, and nothing reports that.

This repo's own newest cron migration gets it right — [`20260830250000_spatial_index_canary_cron.sql:35-38`](supabase/migrations/20260830250000_spatial_index_canary_cron.sql#L35) wraps `unschedule` in its **own inner** `BEGIN … EXCEPTION` precisely so the schedule below still runs. Copy that shape.

Secondary: `COMMENT ON EXTENSION pg_cron` sits outside the guarded block and will error the migration on any database where pg_cron is not installed.

### W4 · MEDIUM — the new CI Deno step fails

```yaml
- name: Deno check edge functions
  run: deno check supabase/functions/_shared/orderToFleetTrip.ts …
```

Two independent reasons this is red:

1. **There is no `denoland/setup-deno` step anywhere in `ci.yml`** — `deno` is not on the runner, so the step fails with command-not-found.
2. Even locally with Deno 2.9.1 it exits non-zero. The four target files are clean, but `deno check` follows the graph into two pre-existing errors in [`feature_flags.ts:236,307`](supabase/functions/_fleet-server/feature_flags.ts#L236) (`Object is of type 'unknown'`) and one in [`kv_store.tsx:14`](supabase/functions/_fleet-server/kv_store.tsx#L14) (`string | undefined` → `string`).

**Fix:** add `setup-deno`, and either repair those three pre-existing errors or scope the step with an ignore list. The instinct was right — this step is what would have caught V3 and V16 — but as written it blocks every merge.

### W5 · MEDIUM — `netToDriver` is now negative on COD deliveries, and one consumer takes its absolute value

V10's fix is correct in cash terms — but `amount` for a Rush trip is the **courier's earning**, not the customer's payment, so `netPayout = amount − cashCollected` goes sharply negative: a J$300 earning on a J$2,500 COD order yields `−2,200`, and `netToDriver` is set to the same value.

[`fleetBankReceive.ts:190-193`](apps/fleet/src/utils/fleetBankReceive.ts#L190) then does:

```ts
const add = Math.abs(
  Number(trip.bankTransferred) || Number(trip.netToDriver) || Number(trip.amount) || 0,
);
```

`Math.abs(−2,200)` = **2,200**. That delivery contributes J$2,200 to expected bank receipts instead of J$300 — a 7× overstatement, in the wrong direction, silently.

For rideshare the formula is sound because `amount` is the full fare. For Rush the two quantities are not commensurable. **Resolve before `rush_settlement` is enabled:** either keep `netToDriver` as the courier's earning and track the COD liability solely through `cashCollected` / `courier_cash_balances`, or exclude `platform = 'Roam Rush'` rows from `fleetBankReceive`. Add a test pinning the expected bank-receive contribution of a COD Rush trip.

### W6 · MEDIUM — Earnings Policy is unreachable for delivery-only orgs

V5 correctly moved Vehicle Ops and Fleet Ops onto `hasSharedOps`, but `canSeeDriverOps` stayed on `rideshareVisible` — and `earnings-policy` lives inside that flyout ([`AppSidebar.tsx:119, 229-231`](apps/fleet/src/components/layout/AppSidebar.tsx#L119)). So a delivery-only org can never open Earnings Policy, even though `SIDEBAR_VISIBILITY['earnings-policy']` was deliberately widened to include `delivery` in the G19 fix, and even though courier earnings tiers are exactly what V12's `serviceLine` plumbing exists to configure.

**Fix:** promote `earnings-policy` out of the rideshare-gated flyout, or gate it on `hasSharedOps` with the `isSidebarItemVisible` matrix doing the real work.

### W7 · LOW — the new CI guard is blind to its highest-risk file

[`check-courier-fleet-stamp.mjs:26`](scripts/check-courier-fleet-stamp.mjs#L26)

```js
if (/courierAssignmentFields|courier_fleet_id/.test(text)) continue;   // skips the WHOLE file
```

Any file that mentions the helper *anywhere* is exempted entirely. `courierConsumerRoutes.ts` imports it — so a fourth assignment path added to that file without using it would pass the guard. That is precisely the file where V2's regression lived.

**Fix:** drop the file-level `continue` and evaluate each `.update({…courier_id…})` block on its own; the per-block checks below already do the right thing.

### W8 · LOW — two new vacuous tests replaced two old ones

- [`rushBatchIds.test.ts`](apps/fleet/src/components/rush/__tests__/rushBatchIds.test.ts) asserts only `expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/)` — it would pass unchanged against the old UTC implementation, so it does not test V13's regression at all. Its comment also calls Jamaica "UTC+5" (it is UTC−5).
- [`appSidebarGating.test.ts`](apps/fleet/src/components/rush/__tests__/appSidebarGating.test.ts) re-implements the gating expressions as local functions and tests those copies, not `AppSidebar`. A regression in the real component passes.
- `wipayPollOnly.test.ts` is still tautological (`expect('success' === 'success').toBe(true)`) and never imports the handler.
- `earningsPolicyServiceLine.test.ts` dropped from 2 cases to 1.

**Fix:** assert the exact expected Monday for a Sunday-21:00-Jamaica instant; export the gating predicate from `AppSidebar` and test the exported symbol; delete `wipayPollOnly.test.ts` or replace it with a request-level test against the real route.

---

## 20. Current gate and next steps

**Build status:** fleet typecheck exit 0 · 174 test files / 1,099 tests pass · `check-courier-fleet-stamp`, `check-fleet-edge-duplicates`, `check-projection-flags-wired` all pass · **`deno check` step fails (W4)**.

Remediation order:

1. **W1** — restore the intersection in `resolveEffectiveModules` and scope any add-on exception to `RUSH_MODULE_KEYS`. This is the largest single item because it now affects Enterprise, and because it is the reason the flags cannot be trusted to roll back.
2. **W2** — fix the backfill cursor before anyone runs `POST /rush/backfill-trips` against a real fleet.
3. **W3** — inner exception block so the cron actually schedules; verify with `SELECT * FROM cron.job`.
4. **W4** — add `setup-deno` and clear or ignore the three pre-existing graph errors, so CI is green and keeps catching this class of bug.
5. **W5** — decide the `netToDriver` semantics for Rush COD and pin it with a test. Blocking for `rush_settlement`.
6. **W6, V9, V12** — the remaining functional gaps: Earnings Policy reachability, scope filtering beyond Trip Logs, and an actual caller for the service-line earnings bundle.
7. **W7, W8, V20** — test and guard quality.

**Flag gate:** `rush_courier_link` is now safe to enable for a pilot org — V1 and V2 are genuinely closed. `rush_trip_projection` should wait for W2. `rush_settlement` should wait for W5 and V12. `rush_ui` should wait for W1, since without it you cannot turn the UI back off.

---

---

# Part IV — Remediation round 2 + workforce signup architecture (2026-09-01)

**Reviewed:** `b8cd5e7a`, `29e75177`, `437c4a43`, `256e8c8c` (74 files, +2,931/−554) — the response to Part III — plus a new architecture review of workforce signup across Roam Driver and Roam Rush Courier.
**Checks run:** `pnpm --filter @roam/fleet test` → **174 files / 1,103 passed**, 1 skipped, exit 0 · `node scripts/typecheck-fleet-rush.mjs` → **0 Rush-spine errors** · `deno check` on the four Rush edge modules → **exit 0** · `check-courier-fleet-stamp`, `check-fleet-edge-duplicates`, `check-projection-flags-wired` → all pass · `pnpm --filter @roam/platform-settings test` → 21 passed · plus a purpose-built reachability probe against the real `resolveEffectiveModules`.

---

## 21. Part III defects — disposition

**All eight fixed.**

| # | Fix | Evidence |
|---|---|---|
| **W1** | The strict intersection is restored in **both** copies — `effective[key] = lineOn && orgOn`, no short-circuit. The paid-add-on question was answered better than proposed: rather than a second override map, `rushModuleOverridesForServiceLines()` derives the org's `rush_*` overrides from `service_lines`, treating Rush as part of the shared product rather than an upsell that has to defeat the kill switch. `modules.test.ts` now pins the contract, including *"org cannot re-enable when product-line turns freight_dispatch off"* — the exact case the old test wrongly asserted. Enterprise semantics are restored. **But see X1.** | [`modules.ts:290-296`](packages/platform-settings/src/modules.ts#L290), [`enterprise_modules.ts:159-166`](supabase/functions/_fleet-server/enterprise_modules.ts#L159) |
| **W2** | Keyset pagination corrected — `isFirstPage ? .gte(sinceIso) : .gt(cursor)`. The loop now advances and terminates. | [`rush_projection_helpers.ts:43-79`](supabase/functions/_fleet-server/rush_projection_helpers.ts#L43) |
| **W3** | `cron.unschedule` wrapped in its own inner `BEGIN…EXCEPTION`, matching the house pattern, so first-run scheduling succeeds. The outer handler now `RAISE NOTICE`s instead of swallowing silently. | [`20260901150000_rush_trip_recon_cron_fix.sql`](supabase/migrations/20260901150000_rush_trip_recon_cron_fix.sql) |
| **W4** | `denoland/setup-deno@v2` added, and the three pre-existing graph errors in `feature_flags.ts` / `kv_store.tsx` cleared. `deno check` now exits 0 locally. A `typecheck-fleet-rush.mjs` gate was added that filters `tsc` output to the Rush spine — a pragmatic way to gate new code without waiting on the 616-error full-app backlog, and honestly documented as such in the script header. | [`ci.yml:80-97`](.github/workflows/ci.yml#L80), [`scripts/typecheck-fleet-rush.mjs`](scripts/typecheck-fleet-rush.mjs) |
| **W5** | `aggregateRoamCardExpectedByWeek` now branches on `platform.includes('rush')` and uses `amount` directly instead of `Math.abs(netToDriver)`. Covered by [`fleetBankReceive.rush.test.ts`](apps/fleet/src/utils/fleetBankReceive.rush.test.ts) with both the card case (J$300, not J$2,200) and the COD-excluded case. | `fleetBankReceive.ts:183-197` |
| **W6** | `earnings-policy` promoted out of the rideshare-gated flyout onto `hasSharedOps`, so delivery-only orgs can configure courier earnings tiers. | `AppSidebar.tsx:127-133` |
| **W7** | The whole-file `continue` removed from the guard; each `.update({…courier_id…})` block is now evaluated on its own. | [`check-courier-fleet-stamp.mjs:20-40`](scripts/check-courier-fleet-stamp.mjs#L20) |
| **W8** | The gating predicates were extracted into [`sidebarGating.ts`](apps/fleet/src/components/layout/sidebarGating.ts) and are now imported by **both** `AppSidebar` and the tests — so the tests exercise the shipped logic rather than a copy. `e2e/fleet-rush-integration.spec.ts` was rewritten around those real predicates and now covers all three customer shapes (V20 substantially addressed, though still assertion-level rather than browser-level). | `sidebarGating.ts`, `e2e/fleet-rush-integration.spec.ts` |

**Also shipped beyond the register:** a Dominion-side rollout console — `FleetRushRolloutPanel`, `FleetServiceLinesPanel`, `FleetRushModulesReadOnly`, `rushRolloutCatalog.ts` and `rush_rollout_admin.ts` with unit tests — giving flags, service lines and module state one operator surface. Plus six rollout/runbook docs. That is real Phase-6 work and it is the right shape.

### 21.1 Still open from earlier rounds

| # | Status |
|---|---|
| **V9** | Still partial. `scope` reaches `TripLogsPage` (with a real server-side filter) and `useVocab`. Dashboard, Business Finance, Driver Settlements, Reports and exports remain unfiltered. |
| **V12** | Plumbing complete on all four layers — client resolver, edge mirror, and now `loadResolvedEarningsBundleForDriverWeek(driverId, weekStartYmd, serviceLine)`. **Still no caller passes it**: `DriverDetail.tsx:720`, `DriversPage.tsx:547/595`, `DriverDashboard`, `DriverEarnings` and edge `driver_financial_periods.ts` all omit the argument. G14 (one combined per-person statement) remains unimplemented. Acceptable only while `rush_settlement` is off. |
| **V22** | `POST /trips` still unauthenticated; accepted as pre-existing. |

---

## 22. X1 · BLOCKER — Rush modules are now unreachable

Restoring the intersection was correct. The missing half is that **nothing turns the `rush_*` keys on at the product-line level.**

```
DEFAULT_ENTERPRISE_MODULES.rush_couriers = false          ← defaults.ts:78, enterprise_modules.ts:133
productLineModules = { ...DEFAULT_ENTERPRISE_MODULES, ...settings.enabledModules }
effective = lineOn && orgOn                               ← lineOn is false ⇒ effective is false
```

`applyOrgServiceLines` writes `service_lines` and `enabled_modules` on the **organization** only ([`rush_rollout_admin.ts:138-150`](supabase/functions/_fleet-server/rush_rollout_admin.ts#L138)). Nothing in the repo writes `rush_*` into the fleet product-line platform settings. So the org override is always ANDed against a `false`.

Verified empirically against the real functions — a fully configured both-lines org:

```
PRODUCT-LINE rush_couriers = false
ORG override rush_couriers = true
EFFECTIVE  rush_couriers   = false     ← expected true
```

`isModuleEnabled('rush_*')` returns `enabledModules[module] === true`, so `canSeeCourierOps` is false and **no Rush navigation ever renders** — regardless of `service_lines`, the org overrides, or the `rush_ui` flag. Every gate below it is dead code.

This is invisible to the current tests: `modules.test.ts` checks `rushModuleOverridesForServiceLines` in isolation (org map only) and `resolveEffectiveModules` with hand-written product-line maps. Nothing composes the two against the real defaults, which is exactly the gap the probe above fills.

**Fix — pick one:**
- **(a) Recommended.** Default `rush_*` to `true` in `DEFAULT_ENTERPRISE_MODULES` / `DEFAULT_ENTERPRISE_ENABLED_MODULES`, and let the real gates be the org's `service_lines`-derived overrides plus the `rush_ui` flag. Both are already implemented, per-org, and fail closed — the product-line default is then the kill switch, which is what §8 wanted.
- **(b)** Keep the `false` defaults and add a Dominion control that writes `rush_*` into fleet product-line platform settings, wired into `FleetRushRolloutPanel`.

Either way, add the composition test: *"a both-lines org with default platform settings resolves `rush_couriers` true, and flipping the product-line key to false turns it off."* That single test pins both X1 and W1 at once.

---

## 23. Workforce signup architecture — Roam Driver vs Roam Rush Courier

New review, requested 2026-09-01. Question: does Roam Rush Courier follow the same signup procedure as Roam Driver, and is the combined architecture enterprise-grade?

**Short answer: no, they do not match — and the courier flow is the better of the two.** The instinct to align them is right; the direction should be reversed.

### 23.1 Roam Driver — as built

Two entry components, both presenting the **same three archetypes**: [`DriverHybridOnboarding.tsx:170-196`](apps/driver/src/components/onboarding/DriverHybridOnboarding.tsx#L170) (email/phone) and [`DriverGoogleSignupWizard.tsx:344-388`](apps/driver/src/components/onboarding/DriverGoogleSignupWizard.tsx#L344) (Google). Selection is routed in [`App.tsx:48-56`](apps/driver/src/App.tsx#L48).

```
Auth ─▶ "How do you drive?"
         ├─ Independent driver   ─▶ profile wizard                     (mode = independent)
         ├─ Join a fleet         ─▶ paste fleet org UUID ─▶ profile    (mode = fleet)
         └─ Fleet operator/owner ─▶ CTA out to roamfleet.co/signup
```

Joining calls `POST /driver/join-fleet` ([`index.tsx:12163`](supabase/functions/_fleet-server/index.tsx#L12163)), which requires an authenticated `driver` role, checks the org exists, refuses to overwrite an existing membership (409), then writes `user_metadata.organizationId`, the `driver:{uid}` KV record, and `driver_profiles{mode:'fleet', fleet_id}`.

### 23.2 Roam Rush Courier — as built

No archetype screen. A linear wizard with a fleet step inserted between profile and vehicle ([`CourierConsumerApp.tsx:226-244`](apps/dash-courier/src/CourierConsumerApp.tsx#L226)):

```
Splash ─▶ Welcome ─▶ How it works ─▶ Sign up ─▶ Verify ─▶ Profile setup
      ─▶ Fleet invite code  (enter code · or "Skip — I'm an independent courier")
      ─▶ Vehicle ─▶ Documents ─▶ Permissions ─▶ Account pending
```

Joining calls `POST /workforce/invites/accept` with an **8-character invite code** minted by the fleet owner into `fleet.workforce_invites`, validated for expiry, single use, and email/phone binding, with identity taken from the JWT.

### 23.3 Side by side

| Dimension | Roam Driver | Roam Rush Courier |
|---|---|---|
| Archetype chooser | **Yes** — 3 options, both auth paths | **No** — linear wizard |
| Fleet-owner CTA | **Yes** — deep link to `roamfleet.co/signup` | **None anywhere in the app** |
| Join credential | Fleet **org UUID**, pasted | **8-char invite code** |
| Credential issued by | Nobody — it is just the org id | Fleet owner, via `POST /workforce/invites` |
| Owner consents to the join | **No** | **Yes** — they created the invite |
| Expiry | None | 14 days |
| Single use | No — reusable forever by anyone | Yes (`status='pending'` predicate) |
| Bound to a person | No | Yes — `invited_email` / `invited_phone` |
| Revocable | No | Yes — `status='revoked'` |
| Audit trail | None | `created_by`, `accepted_by`, `accepted_at` |
| Identity source | JWT (`rbacUser.userId`) | JWT (`rbacUser.userId`) |
| Already-in-a-fleet guard | **Yes** — 409 | **No** — silently re-points `fleet_id` |
| Step placement | Before profile | After profile, before vehicle |
| Storage | `driver_profiles` + `user_metadata` + KV | `courier_profiles` only |
| Feature-flagged | No | Yes — `rush_courier_link` |

### 23.4 The finding that matters

**S1 · HIGH — `POST /driver/join-fleet` treats a non-secret identifier as a bearer credential.**

Any authenticated driver who obtains a fleet's organization UUID can attach themselves to that fleet. There is no invite, no owner approval, no expiry, no revocation, and no binding to a person. Org UUIDs are not secrets — they appear in admin screens, support threads, exports, and URLs, and a fleet hands the same one to every driver it recruits, forever.

Consequences: an uninvited driver lands on the owner's roster, is eligible for vehicle assignment, and their trips flow into the owner's settlement and P&L. The owner's only remedy is to notice and detach them.

The courier path — which was built *second*, as part of this Rush programme — has every control the driver path lacks. **So the correct remedy is not to make Courier look like Driver. It is to migrate Driver onto the courier's invite model**, and then unify both on one mechanism. `fleet.workforce_invites` was deliberately designed for exactly this: it already carries `service_line ∈ {rideshare, rush_delivery}` and the accept handler already branches to `driver_profiles` for the rideshare case ([`workforce_invite_routes.ts:132-140`](supabase/functions/_fleet-server/workforce_invite_routes.ts#L132)). **The rideshare half of the unified path is already written and simply unused.**

### 23.5 The rest of the register

| # | Sev | Finding |
|---|---|---|
| **S2** | **HIGH** | **No already-in-a-fleet guard on the courier accept path.** `/driver/join-fleet` returns 409 if the driver is already linked; the courier upsert silently overwrites `fleet_id`. A courier can be moved between fleets by accepting any invite — including mid-week, which re-points attribution while `orders.courier_fleet_id` keeps the old value on past orders (correct) but the roster and future orders switch (surprising). Mirror the 409. |
| **S3** | **MEDIUM** | **Roam Rush Courier has no fleet-owner path.** A courier who wants to start a delivery company has nowhere to go — no "Fleet operator / owner" card, no link to `roamfleet.co/signup`, no mention of RoamFleet anywhere in the app (grep: one hit, the invite-code helper text). The whole premise of this programme is that delivery fleet owners are a customer segment; the courier app is the natural top of that funnel and it currently has no door. Driver has had `defaultRoamFleetSignupUrl()` since before this work. |
| **S4** | **MEDIUM** | **The courier fleet step is unlabelled as a choice.** Driver asks "How do you drive?" and makes the archetype explicit; Courier shows a code box with a "Skip — I'm an independent courier" ghost button. Same three outcomes are reachable (independent / fleet / — ), but only two are visible and neither is framed as an identity. A courier who does not yet have a code from their employer will skip, land as independent, and there is no in-app way back — no "join a fleet" entry in courier settings. |
| **S5** | **MEDIUM** | **Two divergent membership models for one concept.** Driver membership lives in three places (`driver_profiles`, `user_metadata.organizationId`, `driver:{uid}` KV) and must be kept in sync by hand; courier membership lives in one (`courier_profiles`). The driver triple-write is the source of the `currentOrg` reconciliation logic at `index.tsx:12190-12196`. Any unified flow should adopt the courier's single-source model, not spread it back out. |
| **S6** | **MEDIUM** | **Invite acceptance is not rate-limited.** 32⁸ ≈ 1.1×10¹² makes blind guessing impractical, and codes are now `crypto`-random with binding and expiry, so this is defence in depth rather than an open hole — but an authenticated endpoint that probes a shared code space should have a per-user attempt limit. |
| **S7** | **LOW** | **Courier invite upsert can create a nameless profile.** `/workforce/invites/accept` upserts `{user_id, mode, fleet_id, fleet_joined_at, fleet_role}` with `onConflict: user_id`. In the shipped wizard the row always exists first (profile-setup runs before the invite step), so this is latent — but a deep link or a failed profile step would insert a profile with no email, name or phone. Make the accept path an `update` that 404s when no profile exists. |
| **S8** | **LOW** | **Step ordering differs for no reason.** Driver asks archetype *before* the profile wizard; Courier asks *after*. Asking first is better — it lets you branch the rest of the wizard (a fleet courier may not need to supply their own insurance, for instance). Align on archetype-first. |

**Verified sound, no action needed:** `ensureCourierProfile` never writes `mode` or `fleet_id`, so later wizard steps cannot clobber an accepted invite — I checked this specifically because the call order (`profile-setup → fleet-invite → vehicle → documents → permissions`, with `ensureCourierProfile` firing at several of those) makes it a plausible failure. It also strips `status` on the existing-row branch, so it cannot undo an approval.

### 23.6 Target architecture — one workforce onboarding contract

```
                    ┌──────────────────────────────────────────┐
                    │  fleet.workforce_invites                 │
                    │  service_line ∈ {rideshare, rush_delivery}│
                    │  code · expiry · single-use · bound       │
                    │  created_by · accepted_by · revocable     │
                    └────────────────┬─────────────────────────┘
                                     │  POST /workforce/invites/accept
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
              driver_profiles                 courier_profiles
              mode · fleet_id                 mode · fleet_id
```

Both apps present the **same three archetypes**, in the same order, with the same words:

| Archetype | Roam Driver | Roam Rush Courier |
|---|---|---|
| Independent | continue to profile | continue to profile |
| Join a company | **invite code** (replacing the org UUID) | invite code *(already built)* |
| Owner / operator | CTA → `roamfleet.co/signup?line=rideshare` | CTA → `roamfleet.co/signup?line=rush_delivery` |

Four properties make this enterprise-grade, and three of the four already exist on the courier side:

1. **Consent is explicit and mutual.** Joining requires an artefact the owner deliberately created. Today only Courier has this.
2. **Membership is revocable and auditable.** Who invited whom, when, and who accepted. Today only Courier has this.
3. **One join mechanism, two profile tables.** The accept handler already branches correctly; the rideshare branch just has no caller.
4. **Both apps are funnel tops for RoamFleet.** Driver already links out; Courier must too — and the link should carry the service line so the fleet signup wizard pre-selects it (§6.1 Step 3 already accepts a multi-select).

### 23.7 Migration — additive and reversible

1. **Add the archetype screen to Roam Rush Courier**, reusing the driver copy and card styling, with the fleet-owner CTA carrying `?line=rush_delivery`. Closes S3, S4, S8. UI only — no schema change.
2. **Add "Join a fleet" to courier settings** so a courier who skipped can join later without reinstalling. Closes the S4 dead end.
3. **Mirror the 409 guard** into the courier accept handler; convert the upsert to an update-or-404. Closes S2, S7.
4. **Issue invites for rideshare** — expose `serviceLine: 'rideshare'` in the fleet owner's invite UI. The server already supports it. No new code server-side.
5. **Switch the driver app's "Join a fleet" step from org UUID to invite code**, pointing at `/workforce/invites/accept`. Keep `/driver/join-fleet` alive behind a flag for one release so in-flight signups do not break. Closes S1.
6. **Deprecate `/driver/join-fleet`** once telemetry shows no traffic; keep the 409 guard logic by porting it into the shared accept handler.
7. **Consolidate driver membership** onto `driver_profiles` as the single source, with `user_metadata.organizationId` and the KV record demoted to derived caches. Closes S5. Do this last — it touches the RBAC org resolution path.
8. **Add per-user rate limiting** to the accept endpoint. Closes S6.

Steps 1–4 are independent, ship in any order, and touch no existing driver behaviour. Step 5 is the one that needs a flag and a release window.

---

## 24. Current gate

**Build:** 174 test files / 1,103 tests pass · Rush-spine typecheck 0 errors · `deno check` exit 0 · all four CI guards pass.

| Action | Blocked on |
|---|---|
| Fix **X1** | — do this first; it is a one-line default change plus a composition test |
| Enable `rush_courier_link` for a pilot org | nothing — V1/V2 closed, invite path is sound |
| Enable `rush_ui` | **X1** (until then it renders nothing) |
| Enable `rush_trip_projection` | nothing — W2 closed, recon cron scheduled |
| Enable `rush_settlement` | **V12** — the `serviceLine` argument still has no caller, so there is no per-line tier resolution and no combined per-person statement |
| Pilot with a both-lines customer | **V9** — the scope switcher still does not filter dashboards, Business Finance, settlements, reports or exports |
| Ship the unified signup | **S1–S8**, sequenced in §23.7 |

---

---

# Part V — X1 + signup remediation verification (2026-09-01)

**Reviewed:** `6fc3d15f`, `03768c4f`, `b5573dd1` (28 files, +576/−59) — the response to Part IV.
**Checks run:** `pnpm --filter @roam/fleet test` → **175 files / 1,105 passed**, 1 skipped, exit 0 · `pnpm --filter @roam/platform-settings test` → **24 passed** · `node scripts/typecheck-fleet-rush.mjs` → **0 Rush-spine errors** · all three CI guards pass.

---

## 25. Fixed and verified

### 25.1 X1 — closed, the right way

Option (a) taken: `rush_*` now default `true` in both `DEFAULT_ENTERPRISE_ENABLED_MODULES` and the Deno mirror, leaving the real gates as the org's `service_lines`-derived overrides plus `rush_ui`. The composition test asked for in §22 was written, and it covers all three cases rather than just the happy path ([`modules.test.ts:84-131`](packages/platform-settings/src/modules.test.ts#L84)):

- a both-lines org on default platform settings resolves `rush_couriers` **true** — the reachability case;
- a product-line `rush_couriers: false` **defeats** the org's `true` — the kill switch still holds, pinning W1;
- a rideshare-only org resolves every `rush_*` key **false** — the org-level derivation does the gating.

Worth noting the Enterprise blast radius was considered: because `rushModuleOverridesForServiceLines` drives the org half off `service_lines`, and the V18 migration reset enterprise `delivery` orgs to `['rideshare']`, flipping the product-line default to `true` does **not** switch Rush modules on for Enterprise tenants. The third test case is what pins that.

### 25.2 V9 — closed

Scope filtering now reaches the full §5.5 surface, not just Trip Logs. A `useServiceLineScopeParam` hook and a `filterLedgerByServiceLineScope` helper (with tests) were added, and `scope` is consumed by:

`Dashboard` · `fetchBusinessFinanceBundle` / `useBusinessFinanceBundle` · `DriverSettlementsPage` · `ReportsPage` · `DriversPage` · `DriverDetail` · `TripLogsPage` · `useVocab` · `AppSidebar`

That is every surface §5.5 named. The switcher is no longer cosmetic.

### 25.3 V12 — closed

`serviceLineParam` is now actually passed: [`DriverDetail.tsx:722`](apps/fleet/src/components/drivers/DriverDetail.tsx#L722) → `loadResolvedEarningsBundleForDriverWeek(driverId, undefined, serviceLineParam)`, and `DriversPage.tsx:228`. The edge side gained matching trip filtering and a per-line participation check in [`driver_financial_periods.ts:210-231`](supabase/functions/_fleet-server/driver_financial_periods.ts#L210). Per-service-line earnings policies are live rather than plumbing.

### 25.4 Signup findings

| # | Fix | Evidence |
|---|---|---|
| **S2** | 409 guard mirrored onto the courier branch — accepting an invite for a different fleet is refused rather than silently re-pointing `fleet_id`. Added to the rideshare branch too. | [`workforce_invite_routes.ts:139-142, 156-159`](supabase/functions/_fleet-server/workforce_invite_routes.ts#L139) |
| **S3** | `CourierWorkforceArchetypePage` adds the missing fleet-owner door, with `roamfleet.co/signup?line=rush_delivery`. | [`CourierWorkforceArchetypePage.tsx`](apps/dash-courier/src/pages/onboarding/CourierWorkforceArchetypePage.tsx) |
| **S6** | Per-user rate limit on accept — 20 attempts / 15 min, returning 429. | [`workforce_invite_rate_limit.ts`](supabase/functions/_fleet-server/workforce_invite_rate_limit.ts) |
| **S7** | Courier branch converted from blind upsert to select-then-update, returning **404** when no profile exists. No more nameless profiles. | `workforce_invite_routes.ts:131-138` |
| **S8** | Archetype now asked **first** — `how-it-works → workforce-archetype → sign-up` — and the chosen path routes `profile-setup` to either `fleet-invite` or straight to `vehicle-setup`. Matches the driver ordering. | [`CourierConsumerApp.tsx:215-252`](apps/dash-courier/src/CourierConsumerApp.tsx#L215) |
| **S1** | *Partial* — the hybrid driver path switched to `api.acceptWorkforceInvite(code)`, with `joinFleetByFleetId` marked `@deprecated`. See Y1/Y2. | `DriverHybridOnboarding.tsx`, `apps/driver/src/services/api.ts:672-691` |

---

## 26. NEW defects

### Y1 · HIGH — the Google signup path still joins fleets by org UUID

`DriverHybridOnboarding` was migrated. [`DriverGoogleSignupWizard.tsx`](apps/driver/src/components/onboarding/DriverGoogleSignupWizard.tsx) was not:

```ts
const [fleetId, setFleetId] = useState('');        // :69
…
const id = fleetId.trim();                          // :284
await api.joinFleetByFleetId(id);                   // :291
```

Both components render the same three archetypes and [`App.tsx:48-56`](apps/driver/src/App.tsx#L48) picks between them by auth provider — so for every driver who signs up with Google, S1 is untouched: paste a non-secret org UUID, land on that fleet's roster, no invite, no owner consent, no expiry, no revocation.

The two components have now **diverged**, which is worse than either state alone: the same product offers two "Join a fleet" screens with different credentials, different security properties, and different error copy. Whichever survives, they should share one component.

### Y2 · HIGH — `POST /driver/join-fleet` is still live and unflagged

The client-side migration does not close the hole — the endpoint is the vulnerability, and it is unchanged at [`index.tsx:12163`](supabase/functions/_fleet-server/index.tsx#L12163). Any authenticated driver can still POST an org UUID directly.

§23.7 step 5 called for keeping it "alive behind a flag for one release". It is alive, but there is no flag, no deprecation header, and no telemetry to tell you when traffic reaches zero — so there is no signal that would ever let you retire it. And because Y1 means the Google path still depends on it, it cannot simply be deleted today.

**Fix:** close Y1 first, then put the route behind `FEATURE_FLAGS.LEGACY_DRIVER_JOIN` defaulting off, with a log line on every call.

### Y3 · HIGH — a driver who joins by invite code never reaches the fleet owner's roster

The two join paths write different things.

`/driver/join-fleet` (legacy) writes **three** places — `user_metadata.organizationId`, the `driver:{uid}` KV record (creating it with `organizationId` when absent), and `driver_profiles` via `upsertDriverProfileFromServer` ([`index.tsx:12203-12235`](supabase/functions/_fleet-server/index.tsx#L12203)).

`/workforce/invites/accept` (new, now preferred) writes **one** — `driver_profiles` only:

```ts
await deps.supabase.from("driver_profiles").upsert({
  user_id: userId, mode: "fleet", fleet_id: fleetId, fleet_joined_at: …,
}, { onConflict: "user_id" });
```
([`workforce_invite_routes.ts:160-165`](supabase/functions/_fleet-server/workforce_invite_routes.ts#L160))

But the fleet owner's roster does not read `driver_profiles`. `GET /drivers` resolves through `listByOrg("drivers", orgId)` against `fleet.drivers` ([`index.tsx:2915-2927`](supabase/functions/_fleet-server/index.tsx#L2915)) — the table fed by the `driver:{uid}` KV record. No KV record, no `fleet.drivers` row, **no driver on the roster**: not listed, not assignable to a vehicle, no trips attributed, no settlement.

This is exactly the S5 finding (three sources of truth for driver membership) turning into a live bug: the new path picked the one source the fleet side does not consult. Note the courier branch has no equivalent problem — `courier_profiles` genuinely is the single source there, which is why the courier flow works.

**Fix:** have the rideshare branch call the same `upsertDriverProfileFromServer` + KV write that `/driver/join-fleet` uses — ideally by extracting that block into one `linkDriverToFleet(userId, fleetId)` helper both routes call, which also fixes S5 by construction. Add an integration test asserting the driver appears in `GET /drivers` after accepting an invite.

### Y4 · MEDIUM — the archetype choice is lost across email verification

`workforceChoice` is component state (`useState`, [`CourierConsumerApp.tsx:79`](apps/dash-courier/src/CourierConsumerApp.tsx#L79)) and is never persisted, while the wizard already has a `signupDraft` module imported in the same file for exactly this purpose.

The phase order is `workforce-archetype → sign-up → verify → profile-setup → (fleet-invite | vehicle-setup)`. Verification typically means leaving the app for an email or SMS link. On return the component remounts, `workforceChoice` resets to `'independent'`, and `profile-setup` routes straight past `fleet-invite`. The courier silently completes onboarding as independent — having explicitly chosen "Join a delivery company" three screens earlier.

**Fix:** persist the choice into `signupDraft` alongside the other wizard fields.

### Y5 · MEDIUM — still no way to join a fleet after onboarding

S4 flagged that a courier who skips has no route back. The archetype screen improves discovery but does not fix the dead end: a repo-wide grep of `apps/dash-courier/src` for "join a fleet" / "invite code" outside the onboarding folder returns nothing. Combined with Y4 — which can drop a courier into the independent path against their stated choice — the missing settings entry is now load-bearing rather than a nicety.

**Fix:** add a "Join a fleet" row in courier profile/settings that reuses `FleetInviteCodePage`.

### Y6 · LOW — hardcoded production URL in the courier archetype screen

```ts
const FLEET_SIGNUP_URL = 'https://roamfleet.co/signup?line=rush_delivery';
```

The driver app resolves the same link through `defaultRoamFleetSignupUrl()` ([`utils/googleDriverSignup.ts`](apps/driver/src/utils/googleDriverSignup.ts)), so dev and staging builds point at their own environment. The courier constant sends every build to production. Use the shared helper and append the `line` parameter.

### Y7 · LOW — the accept rate limit is per-isolate, not global

`acceptAttempts` is a module-level `Map` in the edge function. Supabase edge functions scale horizontally and recycle isolates, so the effective limit is 20 attempts *per warm instance*, and it resets on cold start. As defence-in-depth behind auth, binding and expiry that is acceptable — but it should not be described as a global limit. If it ever needs to be one, back it with the KV store the way the other counters in `_fleet-server` are.

---

## 27. Current gate

**Build:** 175 test files / 1,105 tests · platform-settings 24 tests · Rush-spine typecheck 0 errors · `check-courier-fleet-stamp`, `check-fleet-edge-duplicates`, `check-projection-flags-wired` all pass.

| Action | Blocked on |
|---|---|
| Enable `rush_courier_link` for a pilot org | **clear** |
| Enable `rush_ui` | **clear** — X1 closed, reachability pinned by test |
| Enable `rush_trip_projection` | **clear** |
| Enable `rush_settlement` | **clear** — V12 closed; still run one week of manual reconciliation per §7 Phase 3 exit criteria before trusting it |
| Pilot with a both-lines customer | **clear** — V9 closed |
| Announce invite-code onboarding for **rideshare** drivers | **Y1, Y3** — half the signups still use the UUID path, and invite-code joiners do not appear on the roster |
| Retire `POST /driver/join-fleet` | **Y1, Y2** |
| Rely on the courier archetype choice | **Y4, Y5** |

Suggested order: **Y3** (it silently breaks the flow you just made preferred), then **Y1** (share one join component between the two driver wizards), then **Y2** (flag and instrument the legacy route), then Y4/Y5 together, then Y6/Y7.

The Rush programme itself is done. What is left is finishing the workforce-signup unification that Part IV started — and the remaining items are all in the rideshare half, not the Rush half.

---

*Design audit 2026-08-31; verification passes II–V on 2026-09-01, the last against `b5573dd1` on branch `main`. No code was modified in any pass. Re-run Part V after Y1–Y3 are closed; re-run the design audit before Phase 2 if the `delivery` or `fleet` schemas change.*
