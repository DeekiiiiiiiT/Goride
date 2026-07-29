# RoamDash Merchant (`apps/dash-merchant`) — Production Readiness Audit

**Date:** 2026-07-29
**Scope:** `apps/dash-merchant` (the restaurant/merchant-partner web app) — core dashboard/orders/menu/analytics/earnings/settings, the staff-ops/POS/kitchen-display surface, the enterprise-inventory module, the embedded "Dash" admin portal (`src/admin`), and the backend surfaces they depend on (`supabase/functions/delivery` merchant + admin routes, `supabase/functions/payments`, the `delivery`/`payments` Postgres schemas, shared packages).
**Companion docs:** [`dash-customer-production-readiness-audit.md`](./dash-customer-production-readiness-audit.md), [`dash-courier-production-readiness-audit.md`](./dash-courier-production-readiness-audit.md) — this audit builds on both for shared backend surface and reports only merchant-specific findings in those areas.
**Method:** Static, read-only audit, four parallel workstreams (core frontend, staff-ops/POS/inventory frontend, backend/schema/RLS, integrations/secrets/admin) cross-referenced against each other, against the two companion audits, and against migration files directly. **No code was changed as part of this audit.**

---

## 0. Executive Summary

This is the most production-ready of the three RoamDash apps audited so far, and it isn't close. The core merchant experience — going online/offline, receiving and managing orders in real time, menu CRUD, analytics, earnings, settings, promotions, team invites, web push — is genuinely wired to a real backend end to end, with real Supabase Realtime order alerts, a real service-worker-based push subscription flow, and real server-mediated image uploads with magic-byte validation. The embedded "Dash" admin portal is broad and real: merchant approval/suspension, finance (payouts/adjustments/disputes), customer management, review moderation, order oversight, and platform-admin team RBAC, all backed by a substantial, audited edge-function API shared with the courier admin backend. Several serious RLS holes the platform-wide audits found (merchants able to self-approve/self-unsuspend, two back-office tables with *no RLS at all* plus a blanket public grant, an unauthenticated merchant-push-notification impersonation bug) are all confirmed fixed in code, not just documented as fixed.

That said, three sharp gaps keep this from being launch-ready as-is. First, the in-store POS's card-payment step has no real card-reader/terminal integration behind it — the UI shows static "tap or insert card" copy, a cashier manually confirms, and the frontend doesn't even check the backend's own `mockMode` flag that would tell it whether a real charge happened — this is a payment-integrity gap on a flow that handles real money. Second, merchant payout *creation* is broken: the admin finance UI for listing/holding/releasing payouts is real, but the only code path that would ever create a `payments` payout row targets a table that doesn't exist in any migration — it would fail at runtime today. Third, two screens in the order-detail flow (the courier hand-off screens, `ReadyOrderDetail`/`PickedUpOrderDetail`) show a fabricated courier identity — a hardcoded name and stock photo — as if it were the real assigned courier, and one of them has a primary "Confirm Pickup" button that is permanently disabled with no way to complete the screen.

Beyond those, the newest subsystem — enterprise inventory & procurement (a real, well-designed 23-table schema with tenant-scoped RLS) — has its foundational views (stock read, manual adjustment, purchase orders, receiving) genuinely wired up, but vendors, transfers, location hierarchy, physical-count variance, and recipes are still entirely fixture-driven on the frontend, including one screen (blind physical count) whose "Save" button silently discards the count the user just entered, and one backend endpoint (`fetchVariance`) that's fully built and simply never called.

---

## 1. What's Actually Real Today

| Capability | Status |
|---|---|
| Merchant auth (signup, login, Google OAuth, session refresh) | **Real** — `supabaseDashPartner` via `@roam/auth-client` |
| Admin login + JWT-role gating | **Real** — same `app_metadata`-claim pattern as dash-courier's admin, verified byte-for-byte structurally identical |
| Team invite acceptance | **Real** — creates real `merchant_team_members` rows, handles email-mismatch/expiry |
| Orders (live feed, accept/reject/status transitions) | **Real** — Supabase Realtime `postgres_changes` on `delivery.orders` + real `PUT /orders/:id/status` mutations |
| Menu CRUD, promotions CRUD, settings, earnings, analytics | **Real** — all React Query hooks call real `${API_ENDPOINTS.delivery}/merchant/...` routes |
| Web push notifications | **Real** — real service worker, real VAPID subscription, synced to backend; independent real-time in-app alert path too |
| Image uploads (onboarding/menu photos, via `uploadMerchantAsset()`) | **Real** — server-mediated, magic-byte MIME validation, 5MB limit, UUID-scoped paths — **verified edge-function-only (§I)** |
| Merchant onboarding/KYC (draft autosave, real geocoding, document upload w/ malware scan, bank-account linking, live status checklist) | **Real and extensive** |
| Admin approval workflow (queue, SLA flagging, state machine, audit log, notifications+email) | **Real** |
| POS order creation, inventory depletion on sale, station/kitchen-display device pairing & PIN shift login | **Real** |
| Staff-ops order queues (kitchen/counter/bar/drive-thru/expo) | **Real order feed** (Realtime-driven), one heuristic-classification gap (see §C) |
| Enterprise inventory: nodes/KPIs, item stock read + manual adjustment, purchase orders, receiving | **Real**, tenant-scoped RLS (reads), service-role-only writes |
| Enterprise inventory: vendors, transfers, locations, physical-count variance, recipes | **Fixture-only on the frontend**, despite real backend schema and (for variance) a real unused endpoint |
| POS card payment | **Not real** — no terminal SDK, backend's own mock-mode signal ignored by the UI |
| Merchant payout creation | **Broken** — targets a non-existent table, would fail at runtime |
| `QueryErrorState` component | **Real and actually used** — ~12 real call sites, unlike dash-courier's dead `ErrorScreen` |
| Network/offline connectivity detection | **Absent** — no equivalent exists anywhere in this app |

---

## 2. Domain-by-Domain Findings

### A. Core Dashboard, Orders, Menu, Analytics, Earnings, Settings — real, with two blockers in the courier-handoff screens

The core hooks (`useMerchantMenu`, `useMerchantAnalytics`, `useMerchantEarnings`, `usePromotions`, `useWebPush`, `useNotificationSettings`, `useMenuReorder`) are all genuinely backend-wired via a shared `deliveryFetch` helper hitting `${API_ENDPOINTS.delivery}/merchant/...`, with proper React Query cache invalidation and optimistic-update rollback. Order accept/reject/status transitions are real end to end. A few narrow issues:

- **Blocker** — `components/order-detail/ReadyOrderDetail.tsx`: a hardcoded `COURIER_PLACEHOLDER` object (fake name "Marcus," fake vehicle, fake ETA, a stock Unsplash photo) is displayed as the real assigned courier whenever `order.courier_id` is truthy — no real courier profile is ever fetched. The screen's primary CTA, "Confirm Pickup," is permanently `disabled` with no handler wired to activate it — there is currently no way to complete this screen's core action.
- **Needs-backend-work** — `components/order-detail/PickedUpOrderDetail.tsx` shows the same hardcoded courier name unconditionally; "Call courier" and header "Open" buttons have no handlers. `PreparingOrderDetail.tsx`'s "Need more time" button has no handler despite `estimatedPrepTimeMins` existing elsewhere in the status-update payload, suggesting this was meant to call it.
- **Cosmetic** (intentionally labeled, not misleading): "Instant Payout" and "Download Statement" both show honest `toast.info('...coming soon')` stubs; custom notification sounds likewise. `DashboardPage.tsx`'s "Recent Activity" list pads itself with two hardcoded fake events ("New 5-star review," "Item marked Sold Out") when there are fewer than 3 real ones — unlabeled as fake, worth fixing since it's presented as real activity.

### B. Point of Sale (In-Store) — real order/inventory backend, no real card payment

- Order creation, payment-intent creation (real Stripe `card_present` intent, with a documented `mockMode: true` fallback if `STRIPE_SECRET_KEY` is unset), marking paid, inventory depletion, and receipt-queueing are all real backend routes in `merchantRestaurantRoutes.ts`.
- **Blocker**: the frontend never reads `result.mockMode` from the payment-intent response — confirmed via repo-wide search, the field is defined in the type but never consumed. This means the UI shows identical "present card" messaging whether a real charge is about to happen or the backend silently ran in mock mode. Combined with the complete absence of any Stripe Terminal SDK or physical card-reader integration anywhere in the app, the "tap or insert card" step is really just a cashier manually confirming after an unverified pause — a payment-integrity and observability gap on a flow that handles real money.
- **Needs-backend-work / possibly blocker**: the UI claims "Receipt sent to printer" after a sale, but `completeSale()` never calls any print-job-creation endpoint — the only real print call in the app is a manual "Test print" button in settings. If merchants expect automatic receipts, this doesn't happen today.
- **Cosmetic, gated correctly**: when `useApi=false` (an intentional demo/preview mode gated by an in-store capability flag), the register falls back to fixture menu data — not a disguised mock, but worth confirming this mode is unreachable for real enrolled merchants in production.

### C. Staff-Ops Order Queues (Kitchen/Counter/Bar/Drive-Thru/Expo) — real feed, one classification gap

- All five queue pages pull from a real, Realtime-backed order feed (`useMerchantActiveOrders` + `useMerchantOrdersRealtime` subscribing to `delivery.orders` filtered by `merchant_id`) — no hardcoded order data anywhere.
- **Needs-backend-work**: bar-queue item routing uses a regex heuristic matching item/category *names* against words like "drink"/"cocktail" rather than a real assigned-station field — unlike the kitchen queue, which correctly uses a genuine `prep_station_id` column via `usePrepStations`. This can misclassify items with no admin-facing correction path.
- **Cosmetic**: `StationPlaceholderPage.tsx` is confirmed dead code — zero references anywhere else in the app, superseded by the real bar/expo/drive-thru pages it was presumably a placeholder for. Safe to delete.
- The staff PIN/shift-session kiosk flow (`StationKioskFlow` and related components) is fully real — genuine roster fetch, PIN verify/create, and shift-end endpoints.

### D. Enterprise Inventory & Procurement — real, well-designed schema; frontend only half-wired

The backend here is genuinely impressive: a 23-table schema (`inventory_companies/regions/groups/nodes`, `item_master`, `uom_definitions`/`uom_conversions`, `vendors`/`vendor_catalogs`/`vendor_price_history`, `purchase_orders`/`purchase_order_lines`, `receiving_events`/`receiving_variances`, `recipes`/`recipe_ingredients`, `inventory_ledger`/`inventory_balances`/`inventory_cost_layers`, `inventory_transfers`/`_lines`, `physical_counts`/`_items`), created together in one migration, with a deliberate design: tenant-scoped **read** RLS via `SECURITY DEFINER` helper functions, and all **writes** routed only through service-role edge functions (`inventory/{uomService,ledgerService,depletionService}.ts`). This design intent is confirmed fixed after an earlier state where RLS was enabled platform-wide but only one of the 22 tables actually had a policy (flagged Critical in `docs/rls-audit.md`, resolved in a later "Wave 6" migration).

Frontend reality is split:
- **Real**: hub/KPIs, item stock list + detail + manual adjustment (writes to the ledger), purchase orders list, and receiving-against-a-PO.
- **Blocker** — **Vendors**: `vendors`/`vendor-catalog` views always render hardcoded fixtures; there is no `fetchVendors`/`fetchVendorCatalog` function in the API client at all, so the real `vendors`/`vendor_catalogs` tables are never queried.
- **Blocker** — **Transfers**: always fixture data; "Receive at destination" is a pure UI navigation with no API call and no persistence — a dead-end dressed as a completed workflow step.
- **Blocker** — **Physical count**: the blind-count "Save" action **discards the counted quantities and item IDs entirely** — there is no `submitCount`/`saveCount` function in the API client, so even with the button enabled and a real merchant session, nothing is ever sent to the backend. This is a genuine data-loss bug precisely where inventory accuracy matters most.
- **Blocker** — **Variance**: always renders fixture data — notably, `fetchVariance()` **is fully implemented** in the API client (calls a real `/merchant/enterprise-inventory/variance` endpoint) but is simply never imported or called by the flow. This is the cheapest of the enterprise-inventory gaps to close.
- **Blocker** — **Recipes**: there is a real `saveRecipe` (write) endpoint but no corresponding read/fetch endpoint, so the recipe editor always shows two fixture recipes tied to fixture menu-item IDs unrelated to the merchant's actual menu — edits could target a menu item ID that doesn't exist for that merchant.
- **Needs-backend-work**: location hierarchy is always fixture data (lower risk, read-only). `patchInventorySettings()` is a defined-but-never-called dead API function. `UomConversionEditorView` is orphaned — built and exported but no view state in the flow's router ever navigates to it.

### E. Merchant Onboarding & KYC — real and extensive

Draft autosave, real Google Maps geocoding/reverse-geocoding for address entry, document upload with real magic-byte validation and malware scanning (10MB limit, `merchant-documents` bucket), bank-account linking, and a live-computed application-status/checklist are all genuinely implemented (`merchant_application_routes.ts`). The admin-side approval workflow is equally real: an explicit state machine for status transitions, 48-hour SLA-breach flagging on the verification queue, checklist-gated approval with a separate force-approve path requiring elevated roles, document review, and full audit logging plus merchant-facing notification and email on every transition.

The platform-wide "self-approval" RLS bug (an owner-editable policy with no `WITH CHECK`, letting an entity approve/un-suspend itself) applied to `delivery.merchants` in exactly the same shape the courier audit found for `courier_profiles` — **confirmed fixed** in the same Wave 3 migration, which freezes `verification_status`, `operational_status`, `commission_rate`, and `suspended_at` against client writes, and does the same for `merchant_documents` and order financial columns.

Separately, two back-office tables (`merchant_business_types(_sections)`, `merchant_prep_stations`) were found to have **never had RLS enabled at all**, combined with a blanket `GRANT ALL ... TO anon` — i.e., fully public read/write with zero authentication. This is confirmed fixed with real RLS and policies in an earlier remediation wave ("Wave 0").

### F. Merchant Payments, Payouts & Earnings — richer scaffolding than courier, but payout creation is broken

Unlike the courier app (where `payments.courier_payouts` is completely untouched by any code), the merchant side has real bank-account linking, a real admin finance surface (`GET /admin/finance/payouts`, hold, release, adjustments, disputes — all operating on real tables with real policies), and audit logging. **But nothing in the codebase ever successfully creates a payout row**: the admin hold/release routes only update existing rows by ID, and the one route that looks like "create a payout" (`POST /payouts/merchant` in `supabase/functions/payments/index.ts`) inserts into a `payments.payouts` table that **does not exist anywhere in the migration history** — this would fail at runtime with a "relation does not exist" error. It appears to be a leftover from, or parallel to, an in-progress ledger-unification effort elsewhere in the codebase. Net effect: the admin payout UI is real but has nothing to operate on, because the creation path is broken — a more specific, more fixable problem than courier's "nothing touches this table at all," but still non-functional today.

### G. Web Push & Realtime Alerts — the best-built notification story of the three apps

`useWebPush.ts` implements a genuinely complete flow: real service worker registration (`/sw.js`), real `Notification.requestPermission()`/`pushManager.subscribe()` with a real VAPID key, and the resulting subscription is POSTed to a real backend endpoint. The service worker itself has real `push`/`notificationclick` listeners. Independently, new-order alerting while the tab is open comes from a genuine Supabase Realtime subscription (not polling) driving both an audible/haptic alert and cache invalidation. This two-legged design (Realtime for in-app, Web Push for backgrounded) is correctly built and should be treated as a reference pattern rather than a gap.

### H. Auth & Admin Portal — real, and the admin portal is the broadest of the three apps' admin surfaces

Merchant auth, Google OAuth, session refresh, and team-invite acceptance are all real. The admin login uses the identical JWT-`app_metadata`-role-claim gating pattern found (and trusted) in the courier audit. `DashAdminPortal` maps cleanly onto a substantial, shared "Dash" admin backend (`registerMerchantAdminRoutes`, `registerOrderAdminRoutes`, `registerCustomerAdminRoutes`, `registerFinanceAdminRoutes`, plus courier admin routes all mounted in the same app) — merchant approval/suspension/deletion, order oversight, customer management, finance (payouts/adjustments/disputes), review moderation (still operating on `orders.customer_rating`/`review_hidden` columns rather than a dedicated reviews table, consistent with the customer-app audit's finding that no reviews table exists platform-wide), and platform-admin team RBAC. This is comparable to or broader than the courier admin portal already judged "genuinely close to production-ready."

A previously-flagged unauthenticated merchant-push-notification impersonation bug (any caller could trigger a push to any merchant by ID) is confirmed fixed — the route now requires an internal shared secret.

### I. Image & Document Uploads — real backend; frontend confirmed on secure path (2026-07-29)

The backend upload path (`merchantAssetsUpload.ts`) is genuinely well-built: requires a valid bearer JWT, enforces a real server-side 5MB limit, validates actual file magic bytes (not just the client-declared MIME type), and writes via service-role to UUID-scoped paths.

**Resolved:** A direct follow-up read confirmed `ImageUpload.tsx`, `EditProfileView.tsx`, and `PartnerImageUploadField.tsx` all call `uploadMerchantAsset()` → the edge function. There are **no** direct `supabase.storage.from(...).upload` call sites in dash-merchant. The earlier storage-audit claim of browser-writable bucket uploads for these files was stale. Dead unused `bucket` prop removed from `ImageUpload`.

### J. Environment, Secrets, Error Handling

- `packages/api-client/src/supabaseInfo.ts` is confirmed, as currently written, to be **fail-closed** (throws if Supabase env vars are missing, no hardcoded fallback project/key) — this closes the loop on a discrepancy the two companion audits left open between an earlier "fail-open" read and a later "fail-closed" read; the current code fails closed.
- `QueryErrorState.tsx` is genuinely used across roughly a dozen real call sites (orders, menu, analytics, earnings, all five staff-ops pages, promotions, team) — a meaningfully better error-handling story than dash-courier's mostly-unused `ErrorScreen.tsx`.
- **Resolved (2026-07-29):** `useNetworkStatus` ported into dash-merchant; sticky offline banner in `App.tsx` is distinct from the merchant “stop accepting orders” business toggle.

### K. Backend RLS/Schema Hardening — confirmed track record of fixing what gets found

Beyond what's cited above, the two inventory RPCs that were briefly callable by `anon`/`authenticated` due to a blanket schema-level grant are confirmed revoked and restricted to `service_role`. A missing index (`idx_merchant_team_members_user_id`) flagged as load-bearing for "nearly every merchant-portal RLS subquery" is confirmed added in a later migration. Remaining default-deny (RLS-enabled, zero-policy) tables specific to the merchant surface — `order_disputes`, `payments.merchant_adjustments` — are the same pattern already flagged platform-wide in the customer-app audit, not new; **intentional default-deny** for client roles (admin/service-role edge routes only). `merchant_station_devices`/`merchant_shift_sessions` are zero-policy **by design**, since that flow is entirely service-role-mediated with its own device-token/PIN-hash auth, not a gap.

---

## 3. Prioritized Punch List

**P0 — Business-critical/data-integrity blockers:**
1. POS card payment: wire the frontend to check the backend's `mockMode` flag and integrate a real card-present terminal (Stripe Terminal SDK or equivalent) before this handles real transactions — currently a manually-confirmed step with no way to know if a real charge occurred.
2. Fix merchant payout creation — `POST /payouts/merchant` targets a `payments.payouts` table that doesn't exist in any migration and would fail at runtime; until fixed, no merchant payout can ever be created despite real admin tooling built around it.
3. `ReadyOrderDetail.tsx` — replace the fabricated courier identity (hardcoded name + stock photo) with real courier data, and wire the permanently-disabled "Confirm Pickup" CTA to an actual completion action.
4. Enterprise inventory blind-count "Save" — stop silently discarding the counted quantities; either wire it to a real (currently nonexistent) submit-count endpoint or disable the flow honestly until one exists.
5. Resolve the `ImageUpload.tsx`/`EditProfileView.tsx` upload-path discrepancy (§I) with a direct read — confirm whether any merchant-facing upload currently bypasses the secure, validated edge-function path. **Done 2026-07-29 — edge-function-only; no bypass.**

**P1 — Core wiring gaps (backend exists or is one function call away):**
6. Wire POS `completeSale()` to actually create a `print_jobs` receipt row — currently claims "sent to printer" with no backend call.
7. Fix `PickedUpOrderDetail.tsx`'s hardcoded courier name; wire "Call courier"/"Need more time" buttons to real actions or remove them.
8. Wire enterprise inventory's already-built `fetchVariance()` into the variance/count-review views instead of showing fixture data — the cheapest fix in the entire inventory module.
9. Fix bar-queue item classification to use a real assigned-station field (mirroring kitchen's `prep_station_id`) instead of a name-matching regex heuristic.
10. Add network/offline connectivity detection to the app — currently entirely absent.
11. Fix the misleading fallback "Recent Activity" fake events on `DashboardPage.tsx`.

**P2 — Needs new backend/vendor work:**
12. Real card-present payment terminal integration (ties into P0 #1 but is the larger vendor-integration piece).
13. Enterprise inventory: build real vendor directory endpoints, real transfer persistence, a real recipe read path, and real location-hierarchy fetch — four of the module's ~11 views are still fixture-only despite a real schema underneath all of them.
14. Design and implement a real end-to-end payout-creation flow (ties into P0 #2, but the larger question — what table/schema payouts should actually write to, especially given the in-progress ledger-unification work elsewhere — needs a design decision, not just a bug fix).

**P3 — Hardening / cleanup:**
15. Remove confirmed-dead code: `StationPlaceholderPage.tsx`, orphaned `UomConversionEditorView`, unused `patchInventorySettings()`.
16. Add RLS policies (or explicitly confirm intentional default-deny) for `order_disputes` and `payments.merchant_adjustments`. **Confirmed intentional default-deny (2026-07-29)** — client roles cannot read/write; admin/service-role edge routes only.
17. Address remaining doc-flagged cleanup items: missing CORS headers on `merchant-push` (**already present via `buildCorsOriginFn`**), inline per-request merchant-analytics aggregation performance concern.

**P4 — Product decisions:**
18. Whether the POS's fixture/demo mode should ever be reachable for real enrolled merchants in production, or fully gated off.
19. What "receipt printing" should mean in production (auto-print every sale vs. on-demand) — shapes the scope of P1 #6.

---

## 4. Suggested Phasing

1. **Phase 0 — Close the money and data-integrity gaps**: P0 items. These involve real financial transactions (POS payment, payouts) and a live data-loss bug (inventory count) — highest cost of shipping as-is.
2. **Phase 1 — Connect what's already built**: P1 items, mostly wiring frontend to backend pieces that already exist (variance endpoint, receipt printing, bar classification, connectivity detection).
3. **Phase 2 — Vendor/new-backend work**: P2 items — payment terminal integration and the remaining enterprise-inventory views are the largest remaining scope.
4. **Phase 3 — Hardening**: P3 items, ideally alongside Phases 1–2 rather than deferred.
5. **Product decisions (P4)** should be resolved before or during Phase 1, since they affect its scope directly.

---

## 5. Notes on Methodology / Confidence

- This audit found meaningfully more "confirmed fixed in code" items than the two companion audits — the merchant/dash backend appears to be the most actively hardened part of the platform, based on the density of resolved Wave 0/3/6 remediation items traced directly against migration files.
- §I image-upload discrepancy is **resolved** (2026-07-29): dash-merchant upload UI is edge-function-only.
- This audit covers `apps/dash-merchant` only (consumer-facing + embedded admin). `driver`, `fleet`, `haul`, `enterprise`, `rides-passenger` would need their own passes if/when they're headed toward production — they share the same underlying Supabase project but have independent frontend wiring status.
- No code was changed. This document is intended as input to a separate implementation plan, alongside the dash-customer and dash-courier audits.
