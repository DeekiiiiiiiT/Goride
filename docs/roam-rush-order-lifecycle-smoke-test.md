# Roam Rush End-to-End Smoke Test — Order Placement to Delivery

**Scope:** `apps/dash-customer` (Roam Rush), `apps/dash-merchant` (Roam Partner), `apps/dash-courier` (Roam Courier), backed by the shared Supabase project (`supabase/functions/delivery`, `payments`, `notifications`).
**Purpose:** A real, runnable smoke test script for the full "customer buys food → merchant preps it → courier delivers it" loop, plus the scenario matrix the three apps need to survive before this is trusted with real money.
**Method:** Read-only audit. No app or backend code was changed to produce this document. Traced against current source (`packages/types/src/delivery.ts`, `supabase/functions/delivery/*`, `supabase/functions/payments/index.ts`, `supabase/functions/notifications/index.ts`) and cross-checked against the existing [production readiness audit](./roam-rush-stack-production-readiness-audit-2026-08-15.md) (2026-08-15, still the most current known-gaps baseline).

---

## 1. The order state machine you're actually testing

This is the canonical machine (`packages/types/src/delivery.ts:304-463`) — every smoke test run should assert the order's `status` column moves through this graph in order, never skips, and never reverses:

```
placed → accepted → preparing → ready → assigned → picked_up → in_transit → delivered → completed
   ↓         ↓                     ↓         ↓            ↓            ↓
cancelled  cancelled           cancelled  cancelled    cancelled    cancelled
```

Allowed transitions (`ORDER_STATUS_TRANSITIONS`):

| From | Can go to |
|---|---|
| `placed` | `accepted`, `cancelled` |
| `accepted` | `preparing`, `cancelled` |
| `preparing` | `ready` |
| `ready` | `assigned`, `picked_up`, `cancelled` |
| `assigned` | `picked_up`, `cancelled` |
| `picked_up` | `in_transit`, `cancelled` |
| `in_transit` | `delivered`, `cancelled` |
| `delivered` | `completed` |
| `completed` | (terminal) |

Two things worth testing specifically because the graph allows them and it's easy to assume otherwise:
- `ready` can jump straight to `picked_up` (courier already staged at the store when the order finishes prepping) — skip `assigned` entirely. Don't fail a test run just because `assigned` never appeared.
- Customer self-cancel is only legal at `placed`/`accepted` (`customerOrderRoutes.ts:468`, "before the restaurant starts preparing"). Every other cancellation path (merchant reject, courier drop, admin/support) uses a different code path — test them separately, they are not the same endpoint.

---

## 2. Environment setup before you smoke test

You cannot get a meaningful signal running this against mocked data. Confirm before starting:

1. **`mocksGate` is off.** All three apps have a production-gated mock fallback (`allowMocks()`). Run against a build/env where it evaluates `false`, or you're smoke-testing fixtures, not the system.
2. **At least one seeded, `is_active` + `is_accepting_orders` merchant** with a real menu, real `delivery_fee`/`commission_rate`, and merchant hours that are currently open (`merchantOpenCheck.ts` enforces hours server-side even if the UI doesn't). As of the 2026-08-15 audit there was exactly **one** active merchant in the live project — confirm this is still true or seed more before testing multi-merchant scenarios.
3. **A delivery address inside the Kingston polygon zone** (`apps/dash-customer/src/lib/deliveryZones.ts`) and one deliberately outside it, for the geofence-rejection scenario.
4. **A real courier account**, phone-verified, that can go online (`PUT /courier/availability`) and is within dispatch range of the test merchant.
5. **Sandbox credentials live** for both payment providers — WiPay and PayPal — since checkout is hosted-checkout for both, not a stub. Confirm `WIPAY_REFUND_URL`/`WIPAY_API_KEY` are actually set (flagged as unverified in the last audit).
6. **Three separate logged-in sessions** open in parallel (customer, merchant, courier) so you can watch state propagate live rather than polling after the fact — the whole point of this smoke test is confirming the three apps agree on order state at every hop, not just that each one works in isolation.

---

## 3. Golden path script

Run this as one continuous session, watching all three apps at once.

| Step | App | Action | Backend call | Status after | What to verify |
|---|---|---|---|---|---|
| 1 | Roam Rush | Sign in (phone OTP), land on Home | `supabase.auth.signInWithOtp/verifyOtp` | — | Real OTP SMS arrives; session persists on reload |
| 2 | Roam Rush | Onboarding: set delivery address | `AddressAutocomplete` (Google Places) or GPS | — | Real suggestions, not the old `SAVED_ADDRESSES` hardcode — confirm the fix from the 2026-08-15 audit actually shipped to the build under test |
| 3 | Roam Rush | Browse merchant, add items with modifiers/options to cart | client-side cart / `carts` table | — | Item options/choices total correctly; cart survives app backgrounding |
| 4 | Roam Rush | Checkout: review subtotal, delivery fee, platform fee, tax, tip | — | — | Delivery fee is the *merchant-configured* value, not `0` (a previously-fixed bug — regression-check it) |
| 5 | Roam Rush | Place order, pay | `POST /orders` → `status: "placed"`; `POST /payments/intents` → provider hosted checkout → `POST /payments/wipay/complete` or `POST /payments/paypal/capture` | `placed`, `payment_status: paid` | Order row exists with correct `subtotal/deliveryFee/platformFee/tax/tip/total`; commission split (`dashMoneySplit.ts`) computed at capture, not guessed client-side |
| 6 | Roam Rush | Order confirmation / tracking screen appears | realtime subscription in `OrderTrackingPage.tsx` | `placed` | Tracking view renders immediately, doesn't require a manual refresh |
| 7 | Roam Partner | New order appears in queue | `GET /merchant/orders` (live query or push) | `placed` | Order appears **without a manual refresh** — this is the single most safety-critical propagation in the whole loop (a missed order = a hungry, charged customer). Confirm the push path, not just polling |
| 8 | Roam Partner | Merchant accepts order | order status update → `accepted_at` stamped | `accepted` | Roam Rush tracking view updates to "Accepted" live |
| 9 | Roam Partner | Merchant marks preparing → ready | → `preparing_at`, then `ready_at` stamped | `preparing` → `ready` | Roam Rush stepper (`OrderStatusStepper.tsx`) advances live at each hop, not just at the end |
| 10 | Roam Courier | Courier (already online) receives dispatch offer | `POST /courier/offers/dispatch` server-side → courier app receives via push/poll + Realtime | — | Offer arrives within a few seconds of `ready` (or earlier — dispatch can fire pre-ready); offer has correct pickup address, item count, payout |
| 11 | Roam Courier | Courier accepts offer | `POST /courier/offers/:id/accept` → order → `assigned` (or `POST /orders/:id/accept-delivery` pull-claim path) | `assigned` | Roam Partner queue shows courier name/photo assigned; Roam Rush tracking shows courier assigned + live map marker (`CourierTrackingMap.tsx`) |
| 12 | Roam Courier | Courier navigates to store, marks arrived/picked up | `status → picked_up` | `picked_up` | Roam Rush and Roam Partner both flip to "Picked Up" live |
| 13 | Roam Courier | Courier marks en route | `status → in_transit` | `in_transit` | Roam Rush live GPS marker moves; **check whether ETA/distance shown are computed from live GPS or the known-hardcoded `mapOrderToActiveDelivery.ts` values (10 min / 15 min / 0 km)** — this was an open finding, re-verify against the current build |
| 14 | Roam Courier | Courier arrives, uploads proof-of-delivery photo, marks delivered | photo → Supabase Storage `courier-documents` bucket; `status → delivered` | `delivered` | Photo actually persists (not silently discarded); Roam Rush shows "Delivered" and a delivery confirmation/rating prompt |
| 15 | Roam Rush | Customer submits rating + review | `POST /orders/:id/review` | `completed` | Review persists to backend, visible from merchant/admin side, not `localStorage`-only |
| 16 | (backend) | Payout accrual | `payments/payouts/merchant`, `payments/payouts/courier` | — | Correct commission/delivery-fee split lands in merchant and courier payout ledgers for this order |
| 17 | (all three) | Confirm final state agreement | — | `completed` everywhere | Order status, total, and courier/merchant identity match exactly across all three apps' order-history views — this is the actual "did the distributed system agree" check |

**Notification check to run in parallel:** at steps 5, 8, 11, 13, 14 confirm the customer actually receives *something* (`notifications/customer-order-status` push, or SMS via `order-sms` as the primary channel per the last audit) — don't just trust the in-app UI updated, since a backgrounded/killed app depends entirely on the notification channel working.

---

## 4. Scenario matrix — what your smoke tests should cover beyond the happy path

Group by where the branch happens. Each row is a distinct test case; "Expected" is the correct/safe behavior to assert against, not necessarily today's actual behavior (flagged where it's a known gap).

### A. Checkout & payment
| # | Scenario | Expected |
|---|---|---|
| A1 | Customer abandons hosted checkout (closes WiPay/PayPal tab mid-payment) | Order stays `placed`/unpaid or never created; no charge; cart preserved so they can retry |
| A2 | Payment provider declines the card/account | Clear failure surfaced in-app; no order left in a paid-but-not-placed or placed-but-unpaid limbo state |
| A3 | Network drops right after payment capture, before `POST /orders` confirms client-side | Retry doesn't double-charge or create a duplicate order — check for idempotency handling around intent/capture |
| A4 | Customer double-taps "Place Order" | Exactly one order created, one charge |
| A5 | Delivery address resolves outside the Kingston delivery polygon | Checkout is blocked *before* payment, with a clear reason — not rejected only after charging |
| A6 | Merchant is closed / not `is_accepting_orders` at the exact moment of order placement (e.g., they closed while customer was mid-checkout) | Server-side `merchantOpenCheck.ts` rejects even if the UI had stale "open" state — confirm this actually blocks, since it's explicitly designed to catch client/server drift |
| A7 | Tip added/changed at checkout | Reflected correctly in total, in the merchant/courier view, and in commission split math |

### B. Merchant-side handling
| # | Scenario | Expected |
|---|---|---|
| B1 | Merchant never accepts (leaves order sitting at `placed`) | Some timeout/escalation exists (auto-cancel, admin alert, or at minimum the customer isn't left silently waiting forever) — verify what actually happens today, this is a real gap risk |
| B2 | Merchant explicitly rejects/cancels a `placed` or `accepted` order | Order → `cancelled`, `cancelledBy: 'merchant'`, automatic refund path triggers, customer notified with a reason |
| B3 | Item goes out of stock after order is placed but before merchant accepts | Merchant can flag/substitute/remove the item; customer is informed and total recalculated — confirm this exists at all, it's a common real-world failure mode for food ordering |
| B4 | Merchant marks `ready` before any courier is online/available nearby | Order correctly sits at `ready` without a courier; dispatch retries/redispatches (`POST /courier/offers/redispatch`) rather than silently stalling |
| B5 | Merchant closes their app entirely (backgrounded/killed) right when a new order lands | **Critical per the last audit**: browser Push API is unreliable in a backgrounded Capacitor WebView. Confirm native push (`@capacitor/push-notifications` + FCM) is actually wired with real `google-services.json`/`FCM_SERVER_KEY` in the build under test — if not, this is a guaranteed missed-order path, not a hypothetical |

### C. Dispatch & courier-side handling
| # | Scenario | Expected |
|---|---|---|
| C1 | No courier online near the merchant when order reaches `ready` | Order waits at `ready`; dispatch keeps retrying/expanding radius; customer sees an honest "finding a courier" state, not a fake ETA |
| C2 | Courier offer expires unaccepted (`courier_offers.status → "expired"`) | Redispatches to next courier automatically (`courierConsumerRoutes.ts:159,267`) |
| C3 | Two couriers try to accept the same offer near-simultaneously | Exactly one wins (`accepted`), the other's offer flips to `superseded` — race-condition test, worth actually running concurrently rather than assuming the DB constraint holds |
| C4 | Courier accepts, then cancels/goes offline before pickup | Order → back to unassigned/`ready` (not stuck at `assigned` with a courier who vanished), redispatch fires, customer notified of the delay |
| C5 | Courier accepts but never arrives at the store (goes idle) | Some staleness detection/timeout — verify whether this exists; a silently stuck `assigned` order with a non-responsive courier is a real customer-facing failure |
| C6 | Courier's GPS broadcast stops mid-`in_transit` (app killed, phone dies) | Customer tracking view degrades gracefully (last-known location + "connection lost" messaging) rather than showing a stale marker as if it were live |
| C7 | Courier marks `delivered` without uploading proof-of-delivery photo (upload fails silently) | Either blocked from completing delivery, or flagged for dispute review — confirm upload failures are surfaced to the courier, not swallowed |
| C8 | Courier delivers to the wrong address / customer disputes non-delivery | Dispute flow exists end-to-end (`DisputeStatus`: `open→investigating→resolved/refunded/denied`) — test creating and resolving one |
| C9 | Stacked/multi-order offer (courier carrying 2+ orders at once) | **Known gap per last audit**: backend has no real "stack" concept, still mock-driven (`mockOffers.ts`) and gated off. Don't write a smoke test expecting this to work; confirm it's still disabled rather than half-working |

### D. Cancellation & refunds
| # | Scenario | Expected |
|---|---|---|
| D1 | Customer cancels while `placed` | Self-serve cancel succeeds (`POST /orders/:id/cancel`), full refund initiated automatically |
| D2 | Customer cancels while `accepted` (kitchen hasn't started prepping) | Same — still allowed per the state machine |
| D3 | Customer tries to cancel at `preparing` or later | Blocked with the correct message ("Orders can only be cancelled before the restaurant starts preparing. Contact support for help.") — confirm the block is enforced server-side, not just hidden in the UI |
| D4 | Refund is issued (any path) | `payment_status → refund_pending → refunded`; real WiPay/PayPal refund call fires (fails closed if secrets missing, per `payments/index.ts:715-724`) — confirm it doesn't fail *open* (i.e., silently mark refunded without the provider call actually succeeding) |
| D5 | Partial refund (e.g., one missing item, not a full-order refund) | Confirm whether this is even supported — full-order refund is the only path evident from the routes traced; if partial refund is a real support workflow, it needs its own test |
| D6 | System/admin-initiated cancellation (e.g., ops force-cancels a stuck order) | `cancelledBy: 'system'`, same refund guarantees as customer-initiated |

### E. Cross-app consistency (the actual point of this smoke test)
| # | Scenario | Expected |
|---|---|---|
| E1 | Order reaches `assigned` — does every app agree? | This exact transition was flagged in the last audit as a cross-app risk ("courier accepts, but customer tracking and merchant queue can regress/drop the order"). **Run this specific transition multiple times and diff all three apps' displayed status after each.** |
| E2 | Merchant and courier apps both push updates near-simultaneously (e.g., merchant marks `ready` at the same moment courier marks `picked_up` via a pull-claim) | Final state is consistent, no lost update |
| E3 | Customer force-quits the app mid-delivery and reopens later | Tracking view reflects true current state on reopen (server truth), not a stale cached status |
| E4 | Same order viewed in merchant's order history vs courier's earnings history vs customer's order history, after completion | Total, fees, and status match exactly in all three — this is the money-reconciliation check, treat any mismatch as a P0 |

### F. Notifications
| # | Scenario | Expected |
|---|---|---|
| F1 | Customer app is foregrounded when order status changes | In-app UI updates live via Realtime |
| F2 | Customer app is backgrounded/killed | SMS (`order-sms`) is the currently-confirmed-real channel per the last audit — verify it actually fires at each major status change, since push-in-background is the less-proven path |
| F3 | Courier app receives a new-offer push while backgrounded | `VITE_VAPID_PUBLIC_KEY` must be configured for web push subscribe to work at all — confirm it's actually set in the deployed env, it was flagged missing from `.env.example` |
| F4 | Merchant app receives new-order push while backgrounded (Android native) | See B5 — this is the highest-severity notification gap of the three apps |

### G. Money / reconciliation
| # | Scenario | Expected |
|---|---|---|
| G1 | Commission split at capture matches the merchant's configured `commission_rate` and `delivery_fee` for that specific order (not a stale/global default) | `dashMoneySplit.ts` output ties out |
| G2 | Merchant payout close-period includes exactly the completed orders in range, no double-counting, no dropped orders | `POST /courier/payouts/close-period` / merchant equivalent |
| G3 | A cancelled-and-refunded order does **not** appear in either merchant or courier payout totals | |

---

## 5. Known gaps that will make certain smoke tests fail today

Carried forward from the 2026-08-15 audit — don't burn time treating these as smoke-test bugs to chase, they're already-known scope:

- **Stacked/multi-order courier offers** (C9) — deferred, backend has no real concept of a stack. Skip this scenario or explicitly test that it stays disabled.
- **WiPay hosted-fields card vault** ("Add Card" saving a reusable card) — deferred post-launch; checkout itself works, only the *save-a-card* convenience feature doesn't.
- **Ops-open items**: whether `WIPAY_REFUND_URL`/`WIPAY_API_KEY`, real Firebase `google-services.json`/`FCM_SERVER_KEY`, and Supabase Auth native-redirect allowlist entries are actually configured in the live project were **not verifiable from source** — confirm directly against the live project/dashboard before relying on D4, F3, or F4/B5 passing.
- **Seed data**: only one active merchant and zero promotions were live as of the last audit — multi-merchant scenarios and any promotions/deals-pipeline testing need seed data first.
- Re-verify whether the three apps in your current working tree actually include the "Resolved" fixes listed in the companion audit's remediation table (§ "Remediation status") before assuming steps 2, 7, 9, 13 behave as described above — that table reflects code written on 2026-08-15; confirm nothing has regressed since.

---

## 6. Suggested pass/fail bar for calling this "smoke tested"

A run should be considered **passed** only if, in one continuous session:
1. The golden path (§3) completes end-to-end with all three apps agreeing on final state (E4).
2. At least one case from each of A–G above was exercised, not just the golden path.
3. E1 (the `assigned` cross-app consistency check) was specifically re-run multiple times, since it's the one transition with a documented history of dropping between apps.
4. Every refund/cancellation path tested actually hit the real payment provider's refund API (D4) — a refund that only flips a DB flag without the provider call succeeding is a **failed** test, not a passed one, even though the UI looks correct.
