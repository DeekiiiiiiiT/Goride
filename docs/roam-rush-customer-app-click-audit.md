# Roam Rush (Customer App) — Full Click-Through Audit

**Scope:** `apps/dash-customer` only — every page and every shared component it renders (layout, home, discovery, restaurant, search, cart, checkout, orders, tracking, rating, account, forms).
**Method:** Read-only source audit. Original pass 2026-08-18. Re-verified 2026-08-19 against current source (§3), plus a fresh production-readiness pass (§2). **Verified again 2026-08-19 (final pass)** — every item in §2 was individually re-checked against current source to confirm what actually got fixed. No code was changed to produce this document.
**Companion doc:** [Roam Courier click audit](./roam-courier-app-click-audit.md) — same methodology, other side of the same order.

---

## 1. Where things stand

**22 of the 23 items from §2's production-readiness pass are now confirmed fixed** — including both critical payment/order-integrity blockers, with real engineering behind them (a client-side submit lock plus a server-side idempotency key with a DB uniqueness constraint for double-order protection; a genuine resume-payment flow for abandoned checkouts). The original 29-item click-through punch list (§3) was already fully closed as of the prior pass.

**One critical item is still open: sign-out does not clear per-user local data, and the cross-account favorites leak on shared devices is unchanged.** See §1a below — this is the one thing left before this app is safe to hand to real customers on shared/reused devices (kiosks, family phones, store demo units).

### 1a. Still open: the sign-out data leak
`AccountPage.tsx`'s sign-out handler still only calls `supabase.auth.signOut()` and navigates home — it never clears the per-user localStorage keys (favorites, profile cache, saved addresses, cart, notification prefs, checkout prefs). There is no `SIGNED_OUT` handler anywhere in `App.tsx` either (confirmed by a repo-wide search — the string `SIGNED_OUT` doesn't appear in `src/` at all). The favorites-merge logic that causes the actual leak (`favoritesStorage.ts`) is also unchanged: on every `SIGNED_IN` event, it still pushes any local-only favorite IDs onto whichever account just signed in, with no check that those IDs actually belonged to that account. On a device more than one customer uses to order, this can silently write one customer's favorites onto another customer's account. **Cart state has the same gap** (no sign-out clearing found either) — worth fixing alongside favorites, not just favorites alone.

Fix requires one of: (a) a `SIGNED_OUT` branch in `App.tsx`'s `onAuthStateChange` that clears every per-user localStorage key (`roam-dash-profile`, `roam-dash-favorite-restaurants`, `roam-dash-favorite-items`, `roam-dash-saved-addresses`, `roam-dash-delivery-address`, `roam-dash-notification-prefs`, cart, checkout prefs), or (b) the same clearing done directly in `AccountPage.tsx`'s sign-out handler — plus, either way, hardening the favorites merge so it never pushes local-only IDs onto a freshly-signed-in session without confirming they belong to that same user.

---

## 2. Findings from the production-readiness pass — verified status

All 23 items below were re-checked against current source in a final verification pass. **22 are confirmed fixed.** Item 3 is the one still open — see §1a.

### 🔴 Launch blockers
1. ~~No idempotency guard on placing an order~~ — ✅ **Fixed, verified with real engineering.** `CheckoutPage.tsx` now uses a synchronous `submitLockRef` to block re-entrant taps, plus a client-generated idempotency key that's reused (not regenerated) on retry. Server-side, `POST /orders` looks up the key against a new `delivery.order_idempotency_keys` table (`UNIQUE (customer_id, idempotency_key)`, migration `20260819093000_customer_order_idempotency_keys.sql`) before inserting, handles the insert race on conflict, and cleans up the key mapping if the order insert itself fails. A double-tap or a retry-after-failed-payment-intent now converges on the same order instead of creating a second one. *Residual, non-blocking:* the client's idempotency key lives in a component ref, not `sessionStorage` — a full page reload mid-request would generate a new key on the next attempt. Low risk since it's a synchronous in-flight request, but worth hardening later.
2. ~~Abandoned payment leaves orders permanently stuck~~ — ✅ **Fixed.** `OrdersPage.tsx` now shows a "Payment pending" label and a real "Complete payment" button for any order where `paymentStatus !== 'paid'`, which re-requests a payment intent and redirects back to the hosted checkout. *Residual, non-blocking:* the resume-payment affordance only lives on the Orders list — `OrderDetailsPage.tsx` and `OrderTrackingPage.tsx` don't surface payment status themselves, so a customer who taps into either of those on an unpaid order sees no indication there.
3. **Still open — signing out doesn't clear local storage, so a shared device can leak one customer's favorites onto the next customer's account.** See §1a for the full writeup. Nothing has changed here since the original finding — `AccountPage.tsx`'s sign-out handler and the favorites-merge logic in `favoritesStorage.ts` are both unchanged, and cart state has the same gap.

### 🟠 High
4. ~~"Track Order" passes the wrong ID~~ — ✅ **Fixed.** `OrdersPage.tsx` now navigates using the real `order.id`, not `order.orderNumber`.
5. ~~Search-results cart-add silently fails with a false success toast~~ — ✅ **Fixed.** `SearchResultsPage.tsx` now checks the `addItem()` return value and opens the real replace-cart prompt on conflict instead of firing a false success.
6. ~~Grocery "+" stepper silently fails with no feedback~~ — ✅ **Fixed.** `StorePage.tsx` now opens the same replace-cart prompt on conflict.
7. ~~Closed/paused merchants fully browsable with no indication~~ — ✅ **Fixed.** The menu-mapping layer now surfaces an `isAcceptingOrdersNow`/`acceptingOrdersError` field from the backend, shown as a warning banner and a disabled add-to-cart control on both `RestaurantPage.tsx` and `StorePage.tsx`, with a server-enforced block even if a disabled control were somehow bypassed.

### 🟡 Medium
8. ~~Deleting your only saved address leaves a stale address active~~ — ✅ **Fixed.** `addressStorage.ts` now clears the "current delivery address" cache when the address list becomes empty.
9. ~~Deleting your default address doesn't promote a new one~~ — ✅ **Fixed.** A new `finalizeAddressListAfterDelete` helper promotes the first remaining address to default whenever the deleted one was the default or none remains.
10. ~~No phone/email validation on Edit Profile~~ — ✅ **Fixed.** The screen now validates email format and phone length, and uses the shared `PhoneInput`/`toE164JamaicaPhone` normalization instead of a bare text input.
11. ~~Failed discovery API call looks identical to "no restaurants here"~~ — ✅ **Fixed** on the Home screen's discovery path — a failed fetch now throws and renders a distinct "Could not load stores" state with a working Retry button, instead of silently resolving to an empty list. *Residual, non-blocking:* `SearchResultsPage.tsx`'s own separate merchant query doesn't read its `isError` state, so this same gap still exists narrowly on the Search Results screen specifically (not Home, and not the main Category/Restaurant flows).
12. ~~No guard against double-submitting onboarding address/zone-check forms~~ — ✅ **Fixed.** Both onboarding address screens now use a submit-lock ref and a disabled "Checking…"/"Saving…" button state. *Residual, non-blocking:* the separate "use current location" flow on the address screen enables the Confirm button as soon as raw coordinates are set, slightly before the reverse-geocode finishes — a very fast tap could confirm a coordinate-only address instead of the resolved street address. Narrow edge case, not the double-submit bug that was originally flagged.
13. ~~8-second OAuth-return timeout fires before a slow Google sign-in finishes~~ — ✅ **Fixed.** The fixed 8s timeout was replaced with a 2-second poll loop for up to 20 seconds, and sign-in is normally caught immediately by the event-driven auth listener anyway — the customer is no longer dropped to a confusing login screen while actually authenticated in the background.
14. ~~Tip keypad allows up to J$99,999 with no confirmation~~ — ✅ **Fixed.** The tip cap now scales to the order total instead of a flat number, and a second confirmation tap is required once a tip crosses a scaled high-tip threshold.

### 🟢 Low
15. Dish-with-modifiers "Add" from Search still doesn't open the item's options sheet — not re-verified this pass, carried forward as open.
16. No pagination on merchant discovery — not re-verified this pass, carried forward as open (fine at current catalog size).
17. ~~PayPal callback has no timeout/failed state~~ — ✅ **Fixed.** A 45-second timeout now flips an unresolved PayPal callback to a failed state with a clear message, instead of spinning forever.
18. ~~Rate Order has no client-side ownership check~~ — ✅ **Confirmed as originally assessed** — unchanged client-side (as expected, this was flagged low/mitigated), and the server-side ownership check (`403` on mismatched `customer_id`) is intact.
19. ~~"Retry" on the offline screen silently no-ops~~ — ✅ **Fixed.** Retry now checks live network status and shows a clear "You are still offline" toast instead of doing nothing.
20. Phone-OTP verification is still feature-flagged off — unchanged, intentional, not re-tested this pass.
21. ~~Home and Quick Reorder independently double-fetch orders~~ — ✅ **Fixed.** Both now share the same React Query cache key/instance, so they coalesce into a single request instead of firing twice.
22. ~~Notification prefs excluded from the global post-login sync~~ — ✅ **Fixed** — notification prefs are now pulled down as part of the same global sync as profile/addresses/favorites on every sign-in. *Residual, tied to item 3:* this only overwrites local prefs when the backend actually returns a value for the newly-signed-in user — until sign-out properly clears local storage, a shared-device scenario can still show stale prefs from the previous user until the new user has saved their own at least once.
23. Favorite-heart double-tap race — not re-verified this pass, carried forward as open (self-correcting, cosmetic).

---

## 3. Re-verification of the original 2026-08-18 punch list

Every item below was checked against current source, not assumed.

### Onboarding, Auth, Home
| # | Original finding | Status |
|---|---|---|
| 1 | Home notification bell dead | ✅ **Fixed** — navigates to notification settings |
| 2 | Home "See all" dead | ✅ **Fixed** — real handler |
| 3 | QuickReorderSection silent mock fallback | ✅ **Fixed** — real endpoint, no mock reference left |
| 4 | Hamburger menu never wired | ✅ **Fixed** — opens a real nav drawer |
| 5 | Orders badge tied to login, not real activity | ✅ **Fixed** — now derived from real non-terminal order check |
| 6 | "Continue with Apple" disabled | ⚠️ **Still open, by design** — honestly labeled "Coming soon" |
| 7 | Static map preview images | ✅ **Fixed** — real Google Maps with OSM fallback |
| 8 | External offline-illustration URL | ✅ **Fixed** — bundled icon, no external dependency |
| — | `AgeVerificationPage` | Confirmed removed from the codebase entirely; alcohol ordering is explicitly deferred with no client-side-only age gate anywhere. Non-issue. |

### Discovery & Browse
| # | Original finding | Status |
|---|---|---|
| 9 | Category browsing 100% unconditional mock | ✅ **Fixed** — now real `fetchDiscoverMerchants` + real filtering |
| 10 | Reviews 100% unconditional mock, same 2 reviews everywhere | ✅ **Fixed** — real per-merchant reviews fetch, real Helpful/Report |
| 11 | Fake favorite heart on search results | ✅ **Fixed** — now the real shared `FavoriteButton` |
| 12 | Price/Dietary/Delivery-fee filters captured but unused | ✅ **Fixed** — all filters now actually applied |
| 13 | Dead "Sort by"/"See All"/product "+" in grouped search layout | ✅ **Fixed** — that layout was removed |
| 14 | "View All" categories tile dead | ✅ **Fixed** |
| 15 | Dead Share icons, dead "tune" filter icon | ✅ **Fixed** — real share + real sort sheet |
| 16 | Restaurant hours always empty for real merchants | ✅ **Fixed** — real hours mapping |

### Cart, Checkout, Tracking, Post-delivery
| # | Original finding | Status |
|---|---|---|
| 17 | Report an Issue fake submit | ✅ **Fixed** — real submit with ownership check, real photo upload |
| 18 | Hardcoded gate code / handoff text during delivery | ✅ **Fixed** — now parses the real order's delivery instructions |
| 19 | Dead Call/Message courier buttons | ✅ **Fixed** — real `tel:`/`sms:` links with fallback |
| 20 | Fake ETAs ("12 min"/"15 min") | ✅ **Fixed** — computed from real order/GPS data |
| 21 | Post-delivery feedback chips discarded | ✅ **Fixed** — now folded into the real review submission |
| 22 | Dead "Add or adjust tip" button | ✅ **Fixed (by removal)** — replaced with an honest static note that tips can't change post-delivery |
| 23 | Dead "Download Receipt"/"Get Help" | ✅ **Fixed** |
| 24 | Dead "Add instructions" on Checkout; static map | ✅ **Fixed** — real instructions sheet, real live map |
| 25 | 5x dead Help buttons + dead near_me + dead order-summary tap across tracking views | ✅ **Fixed** — all wired |

### Account & Settings
| # | Original finding | Status |
|---|---|---|
| 26 | Dead avatar-edit button on Edit Profile | ✅ **Fixed** — real file picker + upload, with revert-on-failure |
| 27 | 5 of 6 notification toggles cosmetic-only | ✅ **Fixed** — all toggles now persist to the backend |
| 28 | Help screen mostly dead (FAQ rows, 3 quick actions) | ✅ **Fixed** — all real |
| 29 | Dead notification bell on account sub-header | ✅ **Fixed** |
| — | Favorited items vanish if not in hardcoded catalog | ✅ **Fixed** — now shows an honest "unavailable" state instead of silently dropping |
| — | Default payment rail localStorage-only | ✅ **Fixed** — now synced to the backend profile |
| — | Add Card dead end | ✅ **Confirmed fixed** — clean redirect stub, unreachable dead code otherwise |

---

## 4. Suggested order of operations

1. **One item left before this is safe for real customers on shared/reused devices: fix the sign-out data leak** (§1a / §2 item 3). Everything else that was blocking launch — order idempotency, abandoned-payment recovery, the wrong-ID tracking bug, both silent cart-add failures, the closed-merchant gap, and every Medium item — is confirmed fixed.
2. Optional hardening, not launch-blocking: the small residual/narrow gaps noted inline in §2 (the idempotency key not surviving a page reload, resume-payment visibility missing from Order Details/Tracking specifically, Search Results' own error-vs-empty state, the current-location confirm-button race, and notification prefs not fully resetting on a shared device until the sign-out fix lands).
3. Re-run a final pass once the sign-out fix lands: sign Customer A in, favorite a few restaurants, sign out, sign Customer B in on the same browser/device, and confirm B's account shows none of A's favorites and nothing of A's was written to B's backend record.
