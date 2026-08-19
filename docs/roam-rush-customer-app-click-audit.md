# Roam Rush (Customer App) — Full Click-Through Audit

**Scope:** `apps/dash-customer` only — every page and every shared component it renders (layout, home, discovery, restaurant, search, cart, checkout, orders, tracking, rating, account, forms).
**Method:** Read-only source audit. Original pass 2026-08-18. **Re-verified 2026-08-19** against current source, plus a fresh pass hunting for functional bugs and production-readiness gaps (not just dead buttons) since this is heading to real customers with real payments. No code was changed to produce this document.
**Companion doc:** [Roam Courier click audit](./roam-courier-app-click-audit.md) — same methodology, other side of the same order.

---

## 1. Where things stand

**The original 29-item punch list is almost entirely closed.** Every Critical and every High item from the 2026-08-18 pass — the fake support-report submit, the hardcoded gate code shown during delivery, the dead call/message buttons, the fake ETAs, the unconditional mock Category/Reviews screens, the dead Home-screen buttons — is now fixed and verified against current source (§3). The only item still intentionally open is "Continue with Apple," which is honestly disabled with a "Coming soon" label, not a bug.

**But this re-audit found new issues that weren't visible in a pure click-through pass**, because they're not about a button doing nothing — they're about what happens under real-world conditions: a flaky connection, a customer double-tapping, a shared device, an abandoned payment. Two of these are genuine launch blockers (§2). Fix those before turning on real payments.

---

## 2. New findings from this pass — ranked

This is the current answer to "what's left before this is production-ready." Items already covered in the original punch list are not repeated here — see §3 for that re-verification.

### 🔴 Launch blockers — fix before customers pay real money

1. **No idempotency guard on placing an order — a flaky connection or a double-tap can create two real orders and two real charges.** `apps/dash-customer/src/pages/CheckoutPage.tsx:179,538-546` — the "submitting" flag is set via `setState` inside the async handler, which doesn't block a second tap before React re-renders, and the button's `disabled` prop has no synchronous guard behind it. Server-side, `POST /orders` (`supabase/functions/delivery/customerOrderRoutes.ts:232-266`) has no idempotency key or dedup check at all — every call is an unconditional insert. Worse: if the order insert succeeds but the payment-intent call that follows it fails (a transient network blip), the error handler resets the "submitting" flag and shows a generic error — the customer sees "Place Order" again, taps it, and now has **two orders** for the same cart, with the first one never rolled back.
2. **A payment that's abandoned mid-flow leaves the order permanently stuck with no way back to it.** Same file — checkout clears the cart and redirects to the WiPay/PayPal hosted page *before* payment completes. If the customer closes the tab, loses signal, or the provider times out, `PaymentCallbackPage` (the screen that finalizes payment) never runs. Nowhere in `OrdersPage.tsx`, `OrderDetailsPage.tsx`, or `OrderTrackingPage.tsx` is there a "resume payment" affordance or even a visible unpaid/paid status — an unpaid, abandoned order looks identical to a normal active one ("Arriving soon"). There's currently no way for a customer — or you — to recover that order from the client.
3. **Signing out doesn't clear local storage, so on a shared/kiosk device the next customer's sign-in can silently push the previous customer's favorites onto their own account.** `AccountPage.tsx:137-140` — sign-out only calls `supabase.auth.signOut()`; it never clears the per-user localStorage keys (favorites, profile cache, saved addresses, cart, notification prefs, checkout prefs). On the next `SIGNED_IN` event, the favorites sync logic (`favoritesStorage.ts:167-197`) merges "remote + local" and **writes the leftover local IDs onto the new user's backend account**. This is a real cross-account data leak on any device more than one person uses to order — not just a stale-UI annoyance.

### 🟠 High — will cause real support tickets if not fixed before launch
4. **"Track Order" from the active-orders list passes the wrong ID and will 404 for real customers.** `apps/dash-customer/src/pages/OrdersPage.tsx:196` passes `order.orderNumber` where the tracking screen and its backend route (`customerOrderRoutes.ts:281-289`) expect the real order `id` (UUID), with no fallback lookup by number (unlike several sibling endpoints, which do support that fallback). A customer tapping "Track Order" straight from their own orders list will very likely hit "Couldn't load this order." (`OrderDetailsPage`'s "View Details" button, one screen over, uses the correct `order.id` — this is an isolated mistake, not a systemic pattern.)
5. **Adding a dish from search results can silently fail — with a false "added to cart" success toast — when it conflicts with what's already in the cart.** `SearchResultsPage.tsx:158-177` — the cart-add call correctly detects a cross-restaurant conflict elsewhere in the app (and shows a real "replace cart?" prompt on the main restaurant page), but this specific call site ignores that return value and fires a success toast/haptic regardless. The customer believes the item was added; it wasn't.
6. **The grocery "+" quantity stepper has the same conflict silently fail, with zero feedback at all** (not even a false-success toast). `StorePage.tsx:177-205` — tapping "+" on a grocery item while a different merchant's items are already in the cart does nothing, with no explanation.
7. **A closed or paused merchant can be fully browsed and added to cart with no indication anything's wrong** — there is no "closed" or "not accepting orders" concept anywhere in the client discovery/menu code (`RestaurantPage.tsx`, `StorePage.tsx`, `merchantMenu.ts`). If this is only enforced at checkout, a customer can build an entire order before finding out the restaurant isn't taking it — a bad, avoidable last-second failure.

### 🟡 Medium — real gaps, lower blast radius
8. **Deleting your only saved address leaves a stale address silently active for checkout.** `addressStorage.ts:69-84,156-166` — the local cache of "current delivery address" is only refreshed when a default address still exists after deletion; if you delete your last one, checkout keeps quietly using the deleted address instead of prompting for a new one.
9. **Deleting your default address doesn't promote a new one, so the UI shows no default while checkout silently still picks one** — a data/UI mismatch, not a functional break, but confusing.
10. **No phone/email format validation on Edit Profile** before it's saved to the backend — the app already has a proper phone-formatting component used elsewhere that this screen doesn't use.
11. **A failed discovery/search API call looks identical to "no restaurants here."** `merchantDiscovery.ts` swallows fetch errors and returns an empty list rather than surfacing an error state — during a real backend blip, customers would see "no restaurants found" and likely conclude the service doesn't work in their area, rather than "try again."
12. **No guard against double-submitting the onboarding address/zone-check forms** — rapid double-tap can fire two concurrent save/zone-check calls.
13. **The 8-second OAuth-return timeout can fire before a legitimately slow Google sign-in finishes**, especially relevant for the target network conditions (Jamaican mobile carriers) — the customer can end up "actually signed in" but stuck looking at the login form, and if they then try to sign in with a password, it fails (Google-only accounts have no password), which reads as a broken login.
14. **The tip keypad allows up to J$99,999 with no confirmation step or sanity check against the order total** — low probability of accidental use, but zero friction before it hits the real charge.

### 🟢 Low — polish, not launch-blocking
15. Tapping "Add" on a dish with modifiers from Search doesn't open its options sheet — lands on the plain restaurant menu instead.
16. No pagination on the merchant discovery fetch — fine at today's catalog size, will need attention as it grows.
17. `PaymentCallbackPage`'s PayPal branch has no timeout/failed state if the session hasn't rehydrated yet on redirect-back — can show an infinite "Processing..." spinner (the WiPay branch handles this correctly; PayPal doesn't).
18. Rate Order has no client-side check that the order actually belongs to the reviewer — safe today because the server enforces it, but it's relying entirely on that one backend check.
19. "Retry" on the offline/connection-error screen silently does nothing if you're still offline — no feedback that the tap registered.
20. Phone-OTP verification is fully feature-flagged off (`ENABLE_PHONE_AUTH = false`) — intentional soft-launch gate, not a bug, but worth knowing the phone-verify screen isn't reachable in production today, so QA shouldn't assume it's exercised.
21. Home screen and its Quick Reorder section each independently re-fetch the same orders data on every load — an avoidable duplicate request, worth trimming for a market where mobile data cost/latency matters.
22. Notification preferences aren't included in the app's global post-login sync (only refreshed when the Notification Settings screen itself is opened) — combine this with item #3 above and a second user on a shared device could briefly see/inherit the first user's toggles.
23. Rapid double-tapping a favorite heart can race two optimistic updates and briefly flicker back to a stale state — self-corrects on the next sync, cosmetic only.

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

1. Fix the three **Launch blockers** (§2, items 1-3) before real payments go live — an idempotency guard on order placement, a recovery path for abandoned payments, and clearing per-user local storage on sign-out. These are the ones that can cost real money or leak one customer's data to another.
2. Fix the **High** items (§2, items 4-7) next — the wrong-ID tracking bug and the two silent cart-add failures will generate support tickets almost immediately after launch since they sit on the most-used paths (tracking an order, adding food to cart).
3. Sweep the **Medium** list (§2, items 8-14) before or shortly after launch — none of these block going live, but several (stale deleted address, unvalidated profile data) will produce confusing support cases if left.
4. **Low** items (§2, items 15-23) are safe to defer post-launch.
5. Re-run this pass once more after the blockers land, specifically exercising: double-tapping "Place Order" on a throttled connection, abandoning a WiPay/PayPal redirect mid-flow, and signing two different accounts in on the same browser session back-to-back.
