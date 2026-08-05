# Roam Rush — Production Readiness Audit (vs. Roam Rideshare Baseline)

**Date:** 2026-08-03
**Author:** Consolidated audit — static, read-only code review. No code was changed as part of this audit.
**Scope:** `apps/dash-customer`, `apps/dash-courier`, `apps/dash-merchant` (the "Roam Rush" DoorDash-style marketplace), benchmarked against `apps/rides-passenger`, `apps/driver`, and `apps/fleet` (the "Roam Rideshare" suite, currently production and serving real riders/drivers). Also covers the shared backend these apps depend on: `supabase/functions/delivery`, `supabase/functions/payments`, `supabase/functions/matching`, `supabase/functions/notifications`, `supabase/functions/merchant-push`, the `delivery`/`payments` Postgres schemas, and shared packages (`@roam/api-client`, `@roam/auth-client`, `@roam/location`, `@roam/vertical-config`, `@roam/platform-settings`).

**Method:** This document merges two layers of evidence:
1. Four prior static audits already in this repo (`docs/dash-customer-production-readiness-audit.md`, `docs/dash-courier-production-readiness-audit.md`, `docs/dash-merchant-production-readiness-audit.md`, `docs/dash-cross-app-integration-audit.md`, all dated 2026-07-28/29), and
2. A fresh re-verification pass against the current codebase (HEAD as of 2026-08-03), including direct git history review and four new parallel audits that specifically benchmark each Dash app against its rideshare counterpart.

Where the fresh pass confirmed a prior finding is now **fixed in code** (not just claimed fixed), it's marked `✅ RESOLVED`. Where a fresh finding is genuinely new (not in the prior docs), it's marked `🆕 NEW`. Every finding below was verified by directly reading the cited file — nothing here is inferred from doc claims alone.

---

## 0. Executive Summary

Roam Rush is **not a UI shell** — it's a partially-real marketplace with a genuinely substantial backend (order placement, real WiPay/PayPal payment capture, real-time order sync via Supabase Realtime, real RLS, real admin tooling) that is meaningfully more built-out than a first read of the file tree suggests. The team has also been actively fixing things: several P0 items flagged in the 2026-07-29 audits (the `assigned`-status marketplace-breaking bug, missing live courier map, missing customer cancellation, missing commission/fee split, duplicate payout routes) were independently re-verified as **fixed** in this pass, days after they were documented. That's a good sign for velocity.

That said, **Roam Rush is not at rideshare parity, and there are new blockers the July audits didn't catch.** The honest comparison:

| Dimension | Rideshare (production) | Roam Rush (today) |
|---|---|---|
| Native mobile app (Capacitor/Android/iOS) | Yes — full Capacitor stack, background GPS, native builds | **None of the three Dash apps have Capacitor at all.** Web-only. |
| Driver/courier dispatch engine | Mature: geo-distance pooling, fairness rotation, wave escalation, reconciliation (`supabase/functions/matching`) | Courier dispatch is a **separate, simplified, distance-agnostic, single-shot** implementation with no scheduled re-dispatch |
| Payout/settlement integrity | Dedicated idempotency/dedup subsystem (`rides/cashSettlement/*`) | Courier self-service payout endpoint has **no idempotency protection** — duplicate-payout exploit exists today |
| Merchant/business money movement | N/A (fleet uses reimbursement flows) | **No real bank disbursement rail exists anywhere** — bank account numbers aren't even persisted |
| In-app chat/support | `@roam/ride-chat` wired into driver | dash-courier has no in-app chat at all |
| Automated tests | Present (`vitest`, `*.test.ts` files) in rides-passenger/driver | **Zero test infrastructure** in dash-customer and dash-courier |
| i18n | Fully internationalized (`src/i18n`, `locales.ts`) | dash-customer has **no i18n at all** |
| Core order/ride lifecycle wiring | Real, production-proven | Mostly real, with two confirmed pricing/address bugs reaching production on every real order |

**Total open findings across the suite: 6 Blockers that touch real money or ship wrong data to production, plus ~14 High-severity gaps, plus a long tail of Medium/Low polish items.** Several of the Blockers are new discoveries from this pass, not carried over from the July docs — see §1.1.

**Bottom line:** the backend foundation (schema, RLS, payments plumbing, realtime) is closer to rideshare-grade than the frontends are. The fastest path to parity is: (1) fix the handful of money-integrity and data-integrity bugs in §1.1 immediately, (2) decide the native-app question for courier (a courier cannot realistically do this job from a backgrounded browser tab), (3) close the payout/disbursement gap for both couriers and merchants before any real money changes hands, (4) then work through the mock-data/wiring backlog per app.

### 0.1 Severity legend

- **Blocker** — must not ship to real users/real money in this state; either a live bug reaching production paths, a compliance gap, or a security/financial-integrity hole.
- **High** — will cause real user-facing failures or business-process failures at moderate frequency; should be fixed before general launch.
- **Medium** — real gap, lower frequency/impact, or needs backend/vendor work before it can be closed.
- **Low** — polish, honestly-labeled stubs ("coming soon"), or cleanup.

---

## 1. Cross-Cutting Findings (apply to more than one app)

### 1.1 🆕 NEW — Money-integrity and data-integrity Blockers found in this pass

These were not flagged in the July docs and were independently verified by direct file read during this audit.

1. **[Blocker] Courier payout self-service has no idempotency/dedup protection — exploitable duplicate-payout vector.**
   `supabase/functions/delivery/courierConsumerRoutes.ts:481-524` (`POST /courier/payouts/close-period`). A courier calls this endpoint authenticated as themselves, supplies their own `periodStart`/`periodEnd` in the request body, and the handler sums `delivery_fee + tip` for their delivered orders in that window and directly inserts a `payments.courier_payouts` row with `status: "pending"`. There is **no unique constraint** on `(courier_id, period_start, period_end)` in the schema (`supabase/migrations/20260511150000_payments_schema.sql:81-94`), **no linkage table** recording which order IDs were included, and no server-side check that a given period (or overlapping period) hasn't already been paid out. A courier can call this repeatedly with the same/overlapping ranges and generate multiple `pending` payout rows for the same completed deliveries. Rideshare's equivalent (`supabase/functions/rides/cashSettlement/`) has an entire subsystem for this exact problem (`requestHash.ts`, `settlementRepairGuards.ts`, `repairIncompleteSettlement.ts`) — delivery has none of it.
   **Fix:** add a DB-level unique constraint on `(courier_id, period_start, period_end)` at minimum; ideally move to an order-linkage model (one row per settled order, or a ledger) so a period can't be double-claimed even with adjacent/overlapping ranges.

2. **[Blocker] dash-customer checkout sends a hardcoded delivery fee to the order API for every real merchant.**
   `apps/dash-customer/src/pages/CheckoutPage.tsx:58-60`:
   ```ts
   const merchantDeliveryFee = merchantId
     ? parseDeliveryFeeLabel(getRestaurantProfile(merchantId).deliveryFee)
     : 0;
   ```
   `getRestaurantProfile()` (`apps/dash-customer/src/lib/restaurantContent.ts:169-174`) ignores the passed `id` for anything other than two hardcoded demo slugs and returns the fake `ISLAND_GRILL` object, whose `deliveryFee` is a hardcoded `'J$150 delivery fee'` string. This value flows straight into `calculateOrderTotals()` and is submitted with the real order (`CheckoutPage.tsx:190`). **This is not gated by the app's `allowMocks()` safety flag** — it runs unconditionally in production for every merchant that isn't one of the two demo restaurants. Note the *platform fee rate* is fetched correctly from the real `/merchants/:id/pricing` endpoint in the same file — only the delivery fee input is wrong.
   **Fix:** replace `getRestaurantProfile(merchantId).deliveryFee` with the real per-merchant delivery fee (already available server-side per `merchants.delivery_fee`, confirmed to exist in `supabase/functions/delivery/customerOrderRoutes.ts:187-198` — reuse that source instead of the static content file).

3. **[High] dash-customer checkout silently falls back to a hardcoded fake address and gate code on any address-load failure — ungated by `allowMocks()`.**
   `apps/dash-customer/src/pages/CheckoutPage.tsx:50-55`:
   ```ts
   const deliveryAddress = savedAddress
     ? `${savedAddress.line1}${savedAddress.line2 ? `, ${savedAddress.line2}` : ''}`
     : '45 Constant Spring Rd, Apt 12B';
   const instructions = savedAddress?.instructions ?? 'Leave at door • Gate code: 1234';
   ```
   If `getSavedAddress()` returns `null` (localStorage cleared, backend sync fails silently — `syncAddressesFromBackend()` swallows all errors and falls back to local storage, `addressStorage.ts:107-118`, new device without onboarding redo), checkout displays and **submits** this fake Kingston address with no error, no warning, no gate. Onboarding normally forces address entry first, so this is an edge-path bug, not the common path — but it's a silent misdelivery risk with zero user-facing signal when it happens.
   **Fix:** if no saved address exists at checkout time, block order placement and route to address entry — never synthesize a fake one.

4. **[Blocker] dash-merchant: merchant bank/routing numbers are never actually persisted — no real payout rail exists.**
   `supabase/functions/delivery/merchant_application_routes.ts:592-643` (`POST /merchant/bank-account`) receives the full account/routing number from the client but only computes and stores the **last 4 digits** — the full numbers are discarded after the request, never encrypted-and-vaulted, never sent to a processor. No code path anywhere in the repo (checked both `apps/dash-merchant/src` and `supabase/functions`) can use this data to actually move money to a merchant. `apps/dash-merchant/src/components/PayoutSetupSheet.tsx:177-183` tells merchants "Your banking information is securely encrypted and used solely for depositing your earnings" — **this claim is false as implemented.** Compounding this: there is no Stripe Connect / Dwolla / Plaid / WiPay-payout integration anywhere — the only "payout" mechanism is an admin manually creating a database row (`supabase/functions/delivery/admin/financeRoutes.ts:18-100`); nothing executes an actual bank transfer.
   **Fix:** this needs a real disbursement-rail decision (Stripe Connect Express is the natural fit alongside the existing Stripe Terminal dependency) before any merchant payout claim in the UI can be true. Until then, the "securely encrypted" copy should be removed — it's a false claim to a business partner about their financial data.

5. **[Blocker] dash-merchant: in-store card reader discovery is hardcoded to simulated mode — real Stripe Terminal hardware can never be used.**
   `apps/dash-merchant/src/lib/stripe-terminal.ts:67`:
   ```ts
   const discover = await terminal.discoverReaders({ simulated: true });
   ```
   This is the only call site of `discoverReaders` in the codebase, and `simulated: true` is unconditional — not gated by env or dev-mode. Even with `STRIPE_SECRET_KEY` correctly configured and real hardware present, a merchant's POS will only ever find Stripe's simulated test reader. In-store card-present payments cannot work with real hardware as currently coded. (This is distinct from — and more serious than — the already-known, transparently-flagged `mockMode` fallback for when Stripe isn't configured at all; that one shows an explicit toast to staff.)
   **Fix:** `discoverReaders({ simulated: false })` (or env-gated) once a real reader-registration flow exists.

6. **[High] dash-merchant: holiday/exception hours are localStorage-only and not enforced server-side.**
   `apps/dash-merchant/src/hooks/useMerchantSettings.ts:70-82`. "Special dates" (holiday closures) save only to `localStorage`; there is no corresponding backend table/route. This means a merchant marking themselves closed for a holiday on one device (a) doesn't sync to other staff devices/tablets and (b) **does not actually stop the storefront from accepting orders** — nothing server-side enforces it. This directly affects whether customers can place orders a merchant believes are blocked.
   **Fix:** needs a real `merchant_special_hours` table + route, consumed by whatever server-side logic gates order acceptance (same place `is_accepting_orders` and regular `merchant_hours` are checked).

### 1.2 Confirmed fixed since the 2026-07-29 audits (do not re-work these)

Independently re-verified against current HEAD, not just trusted from doc claims:

| Item | Where verified | Status |
|---|---|---|
| `assigned` order status broke customer tracking UI (regressed to "preparing") | `apps/dash-customer/src/lib/trackingContent.ts:105-106` | ✅ Fixed — real case added |
| `assigned` order status dropped orders from merchant's active queue / hit dead-end detail view | `apps/dash-merchant/src/lib/merchant-orders-filters.ts:20,37,43`; `OrderDetailPage.tsx:141` | ✅ Fixed — `assigned` now included and routed to the `ready` view |
| Courier live location shown as frozen marker with raw lat/lng text | `apps/dash-customer/src/components/tracking/CourierTrackingMap.tsx` (new, 194 lines), wired into `CourierAssignedView.tsx`/`OnTheWayView.tsx` | ✅ Fixed — real Google-Maps-based live marker with schematic fallback |
| No customer-facing order cancellation existed at any layer | `apps/dash-customer/src/pages/OrderTrackingPage.tsx:100-124` calls real `POST /orders/:id/cancel`; backend at `supabase/functions/delivery/customerOrderRoutes.ts:408-474` (self-serve, pre-prep-only) | ✅ Fixed |
| No commission/delivery-fee split — full payment credited to merchant, platform fee never taken | `supabase/functions/delivery/customerOrderRoutes.ts:187-213` + new `platformFeeRate.ts` | ✅ Fixed — real per-merchant/global platform fee rate resolution now feeds order creation. **Note:** delivery fee itself is still wrong for real merchants — see §1.1 item 2, a *different* bug in the same code path. |
| Three uncoordinated payout-creation code paths (`payments.payouts` table confusion) | `supabase/functions/payments/index.ts:797-825` | ✅ Fixed — duplicate routes now return `410 Gone` with an explicit redirect message to the canonical route |
| Courier push subscription (`subscribeCourierPush`) was dead code, never called | `apps/dash-courier/src/services/courierDispatch/RealDispatchProvider.ts:117` | ✅ Fixed — now called during dispatch-provider init (backend delivery still limited by VAPID-stub caveats, see §4) |
| `packages/api-client/src/supabaseInfo.ts` fail-open vs. fail-closed discrepancy (open question between two July docs) | Direct read | ✅ Resolved — confirmed fail-closed (throws if Supabase env vars missing, no hardcoded fallback project) |
| Reviews: `RateOrderPage.tsx` submit didn't send anywhere; no reviews table | Confirmed by July cross-app audit as fixed; not independently re-verified in this pass | ✅ Per prior audit (spot-check recommended before fully trusting) |

### 1.3 Still open from the July audits (re-confirmed relevant, not yet fixed)

- **Stacked/multi-order courier offers are entirely mock** — no backend concept of an order "stack" exists (only a `wave` field on individual offers). Fully exposed in the dash-courier UI as if functional. `apps/dash-courier/src/pages/home/CourierHomePage.tsx:201,237-244` explicitly hardcodes `MOCK_STACKED_OFFER.id` regardless of what's accepted. **Blocker if stacked orders are expected at launch.**
- **`notifications` edge function is a stub for real push delivery**; deployed and reachable but its actual push-send paths largely log/accept-and-discard. Customer notifications work today only via a separate, real, easy-to-miss direct SMS integration (`_shared/dashOrderSms.ts`). Merchant push is real and independent (own VAPID flow). Courier push is now wired client-side (§1.2) but inherits the same silent-no-op-without-VAPID-keys backend risk (see §4).
- **A merchant-initiated cancellation of an assigned/in-flight order leaves the courier's `courier_availability.active_order_id` dangling** — only the courier-initiated cancel path clears it.
- **A courier mid-delivery has no realtime/poll listener on their own active order's status** — a merchant or admin cancellation is invisible to them until they try to complete a delivery that no longer exists.
- **Enterprise Inventory module** (dash-merchant): vendors, transfers, physical-count save, recipes, location hierarchy remain fixture-only despite a real, well-designed 23-table backend schema underneath all of them. Physical-count "Save" silently discards the counted quantities entirely (data-loss bug). `fetchVariance()` is fully implemented server-side and client-side but never called from the flow — cheapest fix in this whole area.
- **No reviews for restaurants themselves** — `RateOrderPage`/order review are wired (§1.2), but there's still no dedicated reviews table; review data lives on `orders.customer_rating`/`customer_review` columns only. Fine at small scale, will need a real schema before review volume/moderation matters.

---

## 2. RoamDash Customer (`apps/dash-customer`) vs. `apps/rides-passenger`

### 2.1 What's real and working (don't re-build this)
- Supabase Auth: signup, login, Google OAuth, session/JWT, `onAuthStateChange` — same shared `@roam/auth-client` pattern as rides-passenger.
- Order placement (`POST /orders`), server-side price re-validation of line items, order cancel, order review — all real, hitting `supabase/functions/delivery/customerOrderRoutes.ts`.
- WiPay + PayPal payment intents, webhook signature verification, PayPal capture, refund logic — all real in `supabase/functions/payments/index.ts`, including rate limiting on `/intents`.
- Real-time order tracking: 5s polling **and** a genuine Supabase Realtime subscription (`postgres_changes` on `delivery.orders`), confirmed backed by an actual realtime publication migration.
- Live courier map with Google Maps (`CourierTrackingMap.tsx`) — see §1.2.
- A genuinely good production-safety pattern: `src/lib/mocksGate.ts`'s `allowMocks()` gate, correctly applied to ~6 of 8 checked mock/demo fallback sites (the 2 exceptions are Blocker/High findings in §1.1).
- Address autocomplete degrades honestly to a disclosed local suggestion list if the Google Places call fails (`AddressAutocomplete.tsx:131-135` shows an explicit "Live address search unavailable" message) — not a hidden gap.
- Network/offline detection (`networkGuard.ts`, `useNetworkStatus.ts`, `ConnectionErrorPage.tsx`) is arguably **more explicit** than what rides-passenger has.

### 2.2 Open findings

| # | Finding | File:Line | Severity |
|---|---|---|---|
| 1 | Hardcoded delivery fee sent to order API for all real merchants | `CheckoutPage.tsx:58-60` | **Blocker** (see §1.1.2) |
| 2 | Hardcoded fallback address/gate code, ungated | `CheckoutPage.tsx:50-55` | **High** (see §1.1.3) |
| 3 | Zero automated test infrastructure — no `vitest`, no test script, no `*.test.ts` files anywhere in the app, despite this being the payment/order-critical surface where the two bugs above live undetected | `package.json` | **High** — rides-passenger has `vitest` + multiple `*.test.ts` files |
| 4 | "Add Card" (saved payment methods) requires a WiPay tokenization token the app provides no way to generate — no WiPay JS SDK integrated anywhere | `AddCardPage.tsx:1-173` | Medium — honestly labeled "coming soon" in-page, but non-functional as shipped |
| 5 | No i18n infrastructure at all (no `src/i18n`, no `locales.ts`) vs. rides-passenger's full internationalization | `package.json`, directory structure | Medium — matters if Jamaica-market language parity with rideshare is a requirement |
| 6 | `.env.example` documents only Supabase URL/anon key — omits `VITE_ALLOW_MOCKS` and any Google Maps key variable, both of which the app depends on | `apps/dash-customer/.env.example` | Medium |
| 7 | Static image (`/images/address-map.png`) instead of a live map on the checkout delivery-address section, inconsistent with the real map quality used in tracking | `CheckoutPage.tsx:277-283` | Low/Medium |
| 8 | Stale Stripe CSP allowlist entry (`https://js.stripe.com`) with zero Stripe usage anywhere in the app (processors are WiPay/PayPal) — looks copy-pasted from another app's config | `vercel.json:14` | Low |
| 9 | No native mobile packaging (Capacitor) — likely an intentional web-first decision for the ordering app (unlike courier, where it's a hard blocker), but should be an explicit product confirmation, not an assumption | `package.json` | Low — confirm intent |
| 10 | No push notification infrastructure (service worker/FCM/APNs), browser `Notification` API only | `notificationPermission.ts` | Low — **note: rides-passenger has the identical gap**, this is a platform-wide limitation, not a dash-customer regression |
| 11 | Phone/OTP auth is fully built but disabled via `ENABLE_PHONE_AUTH = false` (SMS provider not paid/configured); "Continue with Apple" is a disabled, honestly-labeled button | `dashCustomerAuth.ts:8`, `LoginPage.tsx:347-357` | Low — clearly flagged, not deceptive |
| 12 | Deals/search/reviews-per-restaurant remain shallow (per July audit: ~1 real restaurant profile, search matches literal "chicken" substring in one path) — **not independently re-verified in this pass**, flag for spot-check | `lib/restaurantContent.ts`, `lib/searchDishes.ts` | Needs re-verification |

---

## 3. RoamDash Courier (`apps/dash-courier`) vs. `apps/driver`

This is the least production-ready of the three apps. The **admin/compliance portal side** (`src/admin/*`) is genuinely solid — real JWT-role-gated login, a real compliance review queue, a courier presence map, audited approve/suspend/deactivate actions. The **courier-facing app** — what an actual delivery driver uses — has a real dispatch/offer/GPS/push foundation now (per the 2026-07-29 soft-launch remediation, independently re-verified as real and deployed), but several major gaps remain, some newly discovered in this pass.

### 3.1 What's real and working
- Supabase Auth (signup, OTP, Google OAuth), and a genuinely well-built separate courier-admin JWT-role gate.
- `RealDispatchProvider` is the default dispatch engine (mock only behind an explicit dev flag) — `goOnline()`/`goOffline()`, single-offer accept/decline, and GPS transmission are all real, hitting real edge routes.
- Push notifications: real service worker (`public/sw.js`), real VAPID subscribe flow, now actually called during dispatch init (§1.2).
- Earnings summary page is real (`GET /courier/earnings`).
- Document/vehicle upload now writes to real storage with a real courier-documents bucket (per soft-launch remediation).
- Age-verification handoff now requires a real photo capture with an audit trail (per soft-launch remediation) — a meaningful upgrade from the July finding of a checkbox-only gate.
- Network/offline detection (`useNetworkStatus.ts`, `networkGuard.ts`'s `assertOnline()`) is real and actually exercised in action handlers — sensible for a driving-heavy use case.

### 3.2 Open findings

| # | Finding | File:Line | Severity |
|---|---|---|---|
| 1 | 🆕 **No Capacitor / native mobile packaging at all** — zero `@capacitor/*` dependencies. Location tracking uses browser `navigator.geolocation.watchPosition` only, which will not track in the background when the tab/app isn't foregrounded. A courier job fundamentally requires background tracking with the screen off; this cannot be shipped as a real mobile app in its current form. `apps/driver/package.json` has the full Capacitor Android stack. | `package.json` (whole app) | **Blocker** |
| 2 | 🆕 **Active-delivery state only partially overwrites mock data on a real accepted offer.** `CourierHomePage.tsx:105` seeds `activeDelivery` from `MOCK_ACTIVE_DELIVERY`; accepting a real offer (`handleAcceptSingleOffer`, lines 246-288) only overwrites `orderId`/`displayOrderId`/`restaurant`/`dropoffAddress` — every other field (items, prices, customer name/phone, tip, special instructions, photos) stays fabricated. A real courier mid-delivery sees a mix of real and fake order data. | `CourierHomePage.tsx:105,246-288` | **Blocker** |
| 3 | 🆕 **Activity/delivery-history tab is 100% mock, zero backend call.** | `ActivityPage.tsx:1-15` → `mockActivity.ts` | **Blocker** |
| 4 | 🆕 **Payout History page is 100% mock.** | `PayoutHistoryPage.tsx:1-10,68-80` → `mockPayoutHistory.ts` | **Blocker** |
| 5 | 🆕 **Payout Settings page is entirely hardcoded UI** — "Bank account ending in ****4521" is static JSX text, "Add payment method" button has no `onClick` handler, payout-schedule selector only sets local state. **No Stripe Connect or any payment-processor code exists anywhere in this app** (zero matches for "stripe"). The real backend `closeCourierPayoutPeriod` function exists in `courierApi.ts` but is never called from any page — dead on the frontend, and (per §1.1.1) unsafe even if wired up. | `PayoutSettingsPage.tsx:41-133` | **Blocker** — couriers currently have no way to actually get paid |
| 6 | Stacked/multi-order offers fully mock | see §1.3 | **Blocker if stacked orders required at launch** |
| 7 | No in-app chat/support — `HelpSupportPage.tsx` renders a fully mock FAQ/ticket list; only live affordance is a `tel:911` dialer link. `apps/driver` has `@roam/ride-chat` wired; dash-courier has no equivalent dependency at all. | `HelpSupportPage.tsx`, `package.json` | **High** |
| 8 | GPS pings have no sequence numbers/idempotency protection — out-of-order location writes are possible. Driver's equivalent (`nextClientSeq`, exponential backoff on `rate_limited`) has none of this risk. | `courierApi.ts:147-156` vs `apps/driver/src/utils/rideLocationSeq.ts` | **High** |
| 9 | No realtime channel for offers/going-online/status — polling only (8s offer poll, 5s active-order poll). Driver subscribes to a real Supabase Realtime channel in addition to a 4s poll. | `RealDispatchProvider.ts:153-232` vs `apps/driver/src/hooks/useRideDispatch.ts:367-389` | **Medium** — offer latency up to 8s, delayed awareness of remote cancels |
| 10 | Vehicle photo captured but never uploaded — only a local blob preview; make/model/plate/color save, but the required photo is silently dropped | `VehicleSetupPage.tsx:32-49` | **High** |
| 11 | No Google Maps/geocoding SDK — only `leaflet`; unverified whether the navigation sheet actually deep-links to external maps apps or is UI-only | `package.json`; `NavigationPickerSheet.tsx` | Medium — needs follow-up verification |
| 12 | Zero test infrastructure (no `vitest`, no test script) | `package.json` | Medium |
| 13 | `PlaceholderHomePage.tsx` literally renders "Home coming soon" — routing reachability not confirmed in this pass; Blocker if reachable, Low if dead code | `PlaceholderHomePage.tsx:4-8` | Needs re-verification |
| 14 | `MockDispatchProvider` and its mock data files ship in the production bundle (not tree-shaken), with a live env-var footgun (`VITE_COURIER_USE_MOCK_DISPATCH`) that could flip a production build to all-mock if ever misconfigured | `useCourierDispatch.ts` | Low — hygiene/deploy-safety item |
| 15 | Document upload writes directly from the browser to `delivery.courier_documents` (RLS-only trust boundary), weaker than driver's server-mediated evidence-upload pattern | `courierDocumentService.ts:43-90` | Medium |

---

## 4. RoamDash Merchant (`apps/dash-merchant`) vs. `apps/fleet` / `apps/admin`

This is the **most production-ready of the three Dash apps** — core ordering, real-time updates, menu CRUD, analytics, earnings, onboarding/KYC, and the embedded admin portal are all genuinely wired to real backends, comparable in wiring quality to fleet's dashboard patterns. The gaps are concentrated and specific rather than pervasive.

### 4.1 What's real and working
- Merchant auth (dedicated Supabase instance, session refresh, legacy-session migration), team RBAC via `membership.permissions`, admin RBAC via real JWT `app_metadata` role claims.
- Order queue: real Supabase Realtime `postgres_changes` subscription on `delivery.orders` filtered by `merchant_id`, with connection-status surfaced to the UI, plus sound/haptic new-order alerts.
- Web push: fully real end-to-end (VAPID subscribe, real `web-push` sends, stale-subscription cleanup) — the best-built notification story of the three apps.
- Menu CRUD, promotions, settings, earnings, analytics — real React Query hooks against real `${API_ENDPOINTS.delivery}/merchant/...` routes with optimistic updates and rollback.
- Onboarding/KYC: draft autosave, real Google Maps geocoding, real document upload with magic-byte validation and malware scanning, live-computed application-status checklist, a real admin approval state machine with SLA-breach flagging and audit logging.
- In-store POS: real order creation, real Stripe `card_present` payment-intent creation (with an honestly-flagged `mockMode` when `STRIPE_SECRET_KEY` is unset), real inventory depletion on sale.
- Staff-ops order queues (kitchen/counter/bar/drive-thru/expo): real Realtime-backed feed, no hardcoded order data.
- Enterprise Inventory backend: a genuinely well-designed 23-table schema with tenant-scoped RLS via `SECURITY DEFINER` helpers and service-role-only writes — a serious piece of engineering, even though its frontend is only half-wired (§1.3).
- `QueryErrorState.tsx` is used across ~12 real call sites — the best error-handling story of the three apps.

### 4.2 Open findings

| # | Finding | File:Line | Severity |
|---|---|---|---|
| 1 | Bank/routing numbers never persisted; no real disbursement rail | `merchant_application_routes.ts:592-643` | **Blocker** (see §1.1.4) |
| 2 | Card reader discovery hardcoded to simulated mode | `stripe-terminal.ts:67` | **Blocker** (see §1.1.5) |
| 3 | `ReadyOrderDetail.tsx` primary "Confirm Pickup" CTA — **re-verify current state**: the July audit called this permanently disabled with a fabricated courier identity; this pass did not independently re-check it post the `assigned`-status fix (§1.2), and it's plausible this was touched in the same remediation. **Flag for direct re-read before treating either version as current.** | `ReadyOrderDetail.tsx` | Needs re-verification (was Blocker) |
| 4 | Enterprise Inventory silently keeps fixture data on API failure instead of showing an error — the `catch` block only toasts, never clears fixture-seeded state. Affects a feature that drives real purchasing/counting decisions. | `EnterpriseInventoryFlow.tsx:87-160` | **High** |
| 5 | Holiday/special hours are localStorage-only, not enforced server-side | `useMerchantSettings.ts:70-82` | **High** (see §1.1.6) |
| 6 | Restaurant-management dashboard (`PosRegisterPage.tsx`) seeded from fixtures; not independently confirmed always overwritten by real data | `PosRegisterPage.tsx:56-74` | Medium |
| 7 | `merchant_bank_accounts.is_verified` always false — no verification flow (e.g. micro-deposits) exists | schema + code review | Medium (follows from #1) |
| 8 | `.env.example` omits `VITE_VAPID_PUBLIC_KEY` and other required vars — a new environment could silently ship without push configured | `apps/dash-merchant/.env.example` | Medium |
| 9 | Not confirmed whether a DB webhook/trigger on `delivery.orders` insert actually calls `merchant-push` in production — the edge function supports the payload shape but the trigger config itself wasn't located in migrations | `supabase/migrations/*` | Medium — unverified, needs an explicit pre-launch check |
| 10 | Vendors/transfers/physical-count/recipes/location-hierarchy remain fixture-only in Enterprise Inventory despite a real backend; physical-count "Save" silently discards counted data (data-loss bug); `fetchVariance()` is fully built and simply never called | `enterprise-inventory/*` | High (data loss), Medium (rest) |
| 11 | "Instant Payout"/"Download Statement"/custom alert sounds are honestly labeled "coming soon" | various | Low |
| 12 | Website/Instagram/Facebook profile fields are localStorage-only, no backend persistence | `useMerchantSettings.ts` | Low |
| 13 | No centralized `PermissionGate`-equivalent component (fleet's reference pattern) — permission checks are inlined per-page instead | throughout `src/admin` | Low |
| 14 | No automated ID/liveness verification vendor for merchant KYC — approval is human document review only | admin approval flow | Low (design choice, confirm intentional) |

---

## 5. Shared Backend & Platform Infrastructure

### 5.1 What's real and working
- `supabase/functions/delivery` (1,830-line `index.ts` + ~25 route/helper modules) is comparable in scale and real-query density to `supabase/functions/rides`. No blocking stubs found.
- `supabase/functions/payments` (930 lines) is genuinely shared between both verticals — real WiPay/PayPal tokenized intents, webhook verification, refunds. Card tokenization correctly requires a `providerToken`; raw PAN is never accepted.
- `merchant-push` and the courier-facing parts of `notifications` are real (VAPID web-push, subscription pruning on 404/410).
- Delivery-schema RLS/migration coverage (policy count, FK/CHECK-constraint hardening waves) is roughly on par with rides' base migration, with active, ongoing hardening work visible (`schema_audit_wave2_delivery_money.sql` mirrors the rides-side wave-3 pattern).
- `packages/types/src/delivery.ts` / `courier.ts` are reasonably fleshed out, comparable in kind to the rides/driver type files.
- `packages/vertical-config` (restaurant/grocery/pharmacy/alcohol/convenience/retail presets, compliance-doc requirements, UI labels) is well-developed and dash-specific — not stubbed.

### 5.2 Open findings

| # | Finding | Where | Severity |
|---|---|---|---|
| 1 | Courier payout self-service has no idempotency protection | see §1.1.1 | **Blocker** |
| 2 | Courier-order dispatch is a separate, distance-agnostic, single-shot implementation with no scheduled re-dispatch. `dispatchOffersForOrder` (`courierConsumerRoutes.ts:48-101`) explicitly comments "simple distance-agnostic wave" — grabs up to 25 online couriers with no radius/proximity ranking/fairness rotation, and expired offers are only marked expired lazily when a courier happens to poll. An order whose wave-1 offers all expire unaccepted can go permanently un-offered if no courier polls in that window. Rides' `matching` engine (haversine pooling, fairness rotation, wave escalation, reconciliation) is not reused at all. | `courierConsumerRoutes.ts:48-101` vs `supabase/functions/matching/*` | **High** |
| 3 | Both `merchant-push` and `notifications` silently no-op (or return a vague `202 queued_awaiting_vapid`) when `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are unset — if these aren't provisioned in production, merchants/couriers get zero alerts with no fallback channel (customers have SMS fallback; merchants/couriers do not) | `merchant-push/index.ts:43-51`, `notifications/index.ts:127-140` | Medium |
| 4 | Merchant payout amounts are admin-entered free text, not computed from a settlement ledger the way rides' `cashSettlement/buildSettlementJournalV2.ts` deterministically computes | `delivery/admin/financeRoutes.ts:18-100` | Medium |
| 5 | The in-progress "unified ledger" effort (`_shared/unifiedLedger/`) only mirrors already-created payouts into an accounting journal after the fact — it is not a source of truth or reconciliation mechanism between the merchant-admin and courier-self-service payout paths | `_shared/unifiedLedger/*` | Medium |
| 6 | `packages/api-client` has no typed request/response client methods for either vertical — just base URL config. **Not dash-specific**; rides has the identical gap. Flag as a general code-quality item, not a launch blocker. | `packages/api-client/src/config.ts` | Low |
| 7 | `platform-catalog` edge function is a confirmed 34-line stub (`TODO: Extract routes from make-server-37f42386`) — but it's fleet/rideshare-adjacent catalog data (vehicles, toll plazas, gas stations), **not a Dash dependency**. Real gap, wrong audit. | `supabase/functions/platform-catalog/index.ts` | N/A for Dash |
| 8 | No centralized feature-flag entry for "is the Dash vertical live" distinct from its own maintenance-mode toggle — `platform-settings` treats `dash`/`courier` as ordinary settings segments alongside `rides`/`driver`, which is fine, but there's no dash-specific kill-switch pattern comparable to e.g. the toll system's per-feature flags | `packages/platform-settings/src/defaults.ts:135-181` | Low |

---

## 6. Master Prioritized Punch List

This merges every open finding above into one execution order. Items already marked `✅ RESOLVED` in §1.2 are excluded.

### P0 — Money-integrity, data-integrity, and marketplace-breaking (fix before any real users/real money)
1. Add DB-level idempotency (unique constraint on `courier_id, period_start, period_end` at minimum; ideally order-linkage) to `POST /courier/payouts/close-period` — §1.1.1.
2. Fix `CheckoutPage.tsx` to use the real per-merchant delivery fee instead of `getRestaurantProfile().deliveryFee` — §1.1.2.
3. Block order placement (don't synthesize a fake address) when no saved address exists at checkout — §1.1.3.
4. Decide and implement a real merchant disbursement rail (Stripe Connect Express is the natural fit); stop discarding full bank/routing numbers, or stop claiming they're "securely encrypted" until they are — §1.1.4.
5. Fix Stripe Terminal reader discovery (`simulated: true` → real) — §1.1.5.
6. Build real backend enforcement for merchant holiday/special hours — §1.1.6.
7. Fix the merchant-initiated-cancellation dangling `active_order_id` bug (only courier-initiated cancels clear it today) — §1.3.
8. Add a realtime listener/poll on the courier's own active order status so remote cancellations aren't silent — §1.3.
9. Re-verify `ReadyOrderDetail.tsx`'s "Confirm Pickup" CTA and courier-identity display current state — §4.2 item 3.

### P1 — Courier app cannot function as a real job without these
10. Decide the native-app question for dash-courier and implement Capacitor + background geolocation — a courier cannot be tracked reliably from a backgrounded browser tab (§3.2 item 1).
11. Fully populate `activeDelivery` from the real accepted order — stop leaving items/prices/customer info/tip mocked after a real accept (§3.2 item 2).
12. Wire Activity/history page to real order data (§3.2 item 3).
13. Wire Payout History page to real payout data (§3.2 item 4).
14. Build a real courier payout-method/Stripe-Connect-equivalent flow — `PayoutSettingsPage.tsx` currently has no working "add payment method" at all (§3.2 item 5; ties into P0 #1 and #4).
15. Fix vehicle-photo upload — currently silently dropped despite make/model/plate/color saving (§3.2 item 10).
16. Add GPS ping sequence numbers/idempotency to prevent out-of-order location writes (§3.2 item 8).

### P2 — Core "make it real" wiring (backend mostly exists; mostly frontend work)
17. Build a real, backend-backed multi-order "stacked offer" flow, or explicitly descope it for launch and remove the mock UI that implies it works (§1.3, §3.2 item 6).
18. Wire `fetchVariance()` into the Enterprise Inventory variance view — already fully built, just never called (§1.3, §4.2 item 10).
19. Fix Enterprise Inventory's physical-count "Save" to actually submit counted data instead of discarding it (§4.2 item 10).
20. Fix Enterprise Inventory's silent fixture-fallback-on-API-failure — show a real error state instead (§4.2 item 4).
21. Build real courier-order dispatch with distance/proximity filtering and scheduled re-dispatch, or explicitly accept the current pull-based limitation as a soft-launch tradeoff (§5.2 item 2).
22. Add in-app chat/support for dash-courier — currently a mock FAQ list and a `tel:911` link only (§3.2 item 7).
23. Wire real-time channels (not just polling) for courier offers/status, matching driver's pattern (§3.2 item 9).
24. Wire remaining Enterprise Inventory views (vendors, transfers, recipes, location hierarchy) to their real backend endpoints (§4.2 item 10).
25. Add real push delivery behind `notifications`' stub endpoints or formally retire the stub in favor of the SMS-only channel that's actually working today (§1.3).

### P3 — Hardening, safety nets, and hygiene
26. Add automated test coverage (`vitest` + `*.test.ts`) to dash-customer and dash-courier — currently zero test infrastructure in either, on the two apps where a real pricing/address bug (§1.1.2/3) already reached production undetected.
27. Ensure `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are actually provisioned in the production Supabase project and add a startup/health check that fails loudly (not a silent `202 queued_awaiting_vapid`) if missing (§5.2 item 3).
28. Confirm whether the `delivery.orders` insert → `merchant-push` DB webhook trigger is actually configured in production (§4.2 item 9).
29. Add `.env.example` entries for `VITE_ALLOW_MOCKS`, Google Maps key (dash-customer), and `VITE_VAPID_PUBLIC_KEY` (dash-merchant) so a fresh environment setup can't silently ship misconfigured (§2.2 item 6, §4.2 item 8).
30. Remove the stale Stripe CSP entry from dash-customer's `vercel.json` (§2.2 item 8).
31. Move document upload to a server-mediated path for dash-courier, matching driver's evidence-upload trust boundary (§3.2 item 15).
32. Clean up dead code: `MockDispatchProvider`'s production-bundle footgun (§3.2 item 14), `StationPlaceholderPage.tsx` (per prior merchant audit), unused `patchInventorySettings()`.
33. Compute merchant payout amounts from a real settlement ledger instead of admin free-text entry (§5.2 item 4).

### P4 — Product decisions needed before engineering can finish scoping
34. Is web-only (no native app) acceptable for dash-customer long-term, or does it eventually need Capacitor parity with rides-passenger? (Courier is a hard blocker either way — see P1 #10.)
35. What should real merchant/courier payout cadence and disbursement method actually be (bank transfer via Connect, in-app wallet, cash-out threshold)? Blocks P0 #4 and P1 #14 from being scoped concretely.
36. Is the pull-based courier dispatch model (vs. rides' push/matching-engine model) acceptable for launch, or does delivery need the same fairness/proximity engine? Blocks P2 #21.
37. Does Roam Rush need i18n parity with rides-passenger for the Jamaica market at launch? (§2.2 item 5)
38. Is alcohol/age-restricted-item sale in scope for launch? If yes, the age-verification gate (customer-side DOB check, courier-side handoff photo) needs a real ID-verification vendor decision — currently deferred per an explicit code comment, which is fine only as long as restricted items stay out of scope.

---

## 7. Suggested Phasing

1. **Phase 0 (days, not weeks) — Stop the bleeding.** P0 items 1–9. These are either live money-integrity bugs or marketplace-breaking sync bugs already reaching production code paths today. Cheap to fix individually; expensive to leave live.
2. **Phase 1 — Make the courier app a real job.** P1 items 10–16. Nothing else about the courier experience matters if a courier can't be tracked in the background or get paid. Item 10 (native app decision) should be made first since it affects scope of the rest.
3. **Phase 2 — Close the wiring gaps where the backend already exists.** P2 items 17–25, mostly frontend-to-existing-backend connection work plus one net-new dispatch-engine decision (21).
4. **Phase 3 — Hardening.** P3 items 26–33, ideally threaded through Phases 0–2 rather than deferred to the end, especially test coverage (26) given the two production pricing/address bugs this audit found.
5. **Product decisions (P4)** should be resolved during Phase 0/1 — items 34–36 materially change the scope of Phase 1/2, and item 38 gates whether the deferred age-verification work ever needs to happen at all.

---

## 8. Methodology Notes & Confidence

- This document supersedes the four 2026-07-28/29 docs in `docs/` for anything they disagree on — those docs are valuable historical record and are still accurate for items not called out above as resolved or superseded, but several of their claims (the `assigned`-status bug, the frozen-marker map, missing cancellation, missing fee split, duplicate payout routes, courier push being dead code) were fixed within days of being written and are stale if read on their own.
- Every finding tagged 🆕 NEW or with a specific file:line in this document was verified by direct file read during this pass (2026-08-03), not inferred from the July docs.
- A few items are explicitly flagged **"needs re-verification"** (§4.2 item 3, §3.2 item 13, §2.2 item 12) — these were called out in July but not independently re-checked in this pass; don't treat them as either confirmed-open or confirmed-fixed without a direct read first.
- `apps/haul`, `apps/enterprise`, and `apps/admin` were out of scope for this audit (per the original request, which scoped to the Dash-vs-Rideshare comparison specifically).
- No code was changed as part of this audit.

---

## 9. Full Production Launch Plan

**Goal of this section:** turn §1–§6 into an execution plan a real engineering org would run, ending at **true production launch** — not a soft launch, not a limited pilot with manual workarounds. "Full launch" is defined concretely in §9.1 below. This section assigns ownership, sequences the work, and is explicit about what's on the critical path for the literal golden path (**customer orders → merchant fulfills → courier delivers**) versus what's launch-critical for other reasons (compliance, reliability, money-handling) versus what can genuinely ship after launch without weakening that loop. No code was written for this section — it is a plan only, per the request.

### 9.1 What "Fully Production Ready" Means Here

Three tiers, used throughout this section so scope doesn't quietly balloon:

- 🔴 **Golden-Path Critical** — if this is broken, the literal loop ("customer orders food → restaurant completes the order → driver delivers it") does not work, or works but corrupts money/data while doing it. Nothing in this tier ships broken, ever.
- 🟠 **Launch-Critical (non-negotiable for a real launch, not a soft one)** — the loop technically works without it, but shipping without it means real money moves through an unsafe/unreliable path, or the product can't survive real-world usage (a courier's phone locking, a merchant losing power on their tablet, a payout regulator asking questions). This is what separates "soft launch with training wheels" from "full launch."
- 🟢 **Fast-Follow (post-launch acceptable)** — real, valuable, and already scoped in §1–§6, but does not block the golden path or expose the business to a launch-blocking risk. Ships in the weeks after launch.

**Full-launch go/no-go checklist** (every box must be checked before flipping the switch — see §9.11 for the expanded version):

- [ ] A customer can browse a **real merchant's real menu**, place an order at the **real computed price** (subtotal, real per-merchant delivery fee, real platform fee, real tax, tip), and pay via WiPay or PayPal with money actually captured.
- [ ] The order reaches the merchant in real time; the merchant can accept/reject/prep/mark-ready reliably, including correctly refusing orders outside real (server-enforced) hours.
- [ ] A courier is offered the delivery through a dispatch mechanism that behaves reasonably at real order volume (proximity-aware, doesn't silently strand orders), receives the offer **even if their phone is locked or the app is backgrounded**, accepts, navigates, picks up with proof, delivers with proof.
- [ ] Order status is one consistent source of truth across all three apps — no status value any app doesn't know how to render.
- [ ] The customer can see the courier moving on a real map and can cancel within policy; a merchant- or admin-initiated cancellation reliably reaches and clears state for the courier.
- [ ] Both the merchant and the courier are **actually paid real money** on a defined schedule, through a real disbursement rail, with no way to double-claim a payout.
- [ ] Every state transition notifies the right party through a channel that actually works (push and/or SMS), not a stub.
- [ ] The golden path (browse → order → pay → prep → dispatch → deliver → payout) has automated regression tests that run in CI.
- [ ] Security/compliance sign-off: RLS coverage complete on money tables, no unauthenticated financial endpoints, and a legal/compliance review of the payout rail has cleared money-transmission obligations.
- [ ] The system has been load-tested at expected launch-day volume, and there is monitoring/alerting on the golden path (order stuck in a status too long, payment failures, dispatch failures).
- [ ] There is a support/ops runbook and admin tooling for the failure modes above (stuck order, failed payout, dispute).

### 9.2 Team Structure & Ownership

This plan assumes a real, cross-functional team — assign these as squads, not individuals, and staff to roughly this shape:

| Team | Owns | Suggested size |
|---|---|---|
| **Platform/Backend** | `supabase/functions/delivery`, `matching`, `notifications`, schema/RLS hardening, dispatch engine | 2–3 backend engineers |
| **Payments & Payouts** | Stripe Connect (or equivalent) integration, `payments` function, courier/merchant payout rails, ledger reconciliation | 1–2 engineers (payments-focused) + compliance liaison |
| **Customer App** | `apps/dash-customer` | 1–2 frontend engineers |
| **Courier App & Mobile** | `apps/dash-courier` + Capacitor native build/release | 2–3 engineers, **at least one with prior Capacitor/native mobile release experience** (reuse `apps/driver`'s setup — it's a solved problem in this codebase already) |
| **Merchant App** | `apps/dash-merchant` (core + admin + Enterprise Inventory) | 2 engineers |
| **QA & Release Engineering** | Test infrastructure, golden-path e2e tests, load testing, staged rollout | 1–2 engineers |
| **Security & Compliance** | RLS/schema audit sign-off, PCI scope, money-transmission/KYC legal review | 1 engineer (can be shared/part-time) + legal counsel for the payout rail specifically |
| **Product/Program** | Drives the P4 decisions in §9.10, owns the go/no-go call | 1 PM |

Total: roughly 12–15 people if fully staffed in parallel; the plan still works with fewer people, it just stretches the timeline in §9.3.

### 9.3 Phase Roadmap Overview

| Phase | Goal | Rough duration | Exit criteria |
|---|---|---|---|
| **Phase 0** | Stop active money/data-integrity bleeding | 1 sprint (~2 weeks) | All 🔴 P0 blockers closed; test harness bootstrapped |
| **Phase 1** | Lay the two long-lead foundations: native courier app + real payout rail | 3–4 sprints (~6–8 weeks), **started in parallel with Phase 0** | Courier native app in store review; Stripe Connect (or equivalent) integrated end-to-end in at least sandbox/test mode |
| **Phase 2** | Finish golden-path wiring + real dispatch engine | 3 sprints (~6 weeks) | Every 🔴 and 🟠 item in §9.4–§9.7 closed |
| **Phase 3** | Hardening, compliance sign-off, scale readiness | 2 sprints (~4 weeks) | Security/compliance sign-off obtained; load test passed; golden-path e2e tests green in CI |
| **Phase 4** | Staged rollout → full launch | 1–2 sprints (~2–4 weeks) | Go/no-go checklist (§9.1) fully checked; staged cohort live with no P0/P1-class incidents |

**Total estimate: ~11–14 weeks (5.5–7 two-week sprints) to full production launch**, assuming the team shape in §9.2 and no major regulatory surprise on the payout rail (see §9.12, Risk 1 — this is the single biggest wildcard and is outside engineering's control).

Phases 0 and 1 run **concurrently**, not sequentially — Phase 1's two items (native app store review, payout-rail vendor/compliance onboarding) have long external lead times unrelated to engineering effort, so they should start on day one alongside Phase 0's fixes.

---

### 9.4 Phase 0 — Stop the Bleeding (Sprint 1)

All items below are already itemized in §6 as P0 #1–9. Assign in parallel; each is small and independently shippable.

| Owner | Item | Audit ref | Tier |
|---|---|---|---|
| Platform/Backend | Add idempotency constraint to courier payout close-period endpoint | P0 #1 | 🔴 |
| Customer App | Fix hardcoded delivery fee in checkout — use real per-merchant fee | P0 #2 | 🔴 |
| Customer App | Remove hardcoded fallback address; block checkout instead | P0 #3 | 🔴 |
| Merchant App + Payments | Stopgap only this sprint: remove the false "securely encrypted" payout copy and gate the payout-setup UI as "pending" until the real rail (Phase 1) lands — do **not** attempt the full disbursement build this sprint | P0 #4 | 🔴 |
| Merchant App | Fix Stripe Terminal `simulated: true` → real reader discovery | P0 #5 | 🔴 |
| Merchant App + Platform | Special/holiday hours: add real table + route, wire into order-acceptance gate | P0 #6 | 🔴 |
| Platform/Backend | Fix dangling `courier_availability.active_order_id` on merchant/admin-initiated cancels | P0 #7 | 🔴 |
| Courier App | Add realtime/poll listener on courier's own active order so remote cancels aren't silent | P0 #8 | 🔴 |
| Merchant App | Re-verify `ReadyOrderDetail.tsx` current state; fix if still broken | P0 #9 | 🔴 |
| QA & Release *(pulled forward from P3 #26)* | Stand up test infrastructure (`vitest` + CI wiring) in dash-customer and dash-courier **this sprint**, and write a regression test for each P0 fix above as it lands | P3 #26 | 🟠 |

**Exit criteria:** every row above merged and deployed to staging; regression test exists for each. Nothing in Phase 1+ starts on a foundation that still has an open P0.

---

### 9.5 Phase 1 — The Two Long-Lead Foundations (Sprints 2–5, run in parallel with Phase 0's tail and Phase 2's start)

These two items are singled out into their own phase because their calendar time is dominated by things engineering can't fully control (app store review queues, compliance/legal review, banking-partner onboarding) — starting them late is the single most common reason a "we're almost done" plan slips by a month.

#### 9.5.1 Courier native app (🟠 Launch-Critical — P1 #10)
A courier cannot be reliably tracked, and cannot receive an offer while their phone is locked or another app is in front, from a browser tab. This is not optional for a real launch of a delivery product.
- Reuse `apps/driver`'s Capacitor setup as the template (Android config, background geolocation plugin, native settings deep-link) rather than building from scratch — this is a **solved problem elsewhere in this monorepo**, which materially de-risks the timeline.
- Sequence: (1) add Capacitor scaffolding + background geolocation to dash-courier, (2) internal TestFlight/APK dogfooding with real couriers for at least one full sprint, (3) submit to app store review (build in 1–2 weeks of review-queue buffer, possibly more for iOS), (4) only then treat P1 #11–16 (real active-delivery data, activity page, GPS sequencing, etc.) as meaningful — there's limited point fully polishing a web-tab experience that's about to be replaced.
- **Owner:** Courier App & Mobile team. **Kick off day 1 of Phase 0.**

#### 9.5.2 Real payout rail for merchants and couriers (🔴/🟠 — P0 #4, P1 #14, P3 #33)
This is the item most likely to be underestimated. "Add Stripe Connect" sounds like an integration task; in practice it's a compliance project with an integration task inside it.
- **Week 1 (parallel with Phase 0):** Payments team + legal/compliance liaison determine the actual disbursement model — Stripe Connect Express accounts are the natural fit given the POS already uses Stripe — and confirm what KYC/money-transmission obligations apply to Roam operating a marketplace that pays out couriers and merchants in this jurisdiction. **This legal review is on the critical path for launch and should start immediately, not after engineering finishes the integration.**
- **Weeks 2–5:** build Connect Express onboarding into merchant signup (replacing the current bank-account form that discards real numbers) and courier onboarding; wire real transfer creation into the payout flow; replace the admin free-text payout amount with a computed figure from a real settlement ledger (P3 #33); close the loop so `payments.merchant_payouts` / `payments.courier_payouts` rows correspond to an actual bank transfer, not just a database record.
- **Owner:** Payments & Payouts team, with Merchant App and Courier App teams wiring their respective frontends once the backend contract is ready.

**Exit criteria for Phase 1:** courier native app is in store review (or already approved) and payout rail moves real test money end-to-end in sandbox mode for both a merchant and a courier account.

---

### 9.6 Phase 2 — Complete the Golden-Path Wiring (Sprints 5–7)

Once Phase 0 is closed and Phase 1 is underway, this phase closes every remaining item that touches the literal order→fulfill→deliver loop.

| Owner | Item | Audit ref | Tier |
|---|---|---|---|
| Courier App | Fully populate `activeDelivery` from the real accepted order (stop leaving items/prices/customer info mocked) | P1 #11 | 🔴 |
| Courier App | Wire Activity/history page to real order data | P1 #12 | 🟠 |
| Courier App | Wire Payout History page to real payout data (depends on §9.5.2) | P1 #13 | 🟠 |
| Courier App | Wire real payout-method flow into `PayoutSettingsPage.tsx` (depends on §9.5.2) | P1 #14 | 🔴 |
| Courier App | Fix vehicle-photo upload (currently silently dropped) | P1 #15 | 🟠 |
| Courier App | Add GPS ping sequence numbers/idempotency | P1 #16 | 🟠 |
| Platform/Backend | Build real courier dispatch: proximity/distance filtering + scheduled re-dispatch for orders whose wave-1 offers expire unanswered — this is what separates "works in a demo" from "works at real order volume" | P2 #21 | 🔴 |
| Courier App | Real-time channel for offers/status (not just 8s/5s polling), matching driver's pattern | §3.2 #9 | 🟠 |
| Platform/Backend | Real push delivery behind `notifications`' stub endpoints (merchant push already works; courier/customer need this closed for real reliability) | P2 #25 | 🟠 |
| Platform/Backend | Ensure `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are provisioned in production; fail loudly (not silently) if missing | P3 #27 | 🟠 |
| Merchant App | Confirm the `delivery.orders` insert → `merchant-push` DB webhook trigger is actually configured in production | P3 #28 | 🟠 |

**Note on stacked/multi-order offers (P2 #17) and Enterprise Inventory's remaining views (P2 #18–20, #24):** these are explicitly **not** on the golden-path critical path — a courier delivering one order at a time, and a merchant not yet having vendor/transfer/recipe management, does not stop a customer from ordering food and getting it delivered. Recommend classifying both 🟢 Fast-Follow and deferring past launch unless Product overrules (see §9.10, decision items 36–37).

**Exit criteria:** a real order can go browse → pay → merchant accepts → real dispatch offers it to a nearby courier → courier (on the native app, once available, or web fallback in the interim) delivers it → both merchant and courier see it reflected in real earnings — with no step relying on mock data.

---

### 9.7 Phase 3 — Hardening, Compliance & Scale Readiness (Sprints 8–9)

This is the phase that turns "the golden path works" into "the golden path works for real money, at real volume, without the business taking on undisclosed risk."

| Owner | Item | Audit ref | Tier |
|---|---|---|---|
| QA & Release | Expand automated test coverage to the full golden path across all three apps (checkout, payment capture, order-status transitions, dispatch accept/decline, payout creation) | P3 #26 (expanded) | 🟠 |
| Security & Compliance | Full RLS/schema audit sign-off on `delivery`/`payments` schemas — confirm the default-deny tables are intentional, not oversights | §5.2, existing `docs/rls-audit.md` pattern | 🟠 |
| Security & Compliance | PCI scope review for the POS card-present flow now that real Stripe Terminal readers work | P0 #5 follow-up | 🟠 |
| Security & Compliance / Legal | Money-transmission/KYC compliance sign-off on the live payout rail (should already be mid-review since §9.5.2 — this is the formal close-out) | P0 #4 follow-up | 🔴 — **hard gate, cannot launch without this** |
| QA & Release | Load test the golden path at expected launch-day order volume; specifically stress-test the new dispatch engine (§9.6) under concurrent offers | new — not in original audit, required for "not a soft launch" | 🟠 |
| Platform/Backend | Stand up monitoring/alerting on the golden path: orders stuck in a status past a threshold, payment failures, dispatch failures, payout failures | new — required for real launch | 🟠 |
| Customer App | `.env.example` completeness (`VITE_ALLOW_MOCKS`, Maps key); remove stale Stripe CSP entry | P3 #29–30 | 🟢 |
| Merchant App | `.env.example` completeness (`VITE_VAPID_PUBLIC_KEY`) | P3 #29 | 🟢 |
| Courier App | Move document upload to a server-mediated path (matches driver's trust boundary) | P3 #31 | 🟢 |
| Platform/Backend | Compute merchant payout amounts from a real settlement ledger instead of admin free-text (if not already finished in §9.5.2) | P3 #33 | 🟠 |
| All teams | Dead-code cleanup: `MockDispatchProvider` production-bundle footgun, `StationPlaceholderPage.tsx`, unused functions | P3 #32 | 🟢 |

**Exit criteria:** security/compliance sign-off document exists and is signed; load test report shows the system handles target launch volume; monitoring dashboards exist for the golden path; CI has golden-path e2e coverage green.

---

### 9.8 Phase 4 — Staged Rollout → Full Launch (Sprints 10–11)

Even a "not a soft launch" plan should not go from zero real orders to city-wide on the same day — that's a QA strategy, not a lack of commitment to full launch. The distinction from a "soft launch" is that this stage is short, time-boxed, fully-featured (nothing is stubbed or manually worked around), and has an explicit exit date, not an indefinite limited pilot.

1. **Staged cohort (few days–1 week):** enable ordering for a small, real set of merchants and couriers in one area, with the full feature set from Phases 0–3 live (not a cut-down version) and the monitoring from Phase 3 watched actively.
2. **Go/no-go review:** run the full checklist in §9.1 and §9.11 against real production data from the staged cohort. Any P0/P1-class incident during this window resets the clock on that specific area, not the whole plan.
3. **Full launch:** remove the cohort restriction.

**Owner:** Product/Program drives the go/no-go call; QA & Release owns the monitoring dashboard used to make it.

---

### 9.9 Cross-Team Dependency Map

| This item... | ...blocks | Because |
|---|---|---|
| Payout-rail compliance review (§9.5.2) | P1 #14, Phase 3 compliance sign-off, launch gate | Can't wire a payout UI to a rail that hasn't cleared legal review; can't launch without it |
| Real dispatch engine (P2 #21) | Meaningful load testing (§9.7) | Load-testing the old distance-agnostic dispatch would validate the wrong system |
| Courier native app (§9.5.1) | P1 #11, #15, #16 (full polish) | Low ROI polishing a web-tab UX about to be replaced by the native build |
| Test infrastructure bootstrap (Phase 0) | Every subsequent fix having a regression test | Can't write regression tests against a framework that doesn't exist yet |
| P4 decisions (§9.10) | P2 #17 (stacked orders), P2 #21 scope (dispatch model), Customer App i18n scope | Engineering can't size work whose requirements are undecided |

---

### 9.10 Product Decisions Required (P4, §6) — With Recommended Defaults

Product/Program should resolve these in **Phase 0**, since several block Phase 2 sizing. Recommended defaults below are the lowest-scope option that still satisfies "full launch, not soft launch" for the literal golden path — Product can expand scope, but shouldn't let these sit undecided.

| # | Decision | Recommended default | Why |
|---|---|---|---|
| 34 | Native app parity for dash-customer? | Not required for launch; web-first is fine for the ordering side (courier is the hard blocker, not the customer) | Customers ordering food from a mobile browser or PWA is an accepted pattern industry-wide; couriers cannot do their job from a browser tab |
| 35 | Payout cadence/method | Weekly, via Stripe Connect Express standard payout schedule, no instant-payout at launch | Simplest to implement and reconcile; "Instant Payout" stays an honest "coming soon" fast-follow |
| 36 | Pull-based vs. push/matching-engine dispatch | Build the proximity-aware version in P2 #21 (not the full rides-grade fairness/wave engine) | A distance-agnostic city-wide fan-out is not acceptable for a full launch, but the rides engine's full sophistication (multi-wave escalation, reconciliation subsystem) is more than day-one delivery volume needs — right-size it, don't over-build it |
| 37 | i18n parity with rides-passenger | Not required for launch unless the launch market requires a second language on day one | No evidence in the audit that this blocks the golden path; treat as Fast-Follow |
| 38 | Alcohol/age-restricted items at launch | **Keep deferred** (already the case per the existing code comment) | Avoids needing to solve real ID-verification vendor integration before launch; revisit only if Product decides to add restricted-item categories post-launch |
| — | Stacked/multi-order offers at launch | Fast-Follow, not required | A courier delivering one order at a time is a completely valid full-launch product; multi-order stacking is a density optimization for later |
| — | Enterprise Inventory (vendors/transfers/recipes/location hierarchy) at launch | Fast-Follow, not required | This is multi-location inventory management for larger merchant chains — irrelevant to whether a single restaurant can receive and fulfill an order |

### 9.11 Expanded Go/No-Go Checklist (use this at the Phase 4 gate)

In addition to §9.1's checklist:

- [ ] Every 🔴 Golden-Path Critical item in §9.4–§9.6 is closed and has a passing regression test.
- [ ] Every 🟠 Launch-Critical item in §9.4–§9.7 is closed.
- [ ] Legal/compliance has signed off on the payout rail in writing.
- [ ] Security has signed off on RLS/schema coverage in writing.
- [ ] Load test report exists and meets the target volume with margin.
- [ ] Monitoring dashboards are live and at least one team member has been paged by a synthetic/test alert successfully (i.e., alerting is confirmed to work, not just configured).
- [ ] The staged-cohort window (§9.8) ran with zero unresolved P0/P1-class incidents.
- [ ] Support/ops has a written runbook for: stuck order, failed payment, failed payout, courier-app crash mid-delivery, merchant-initiated cancellation of an in-flight order.

### 9.12 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Money-transmission/KYC legal review (§9.5.2) surfaces a licensing requirement that takes longer than engineering | Medium | High — could extend the whole plan by weeks/months, outside engineering's control | Start the legal review on day one of Phase 0, not after engineering finishes the integration; consider a licensed payment facilitator/BaaS partner if direct money-transmission licensing is required, to avoid Roam becoming its own money transmitter |
| App store review rejects the courier app (background location permissions are a common rejection reason) | Medium | Medium — adds 1–2+ weeks | Reuse `apps/driver`'s already-approved permission-justification language/flow; submit early with buffer built into §9.5.1's timeline |
| Real dispatch engine build (P2 #21) uncovers that the rides `matching` engine's code isn't cleanly reusable for delivery's different constraints | Medium | Medium — could push Phase 2 by a sprint | Scope the delivery dispatch engine as its own right-sized build from day one (per §9.10 decision #36) rather than assuming a lift-and-shift of the rides engine |
| Team underestimates payout-rail work as "just add Stripe Connect" | High if not flagged | High | This section explicitly calls it out as a compliance project, not just an integration — keep it in Phase 1, not squeezed into Phase 0 or 2 |
| Enterprise Inventory or stacked-orders scope creeps back into the launch-critical path without a Product decision | Medium | Medium — inflates timeline for no golden-path benefit | §9.10 explicitly recommends both as Fast-Follow; hold that line unless Product formally overrides with a written decision |
