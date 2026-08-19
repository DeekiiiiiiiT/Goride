# Roam Rush (Customer App) — Full Click-Through Audit

**Scope:** `apps/dash-customer` only — every page (39 files) and every shared component it renders (layout, home, discovery, restaurant, search, cart, checkout, orders, tracking, rating, account, forms).
**Method:** Read-only source audit. Every interactive element (button/link/toggle/tab/input) was traced to its actual handler to determine whether it does something real or nothing at all. No code was changed to produce this document.
**Date:** 2026-08-18

---

## 1. How to use this document

This is written as a literal click-through script: go screen by screen, tap everything, and use the tables in §4 to know whether what you're seeing is supposed to work. Anything marked **❌ dead** will feel broken to a real user — nothing happens when they tap it, with no error, no toast, no navigation. Anything marked **⚠️** works but is either cosmetic, mock data, or silently discards input. Anything marked **✅ real** is genuinely wired to the backend or to real device APIs (GPS, camera picker, etc.) and should behave correctly in a real environment.

Read §2 first — it answers your demo-data question directly and explains why some screens will look identical whether or not you remove anything.

---

## 2. Do you need to remove demo data?

There are **two different kinds** of fake data in this app, and they need opposite treatment:

### 2a. Gated mock data — leave it, just confirm the build flag
Most mock fallbacks in this app (`MOCK_ORDERS`, `ISLAND_GRILL` restaurant fixture, `MOCK_TRACKING_ORDER`, `FEATURED_DEALS`, the default profile fixture, etc.) are wrapped in a helper called `allowMocks()` (`src/lib/mocksGate.ts`), which only returns `true` when the app is built in dev mode or when an env var `VITE_ALLOW_MOCKS=true` is explicitly set. **In a real production build, these fallbacks never render** — the screen instead shows a real empty state (e.g., "No deals in Kingston right now"). You don't need to delete this code; it's a legitimate empty-database safety net. What you **do** need to do is confirm your production Vercel/build environment never sets `VITE_ALLOW_MOCKS=true`, and be aware that if you demo the app locally (`pnpm dev`) with an empty database, you *will* see this fake data appear automatically — that's expected dev behavior, not a bug.

### 2b. Unconditional mock data — this is a real gap, not a demo artifact
Two screens have **no live-data path at all** — they are not gated by `allowMocks()`, so they show fake data in production too, to real users, regardless of any environment setting:
- **CategoryPage** (`pages/CategoryPage.tsx`) — the entire screen is driven by a hardcoded `CATEGORY_PAGES` object that only has one entry, `pizza`. Tapping into any other category from wherever this screen is linked from renders "Category not found."
- **RestaurantReviewsPage** (`pages/RestaurantReviewsPage.tsx`) — every restaurant in the app, real or fake, shows the exact same two hardcoded "Island Grill" reviews. There is no backend reviews table wired to this screen at all.

These two need to be treated as **unbuilt features**, not demo cleanup — wiring them to real data (or hiding the entry points until they are) is genuine engineering work, separate from any "flip a flag" step.

---

## 3. Master punch list — what needs to be wired up, ranked

This is the actual answer to "what needs to be wired up." Ordered by how much it costs you (money lost, trust lost, or safety risk) if it ships as-is.

### 🔴 Critical — fix before this is customer-facing
1. **Report an Issue never actually submits anything.** `pages/ReportIssuePage.tsx` — "Submit Report" is a fake `setTimeout()` that shows a convincing "we'll respond within 24 hours" success screen, then discards everything the customer typed (order picked, issue type, details, photo). There is no dispute/support pipeline behind this screen at all today. This is your support/refund intake for a *food order gone wrong* — right now it's a black hole.
2. **In-delivery tracking screens show a fake gate code and fake handoff instructions to real customers.** `components/tracking/AlmostThereView.tsx` hardcodes `"Gate code: 1234"` and "Courier will leave at door" on every single delivery, regardless of what the customer actually entered as their delivery instructions or handoff preference. This isn't just a dead button — it's actively wrong information shown at the most stressful moment of the order (courier arriving).
3. **"Call courier" / "Message courier" do nothing, on every tracking screen.** `components/tracking/CourierShared.tsx` (`CourierActions`, reused across `CourierAssignedView`, `OnTheWayView`) — both buttons have no `onClick` at all. If a customer needs to reach their courier (wrong gate, can't find the address, item missing), there is currently no in-app way to do it.
4. **Fake ETAs shown during tracking.** `OnTheWayView.tsx` hardcodes "Arriving in 12 min"; `PreparingTrackingView.tsx` hardcodes "Estimated Ready: 15 min" — neither is computed from the real order/courier data, even though real GPS data is available elsewhere in the same flow (the live map itself is real).

### 🟠 High — customers will notice and lose trust
5. **Home screen has two dead buttons on the first screen every user sees.** `pages/HomePage.tsx` — the notifications bell (shows a red "unread" dot, does nothing when tapped) and "See all" under Popular near you.
6. **5 of 6 notification toggles are cosmetic.** `pages/NotificationSettingsPage.tsx` — only "Order updates" actually registers a push subscription. "Promotions," "New restaurant alerts," "Personalized picks," "Email newsletters," and "SMS updates" only flip local state with no backend call — a customer who turns off "Promotions" has not actually unsubscribed from anything server-side.
7. **Help screen is mostly dead.** `pages/HelpPage.tsx` — 3 of 4 "Quick Action" tiles (Account Issues, Payment Issues, Safety) do nothing, and every FAQ category row does nothing (no handler at all), despite showing a chevron implying it expands.
8. **Post-delivery feedback is silently discarded.** `pages/OrderDeliveredPage.tsx` — the "fast delivery / item missing / etc." feedback chips update local state that is never sent anywhere, in the API call, or in navigation to the rating screen. "Add or adjust" tip button is also dead.
9. **Category browsing is fully fake** (see §2b) — `pages/CategoryPage.tsx`.
10. **Reviews are fully fake for every restaurant** (see §2b) — `pages/RestaurantReviewsPage.tsx`, plus its own "Helpful" and "⋮ more options" buttons do nothing.
11. **Fake "favorite" heart on search results.** `pages/SearchResultsPage.tsx` — the heart icon on restaurant cards in search results only calls `stopPropagation()`; it looks identical to the real `FavoriteButton` used elsewhere but never actually favorites anything.
12. **Order Details has two dead buttons.** `pages/OrderDetailsPage.tsx` — "Download Receipt" and "Get Help" both have no handler.
13. **Profile photo can't actually be changed.** `pages/EditProfilePage.tsx` — the avatar edit overlay shows an "Edit" hover state with a camera badge, but there's no `onClick` anywhere on it — no file picker ever opens.

### 🟡 Medium — real but incomplete, or inconsistent
14. **Checkout delivery-address preview is a static image**, not a live map (`pages/CheckoutPage.tsx`), same pattern on the two onboarding address screens (decorative only, doesn't affect the real GPS/geocoding logic which is fully wired).
15. **"Add instructions" button on Checkout does nothing** (`pages/CheckoutPage.tsx`) — though the Hand-it-to-me/Leave-at-door toggle right next to it does work.
16. **Search results filters are half-dead.** `FilterSortSheet` (used from `SearchResultsPage`) — Sort and Rating actually filter results; Price, Dietary, and Delivery Fee are captured in state and passed along but never read by the filtering logic. Reopening the sheet also always resets to defaults instead of showing what's currently applied.
17. **Category page filter chips (Sort/Price/Rating/Time/Offers) are entirely cosmetic** — they only toggle the chip's own highlighted state; the restaurant list never actually re-sorts or filters. (Moot until #9 is fixed, since this screen only has one working category anyway.)
18. **Dead share/utility icons**: Share icon on `RestaurantPage.tsx` and `StorePage.tsx`, search "tune"/filter icon on `StorePage.tsx`'s grocery view, "near_me" icon on `PreparingTrackingView.tsx`'s map card, Help icon on `CourierAssignedView.tsx`, `AlmostThereView.tsx`, and `PreparingTrackingView.tsx` (every tracking phase has its own dead Help button — five separate instances, not one bug).
19. **Notification bell inconsistency.** `AccountSubHeader.tsx` (used on Favorites and other account sub-pages) has a bell icon with no handler at all, while the equivalent bell on `AccountPage.tsx`'s own header correctly navigates to notification settings — same-looking element, inconsistent behavior depending which screen it's on.
20. **Hamburger/menu icon in the shared app header does nothing anywhere it appears** (`components/layout/DashAppHeader.tsx` — `onMenuClick` prop is never actually passed from `App.tsx`).
21. **Restaurant "hours" section always renders empty for real (non-mock) merchants** — `mapMerchantMenuResponse` in `merchantMenu.ts` hardcodes `hours: []` regardless of what the backend actually has, so the "More info" expand on `RestaurantPage.tsx` is wired correctly but has nothing real to show.
22. **Favorited items can silently disappear from the Favorites list** if their ID isn't present in the app's hardcoded discovery/menu fixtures (`favoritesResolver.ts` looks items up against static content files, not a live catalog) — the favorite itself is saved correctly server-side, it just can't always be *displayed* back.
23. **Default payment-method preference (WiPay/PayPal/Cash) is localStorage-only** — doesn't carry over across devices or a reinstall. Low stakes since it's a preference, not the vaulted card data itself (which is real).
24. **Orders badge dot on the bottom nav is misleading** — it's tied to "is the user logged in," not "is there an actual new/active order," so it's always on for any signed-in user.
25. **"Continue with Apple" login is honestly disabled** ("Coming soon" tooltip) — not a bug, just incomplete; listed here so it's tracked alongside everything else.

### 🟢 Low — cosmetic only, no functional impact
26. Static map background image (with a fixed pin) on the two onboarding address screens — real GPS/geocoding underneath is unaffected.
27. `ConnectionErrorPage.tsx`'s offline illustration is a remote `googleusercontent.com` image URL rather than a bundled local asset — ironic for a "you're offline" screen, and a fragile external dependency, but not customer-blocking.
28. A hidden, `aria-hidden` dead button inside `AgeVerificationPage.tsx` — irrelevant today since the file itself documents that this screen isn't mounted in the current app routing at all.
29. `QuickReorderSection.tsx` silently falls back to mock orders/mock cart-building in dev mode with zero "this is fake" indicator — only a concern if someone runs a live product demo off a local dev build pointed at an empty database.

---

## 4. Full screen-by-screen click-through reference

Organized in the order a real customer moves through the app.

### 4.1 Onboarding & Auth

| Screen | File | Verdict |
|---|---|---|
| Splash | `pages/onboarding/SplashPage.tsx` | ✅ No interaction by design (auto-advances). |
| Welcome | `pages/onboarding/WelcomePage.tsx` | ✅ "Get Started" and "I already have an account" both real. |
| How It Works | `pages/onboarding/HowItWorksPage.tsx` | ✅ Skip, swipe, dot pagination, Next/Get Started all real. |
| Verify Phone | `pages/onboarding/VerifyPhonePage.tsx` | ✅ Real Supabase OTP send/resend/verify/change-number. |
| Delivery Address (onboarding) | `pages/onboarding/DeliveryAddressPage.tsx` | ✅ Real GPS + reverse geocode + Places search + zone check. ⚠️ Map preview image is static/decorative only. |
| Delivery Details (onboarding) | `pages/onboarding/DeliveryDetailsPage.tsx` | ✅ Inputs, label chips, Save all real. ⚠️ Map re-center icon is intentionally inert (by design, not a bug) but looks tappable; map image itself is static. |
| Login / Sign up | `pages/LoginPage.tsx` | ✅ Email/password, Google OAuth, forgot-password all real. ❌ "Continue with Apple" disabled ("Coming soon" — honest, not hidden). |
| Age Verification | `pages/AgeVerificationPage.tsx` | Not reachable in current routing — file documents it's unmounted. Contains one hidden dead button, low priority. |

### 4.2 Home & shared chrome

| Screen | File | Verdict |
|---|---|---|
| Home | `pages/HomePage.tsx` | ✅ Real order query, real merchant discovery, real category tabs, real pull-to-refresh. ❌ Notification bell dead. ❌ "See all" (Popular near you) dead. |
| App header (shared) | `components/layout/DashAppHeader.tsx` | ❌ Hamburger/menu icon never wired anywhere it's used. ✅ Profile/account icon real. |
| Bottom nav (shared) | `components/layout/DashBottomNav.tsx` | ✅ Tabs real. ⚠️ Orders badge dot logic is "logged in," not "has active order." |
| Active order banner | `components/home/ActiveOrderBanner.tsx` | ✅ Fully real, live order data. |
| Quick Reorder section | `components/home/QuickReorderSection.tsx` | ✅ Real when orders exist. ⚠️ Falls back to mock orders/cart in dev-mode-with-empty-DB, ungated visual indicator. |
| About | `pages/AboutPage.tsx` | ✅ Real static legal/version links (legitimate static content, not fake data). |
| Connection Error | `pages/ConnectionErrorPage.tsx` | ✅ Retry and active-order card real. ⚠️ Illustration is an external hosted image URL. |

### 4.3 Discovery & browse

| Screen | File | Verdict |
|---|---|---|
| Search (landing) | `pages/SearchPage.tsx` | ✅ Search input, recent/trending/category taps all real. ❌ "View All" categories tile dead. Recent-search list is in-memory only (not persisted). |
| Search Results | `pages/SearchResultsPage.tsx` | ✅ Real backend search + dish "Add" button. ❌ Fake favorite heart (no-op). ❌ Price/Dietary/Delivery-fee filters captured but never applied. ❌ "Sort by" pseudo-dropdown and "See All" dead (grouped/demo layout). ❌ Product "+" button dead in grouped Products section. |
| Category | `pages/CategoryPage.tsx` | ❌ 100% unconditional mock, only `pizza` category exists — see §2b/#9. All filter chips cosmetic-only. |
| Deals | `pages/DealsPage.tsx` | ✅ Fully real, properly gated fallback, no broken elements. |
| Promotions | `pages/PromotionsPage.tsx` | ✅ Fully real (promo code apply, redeem, use now) — no mock fallback exists at all. |

### 4.4 Restaurant / Store

| Screen | File | Verdict |
|---|---|---|
| Restaurant (deprecated, superseded by Store) | `pages/RestaurantPage.tsx` | ✅ Real menu, item detail sheet, add-to-cart, favorite, reviews-nav, cart-replace-modal all real. ❌ Share icon dead. ⚠️ "More info" hours always renders empty due to a mapping bug (`hours: []` hardcoded upstream), not a UI issue. |
| Store (grocery/retail/restaurant router) | `pages/StorePage.tsx` | ✅ Real product grid, qty stepper, cart bar, search-filter, favorite. ❌ Share icon dead, ❌ search "tune" icon dead. |
| Restaurant Reviews | `pages/RestaurantReviewsPage.tsx` | ❌ 100% unconditional mock, same two reviews for every restaurant — see §2b/#10. ❌ "Helpful" and "⋮" dead. ✅ Sort dropdown works (on the mock list). ✅ "Write a Review" navigates correctly, but nothing it produces ever shows back here. |

### 4.5 Cart, Checkout, Payment

| Screen | File | Verdict |
|---|---|---|
| Cart | `pages/CartPage.tsx` | ✅ Fully real — quantity, edit, delete, address change, instructions, promo apply, checkout nav. No broken elements found. |
| Checkout | `pages/CheckoutPage.tsx` | ✅ Real order + payment-intent creation, delivery mode, handoff toggle, tip, payment-method nav. ❌ "Add instructions" button dead. ⚠️ Map preview is static image. |
| Payment Callback | `pages/PaymentCallbackPage.tsx` | ✅ Fully real (WiPay complete / PayPal capture), all buttons wired. |
| Order Confirmation | `pages/OrderConfirmationPage.tsx` | ✅ Real (uses real order data passed from Checkout). "Enable notifications" real. Hardcoded fallback items exist in code but are unreachable in the real flow. |
| Payment Methods | `pages/PaymentMethodsPage.tsx` | ✅ Real vaulted-card fetch, real WiPay/PayPal/Cash selection. Confirms checkout is intentionally hosted-checkout-only — there is no separate "Add Card" form by design. ⚠️ Default-rail preference is localStorage-only. |
| Add Card | `pages/AddCardPage.tsx` | ✅ No longer a dead end — now an honest redirect stub that toasts "cards are saved during checkout" and bounces back. Previously flagged issue is resolved by removing the broken feature rather than fixing it. |

### 4.6 Live order tracking

| Screen | File | Verdict |
|---|---|---|
| Order Tracking (shell) | `pages/OrderTrackingPage.tsx` | ✅ Real polling + Supabase realtime, real cancel-order flow. |
| Preparing view | `components/tracking/PreparingTrackingView.tsx` | ❌ "Estimated Ready: 15 min" hardcoded. ❌ "near_me" map icon dead. ❌ "Need Help?" dead. ✅ Cancel Order real. |
| Courier Assigned view | `components/tracking/CourierAssignedView.tsx` | ❌ Help icon dead. ❌ "Details" button dead. |
| On The Way view | `components/tracking/OnTheWayView.tsx` | ❌ "Arriving in 12 min" hardcoded. ❌ Help dead. ❌ Order-summary row dead (looks tappable). ❌ Call/Message courier dead (shared component). |
| Almost There view | `components/tracking/AlmostThereView.tsx` | ❌ Hardcoded gate code + handoff text shown for every real order (see Critical #2). ❌ Help dead. ❌ Call/chat dead. ⚠️ Destination label hardcoded "Home." |
| Live map | `components/tracking/CourierTrackingMap.tsx` | ✅ Real Google Maps with live courier marker when GPS data present. Reasonable static-schematic degrade when GPS unavailable — not fake-by-default. |

### 4.7 Post-delivery

| Screen | File | Verdict |
|---|---|---|
| Order Delivered | `pages/OrderDeliveredPage.tsx` | ✅ "Rate Order" CTA real. ❌ Feedback chips silently discarded (never sent anywhere). ❌ "Add or adjust" tip dead. ⚠️ Star rating only persists if you continue to Rate Order. |
| Rate Order | `pages/RateOrderPage.tsx` | ✅ Fully real — POSTs a real review with ratings + issue chips + text. No mock fallback. |
| Report Issue | `pages/ReportIssuePage.tsx` | ❌ **Submit does not send anything anywhere** (see Critical #1). Order/issue-type/details selection is cosmetic. ❌ "Upload a photo" dead. ❌ Support header icon dead. |
| Out of Delivery Zone | `pages/OutOfDeliveryPage.tsx` | ✅ Fully real — waitlist submit and "try different address" both work. |

### 4.8 Orders history

| Screen | File | Verdict |
|---|---|---|
| Orders (list) | `pages/OrdersPage.tsx` | ✅ Real order list, real track/reorder/view-details, real pull-to-refresh. Reorder safely fails closed if item data is incomplete rather than adding garbage to cart. |
| Order Details | `pages/OrderDetailsPage.tsx` | ✅ Merchant nav, Reorder, Rate Order all real. ❌ "Download Receipt" dead. ❌ "Get Help" dead. |

### 4.9 Account & settings

| Screen | File | Verdict |
|---|---|---|
| Account (menu) | `pages/AccountPage.tsx` | ✅ Fully real — profile sync, all menu rows, sign out. |
| Edit Profile | `pages/EditProfilePage.tsx` | ✅ Name/email/phone save real (backend-synced when signed in — previously-flagged localStorage-only issue is fixed for this case). ❌ Avatar/photo edit is dead — no upload handler exists at all. |
| Saved Addresses | `pages/SavedAddressesPage.tsx` | ✅ Fully real — edit/delete/add all sync to backend. |
| Add Address | `pages/AddAddressPage.tsx` | ✅ Fully real — GPS, autocomplete, zone check, save all wired. |
| Favorites | `pages/FavoritesPage.tsx` | ✅ Real backend sync for heart-toggle (previously-flagged localStorage-only issue is fixed). ⚠️ A favorited item can silently vanish from the list if it's not in the app's hardcoded content catalog (display-only limitation, the favorite itself is saved correctly). |
| Notification Settings | `pages/NotificationSettingsPage.tsx` | ✅ "Order updates" toggle is genuinely wired to a real push subscription (previously-flagged issue fixed for this one toggle). ❌ The other five toggles (Promotions, New restaurants, Personalized picks, Email newsletters, SMS) are cosmetic-only. |
| Help | `pages/HelpPage.tsx` | ❌ 3 of 4 quick actions dead, all FAQ rows dead. ✅ "Order Help" and "Contact Support" real (both route to Report Issue, which itself doesn't submit — see Critical #1). |
| Account sub-header (shared) | `components/account/AccountSubHeader.tsx` | ❌ Notification bell dead here specifically (inconsistent with the working one on `AccountPage.tsx`). |

---

## 5. Suggested order of operations

1. Fix or hide the **Critical** section (§3, items 1-4) first — these are the ones that produce actively wrong information or a lost support ticket, not just a missed feature.
2. Decide whether Category browsing and Reviews (items 9, 10) are in scope for this launch. If not, hide their entry points rather than leaving dead-feeling screens live.
3. Sweep the **High** and **Medium** dead-button list (§3, items 5-25) — most of these are missing `onClick` handlers on already-styled buttons, which is typically fast to fix once triaged, not a redesign.
4. Re-run this exact click-through pass after fixes land, specifically re-testing the tracking-screen flow (§4.6) end-to-end on a real order, since that's where the highest concentration of dead buttons and hardcoded strings live.
