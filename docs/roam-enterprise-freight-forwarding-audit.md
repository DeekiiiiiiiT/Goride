# Roam Enterprise / Freight Forwarding — Architecture Audit

**Scope:** Turn `roamenterprise.co` from a marketing shell into a real, production-grade, multi-tenant B2B product, starting with a Freight Forwarding/Courier business vertical.
**Method:** Read-only audit across frontend (`apps/enterprise`, `apps/fleet`), backend (`supabase/migrations`, `supabase/functions`), shared packages (`packages/*`), and platform governance (`apps/admin` "Dominion"). No code was changed.
**Status:** Audit only — no implementation decisions have been made yet. Section 9 lists open questions that need your decision before work starts.

---

## 1. Executive Summary

`apps/enterprise` is **100% a pre-login marketing website** — 16 static routes, zero auth, zero data layer, zero business logic. It declares `@roam/auth-client`, `@roam/business-config`, `@roam/api-client`, `@roam/ui`, `@roam/types`, and `@supabase/supabase-js` as dependencies but imports none of them anywhere.

Meanwhile, large parts of the *rest* of the codebase already anticipate "Roam Enterprise" as a product:

- `packages/platform-settings` already has `'enterprise'` as a first-class settings segment.
- The `organizations` table already has a `product_line CHECK IN ('fleet','enterprise')` column and a `business_type` enum that already includes `trucking` and `shipping`.
- `apps/fleet` already has an `IS_ENTERPRISE_PRODUCT` flag, an `X-Roam-Product-Line` header, and enterprise-specific branching in its login page, admin settings, and PWA manifest.
- Dominion (`apps/admin`) already **enforces** `enabledBusinessTypes` server-side at signup — this is not cosmetic.

**The uncomfortable finding:** the codebase and the docs (`docs/products/PRODUCT_LINES.md`) describe an *intended* architecture where **`apps/fleet` itself gets deployed a second time** as the authenticated Enterprise product (differentiated only by a build-time env flag), with `apps/enterprise` staying a pure marketing front door. That is a fundamentally different build plan than "build a real app inside `apps/enterprise`." **This is the single biggest decision to resolve before any implementation starts** — see §2.

Everything else in this document — schema gaps, reusable modules, redundancies, production-readiness gaps — is organized underneath that decision.

---

## 2. The Fork in the Road (decide this first)

### Path A — "Enterprise rides on Fleet" (what the codebase is already halfway built for)
Deploy the existing `apps/fleet` admin portal a second time, as the authenticated app behind `roamenterprise.co`, distinguished by `VITE_PRODUCT_LINE=enterprise` (already wired: `apps/fleet/src/config/productLine.ts`, `LoginPage.tsx`, `PlatformSettings.tsx`, `pwaMeta.ts`). `apps/enterprise` remains the pure marketing/pre-login site and just deep-links "Sign In" / "Get Started" into that deployment. Freight Forwarding becomes a new vertical module inside the Fleet codebase, following the same pattern as `fuel`/`toll`/`business-finance` — gated by `businessType` and rendered inside the same shell (`AppLayout`, `AppSidebar`, `PermissionGate`).

- **Pros:** Reuses a mature, tested shell (routing pattern aside), the offline/PWA layer, the services/hooks pattern, `business-finance`, and an already-enforced signup/tenancy flow. Dramatically less net-new work. Matches what `docs/products/PRODUCT_LINES.md` already describes as the target state.
- **Cons:** Freight Forwarding UI has to live inside Fleet's rideshare-flavored vocabulary/nav (`AppSidebar`, `BusinessConfigContext`) unless that's generalized first. Fleet's own tech debt (giant string-routed `App.tsx`, two disconnected settings systems) comes along for the ride.

### Path B — "Enterprise is its own app" (what you asked for literally)
Build real, authenticated product functionality directly inside `apps/enterprise`, reusing shared **packages** (`@roam/ui`, `@roam/auth-client`, `@roam/admin-core`, `@roam/platform-settings`) but not Fleet's app-level code. This means building a second admin shell, router, sidebar, auth context, and data layer essentially from scratch.

- **Pros:** Clean slate — no rideshare vocabulary to strip out, freedom to fix Fleet's known tech debt from day one (real router, unified settings layer, RLS-only tenancy).
- **Cons:** Duplicates a lot of shell-building work Fleet already paid for. Diverges from what the docs currently describe. Two admin shells to maintain long-term unless `admin-core`/a new `@roam/app-shell` package is extracted to keep them in sync.

### Recommendation
Lean toward **Path A**, because the enforcement, tenancy, and settings plumbing for "enterprise" already exist and are live in production paths (signup rejects disabled business types server-side today). Path B is the "clean" answer but means re-deriving infrastructure Path A gets for free. A hybrid is also possible: Path A for the initial Freight Forwarding launch to move fast, with an explicit plan to extract Fleet's shell into a shared `@roam/app-shell` package later so Enterprise can eventually stand alone. **This needs your explicit sign-off before scoping tasks 3 onward — the rest of this audit is written to be useful either way, but the task breakdown will differ.**

---

## 3. Current State Inventory

### `apps/enterprise` (today)
- `src/pages/*.tsx` (16 static routes: Home, Rides, Driver, Haul, Fleet, Dash, Enterprise, About, Careers, Safety, Help, Contact, Privacy, Terms, Cookies, Accessibility) + matching `*Sections.tsx` components + `lib/*Content.ts` copy objects.
- Flat `react-router-dom` `<Routes>` in `App.tsx`, no nested/protected routes, no lazy loading, no 404 handler.
- Only one context: `ThemeContext` (light/dark). No `AuthProvider`, no `QueryClientProvider`, no error boundary at root.
- No `hooks/`, `services/`, or `types/` directories exist.
- Own local Tailwind `@theme` token set in `index.css`, independent from Fleet's and Admin's.
- Declared-but-unused dependencies: `@supabase/supabase-js`, `@roam/auth-client`, `@roam/api-client`, `@roam/business-config`, `@roam/ui`, `@roam/types`.
- `vercel.json` confirms `roamenterprise.co` builds `@roam/enterprise` via `pnpm --filter @roam/enterprise build`; root `package.json` already has `dev:enterprise`/`build:enterprise` scripts wired.
- No genuine dead code beyond a "coming soon" language selector in the footer — this is a clean, well-organized marketing site, just not a product.

### Naming collisions to not fall into (found during this audit)
1. **`docs/enterprise-inventory.md`** and migrations `20260801120000_enterprise_inventory_foundation.sql` / `20260802120000_enterprise_inventory_rpcs.sql` — this is **Roam Rush merchant restaurant inventory** ("advanced inventory mode" for a Dash Partner), unrelated to the B2B Roam Enterprise product. Don't reuse or reference this schema when building freight inventory/assets.
2. **`rides.haulage_categories` / `haulage_items`** — this is a catalog of item categories for booking a Roam Haul *consumer moving job*, not a freight/logistics domain model. Not reusable for Freight Forwarding despite the name proximity.
3. **`@roam/vertical-config`** — despite the name, its `VerticalType` is `restaurant | grocery | convenience | retail | pharmacy | alcohol` (Dash merchant verticals). Do not extend this for Freight/Taxi/Trucking/Shipping — it's a different axis entirely.

---

## 4. What Already Exists & Is Reusable

### Frontend shell (from `apps/fleet`, applies mainly under Path A, still informs Path B)
- `AppLayout` (sidebar + header + announcement banner + content), `SidebarProvider`, `NavSection`/`NavFlyout`/`NavItem` primitives, `PermissionGate` — reusable as-is.
- Nav-item gating pattern: `permission ∧ feature-flag(module) ∧ business-type` — exactly the composition Freight Forwarding needs (gate freight nav items by a `freight_forwarding` business type once it exists).
- Services-wrap-fetch + hooks-wrap-services pattern (`src/services/*.ts` + `src/hooks/*`) using `getHeaders()`/`requireAuthHeaders()` that auto-inject JWT + `X-Roam-Product-Line` — reusable pattern for any new Freight services.
- Offline/PWA layer (`OfflineProvider`, `offlineStorage`, `SyncCenter`) — reusable *if* Freight has a field app (e.g., a courier/driver mobile portal with connectivity gaps); not needed for back-office freight-ops screens.

### Candidate modules to carry over
| Module | Verdict | Notes |
|---|---|---|
| `business-finance` | **Reuse as-is** | Core types (money, period, P&L) barely coupled to vehicle/trip — best-fit for freight client billing/general ledger. |
| `claimable-loss` | **Reuse with relabeling** | Generic claim/dispute list-and-resolve pattern; works for cargo/insurance claims with renamed entities. |
| `fuel` | **Generalize** | Legit freight/trucking need (fuel spend, cards, disputes) but hardcoded to vehicle/driver — repoint FKs at Enterprise's own fleet entities. |
| `toll` / `toll-tags` (+ `@roam/toll-ui`) | **Generalize** | Most vertical-agnostic of the group — plazas/tags apply to any vehicle. Check `@roam/toll-ui` first before copying app-level components. |
| `driver-portal` | **Shell reusable, content is not** | `DriverLayout`/theme/common scaffolding reusable; trip/earnings-centric content needs a parallel "Courier/Carrier portal" built around shipments. |
| `performance` | **Don't reuse** | Rideshare driver-safety KPIs (at-risk, safety/efficiency); Freight needs its own KPI set (on-time delivery, dwell time, exceptions). |

### Backend / data
- `organizations` table already has `product_line` and `business_type` (including `trucking`, `shipping`) — the tenant model already anticipates this.
- Postgres RLS is the real, DB-enforced isolation mechanism for financial data (`ledger.*` schema + RLS wave migrations) — this is the pattern to imitate for new Freight tables, **not** the KV-store app-level filtering used elsewhere in Fleet (see §6, redundancy #4).
- `unifiedLedger` (`supabase/functions/_shared/unifiedLedger/postEntry.ts`) is a working double-entry ledger substrate with idempotency keys and per-product account namespacing — the right foundation for Freight invoicing/billing, once a `roam_enterprise` (or `roam_freight`) product key is added to its enum.
- `platform_settings.ts` on the backend already has segment-aware KV keys including `enterprise`.

### Packages
- `@roam/admin-core` — genuinely product-agnostic (`ProductLineSettingsPage` is already parameterized by `segment`, including `'enterprise'`). Ready to host Enterprise admin surfaces with no fork needed.
- `@roam/ui` — real shadcn/Radix component library, reusable directly.
- `@roam/location` — geocode/address-search/maps-loader, directly reusable for freight pickup/dropoff/route needs.
- `@roam/api-client`, `@roam/auth-client` — reusable patterns, but need Enterprise-specific additions (see §5).

---

## 5. Gaps to Fill (Freight Forwarding specifically)

### Schema (net-new — nothing in the current DB models this)
No table anywhere models freight/logistics concepts. Repo-wide search for `freight|consignment|carrier|shipment|customs|waybill` returned nothing relevant. Needed, at minimum:
- `shipments` (top-level booking: origin, destination, client/org, status)
- `shipment_legs` (multi-leg routing — freight forwarding is rarely point-to-point)
- `consignments` / `packages` (what's actually being shipped, weight/dimensions/value/hazmat flags)
- `carriers` (3PL/carrier partners, capacity, rate agreements — distinct from Roam's own driver/vehicle fleet)
- `tracking_events` (status/location history per shipment or leg — analogous to `order_events` in the delivery domain, but shipment/leg-scoped not single-order-scoped)
- `customs_documents` / `waybills` (document references, likely pointing at a new document-storage layer — see below)
- `rate_cards` / `client_pricing` (how a shipment gets priced/billed)
- Link into `unifiedLedger` for invoicing once a shipment is billed.
- All of it should use **table + RLS** tenancy (organization_id + policy), matching the `ledger.*` pattern — not the KV-store `org_scope.ts` filtering pattern.

### Domain package
- No `@roam/freight-types` (or extension of `@roam/types`) exists yet — needed for shipment/consignment/carrier/tracking types shared between frontend and edge functions.
- No document/file-upload package exists anywhere in `packages/` — needed for customs docs, bills of lading, proof-of-delivery photos.
- No notifications package exists — needed for shipment status updates to clients/carriers (email/SMS/push).

### Ledger integration
- Add a `roam_enterprise` (or `roam_freight`) value to `unifiedLedger`'s product enum.
- Define an account-key namespace convention for freight (mirroring the existing `user:{id}:driver:` convention).

### Auth client
- `@roam/auth-client` has per-app Supabase client factories (`supabaseFleetAdmin`, `supabaseDriverApp`, etc.) but **no `supabaseEnterpriseApp`/`supabaseEnterpriseAdmin` export exists yet** — needs adding regardless of Path A/B.

---

## 6. Redundancies & Inconsistencies to Resolve

1. **Business-type list duplicated in 4+ places with no single source of truth**: `packages/admin-core/.../ProductLineSettingsPage.tsx` (`BUSINESS_TYPE_DEFS`), `supabase/functions/_fleet-server/product_line.ts` (`ALL_BUSINESS_TYPES`), `apps/fleet/src/utils/businessTypes.ts` (`BUSINESS_TYPES`), `packages/business-config/src/businessTypes.ts` (`BUSINESS_TYPES` + `SIDEBAR_VISIBILITY`), plus a `BusinessType` union in `packages/types`. Every change (like adding Freight Forwarding or removing Rideshare from Enterprise) currently means editing 5 files by hand and hoping they stay in sync. **Recommend consolidating to one canonical source** (likely `@roam/business-config`) that the others import from.
2. **`@roam/roam-shared` vs `@roam/ui`** both ship a full, diverging `ErrorBoundary` implementation. Pick one, deprecate the other.
3. **Design tokens duplicated three times**: `apps/fleet/src/styles/globals.css`, `apps/admin/src/styles/globals.css`, and `apps/enterprise/src/index.css` each define independent Tailwind `@theme` CSS variable sets with drift between them. Building a fourth surface (a real Freight product UI) on top of this will make the drift worse. Recommend extracting a `@roam/design-tokens` package before or during this build.
4. **Two parallel tenancy/isolation mechanisms in the backend**: real Postgres RLS (ledger/inventory tables) vs. app-level KV-store filtering (`org_scope.ts`, with an "insecure by default unless a strict-mode flag is on" fallback for legacy unscoped records). New Freight schema should be RLS-only from day one — don't inherit the KV-filter pattern.
5. **Two disconnected settings systems inside Fleet**: the tenant-owner-level `SettingsPage.tsx` (ad hoc KV `getPreferences`/`savePreferences`, no shared types) vs. the platform-admin-level `ProductLineSettingsPage` (backed by `@roam/platform-settings` types and merge logic). They don't share a schema. Don't repeat this split for Enterprise — design one settings layer that both the tenant-owner UI and Dominion's admin UI read from.
6. **`BusinessConfigContext`'s business-type resolver** has three independently copy-pasted fallback layers (KV → `user_metadata` → `localStorage`), each with its own try/catch, instead of one reusable resolver function.
7. **`App.tsx` string-based router accumulates redirect cruft** from renames done in place (e.g., `tier-config-legacy` → `earnings-policy`) rather than via a real route table. If Path A is chosen, don't extend this pattern for Freight's new pages — at minimum introduce a route registry; ideally migrate to real routing.
8. **Mock/placeholder logic surviving in "production" paths**: a hardcoded "John Doe / Fleet Manager" avatar in `AppSidebar.tsx`, and a fake 1.5s-timeout data export in `SettingsPage.tsx`. Worth an explicit check that these don't get copy-pasted into whatever ships for Enterprise.
9. **`platform-settings`'s `'enterprise'` segment is a label, not a real schema** — `DEFAULT_ENTERPRISE_SETTINGS` is literally `FleetProductSettings` relabeled (`fleetTimezone`, `enabledModules` built from Fleet's module set). It looks done (the segment plumbing exists end-to-end) but isn't — there's no Enterprise-specific settings shape yet (per-vertical config, billing plan, etc.). Don't mistake segment-wiring for domain-modeling.

---

## 7. Cross-Cutting Production-Readiness Gaps

- **No schema validation library anywhere in the monorepo** (no zod or equivalent found in any `package.json`). A brand-new domain with multi-leg shipments, customs data, and carrier integrations is exactly the kind of surface area that benefits from runtime validation at the API boundary — worth introducing as part of this build rather than after.
- **Uneven test coverage in Fleet's services** (most `src/services/*.ts` files have no `.test.ts` sibling). Set an explicit coverage bar for new Freight domain services (shipments, customs, carrier integration) from day one instead of inheriting Fleet's uneven pattern.
- **No shared, generic typed API/query layer** beyond header helpers in `@roam/api-client` — each app hand-rolls its `services/*.ts` fetch wrappers. Worth deciding whether Freight's services follow the same hand-rolled pattern or whether this is the moment to add a thin shared client.
- **Single Supabase Auth tenant, no shared identity/authorization library** — every edge function does its own `supabase.auth.getUser()` + ad hoc role checks (`requireProductAdmin`, `resolveMerchantAccess`, etc.). Freight's edge functions will need their own equivalent (`requireEnterpriseAccess` or similar) — there's no existing shared authorization middleware to import, only patterns to imitate.
- **`_fleet-server` is a single monolithic Hono app**, not a clean externally-callable service boundary — tightly coupled to Fleet's KV store, RBAC, and org-scope helpers all in one file. Freight likely needs its own edge function(s) rather than bolting onto `_fleet-server` directly, even under Path A.

---

## 8. Dominion (`apps/admin`) Changes Required

Confirmed: `enabledBusinessTypes` is **actively enforced**, not cosmetic — `_fleet-server/product_line.ts`'s `isEnabledBusinessType()` is called server-side at signup and rejects registrations for disabled business types. This means:

1. **Removing Rideshare from Enterprise** is not a simple toggle-off — the toggle list (`BUSINESS_TYPE_DEFS` in `ProductLineSettingsPage.tsx`) is currently one shared array rendered for every segment. It needs to become segment-aware (exclude `rideshare` when `segment === 'enterprise'`), and `DEFAULT_ENTERPRISE_SETTINGS` needs `rideshare` stripped from its default-enabled set (`packages/platform-settings/src/defaults.ts`). Also decide what happens to any Enterprise customer already flagged `businessType: 'rideshare'` (if any exist) — a data-migration question, not just a UI one.
2. **Adding Freight Forwarding/Courier as a real business type** means updating the redundant list in all 4+ places identified in §6 redundancy #1 — this is the moment to fix the "no single source of truth" problem rather than adding a 5th duplicate.
3. **Customer Accounts / Team Members are already parameterized by `productLine`** and reused from Fleet's components (`<CustomerAccounts productLine="enterprise"/>`) — this part is genuinely ready, no changes needed for a new business type.
4. **No per-business-type settings branching exists anywhere in Dominion today** — Business Types is a flat allow/deny list. If Freight Forwarding needs its own settings (e.g., default customs document requirements, carrier integration credentials), that's new UI work, not an extension of an existing pattern.

---

## 9. Open Questions (need your decision before task breakdown)

**Locked 2026-07-31 (Path B):**

1. **Path B** — authenticated product inside `apps/enterprise` (not Fleet ×2).
2. **Back-office only** for v1 — no field/courier app.
3. **Consolidate business types now** — `@roam/types` + `@roam/business-config`.
4. **Design tokens** before Freight UI polish (`@roam/design-tokens`).
5. **Own fleet + 3PL** carriers from day one.
6. **Domestic Jamaica first** — customs deferred.

---

## 10. Suggested High-Level Build Sequence (once §9 is answered)

This is a sequencing sketch, not a task breakdown — intended to show dependency order, not effort/time estimates.

1. Resolve the Path A/B decision and the business-type single-source-of-truth question — everything downstream depends on this.
2. Land the Freight schema (shipments/legs/consignments/carriers/tracking_events/documents) with RLS-only tenancy, plus the `roam_enterprise` ledger product key.
3. Add Freight Forwarding to the business-type system end-to-end (Dominion toggle, signup enforcement, sidebar visibility) and remove Rideshare from Enterprise's list, per §8.
4. Stand up the Enterprise product shell (either Path A's env-flagged Fleet deployment, or Path B's new app) with auth wired (`supabaseEnterpriseApp`/`Admin` client additions to `@roam/auth-client`).
5. Build the Freight domain module (shipment CRUD, tracking, carrier assignment) as the first vertical, wiring in the reusable modules from §4 (business-finance for billing, claimable-loss for cargo claims, location for pickup/dropoff).
6. Carry over generalized fuel/toll modules if Freight's own fleet (not third-party carriers) needs them.
7. Production-readiness pass: validation library, test coverage bar, document/notification packages, design-token consolidation.
