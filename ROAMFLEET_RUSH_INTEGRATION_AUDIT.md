# RoamFleet × Roam Rush — Multi-Service-Line Integration Audit

**Date:** 2026-08-31
**Scope:** How to add the Roam Rush product family (`roamrush.app`, `courier.roamrush.app`, `partner.roamrush.app`) into `roamfleet.co` as a second service line, serving three customer shapes: rideshare-only, delivery-only, and both.
**Method:** Static read of `apps/fleet` (1,081 TS/TSX files), `apps/dash-courier` (175), `apps/dash-customer` (163), `apps/rush-command` (277), `apps/enterprise` (196), `supabase/functions/_fleet-server`, `supabase/functions/delivery`, `supabase/functions/matching`, and 437 migrations. **No code was changed.**
**Companions:** [ROAMRUSH_SYSTEM_AUDIT.md](ROAMRUSH_SYSTEM_AUDIT.md) · [docs/FINANCIAL_INTEGRITY_AUDIT.md](docs/FINANCIAL_INTEGRITY_AUDIT.md) · [docs/MULTI_VERTICAL_COMPATIBILITY.md](docs/MULTI_VERTICAL_COMPATIBILITY.md) · [RUSH_MARKETPLACE_PRICING_MIGRATION.md](RUSH_MARKETPLACE_PRICING_MIGRATION.md)

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

---

*Audit performed 2026-08-31 against the working tree at branch `main`. No code was modified. Re-run before Phase 2 if the delivery or fleet schemas change.*
