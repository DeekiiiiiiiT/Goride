# RoamDash Marketplace — Cross-App Integration & Sync Audit

**Date:** 2026-07-29
**Scope:** How `apps/dash-customer` (RoamDash), `apps/dash-courier` (Dash Courier), and `apps/dash-merchant` (Dash Merchant) function *together* as one marketplace against the shared `delivery`/`payments` Supabase backend — the seams between apps, not each app in isolation. Think of this as the "does it work like DoorDash/Uber Eats end-to-end" audit.
**Companion docs:** [`dash-customer-production-readiness-audit.md`](./dash-customer-production-readiness-audit.md), [`dash-courier-production-readiness-audit.md`](./dash-courier-production-readiness-audit.md), [`dash-merchant-production-readiness-audit.md`](./dash-merchant-production-readiness-audit.md) — each audits one app in depth; this doc assumes their findings and checks what happens at the boundaries between them, re-verified against current code (not the older per-app docs, which are now partially stale — see §0.1).
**Method:** Static, read-only. Four parallel verification passes: (1) confirming a "soft-launch" remediation note added to the courier doc actually landed in code, (2) courier-identity/location/status-enum/cancellation/review sync between apps, (3) end-to-end payment split and notification-loop closure, all cross-checked against migrations and edge-function source directly. **No code was changed as part of this audit.**

---

## 0. Executive Summary

Since the three per-app audits were written, real remediation work landed on the courier side — a "soft-launch" migration added courier RLS, a real dispatch provider replaced the mock, GPS now actually transmits, a documents bucket exists with real upload wiring, age-verification now requires a real photo, and a `courier_offers`/proof-of-delivery/earnings/payouts route set was built. All of this was independently re-verified against the live code and the live Supabase project (both `delivery` and a new `notifications` edge function are confirmed deployed and active) — it's real, not just claimed. One frontend flow (the multi-order "stacked" offer UI) is still mock-only, since there's no backend concept of an order "stack" yet.

That remediation, however, was done *within* the courier app without updating the other two apps to match — and that mismatch is the central finding of this audit. The backend now sets a real `assigned` order status the instant a courier claims a delivery. **None of the three frontends has a case for it.** The customer app's tracking screen has no `'assigned'` branch, so it falls through to a default and the tracking UI visibly *regresses* to "preparing" at the exact moment a courier takes the order. The merchant app is worse: its active-order queue filter only includes `['placed','accepted','preparing','ready']`, so the order **disappears from the merchant's queue entirely** the moment a courier claims it, and if a merchant navigates to it directly anyway, the order-detail page hits an explicit `"No detail view for status: assigned"` dead end. A single unhandled enum value, introduced on one side of the marketplace, currently breaks the other two.

Beyond that: courier identity now displays correctly to merchants (a real backend join was added), courier GPS is now real and reaches the customer app's tracking data — but is drawn as a frozen marker on a static schematic image rather than a real map, so the "wiring" is real while the visual payoff isn't. Customer-initiated order cancellation doesn't exist at all — only merchants and admins can cancel — and a merchant cancelling an order already claimed by a courier leaves that courier's `active_order_id` dangling in the availability table, with no realtime mechanism to tell the courier mid-delivery that the order was pulled out from under them. Reviews, previously found broken on the customer side, are now confirmed fully wired end to end into the merchant's review displays.

The single largest gap for feeling like a real marketplace, though, is money: **there is no commission/delivery-fee split logic anywhere in the payment pipeline.** Delivery fee is hardcoded to `0` at order creation, the full customer payment is credited to the merchant with no platform-fee deduction, and courier "earnings" resolve to tip-only, since the fee they'd otherwise earn is always zero. Three separate, uncoordinated, entirely-manual code paths exist for creating a payout row (one real and wired to the merchant admin UI, one dead/unused, one courier self-service), and an in-progress ledger-unification effort mirrors payouts after the fact rather than computing or reconciling them. Notifications are a related soft spot: a `notifications` edge function now exists but is a stub with no real push delivery for any app; the thing that actually keeps a customer informed today is a separate, working, direct SMS integration wired into merchant/courier status-transition code — real, but easy to miss since it isn't where you'd look for it.

### 0.1 Note on the per-app audit docs

The three companion audits are now **partially stale** on the courier side specifically — they describe a pre-remediation snapshot, and the courier doc's own top-of-file remediation note is accurate but the body text below it wasn't updated to match. Treat the courier companion doc's §A–§K body text as historical/pre-fix, and this document's §2 as the current ground truth for anything courier-related. The merchant doc's claim that a payout-creation route "targets a `payments.payouts` table that doesn't exist" is **contradicted** by this audit's direct re-read of that code (§2.F) — flagged for reconciliation, not resolved here.

---

## 1. Order Status Visibility Across Apps — the core sync map

Backend status vocabulary (confirmed in `roamStatusTransitions()`, `supabase/functions/delivery/merchantRestaurantRoutes.ts`), and what each frontend currently does with each value:

| Status | Set by | Customer app | Merchant app | Courier app |
|---|---|---|---|---|
| `placed` | customer order creation | ✅ tracked | ✅ shown in active queue | n/a |
| `accepted` | merchant | ✅ tracked | ✅ shown | n/a |
| `preparing` | merchant | ✅ tracked | ✅ shown (`PreparingOrderDetail`) | n/a |
| `ready` | merchant | ✅ tracked (`courier_assigned` phase, slightly misleadingly named for the pre-claim state) | ✅ shown (`ReadyOrderDetail`, now with real courier data once populated) | ✅ visible via `GET /courier/offers` / available-orders |
| **`assigned`** | courier accepts an offer | ❌ **no case — falls to default, regresses to "preparing"** | ❌ **dropped from active queue; detail page shows "No detail view for status: assigned"** | ✅ courier's own state (tracked internally, not via this enum) |
| `picked_up` | courier | ✅ tracked (`on_the_way`) | ✅ shown (`PickedUpOrderDetail`) | ✅ tracked |
| `in_transit` | courier | ✅ tracked (`almost_there`) | ⚠️ not distinguished from `picked_up` in the audited if-chain | ✅ tracked |
| `delivered` / `completed` | courier / system | ✅ tracked | ✅ shown (`CompletedOrderDetail`) | ✅ tracked |
| `cancelled` | merchant / admin / courier self-report | ✅ tracked as a terminal state | ✅ shown | ⚠️ only reachable via the courier's *own* cancel/issue action — no listener for a cancellation initiated elsewhere (see §3) |

The `assigned` row is the headline finding of this audit: it's a real, correctly-designed backend state (the migration that introduced it also froze order financials against courier edits on the same status — good practice), but it was added without a corresponding frontend update in either of the other two apps. This is exactly the kind of gap that only shows up when auditing the seams rather than each app individually — each per-app audit would see its own status handling as internally consistent, because it is; the break is in the union of the three.

**Fix scope is small and concentrated**: add an `'assigned'` case to `apps/dash-customer/src/lib/trackingContent.ts`'s `getTrackingPhase()` (map it to the existing `courier_assigned` phase, or a new one distinguishing "courier confirmed, heading to restaurant" from "order marked ready"), add it to `apps/dash-merchant/src/lib/merchant-orders-filters.ts`'s `getActiveQueueOrders()` inclusion list, and give `apps/dash-merchant/src/pages/OrderDetailPage.tsx`'s status if-chain a branch for it (likely routing to the same view as `ready`, now that the courier card is real).

---

## 2. Domain Findings

### A. Courier Identity Shown to Merchant — fixed, but gated on a status the order barely stays in

`ReadyOrderDetail.tsx`/`PickedUpOrderDetail.tsx` no longer show the hardcoded "Marcus" placeholder found in the original merchant audit — both now read `order.courier?.display_name/vehicle_type/phone` off the real `Order` type, and the shared `GET /orders/:id` route (used by both customer and merchant apps) now does a real service-role join against `courier_profiles` by `order.courier_id` and returns it. This is a genuine fix, confirmed by direct re-read, not by trusting a doc claim.

The catch is §1: `ReadyOrderDetail` only renders while `status === 'ready'`, and the instant a courier claims the order it flips to `'assigned'` — a status the merchant order-detail router doesn't handle. In practice, a merchant will rarely see the populated real-courier card before the order either vanishes from their queue or hits the dead-end fallback. **The identity fix and the status-routing bug need to land together to actually be visible to a merchant.**

### B. Courier Location Shown to Customer — real data, unreal map

`trackingContent.ts` now carries `courierLat`/`courierLng`, correctly mapped from real `order.courier_lat`/`order.courier_lng` fields that a courier's live GPS actually populates via `PATCH /orders/:id/courier-location` (gated to `picked_up`/`in_transit`/`ready` statuses). This is real, working plumbing — a meaningful upgrade from the original audit's "entirely simulated" finding.

But the payoff is still cosmetic: `OnTheWayView.tsx` uses the real coordinates only to freeze a marker at a fixed screen position and print the raw lat/lng as text — there's no lat/lng-to-pixel projection onto an actual map, so a customer sees a static schematic with numbers next to it, not a moving courier on a map. `CourierAssignedView.tsx` (the pre-pickup phase) ignores GPS entirely and still shows a static background image. **Building the actual map rendering is the remaining work here — the data pipeline is done.**

Both `delivery.orders` and `delivery.courier_availability` are confirmed to be in the `supabase_realtime` publication, and the customer's `OrderTrackingPage.tsx` does subscribe to row-level `UPDATE`s on its own order (in addition to 5-second polling) — location updates reach the client promptly; the constraint is purely in what the UI does with them.

### C. Order Cancellation — no customer path, and a dangling-state bug on merchant-initiated cancels

- **No customer-facing cancel exists at all.** No UI, and no customer-scoped cancel route on the backend — cancellation is only reachable via merchant order-reject or dash-admin.
- **A merchant can cancel an order a courier already claimed or picked up** (the status machine explicitly permits cancelling from `assigned`, `picked_up`, and `in_transit`) — but the code path that clears a courier's `courier_availability.active_order_id` only runs when the *courier* is the one cancelling. A merchant-initiated cancel of an assigned/in-flight order leaves that field dangling, which will eventually corrupt courier availability/offer-eligibility logic that depends on it.
- **A courier mid-delivery has no way to learn the order was cancelled out from under them.** The courier app's cancellation screen is only reachable via the courier's *own* self-cancel/issue-report action; there's no realtime subscription or poll on the active order's status during a delivery, so a merchant- or admin-initiated cancellation is silent to the courier until they try to complete a delivery that no longer exists.

This is a genuine three-way gap: one leg is simply missing (customer cancel), one is a data-integrity bug (dangling availability state), and one is a missing realtime listener (courier awareness).

### D. Reviews — confirmed fixed end to end (corrects the earlier customer-app audit)

The original customer-app audit found `RateOrderPage.tsx`'s submit handler just navigated away without sending anything. That's no longer true: it now does a real authenticated `POST /orders/:id/review`, the backend validates rating range and order ownership and requires a delivered/completed order before persisting `customer_rating`/`customer_review` onto the order row, and both the merchant's `CompletedOrderDetail.tsx` and the merchant admin's review-moderation page read the same fields. This is a clean, fully-closed loop — worth noting as a positive, since the merchant side of review moderation was already found real and had nothing to display until this fix landed.

### E. Money Flow — no commission/delivery-fee split exists anywhere

This is the most consequential finding in this audit, because it's invisible to any single-app audit: each app's *own* payment-adjacent code looks reasonable in isolation, but nothing anywhere computes how a customer's payment should actually be divided between the platform, the merchant, and the courier.

- Delivery fee is hardcoded to `0` at order-creation time, with a code comment explicitly noting the client-sent value is distrusted (correctly, for security) — but nothing replaced it with a real computed fee.
- On successful payment capture (both WiPay and PayPal paths), the **full** payment amount is credited to the merchant's receivable with no platform-fee deduction, despite a `platform_fee` (5% of subtotal) being computed and stored on the order at creation time.
- Courier "earnings" are computed as `delivery_fee + tip` per delivered order — since delivery fee is always `0`, a courier's real earnings today are tip-only. The platform fee collected from the customer is never distributed to, or reconciled against, any courier payable.
- Neither `payments.merchant_payouts` nor `payments.courier_payouts` is written to as a *consequence* of a payment completing — both are only ever touched by separate, manual, later processes (§F).

**This needs a product/finance decision before it's an engineering task**: what should the actual commission structure be, and where in the payment-capture path should it be computed and recorded.

### F. Payout Creation — three uncoordinated manual paths, no automatic trigger

Three separate code paths can create a payout row, and none of them is triggered by an order or payment actually completing:

1. `POST /delivery/admin/payouts` — real, admin-only, and correctly wired to the merchant admin Finance UI. This is the one path that's actually connected to a working frontend.
2. `POST /payments/payouts/merchant` and `POST /payments/payouts/courier` — **resolved 2026-07-29**: tables `merchant_payouts`/`courier_payouts` are real; these duplicate routes are now **HTTP 410 deprecated**. Live paths: admin `POST /delivery/admin/finance/payouts` + courier `close-period`.
3. `POST /delivery/courier/payouts/close-period` — a real, working, self-service route letting a courier close their own payout period and compute an amount from their own delivered orders. This is genuinely functional, just entirely separate from path #1.

An in-progress "unified ledger" effort (`supabase/functions/_shared/unifiedLedger/`) does model both merchant and courier payouts as ledger entry kinds, and both admin-side creation paths call into it — but it's gated behind an environment flag that's off by default, and even when on, it only mirrors an already-created payout into an accounting journal after the fact. **It is not a source of truth or a reconciliation mechanism between the three payout paths** — it's a downstream copy.

### G. Notifications — one real, working channel; one stub

- **Real and working, but easy to overlook**: a direct SMS integration (`dashOrderSms.ts`, Digicel/Flow) fires on merchant- and courier-driven order-status transitions and actually reaches the customer, bypassing the `notifications` edge function entirely. This is the thing actually keeping a customer informed today, separate from in-app polling/realtime.
- **The `notifications` edge function itself is a stub** — it exists and is deployed, but its subscribe/courier-offer/order-sms endpoints log or accept-and-discard rather than delivering anything. It's wired into exactly one non-critical call site (fired on courier offer *acceptance*, not on new-offer creation, despite the route's name).
- **Merchant push is real and independent** — it doesn't use the notifications function at all, has its own service-worker/VAPID subscription flow, and works.
- **Courier push is dead code** — a `subscribeCourierPush()` function exists in the courier app but is never called from anywhere, and even if it were, it would only reach the stub notifications function with no real delivery behind it. A courier today has no way to be alerted to a new offer while the app is backgrounded.
- **Customer push doesn't exist at all** — the customer app relies on 5-second polling plus a real-time subscription on its own order row, backstopped by the real SMS channel above.

### H. Realtime Plumbing Between Merchant and Courier Actions — confirmed working (a genuine positive)

Worth stating clearly since it's easy to assume the worst: the same `delivery.orders` realtime publication and the merchant's existing RLS `SELECT` policy (scoped by `merchant_id`, not by who performed the write) together mean a **courier-driven status update on an order the merchant owns is broadcast to and correctly passes the merchant's realtime subscription** — no separate channel or polling path is needed for a merchant's order-detail screen to update live when a courier acts. This is good architecture and should be treated as the reference pattern for closing the customer-side `assigned`-status gap (§1) — the data already arrives in real time; the frontend just needs a case to handle it.

### I. Courier Soft-Launch Remediation — independently verified, real and deployed

Since this remediation was explicitly claimed in a note added to the courier companion doc, it was independently re-verified rather than taken on faith:

| Claim | Verdict |
|---|---|
| Courier RLS + `assigned` status + `courier_offers`/`courier_delivery_issues` tables + documents bucket, via migration | **Confirmed** — applied to the live project (`csfllzzastacofsvcdsc`), correctly scoped (couriers see own orders or unassigned `ready` orders, not a blanket read), with order financials frozen against courier edits |
| `RealDispatchProvider` replaces the mock by default | **Confirmed** — mock only activates behind an explicit dev env flag |
| GPS actually transmitted to the backend | **Confirmed** — real `PUT /courier/availability` and `PATCH /orders/:id/courier-location` calls, real DB writes |
| Document/vehicle upload wired to real storage | **Confirmed** — real bucket, real upload calls, no more discard-only file inputs |
| Age-verification requires a real photo | **Confirmed** — a photo capture is now mandatory before the handoff-confirm action is enabled, persisted with an audit trail |
| Offer/POD/issue/earnings/payout routes real and frontend-wired | **Confirmed**, with one exception: the multi-order "stacked"/grocery-pick offer UI is still entirely mock-driven — there's no backend concept of an order "stack" yet, only a `wave` field on individual offers |
| `delivery` and `notifications` edge functions deployed and active | **Confirmed** via direct check of the live project, not just repo state |

This is a genuinely solid remediation pass — the gap it leaves is not "was it done," it's "the rest of the marketplace wasn't updated to match" (§1), plus the one still-mock stacked-offer flow.

---

## 3. Prioritized Punch List

**P0 — Breaks the marketplace loop for every order that reaches this state today:**
1. Add an `'assigned'` case to the customer app's `getTrackingPhase()` — currently regresses to "preparing" the moment a courier claims the order.
2. Add `'assigned'` to the merchant app's active-queue filter and order-detail status router — currently the order vanishes from the merchant's view and hits a dead-end if opened directly.
3. Fix the merchant-initiated-cancellation dangling-state bug — clear `courier_availability.active_order_id` regardless of which actor performs the cancel, not only when the courier initiates it.
4. Give the courier app a realtime listener (or at minimum a poll) on its own active order's status, so a merchant/admin cancellation is visible mid-delivery instead of silent.

**P1 — Core marketplace mechanics that are currently silently absent or wrong:**
5. Design and implement a real commission/delivery-fee split in the payment-capture path — currently zero dollars of delivery fee or platform fee are ever distributed to anyone; this is a product/finance decision as much as an engineering one.
6. Reconcile the three payout-creation code paths into one (or explicitly document why courier self-service and admin-driven merchant payouts are intentionally separate) — none is currently triggered automatically by order completion.
7. Resolve the payout-table discrepancy between this audit and the merchant companion doc (§2.F) with a direct, targeted re-read before either is trusted.
8. Add a customer-facing order-cancellation path — currently doesn't exist at any layer.

**P2 — Real data pipelines with cosmetic-only frontends:**
9. Render courier GPS on an actual map instead of a frozen marker with lat/lng printed as text (`OnTheWayView.tsx`), and wire GPS into `CourierAssignedView.tsx`, which currently ignores it entirely.
10. Wire real push delivery behind the `notifications` edge function's stub endpoints, or decide the SMS channel is sufficient and formally retire the push stub to avoid confusion.
11. Wire (or remove) the dead `subscribeCourierPush()` function — a courier currently has no backgrounded-app offer alert mechanism.
12. Build a real backend concept for multi-order "stacked" offers if that's a product requirement — currently the only fully-mock flow remaining post-remediation.

**P3 — Cleanup:**
13. Once §1's status handling lands, re-verify that `in_transit` gets a visually distinct merchant-side view from `picked_up` rather than falling through the same branch.

---

## 4. Suggested Phasing

1. **Phase 0 — Un-break what's silently broken today**: P0 items. These aren't "missing features," they're active bugs that make real orders disappear or regress in front of real users the moment a courier is involved — highest-visibility, lowest-effort fixes in this whole audit series.
2. **Phase 1 — Make the marketplace's money and cancellation logic real**: P1 items, starting with the commission-split product decision since it blocks meaningful payout work in every app.
3. **Phase 2 — Finish the pipelines that already move real data**: P2 items — map rendering and push delivery are both "the hard part is done, finish the last mile" work.
4. **Phase 3 — Cleanup**: P3, alongside Phase 1–2.

---

## 5. Notes on Methodology / Confidence

- This audit deliberately re-read current code for every claim rather than trusting either the older per-app docs or the remediation note added to the courier doc — the `assigned`-status gap and the payout-table discrepancy were both only found because of that re-verification, not visible from the docs alone.
- The payout-table discrepancy (§2.F, §3 item 7) is a genuine open item between this audit and the merchant companion doc and should not be treated as resolved in either direction without a direct follow-up read.
- This audit covers the three Dash-branded apps only. `driver`, `fleet`, `haul`, `enterprise`, `rides-passenger` share backend infrastructure but weren't in scope here.
- No code was changed. This document is intended as input to a combined implementation plan alongside the three per-app audits.
