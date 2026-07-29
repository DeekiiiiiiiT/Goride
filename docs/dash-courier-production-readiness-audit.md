# RoamDash Courier (`apps/dash-courier`) — Production Readiness Audit

**Date:** 2026-07-28
**Scope:** `apps/dash-courier` (courier.roamdash.co) — both the consumer-facing courier app (`src/`, excluding `src/admin`) and the embedded courier admin/compliance portal (`src/admin`) — plus the backend surfaces it depends on: `supabase/functions/delivery` (courier + admin routes), the `delivery` and `payments` Postgres schemas, and shared packages (`@roam/auth-client`, `@roam/api-client`, `@roam/location`).
**Companion doc:** [`dash-customer-production-readiness-audit.md`](./dash-customer-production-readiness-audit.md) — this audit builds on it for shared backend surface (schemas, RLS methodology, remediation-status doc trust level) and reports only courier-specific findings in those sections.
**Method:** Static, read-only audit. Three independent workstreams (frontend data layer, backend/Supabase schema+RLS+edge functions, third-party integrations/secrets) cross-referenced against each other, against the customer-app audit, and against migration files directly (not just prior audit docs). **No code was changed as part of this audit.**

---

## 0. Executive Summary

The courier app splits cleanly into two halves that are almost opposite in maturity. The **admin/compliance portal** (`src/admin/*`) is real, working software: JWT-role-gated login, a genuine compliance review queue with real approve/suspend/deactivate actions, a courier presence map, and a delivery ledger — all backed by real edge-function routes (`supabase/functions/delivery/admin/courierRoutes.ts`) and audited via `courier_audit_events`. This is comparable in quality to the merchant/order admin tooling found solid in the customer-app audit.

The **courier-facing app** — the thing an actual delivery driver would use — is close to 100% mock, and worse than dash-customer in one specific way: it isn't just *unwired*, the two real backend routes that exist for it (`GET /courier/available-orders`, `POST /orders/:id/accept-delivery`) are **currently non-functional against any real courier session**, because `delivery.orders` has RLS enabled with policies for customers and merchants but none for couriers, and `delivery.courier_availability` has RLS enabled with zero policies at all — confirmed by tracing every `CREATE POLICY` across every migration, not inferred. So even if every mock were ripped out of the frontend today, the courier order flow would still fail closed.

On top of that, the entire "go online → receive an offer → accept → deliver → get paid" loop runs through a single client-side class, `MockDispatchProvider`, with no `RealDispatchProvider` implementation anywhere in the codebase. Background GPS location is captured using the real browser Geolocation API but is never transmitted anywhere — it only nudges a decorative map image. `payments.courier_payouts` exists in the schema but is completely orphaned: no code, frontend or backend, reads or writes it. Document/vehicle verification has a real, well-built admin review side with nothing on the courier-facing side to feed it real data — the compliance queue can currently only ever show "no documents submitted."

There are also two straightforward but serious bugs, independent of the mock-data question: `EditVehiclePage.tsx` and `VehicleSetupPage.tsx` both collect make/model/license plate/color from the user, show a success toast, and then **discard those fields** — only `vehicle_type` is ever saved. And `AgeVerifyHandoffPage.tsx`, meant to gate handoff of age-restricted items, is three checkboxes and a button that flips a boolean — no camera, no ID capture, no verification service — a compliance risk directly analogous to the age-gate finding in the customer-app audit, but on the fulfillment side this time.

**Bottom line:** this app needs more backend work than dash-customer, not less — the admin half is genuinely close to production-ready, but the courier-facing half needs both the RLS layer fixed and an entire dispatch/offer engine built (or reused from the rides vertical's `driver_offers` pattern, which already exists and does something structurally similar) before it does anything real.

---

## 1. What's Actually Real Today

| Capability | Status |
|---|---|
| Supabase Auth — signup, email/phone OTP, login, Google OAuth | **Real** — `supabase.auth.signUp/verifyOtp/signInWithOtp/signInWithPassword/signInWithOAuth`, genuine session/JWT management |
| Courier admin login + role gating | **Real** — separate `supabaseCourierAdmin` client, roles read from server-issued JWT `app_metadata` claims (`hasAnyJwtRole()`), not client-editable |
| `delivery.courier_profiles` CRUD (name/phone/email/vehicle_type, status polling) | **Real** — `courierProfileService.ts`/`ensureCourierProfile.ts`, genuine Supabase calls with owner-scoped RLS that actually works |
| Courier admin: compliance review, presence map, delivery ledger, workforce lifecycle (approve/suspend/deactivate/delete) | **Real** — `courierAdminService.ts` → `supabase/functions/delivery/admin/courierRoutes.ts`, service-role mediated, `requireProductAdmin` gated, every mutation audited |
| Background GPS capture (browser API) | **Real capture, zero transmission** — `navigator.geolocation.watchPosition` works, but coordinates never leave the client |
| Online/offline network detection + offline action guard | **Real** — `useNetworkStatus.ts` + `networkGuard.ts`'s `assertOnline()`, actually wired into action handlers |
| Order creation pricing re-validation, merchant/customer RLS fixes | **Inherited from dash-customer backend** — confirmed fixed, see companion doc |
| `GET /courier/available-orders`, `POST /orders/:id/accept-delivery` | **Code exists but is non-functional** — RLS blocks both routes for any real courier JWT (no courier policy on `delivery.orders`) |
| Everything else courier-facing (offers, active delivery, earnings, payouts, ratings breakdown, document/vehicle verification, activity history) | **Mock/localStorage, no backend path at all** |

---

## 2. Domain-by-Domain Findings

### A. Dispatch & Offers — no real implementation exists anywhere

- The entire online/offer/accept/decline/delivery-phase state machine lives in `src/services/courierDispatch/MockDispatchProvider.ts`, a client-side in-memory class. There is no `RealDispatchProvider` — `useCourierDispatch.ts` defaults to the mock and nothing ever overrides it.
- "Going online" (`CourierHomePage.tsx`) is a `setTimeout(2000ms)` — no write to `delivery.courier_availability`, no server registration of availability.
- New offers arrive via a hardcoded `setTimeout(5000ms)` in `HomeOnlinePage.tsx` that fabricates a fixed mock offer — not a poll, not a subscription, not a push.
- Accept/decline only mutate local mock state and never call `available-orders`/`accept-delivery` (which, per §B, wouldn't work yet regardless).
- No `courier_offers`-style table or matching/assignment logic exists in the schema or edge functions — the "offer" concept has no backend representation at all today. (The rides vertical has an analogous, working `driver_offers` table/flow that could plausibly be adapted as a pattern.)
- **Net effect**: a real courier today cannot go online, cannot receive a real offer, and cannot accept a real delivery. This is the single largest gap in the app.

### B. The RLS blocker on the two routes that do exist

- `delivery.orders` policies across all migrations: customers can SELECT their own orders, merchants can SELECT their own orders, merchant team members can UPDATE order status (column-frozen as of Wave 3). **No courier policy exists, ever, in any migration.** RLS defaults to deny, so `GET /courier/available-orders` (which filters `status='ready' AND courier_id IS NULL`) returns nothing for a courier session, and `POST /orders/:id/accept-delivery`'s update fails.
- `PUT /orders/:id/status` (the generic status-transition route couriers would use for picked_up → delivered) only special-cases `actorType === "merchant"` — there's no courier ownership check (`courier_id === user.id`) in the handler itself, so it currently relies entirely on RLS granting couriers something, which it doesn't.
- `delivery.courier_availability` has RLS enabled with zero policies since its creation migration — independently confirmed, matches the companion audit's platform-wide "7 tables, RLS on, no policies" list.
- **This must be fixed before any frontend dispatch wiring work is useful** — it's a backend prerequisite, not a nice-to-have alongside frontend changes.

### C. Location & Realtime — captured but never transmitted, no channel to send it on anyway

- `useBackgroundLocation.ts` genuinely calls `navigator.geolocation.watchPosition` and gets real coordinates (with a Kingston fallback on permission denial) — but the only consumer is a decorative map-offset calculation on the home screen. No `fetch`, no `supabase.from(...).update()`, no Realtime publish exists anywhere in the app for location.
- Even if the frontend did transmit it, there's nowhere real-time for it to land visibly: `delivery.courier_availability` is **not** in the `supabase_realtime` publication (confirmed against the publication's exact membership — five tables, none courier-related). The admin `CourierPresenceMap.tsx` reads this table via polling a service-role-mediated admin endpoint (which correctly bypasses the table's own broken RLS), not a live subscription.
- Net effect: building real location tracking requires (1) wiring the frontend to actually send pings, (2) fixing or adding RLS so a courier can write their own `courier_availability` row, and (3) adding the table to the realtime publication if live updates (vs. polling) are wanted for the admin map or a future customer-facing courier-location view.

### D. Document & Vehicle Verification — real admin review, nothing to review

- The admin compliance logic (`complianceLogic.ts`) is genuinely non-trivial: it checks for an approved license, approved insurance, and at least one vehicle row before clearing a courier.
- But `VehicleSetupPage.tsx` (onboarding) and the profile-side `EditVehiclePage.tsx`/`CourierDocumentsPage.tsx` never call Supabase or any upload endpoint. Photo "upload" is `URL.createObjectURL()` — a local preview only, discarded on navigation. `CourierDocumentsPage.tsx`'s action buttons have no `onClick` handlers at all.
- No `courier-documents`-style storage bucket exists anywhere in the app or in `docs/storage-audit.md` (that doc's `driver-documents`/`driver-photos` buckets belong to the separate `apps/haul` app, not dash-courier).
- **Consequence**: the admin compliance queue, however well-built, currently has no real data to work with — a courier cannot get through document/vehicle verification end-to-end today.
- Separately and more urgently: `EditVehiclePage.tsx` and `VehicleSetupPage.tsx` both **silently discard** user-entered make/model/license plate/color — only `vehicle_type` reaches `courier_profiles`. This is a data-loss bug independent of the missing-backend question, and it shows a false success toast, which makes it worse than simply "not implemented yet."

### E. Age-Restricted Item Handoff — compliance risk

- `AgeVerifyHandoffPage.tsx` presents a 3-item checklist and an "ID verification" button that only flips a local boolean and overlays a static placeholder image. No camera is invoked, no photo is captured or stored, no ID-scanning/verification service is called.
- This mirrors the age-gate finding in the customer-app audit (client-side-only, trivially bypassable) but on the fulfillment side — if RoamDash requires couriers to verify ID at handoff for restricted items, this currently provides no actual verification and should be treated with the same urgency as the customer-side age gate.

### F. Earnings & Payouts — fully mocked, backend table orphaned

- `lib/mockEarnings.ts`, `lib/mockPayoutHistory.ts`, and `lib/mockPromotions.ts` drive every earnings/payout/promo screen (`EarningsPage`, `PayoutHistoryPage`, `PromotionsPage`, `DashSummaryPage`) with fixed numbers.
- `payments.courier_payouts` exists in the schema (with RLS enabled, zero policies — consistent with the companion audit's finding) but **no code anywhere, frontend or backend, reads or writes it**. It's not just unwired, it's untouched — building this out is closer to new-feature work than to "connect the wire."
- No bank-account-linking or payout-request flow exists in the UI at all (zero matches for "bank account"/"payout"/"withdraw" in source).
- `RatingsStatsPage.tsx` is a particularly easy near-term win: `courierProfileService` already exposes real `rating`, `total_deliveries`, `acceptance_rate_pct`, and `completion_rate_pct` from `courier_profiles`, but the page reads `MOCK_COURIER_PROFILE` instead — this is real data sitting one function call away from being used correctly.

### G. Proof of Delivery / Pickup / Issue Reporting — file inputs that discard files

- `AtCustomerPage.tsx`'s delivery-photo capture sets a boolean flag but discards the actual `File`.
- `AtStorePage.tsx`'s pickup-photo input has no `onChange` handler at all — selecting a file does nothing.
- `ReportIssuePage.tsx`'s "Upload Photo" button has no `onChange` handler either, and submitting an issue only sets local UI state — no ticket is created server-side.
- None of this can be fixed by pointing at an existing backend route — no photo-upload or issue-ticket endpoint exists for couriers today; this needs new backend surface, likely reusing whatever storage pattern gets built for document verification (§D).

### H. Push / Real-Time Offer Alerts — no mechanism exists

- The "push" offer banner (`OfferPushBanner.tsx`) only ever appears because of the hardcoded 5-second mock timer (§A) — there is no Service Worker, no Web Push subscription, no FCM integration, and no Supabase Realtime channel subscription anywhere in the app (all confirmed via exhaustive grep, zero matches).
- A courier app fundamentally needs a way to alert a driver to a new offer while the tab is backgrounded or the phone is locked — this is a real, non-trivial piece of infrastructure to build (web push at minimum; native push if this ever wraps into a mobile shell).

### I. Auth & Admin — solid, one item to reconcile

- Courier auth (signup, OTP, Google OAuth, session handling) and the separate courier-admin login (real JWT-role gate via `app_metadata`, not a superficial check) are both genuinely real and well-built.
- One discrepancy surfaced against the companion audit: the customer-app audit found `packages/api-client/src/supabaseInfo.ts` falling back to a hardcoded live Supabase project/anon key when env vars are unset (fail-open). This courier audit read the same file and found it throwing (`"Missing Supabase config..."`) when those vars are absent — i.e. fail-closed. **This needs a quick reconciliation pass** (check git history / confirm which behavior is actually live) before treating either finding as current — it may be that the file was fixed between the two audits, or that a different resolution path is in play for the two apps. Flagging rather than resolving here since this audit is read-only.

### J. Error Handling — detection exists, dedicated error UI is dead code

- `useNetworkStatus.ts` and `networkGuard.ts`'s `assertOnline()` are real and actually exercised (e.g., `CourierHomePage.tsx`'s `guardAction` wrapper) — reasonable given a courier is often driving with spotty connectivity.
- However, `components/ui/ErrorScreen.tsx` defines three well-built full-screen error states (network/gps/server) that are **never imported or rendered anywhere in the app** — genuine backend-call failures in `courierProfileService.ts` are swallowed as `null`/`false` returns rather than routed through this component. This reads as unfinished wiring (the component exists) rather than a missing-feature gap.

### K. What's Real Elsewhere in the Backend, Confirmed by This Audit

- The Wave 3 self-approval RLS fix (couriers/merchants/drivers being able to un-suspend or self-approve themselves) applies to `courier_profiles` too, and is confirmed fixed in code (`20260718163000_rls_wave3_column_freeze.sql`), not just documented.
- `delivery.courier_profiles`, `courier_documents`, `courier_vehicles`, `courier_audit_events` are well-modeled with real CHECK-constrained enums and FKs to `auth.users`.
- Missing FKs persist: `courier_availability.driver_id`, `orders.courier_id`, and (newly confirmed here) `courier_payouts.courier_id` are all bare UUIDs with no FK to any courier identity table.
- `delivery.order_fulfillment` — despite the name — is merchant kitchen/prep-station tooling, not courier-related; don't confuse it with a courier fulfillment table when scoping future work.

---

## 3. Prioritized Punch List

**P0 — Compliance/security/data-integrity blockers (independent of the mock-data cleanup):**
1. Real ID verification at age-restricted handoff (`AgeVerifyHandoffPage.tsx`) — currently a checkbox toggle with a placeholder image, no actual verification.
2. Fix the `EditVehiclePage.tsx` and `VehicleSetupPage.tsx` data-loss bug — user-entered make/model/plate/color are discarded while a success toast is shown. Fix independent of, and before, any mock-data replacement work.
3. Add RLS policies for `delivery.orders` (courier role, scoped to `courier_id = auth.uid()` post-assignment plus a policy allowing couriers to see unassigned `status='ready'` rows) and for `delivery.courier_availability` (owner-scoped read/write). Nothing in §A or §C can function correctly until this lands.
4. Add a courier ownership check (`courier_id === user.id`) to `PUT /orders/:id/status`, and apply the same column-freeze pattern used for merchants/customers in Wave 3 so a courier status-update can't touch order financials.
5. Reconcile the `supabaseInfo.ts` fail-open/fail-closed discrepancy noted in §I between this audit and the customer-app audit.

**P1 — Core wiring once P0 lands (mostly connecting real, already-built pieces):**
6. Build a real `DispatchProvider` implementation to replace `MockDispatchProvider`, calling `available-orders`/`accept-delivery` (now functional post-#3) instead of local mock state.
7. Wire "going online" to actually write `delivery.courier_availability` (`is_online`, current lat/lng) instead of a local `setTimeout`.
8. Transmit `useBackgroundLocation`'s already-real GPS coordinates to `courier_availability` on an interval.
9. Wire `RatingsStatsPage.tsx` to the real `courierProfileService` fields (`rating`, `total_deliveries`, `acceptance_rate_pct`, `completion_rate_pct`) that already exist — this one is nearly free.
10. Wire onboarding (`VehicleSetupPage`) and profile (`EditVehiclePage`, `CourierDocumentsPage`) to actually write `courier_vehicles`/`courier_documents`, including real photo uploads to a new courier-documents storage bucket — this is the only way the already-built admin compliance queue gets real data to review.

**P2 — Needs new backend/vendor work, not just frontend rewiring:**
11. Design and build a real offer/dispatch mechanism (new `courier_offers`-style table + assignment logic, or adapt the existing rides `driver_offers` pattern) — the pull-based `available-orders` endpoint alone doesn't constitute an offer system.
12. Real-time/push offer alerts — web push at minimum (service worker + subscription + a server-side trigger), since there's currently no mechanism at all for alerting a backgrounded courier to a new offer.
13. Build out `payments.courier_payouts` end-to-end: earnings computation from completed deliveries, payout history, and a bank-account-linking or payout-request flow — this table is currently untouched by any code in either direction.
14. Real proof-of-delivery/pickup photo capture and issue-ticket submission — currently the file inputs discard selected files and issue reports never leave the client.
15. Add `delivery.courier_availability` to the `supabase_realtime` publication if live (not polled) location updates are wanted for the admin presence map or any future customer-facing "your courier is X minutes away" view.
16. Wire the existing, well-built `ErrorScreen.tsx` into real backend-failure paths instead of the current silent `null`/toast swallowing.

**P3 — Data integrity hardening:**
17. Add missing FKs: `courier_availability.driver_id`, `orders.courier_id`, `courier_payouts.courier_id` → a courier identity table (`courier_profiles.user_id` or equivalent).
18. Remove confirmed-dead code: `mockStackedDelivery.ts` (unused), `ErrorScreen.tsx` (unused pending #16).

**P4 — Product decisions needed:**
19. Pull vs. push dispatch model — the companion audit flagged this as open for the customer/order side; here it's more acute, since the pull model as coded doesn't function at all yet, so this is a genuine "build vs. redesign" fork rather than a preference.
20. Courier payout model (bank transfer, in-app wallet, cash-out threshold, etc.) — needed before #13 can be scoped concretely.
21. Whether age-restricted handoff verification (§E) needs a real ID-scanning vendor or a simpler photo-capture-and-manual-review flow — affects scope of P0 item #1 substantially.

---

## 4. Suggested Phasing

1. **Phase 0 — Unblock the backend**: P0 items. Nothing else in this app can be honestly tested against real data until RLS is fixed and the data-loss bugs are closed.
2. **Phase 1 — Connect what already exists**: P1 items. Mostly frontend wiring against backend pieces that are already built (profile fields, document/vehicle tables, the two order routes once unblocked).
3. **Phase 2 — Build the missing engine**: P2 items, starting with the offer/dispatch mechanism (#11) since almost everything else in the courier-facing app (active delivery flow, earnings triggers) assumes an offer was real to begin with.
4. **Phase 3 — Hardening**: P3 items, ideally incrementally alongside Phase 1–2 rather than deferred.
5. **Product decisions (P4)** should be resolved before or during Phase 2 — they materially change its scope.

---

## 5. Notes on Methodology / Confidence

- The RLS-blocking finding in §B was verified by direct migration trace (every `CREATE POLICY ... ON delivery.orders` and the `courier_availability` creation migration), not inferred from `list_tables`' `rls_enabled` flag alone — treat it as high-confidence.
- The `supabaseInfo.ts` fail-open/fail-closed discrepancy (§I) is unresolved between the two audits in this pair and should be spot-checked directly before acting on either version.
- This audit covers `apps/dash-courier` only (consumer + embedded admin). `dash-merchant`, `driver`, `fleet`, `haul`, etc. would need their own passes if/when they're headed to production — they share the same `delivery`/`payments` backend but have independent frontend wiring status.
- No code was changed. This document is intended as input to a separate implementation plan, alongside [`dash-customer-production-readiness-audit.md`](./dash-customer-production-readiness-audit.md).
