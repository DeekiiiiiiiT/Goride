# RoamDash (`apps/dash-customer`) — Production Readiness Audit

**Date:** 2026-07-28
**Scope:** `apps/dash-customer` (the customer-facing RoamDash food/grocery delivery web app, roamdash.co) plus the backend surfaces it depends on: `supabase/functions/delivery`, `supabase/functions/payments`, the `delivery` and `payments` Postgres schemas, and shared packages (`@roam/api-client`, `@roam/auth-client`, `@roam/location`).
**Out of scope:** other apps in the monorepo (driver, fleet, haul, enterprise, admin, rides-passenger, dash-courier, dash-merchant) except where they share backend surface with dash-customer.
**Method:** Static, read-only audit. Three independent workstreams (frontend data layer, backend/Supabase schema+RLS+edge functions, third-party integrations/secrets) cross-referenced against each other and against prior audit docs in `docs/`. Live Supabase advisors (`get_advisors`) were queried to confirm which prior findings are actually resolved vs. still open today. **No code was changed as part of this audit.**

---

## 0. Executive Summary

RoamDash's *checkout core* is more real than it looks at first glance — order placement, WiPay/PayPal payment intents, PayPal capture, real Supabase Auth (email/password + Google OAuth), server-side price re-validation, and 5-second order-status polling are all genuinely wired to a working Postgres/edge-function backend. That backend also has real RLS, a real webhook signature check, and a real audit trail (`order_events`).

Everything *around* that core, however, is a stage set. Restaurant catalogs, menus, reviews, deals, search, order history/tracking (with mock fallback), favorites, saved addresses, saved payment cards, notification preferences, and the entire phone-OTP onboarding step are hardcoded static data, `localStorage`, or `setTimeout`-simulated network calls. Several of these mock fallbacks are **silent** — a broken or misconfigured backend endpoint in production will not surface an error, it will quietly show fake restaurants, fake orders, or a fake courier animation instead. That is the single most dangerous property of the current codebase for a production launch: **failure and success currently look identical to the user.**

There is also one live, unresolved compliance/security gap worth flagging above everything else: **age verification for restricted items (alcohol) is entirely client-side and trivially bypassable** (a `localStorage` flag set after a fake delay), while the app's own copy claims it is "Official Roam Dash verification gate." If RoamDash sells age-restricted items, this cannot ship as-is.

The good news: because the backend team already built real schema, RLS, and edge-function coverage for orders/payments/merchants, most of the remaining work is *frontend wiring* (call the real endpoint instead of the mock) rather than backend design-from-scratch. The payments vault (saved cards), notifications, maps/geocoding, and live courier location are the exceptions — those need real backend/vendor work, not just frontend rewiring.

**Bottom line severity mix:** ~20 blocker-level findings (mostly "renders fake data with no way to know it's fake"), a handful of high-severity backend gaps (RLS policy coverage, unindexed FKs, missing CHECK constraints), and one compliance-critical item (age gate).

---

## 1. What's Actually Real Today

Worth stating plainly so the roadmap doesn't waste effort re-building what already works:

| Capability | Status |
|---|---|
| Supabase Auth (signup, login, Google OAuth, session/JWT, `onAuthStateChange`) | **Real** — `lib/supabase.ts` → `@roam/auth-client` |
| Order creation (`POST /orders`) | **Real** — `CheckoutPage.tsx`, server re-validates prices against `menu_items` (confirmed fixed, not just documented) |
| Payment intents — WiPay & PayPal | **Real** — `supabase/functions/payments`, hits WiPay/PayPal sandbox or live gateway depending on `WIPAY_ENV`/`PAYPAL_ENV` |
| PayPal capture callback | **Real** — `PaymentCallbackPage.tsx` → `POST /payments/paypal/capture` |
| Order status polling | **Real transport**, fake fallback content — `OrderTrackingPage.tsx` polls `GET /orders/:id` every 5s with a Bearer token, but silently substitutes `MOCK_TRACKING_ORDER` on any error |
| Merchant discovery (`GET /merchants`) | **Real, with silent mock fallback** on error/empty response |
| Browser online/offline detection | **Real** — `useNetworkStatus.ts`, drives `ConnectionErrorPage` |
| Backend RLS | **Enabled on all delivery/payments tables**; several tables have RLS on but zero policies (effectively "no legitimate access path" rather than "leaky") |
| Realtime plumbing | **Real** — `delivery.orders` and `delivery.merchant_notifications` are in the `supabase_realtime` publication server-side, just not consumed by the frontend yet |
| SMS OTP infrastructure | **Real backend exists** (`supabase/functions/send-sms`, Digicel/Flow routing) but is not called by the app's onboarding screen |
| Saved payment methods backend | **Real endpoint exists** (`GET /payments/methods` reading `payments.customer_payment_methods`) but has no client caller and no `POST` to create one |

---

## 2. Domain-by-Domain Findings

### A. Catalog, Search, Deals, Reviews — mostly blocker-level mock data

- **Restaurants/menu**: `lib/restaurantContent.ts` — the *entire app* has exactly one real restaurant profile (`ISLAND_GRILL`). `getRestaurantProfile(id)` ignores the id for anything else and just relabels the same fake restaurant "Roam Restaurant." Every restaurant page in the app is this one object.
- **Grocery**: `pages/StorePage.tsx` grocery catalog (`GROCERY_PRODUCTS`, 4 items) is hardcoded; only the store *name* comes from `fetchDiscoverMerchants('grocery')`.
- **Search**: `lib/searchDishes.ts` filters an in-memory ~6-item array. `lib/searchGroupedResults.ts` only returns results if the query literally contains the substring `"chicken"` — a scripted demo path, not a search backend.
- **Deals/Promotions**: `lib/dealsContent.ts` (`FEATURED_DEALS`, `DAILY_PICKS`) and `PromotionsPage.tsx` (`ACTIVE_PROMOS`/`EXPIRED_PROMOS`, plus a hardcoded "3/5 Orders" rewards progress bar) are fully static, despite a real `delivery.merchant_promotions` table existing server-side with no customer-facing reader.
- **Reviews**: `lib/reviewsContent.ts` has two hardcoded reviews total, reused for every merchant. `RateOrderPage.tsx`'s submit handler doesn't send anywhere — it just navigates back. There is **no reviews table in the schema at all** (only `orders.customer_rating`/`customer_review` columns) — this needs backend schema work, not just frontend wiring.
- **Pull-to-refresh** on Deals and Search pages awaits a fake `setTimeout(600ms)` — there's nothing behind it to refetch.

### B. Orders, Cart, Checkout — the most real part of the app, with caveats

- Order **placement** and **PayPal capture** are real end-to-end.
- Order **history** (`OrdersPage.tsx`) attempts a real `GET /customer/orders` call but **silently falls back to `MOCK_ORDERS`** on empty/error — a broken endpoint looks like "no orders yet," not an outage.
- Order **details** (`OrderDetailsPage.tsx`) and the home screen's "Quick Reorder" (`QuickReorderSection.tsx`) skip the API entirely and read `MOCK_ORDERS`/`ISLAND_GRILL_ORDER_DETAIL` directly.
- **Pricing**: server-side price re-validation for line items is confirmed fixed, but delivery fee (flat), service fee (2.08%), and tax (5%) are computed **client-side** in `lib/orderPricing.ts` and sent to the order-creation endpoint — worth confirming the backend also re-derives these rather than trusting the client for the non-item charges.
- **Cart**: React context + `localStorage` only (`useCart.tsx`), item IDs via `Math.random()`. Reasonable for a client cart, but there's no cross-device continuation and no merge-on-login behavior for a cart built while logged out.
- No CHECK constraints confirmed on any money column (subtotal, fees, tax, tip, discount, total, payout amounts) per `docs/schema-audit.md` — unresolved as of this audit.

### C. Payments — real gateway integration, fake vault

- WiPay and PayPal payment-intent creation, webhook signature verification (timing-safe), and PayPal capture are genuinely implemented in `supabase/functions/payments`.
- **`AddCardPage.tsx` is entirely fake**: form validates non-empty fields, shows a success toast, and discards the entered card number/CVV — nothing is sent to a processor or stored anywhere. The page displays "PCI DSS / 256-BIT SSL" badges with no actual mechanism behind them — this is a genuine liability if a user believes their card was saved.
- **`PaymentMethodsPage.tsx`** displays hardcoded fake cards (`Visa •••• 4242`, `Mastercard •••• 5555`) with dead Edit/Remove buttons — never calls the real (existing) `GET /payments/methods` endpoint.
- There is no `POST` endpoint yet to actually save a card server-side (tokenize + store), so even wiring the frontend to the real `GET` wouldn't close the loop — this needs a real card-vault/tokenization flow (WiPay/PayPal token vault or a PCI-scoped provider), not just a fetch call.
- Refund capture against the payment provider is an explicit backend `TODO` (`supabase/functions/payments/index.ts` refunds handler) — refund records can be created but don't actually refund money yet.

### D. Auth & Identity — real core auth, fake phone verification, unenforced age gate

- Email/password signup, login, and Google OAuth are real (`LoginPage.tsx` → Supabase Auth).
- **Onboarding phone OTP is entirely theater**: `VerifyPhonePage.tsx` accepts any 6-digit code after a fake 400ms delay. No call to `signInWithOtp`/`verifyOtp` anywhere in the app, despite a real, working SMS-OTP backend (`supabase/functions/send-sms`, Digicel/Flow) sitting unused. Users are never actually phone-verified today.
- **Age verification is a compliance risk, not just a mock-data issue**: `AgeVerificationPage.tsx` computes the gate client-side from a user-entered DOB, adds a fake delay for theater, and sets a `localStorage` flag — trivially bypassed via devtools, with no server-side/ID-check integration. If this gates alcohol sales, it needs to be treated as a launch blocker on its own, separate from the general mock-data cleanup.

### E. Notifications — no real channel wired to the customer app

- Browser `Notification.permission` prompting works, but **no push subscription is ever registered** — no service worker, no manifest, no FCM/OneSignal/web-push anywhere in dash-customer.
- `API_ENDPOINTS.notifications` is defined in the shared client config but **the corresponding edge function directory doesn't exist** on the backend at all — this is referenced-but-unimplemented, not just unwired.
- Merchant-side push (`merchant-push` function, `delivery.merchant_notifications`/`merchant_push_subscriptions`) exists and works — there is no customer-side equivalent table or function to build against; this needs backend design, not just a frontend call.
- No email/SMS provider (SendGrid, Resend, Twilio) is wired for transactional messages (order confirmations, receipts) to customers.

### F. Maps, Geolocation, Delivery Tracking — fully simulated, real package sitting unused

- Address autocomplete (`AddressAutocomplete.tsx`) filters a hardcoded 8-entry Kingston address list — no Google Places/Mapbox geocoding.
- Delivery-zone/serviceability check (`deliveryZones.ts`) is keyword substring matching, not a real geofence or geocoder.
- All "maps" shown to the user (onboarding, checkout, tracking) are static local images, not live maps.
- Live courier location in `OnTheWayView.tsx` animates through 5 hardcoded `{top, left}` positions on a timer — not driven by any GPS feed.
- Notably, `packages/location` already exists in the monorepo (`geocode.ts`, `geolocation.ts`, `maps.ts`, `validation.ts`) and **dash-customer doesn't depend on it at all**. This may substantially shorten the maps work if that package is usable as-is.
- Order-status transport is real (5s polling), so once real courier GPS exists server-side, wiring live position display is comparatively straightforward — realtime plumbing (`supabase_realtime` publication on `delivery.orders`) is already in place server-side and unused by the client.

### G. Client-Only Persistence (should be server-synced)

All of the following are `localStorage`-only today, meaning they're lost on logout, on a new device, or if storage is cleared — and never visible to any backend/support tooling:
- **Profile** (`accountContent.ts` — hardcoded default "Sarah Johnson", edits never reach Supabase user metadata or a profile table)
- **Favorites** (`favoritesStorage.ts` — no backend table exists for this at all; needs schema work)
- **Saved addresses** (`addressStorage.ts` — despite `delivery.customers.saved_addresses jsonb` already existing server-side to support exactly this, unused)
- **Checkout/notification/payment-alt preferences** (`checkoutStorage.ts`, `accountSubContent.ts`)
- **Cart** (acceptable to be client-first, see §B)

### H. Backend / Database — real foundation, targeted gaps remain

Per the backend audit and live `get_advisors` check (not just prior docs):
- Core schemas (`delivery`, `payments`) are well-built for orders/merchants/payments; RLS is enabled everywhere.
- Previously flagged **critical** RLS holes (merchants self-approving KYC/commission, customers self-unsuspending) and the **critical** IDOR/PII-leak findings from `docs/edge-function-audit-2026-07-24.md` (unauthenticated order-detail leak, cross-customer payment-intent IDOR, client-trusted pricing) are confirmed **fixed in code today**, not just marked fixed in a doc.
- **Still open today**, confirmed live: 7 tables have RLS enabled with **zero policies** — `delivery.carts`, `delivery.courier_availability`, `delivery.order_disputes`, `delivery.order_events`, `payments.courier_payouts`, `payments.merchant_adjustments`, `payments.refunds`. This defaults to deny (not a leak), but it also means there is currently no legitimate way for a customer to read their own refund record or dispute status — a real gap that will surface as a bug, not a security hole, once the frontend tries to wire these up.
- Missing FKs (`payments.merchant_payouts`/`merchant_bank_accounts` → `delivery.merchants`; `courier_availability.driver_id`/`orders.courier_id` → no courier identity table) and missing CHECK constraints on order status and all money columns — open per `docs/schema-audit.md`, not independently re-verified as fixed.
- Several functions have mutable `search_path` (WARN); a few inventory RPCs are `SECURITY DEFINER` and callable by `anon`/`authenticated` — back-office scoped, low priority for the customer app specifically.
- Performance advisors show numerous unindexed FKs and un-wrapped `auth.uid()` calls in RLS policies across `payments.*` and `delivery.merchants`/`orders` — a platform-wide pattern, not unique to dash-customer, but will matter at production load.
- No dedicated **courier dispatch/matching** exists for delivery — the courier flow is pull-based (`GET /courier/available-orders` + accept), not push-assigned. Worth a product decision on whether that's acceptable for launch.

### I. Environment, Secrets, Config

- No hardcoded secrets/API keys found in `apps/dash-customer/src` (checked common patterns — zero matches).
- `apps/dash-customer/.env.example` only declares `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, both placeholders.
- **Notable risk, not a leak**: `packages/api-client/src/supabaseInfo.ts` has **hardcoded fallback defaults** for the Supabase project ref and anon key if env vars are unset. Anon keys are meant to be public, so this isn't a secret exposure, but it means a misconfigured build (missing env vars) will silently connect to a specific live Supabase project instead of failing loudly — worth changing to fail-closed before launch so misconfiguration is caught in CI/staging rather than production.
- Payment provider secrets (WiPay, PayPal) are correctly server-only (`Deno.env.get`) with no fallback defaults — if unset, the function errors rather than silently degrading. This is the right pattern; §I's anon-key fallback should match it.
- No Stripe/Maps/Twilio/FCM/SendGrid keys present anywhere yet, consistent with §E/§F findings that those integrations don't exist.

### J. Error Handling & Resilience

- Real browser online/offline detection drives a dedicated `ConnectionErrorPage`.
- But this only covers "no network" — individual API-call failures are handled inconsistently: some show a generic toast (`CheckoutPage.tsx`), some silently substitute mock data (`OrderTrackingPage.tsx`, `OrdersPage.tsx`, `merchantDiscovery.ts`). **This inconsistency is itself the top cross-cutting risk in this audit** — before any other fix, the team should decide on one policy (e.g., "API failure always shows an error state, never silently substitutes demo content in production") and apply it everywhere, ideally gated by environment so mock fallback can stay useful in local/dev builds.
- `ConnectionErrorPage.tsx` has a hardcoded demo deep-link (`orderId: 'island-active'`, `demoPhase: 'preparing'`) baked into a production error page — should be removed or gated behind a dev flag.

---

## 3. Prioritized Punch List

**P0 — Compliance/Security blockers (fix before any real users, independent of everything else):**
1. Age verification (`AgeVerificationPage.tsx`) — replace client-only DOB check with real server-side verification if the app sells age-restricted items.
2. Decide and enforce a single "API failure → real error state, never silent mock substitution" policy across `OrderTrackingPage`, `OrdersPage`, `merchantDiscovery.ts`, at minimum gated by environment.
3. Fix `packages/api-client/src/supabaseInfo.ts` to fail closed (throw/build-fail) when Supabase env vars are missing, rather than falling back to a hardcoded live project.

**P1 — Core "make it real" wiring (backend mostly exists, frontend needs to call it):**
4. Wire `OrdersPage`/`OrderDetailsPage`/`QuickReorderSection` to `GET /customer/orders` and `GET /orders/:id` with no mock fallback in production.
5. Wire `favoritesStorage`, `addressStorage` (backend column `delivery.customers.saved_addresses` already exists — confirm shape), and `accountContent` profile edits to real backend persistence instead of `localStorage`.
6. Replace the phone-OTP onboarding screen with real `signInWithOtp`/`verifyOtp` calls against the already-working `send-sms` function, or remove the step if it's not actually required.
7. Add RLS policies for the 7 currently-policy-less tables (`carts`, `courier_availability`, `order_disputes`, `order_events`, `courier_payouts`, `merchant_adjustments`, `refunds`) scoped to the owning customer/merchant/courier.

**P2 — Needs real backend/vendor work, not just frontend wiring:**
8. Build a real reviews table + submission endpoint (none exists today) and wire `RateOrderPage`/`RestaurantReviewsPage` to it.
9. Build a real card-vault flow (tokenize via WiPay/PayPal or a PCI-scoped provider) with a `POST /payments/methods` endpoint; wire `AddCardPage`/`PaymentMethodsPage` to it; remove the fake "PCI DSS" badges until true.
10. Implement refund capture against the payment provider (currently a backend `TODO`).
11. Wire a maps/geocoding provider (Google Places/Mapbox) for address autocomplete and delivery-zone checks — evaluate reusing the existing, currently-unused `packages/location`.
12. Design and build customer-facing notifications (push subscription + table, or decide email/SMS instead) — `API_ENDPOINTS.notifications` currently points at a non-existent function.
13. Real-time courier location: requires courier-side GPS reporting (new) feeding the already-existing `delivery.orders` realtime publication, then swap `OnTheWayView`'s animated mock for a live feed.
14. Wire deals/promotions UI to the existing `delivery.merchant_promotions` table; implement real search (likely Postgres full-text or an external search index) to replace `searchDishes`/`searchGroupedResults`.

**P3 — Data integrity hardening (defense in depth, not launch-blocking on their own):**
15. Add missing FKs (`merchant_payouts`/`merchant_bank_accounts` → `merchants`; courier columns → a courier identity table) and CHECK constraints on order status and all money columns.
16. Address unindexed FKs and un-wrapped `auth.uid()` in RLS policies flagged by the performance advisor, ahead of production load.
17. Fix mutable `search_path` on flagged functions; review whether the `SECURITY DEFINER` inventory RPCs need `anon`/`authenticated` execute grants.
18. Confirm/verify whether client-computed delivery fee, service fee, and tax are re-derived server-side (item pricing already is) — close the loop if not.

**P4 — Product decisions needed, not purely engineering:**
19. Is pull-based courier acceptance (no auto-dispatch) acceptable for launch, or does delivery need push-assignment like rides?
20. Is the current cart-not-merged-on-login behavior acceptable, or should a logged-out cart merge into the account on sign-in?

---

## 4. Suggested Phasing (for the follow-up implementation plan)

This audit intentionally stops short of a full implementation plan, but a rough phase order that respects dependencies:

1. **Phase 0 — Stop the bleeding**: P0 items (age gate, silent-fallback policy, env fail-closed). These are cheap and prevent the worst production surprises regardless of what else ships.
2. **Phase 1 — Real data everywhere the backend already supports it**: P1 items (orders history/detail, favorites/addresses/profile persistence, real OTP, missing RLS policies). This is the bulk of "make demo data real" and mostly frontend + small backend policy work.
3. **Phase 2 — New backend surfaces**: reviews, card vault, refund capture, notifications backend. Requires schema/edge-function design, so sequence after Phase 1 stabilizes the pattern for how the frontend talks to the backend.
4. **Phase 3 — Vendor integrations**: maps/geocoding, live courier GPS, real search. Likely the longest lead time (vendor contracts/keys, possibly courier-app changes outside dash-customer's scope).
5. **Phase 4 — Hardening**: P3 schema/index/RLS-policy cleanup, ideally done incrementally alongside Phases 1–3 rather than deferred entirely to the end.

---

## 5. Notes on Methodology / Confidence

- Findings citing specific `file:line` locations were read directly from source by the audit agents; findings citing `docs/*.md` were cross-checked live where a live check was possible (`get_advisors`, direct read of `customerOrderRoutes.ts` for the pricing fix). Items marked "per docs, not independently re-verified" should be spot-checked before being treated as still-accurate.
- This audit covers `apps/dash-customer` only. Corresponding audits for `dash-courier`, `dash-merchant`, `driver`, `fleet`, etc. would need to be run separately if those apps are also headed to production — they share the same `delivery`/`payments` backend but have their own frontend wiring status.
- No code was changed. This document is intended as the input to a separate implementation plan.
