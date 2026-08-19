# Roam Courier (Driver App) — Full Click-Through Audit

**Scope:** `apps/dash-courier` only — every page (57 files) and every shared component it renders (layout, home, offers, delivery, delivery/stacked, map, earnings, activity, profile, forms, auth).
**Method:** Read-only source audit. Every interactive element (button/link/toggle/tab/input/swipe/upload) was traced to its actual handler to determine whether it does something real or nothing at all. No code was changed to produce this document.
**Date:** 2026-08-18
**Companion doc:** [Roam Rush (customer) click audit](./roam-rush-customer-app-click-audit.md) — same methodology, other side of the same order.

---

## 1. How to use this document

Same format as the Roam Rush audit: go screen by screen, tap everything, use §4 to know whether what you're seeing is real. **❌ dead** = nothing happens when tapped, no error, no toast. **⚠️** = works but is cosmetic, hardcoded, or silently discards input. **✅ real** = genuinely wired to the backend or real device APIs (GPS, camera, Storage upload).

One thing that came out of this audit worth flagging up front: several issues from an earlier written audit of this app are **no longer true** — the code has moved since then. Where that happened, it's called out explicitly below so you don't waste time re-fixing something that's already fixed, and don't trust an old doc over what's actually in the repo today.

---

## 2. Do you need to remove demo data?

Same two categories as Roam Rush, plus a third pattern specific to this app:

### 2a. Env-gated mock data — leave it
Fallback fixtures gated behind `allowMocks()`/`VITE_COURIER_USE_MOCK_DISPATCH` don't render in a real production build. No action needed beyond confirming the build env doesn't set these flags.

### 2b. Unconditionally-hardcoded screens — real gaps, not demo artifacts
These render fake data in production, to real couriers, with no flag involved:
- **`OrderCancelledPage`** — shows `MOCK_ORDER_CANCELLATION`'s cancelled-by/reason/compensation regardless of what the real cancelled order actually says.
- **`PromotionsPage`** (earnings) — Peak Pay/Weekend Challenge/promo countdown are entirely `mockPromotions.ts` fixtures, always.
- **`AccountPendingPage`**'s review checklist — always the same hardcoded `ACCOUNT_REVIEW_ITEMS`, never reflects actual document/background-check review progress (even though the approval-polling underneath it is real).
- **`HomeOfflinePage`/`HomeOnlinePage`** shift stats — "Today's Earnings," deliveries count, acceptance rate, shift duration, and the "Peak Pay" banner text are static markup, not computed from a real shift.
- **`DashSummaryPage`** (end-of-shift summary) — entirely `MOCK_DASH_SUMMARY`.
- **`EditProfilePage`** avatar photo — permanently a hardcoded external stock image; never loads or saves a real photo.

### 2c. Code-level disabled features — different from a flag, needs real engineering
Stacked (multi-order) delivery is not just mock-fed, it's **hard-disabled in code**: `CourierHomePage.tsx` gates both the stacked-offer screen and the entire stacked-delivery flow behind a literal `{false && ...}`, with a comment confirming there's no backend "order stack" concept yet. This isn't something you flip an env var to enable — someone has to build the backend stack model and remove the `false &&` gate. Don't test this flow expecting it to work; confirm instead that it stays unreachable.

---

## 3. Master punch list — what needs to be wired up, ranked

### 🔴 Critical — fix before this is courier-facing at scale
1. **Onboarding document upload silently discards the courier's photo.** `pages/onboarding/DocumentsPage.tsx` — the file input has **no `onChange` handler at all**; selecting a license/ID photo does nothing, and the "Continue" button is gated only by a consent checkbox, completely ignoring whether any document was actually captured. Every document row's verified/pending status is hardcoded mock, never real. This is the identity-verification step of onboarding a new courier, and it currently does not collect a single real document. (Contrast: the *separate* `profile/CourierDocumentsPage.tsx`, reachable later from Account settings, does upload for real — so there are two document-upload surfaces in this app, and only one of them works.)
2. **Delivery history detail page shows fake data for every real delivery.** `pages/earnings/DeliveryDetailPage.tsx` — tapping any delivery row from `ActivityPage` or `EarningsPage` opens this screen, but its component doesn't accept a delivery ID at all — it always renders the same fixed fake order ("Island Grill," fixed earnings breakdown, fixed timestamps, a stock proof-of-delivery photo), regardless of which real delivery the courier tapped. A courier checking what they actually earned on a specific job sees fabricated numbers.
3. **Hardcoded delivery instructions shown at the customer's door, overriding the real ones.** `pages/delivery/AtCustomerPage.tsx` — the on-screen handoff card always says "Leave at door, don't knock" as static text, never reading the customer's actual `deliveryInstructions`. Gate Code and Unit fields are also always blank (no backend field is mapped into them at all). A courier following this screen literally may deliver the wrong way for a real customer's real instructions.
4. **Chat and Call are dead on the doorstep screen.** `pages/delivery/AtCustomerPage.tsx` — both icon buttons have no `onClick`. If something's wrong at the door (can't find the unit, customer not answering), there is no in-app way to reach them from this specific screen (note: `CustomerUnavailablePage`, the next step in the flow, does have a real Call button — this is specific to the "at customer" screen itself).
5. **"Open Settings" on the location-permission-issue sheet is a literal `window.alert()`**, not a real settings deep-link (`pages/home/CourierHomePage.tsx:782`). A courier who denies location access mid-shift and needs to re-enable it gets a browser alert box instead of being taken to their device settings — directly blocks them going back online.
6. **Profile-setup photo upload is dead during onboarding.** `pages/onboarding/ProfileSetupPage.tsx` — the "Upload profile photo" avatar button has no `onClick` at all.

### 🟠 High — couriers will notice and it affects trust/pay
7. **Order-cancellation screen shows fabricated compensation.** `pages/delivery/OrderCancelledPage.tsx` — cancelled-by, reason, and compensation amount are all `MOCK_ORDER_CANCELLATION`, unrelated to what actually happened or what the courier is actually owed.
8. **Distance Bonus and Peak Pay always show J$0 on the delivery-complete screen**, even when real — `mapOrderToActiveDelivery.ts:162-164` hardcodes both to zero regardless of actual courier performance/timing. Base pay and tip are real; these two line items are not.
9. **"Order not ready?" wait-time selection is discarded.** `pages/delivery/AtStorePage.tsx` — the courier picks a wait duration in `WaitTimeSheet`, but the only thing that happens is the sheet closes; no backend call, no notification to dispatch or the customer that the courier is waiting.
10. **Five dead controls on the grocery/retail shopping screen**, mid-shop: `pages/delivery/ShopAndPickPage.tsx` — header menu icon, header wallet icon, "Can't find" button, "Substitute" button, and the edit-pencil on found items all have no handler. For grocery orders specifically, "Can't find"/"Substitute" not working means a courier has no way to flag an out-of-stock item through the intended UI.
11. **Vehicle-type switch doesn't actually switch anything.** `pages/profile/VehicleDetailsPage.tsx` — the "Switch vehicle type" modal only writes to a local onboarding draft in localStorage; it never calls the real vehicle-update API and never refetches, so the displayed vehicle type never changes and the backend record is untouched.
12. **Profile edit photo is permanently fake, and its edit controls are dead.** `pages/profile/EditProfilePage.tsx` — avatar always renders a hardcoded stock photo (never loaded from or saved to the backend); both the pencil icon and "Change Photo" text button have no `onClick`. Separately, if a courier's real backend profile has a null name/phone/email, the mock draft values silently fill in and could get saved back as if real.
13. **Account-pending review checklist never reflects real progress** (`pages/onboarding/AccountPendingPage.tsx`) — a new courier waiting on approval sees a static checklist that never updates, even while the real approval-status polling underneath is genuinely checking.
14. **Promotions/Peak Pay screen is fully fake**, and its list rows are dead on top of that — `pages/earnings/PromotionsPage.tsx`.
15. **Shift stats on the home screen are fabricated.** `pages/home/HomeOfflinePage.tsx` / `HomeOnlinePage.tsx` — earnings, delivery count, acceptance rate, shift duration, and the "Peak Pay +J$50/delivery" banner are all static text, not computed from the courier's actual shift. `DashSummaryPage.tsx` (the end-of-shift recap) is the same — entirely `MOCK_DASH_SUMMARY`.

### 🟡 Medium — real but incomplete, or inconsistent
16. **Turn-by-turn instructions are placeholder text, not real routing guidance.** `ActiveDeliveryNavPage.tsx` and `EnRoutePage.tsx` both synthesize a string like `"Head to {street name}"` rather than real turn-by-turn directions — the live map/GPS/distance underneath is real, this is specifically the text instruction line. ETA/distance are computed from a real straight-line haversine calculation (not routed/traffic-aware) — a reasonable approximation, just worth knowing it's not routing-engine-accurate.
17. **Dead hamburger/menu and notification-bell icons, repeated across several screens**: `CourierHomePage.tsx` header, `AccountPage.tsx` header (both menu and notifications bell), `ActivityPage.tsx` (menu when `onBack` absent, and notifications bell), `OfflineModePage.tsx` (menu). Same pattern as the customer app — a persistent chrome element that looks tappable everywhere it appears but isn't wired anywhere.
18. **Preferences/settings screens save to localStorage only, not the backend**: `DashPreferencesPage.tsx`, `NotificationSettingsPage.tsx`, `SettingsPage.tsx` (appearance/language/nav-app/distance-units all local). Fine for single-device use; means none of it follows the courier to a reinstall or a second device.
19. **`OfflineModePage`'s "cached last delivery" is a hardcoded fixture** (`MOCK_CACHED_DELIVERY`), not the courier's actual last-known active order, shown when the app detects it's offline.

### 🟢 Low / confirmed non-issues
20. Static (non-live) map preview images on `DeliveryOfferPage.tsx`/`OfferDetailsPage.tsx` — offer accept/decline/countdown/swipe are all genuinely wired; only the route-preview thumbnail is a static image with fixed-position pins.
21. `StackedOfferPage.tsx` contains two dead icon buttons (hamburger, info) — moot, since the entire screen is unreachable (§2c).
22. `PlaceholderHomePage.tsx` is dead, unreachable code, fully superseded by `CourierHomePage.tsx` — no user ever sees it.

### ✅ Worth knowing: previously-flagged issues that are now actually fixed
Cross-checking against an earlier written audit of this app turned up several claims that no longer match current source — don't re-spend effort "fixing" these:
- `EnRoutePage.tsx`/`AtStorePage.tsx` were previously reported as using a static map image with dead Call/Message/Open-in-Maps buttons. **Current source has a real live Leaflet map and all three buttons are genuinely wired** (real phone dialer, real SMS, real nav-app deep link picker).
- `VehicleDetailsPage.tsx` was previously reported reading a hardcoded `MOCK_COURIER_VEHICLE`. **It now loads the real vehicle record** — the only remaining gap there is the "switch type" flow specifically (§3, item 11), which is a different, newly-found issue.
- `AccountPage.tsx` was previously reported seeding from `MOCK_COURIER_PROFILE`. **It now seeds from a real empty-state, not mock data.**
- The unassign-delivery confirmation modal was previously reported showing a hardcoded mock completion-rate stat. **It now receives the real value from the courier's actual profile.**
- Real-time dispatch (offer polling, accept, decline) is genuinely live via `RealDispatchProvider` + Supabase realtime subscriptions — not a stub.
- Proof-of-delivery, pickup, age-verification, and issue-report photos across the active single-order delivery flow all genuinely upload to Supabase Storage (`courier-documents` bucket) and submit to the real delivery API — none of that is discarded client-side.

---

## 4. Full screen-by-screen click-through reference

Organized in the order a real courier moves through the app.

### 4.1 Onboarding & Auth

| Screen | File | Verdict |
|---|---|---|
| Splash | `pages/onboarding/SplashPage.tsx` | ✅ Auto-advances by design, no interaction. |
| Welcome | `pages/onboarding/WelcomePage.tsx` | ✅ Both CTAs real. |
| How It Works | `pages/onboarding/HowItWorksPage.tsx` | ✅ Skip, swipe, Next all real. |
| Sign Up | `pages/onboarding/SignUpPage.tsx` | ✅ Real Supabase signup, real Google OAuth, real ToS links. |
| Verify Account | `pages/onboarding/VerifyAccountPage.tsx` | ✅ Real OTP verify/resend. |
| Documents | `pages/onboarding/DocumentsPage.tsx` | ❌ **File upload fully discarded, doc statuses fully mock, Continue ignores real doc state** — see Critical #1. |
| Permissions | `pages/onboarding/PermissionsPage.tsx` | ✅ Real Capacitor location/notification/camera permission requests; real "open settings" deep link here (contrast with the broken one on the home screen, item #5). |
| Profile Setup | `pages/onboarding/ProfileSetupPage.tsx` | ✅ Name/phone fields real. ❌ Avatar upload button dead (Critical #6). |
| Vehicle Setup | `pages/onboarding/VehicleSetupPage.tsx` | ✅ Fully real, including genuine Supabase Storage photo upload — the one onboarding screen where photo upload actually works. |
| Account Pending | `pages/onboarding/AccountPendingPage.tsx` | ✅ Real approval polling. ⚠️ Review checklist always mock (High #13). |
| Login | `pages/auth/LoginPage.tsx` | ✅ Fully real — email/password, OTP, forgot-password, Google OAuth. |

### 4.2 Home / Dashboard

| Screen | File | Verdict |
|---|---|---|
| Placeholder Home | `pages/PlaceholderHomePage.tsx` | Dead/unreachable code, ignore. |
| Courier Home (shell) | `pages/home/CourierHomePage.tsx` | ✅ Go-online, offer accept/decline, pickup/en-route/handoff/complete transitions, report-issue, unassign all real. ❌ Header menu dead. ❌ "Open Settings" on location sheet is a fake `alert()` (Critical #5). ⚠️ Stacked-order UI present but hard-disabled (§2c). ⚠️ Offline-mode shows a mock cached delivery. |
| Home Offline | `pages/home/HomeOfflinePage.tsx` | ✅ "Go Online" real. ⚠️ All shift stats hardcoded (High #15). |
| Home Online | `pages/home/HomeOnlinePage.tsx` | ✅ Live map, "Go Offline" real. ⚠️ Shift stats and Peak Pay banner text hardcoded (High #15). |
| Home Going-Online | `pages/home/HomeGoingOnlinePage.tsx` | ✅ Transition screen only, no interaction expected. |
| Dash Summary (end of shift) | `pages/home/DashSummaryPage.tsx` | ✅ Both buttons real navigation. ⚠️ All summary numbers mock (High #15). |
| Offline Mode | `pages/home/OfflineModePage.tsx` | ✅ Profile icon and retry-connection real. ❌ Menu dead. ⚠️ Cached delivery shown is mock. Bottom nav intentionally disabled (by design). |

### 4.3 Delivery offers

| Screen | File | Verdict |
|---|---|---|
| Delivery Offer (single) | `pages/offers/DeliveryOfferPage.tsx` | ✅ Countdown, accept, decline, view-details all real, live dispatch data. ⚠️ Route preview is a static image. |
| Offer Details | `pages/offers/OfferDetailsPage.tsx` | ✅ Same as above — accept/decline/swipe-dismiss all real. ⚠️ Map pins are fixed-position, not real geocoded markers. |
| Stacked Offer | `pages/offers/StackedOfferPage.tsx` | ⚠️ Fully mock and unreachable in production (§2c). Two dead icon buttons inside, moot since unreachable. |

### 4.4 Active delivery — single order

| Screen | File | Verdict |
|---|---|---|
| Active Delivery Nav (to store) | `pages/delivery/ActiveDeliveryNavPage.tsx` | ✅ Real live map, real "Open in Maps," real swipe-to-arrive. ⚠️ Turn instruction text is a synthetic placeholder, not real routing (Medium #16). |
| Age Verify Handoff | `pages/delivery/AgeVerifyHandoffPage.tsx` | ✅ Fully real — real ID photo upload, real submit. |
| At Customer (doorstep) | `pages/delivery/AtCustomerPage.tsx` | ❌ **Hardcoded handoff instructions override real ones; Gate Code/Unit always blank; Chat/Call dead** — see Critical #3, #4. ✅ Photo upload and completion are real. |
| At Restaurant | `pages/delivery/AtRestaurantPage.tsx` | Deprecated alias of At Store, no independent logic. |
| At Store (pickup) | `pages/delivery/AtStorePage.tsx` | ✅ Real live map, real Call Store, real photo upload, real confirm-pickup. ❌ "Order not ready?" wait-time is discarded, not communicated anywhere (High #9). |
| Confirm Handoff | `pages/delivery/ConfirmHandoffPage.tsx` | ✅ Fully real, all three actions wired to real parent handlers. |
| Customer Unavailable | `pages/delivery/CustomerUnavailablePage.tsx` | ✅ Real call button, real 5-minute timer gating "leave at safe location." |
| Delivery Complete | `pages/delivery/DeliveryCompletePage.tsx` | ✅ Base pay + tip real. ❌ Distance Bonus and Peak Pay always show J$0 regardless of actual value (High #8). |
| En Route (to customer) | `pages/delivery/EnRoutePage.tsx` | ✅ Real live map, real Call/Message/Open-in-Maps (previously-flagged issue confirmed fixed — see §3 checklist). ⚠️ Turn instruction text synthetic. |
| Order Cancelled | `pages/delivery/OrderCancelledPage.tsx` | ❌ **Entirely fabricated cancellation reason/compensation** — see High #7. |
| Report Issue (mid-delivery) | `pages/delivery/ReportIssuePage.tsx` | ✅ Fully real — real photo upload, real submit, real unassign path. |
| Shop And Pick (grocery) | `pages/delivery/ShopAndPickPage.tsx` | ✅ Checklist, report-issue, message/call, done-shopping all real. ❌ Menu/wallet icons and "Can't find"/"Substitute"/edit-pencil dead (High #10). |

### 4.5 Stacked delivery (multi-order) — confirmed disabled, don't test as if live

| Screen | File | Verdict |
|---|---|---|
| Stacked At Pickup | `pages/delivery/stacked/StackedAtPickupPage.tsx` | ⚠️ Fully mock, unreachable (§2c). |
| Stacked Deliver Nav | `pages/delivery/stacked/StackedDeliverNavPage.tsx` | ⚠️ Fully mock, unreachable. Also has a dead Call button and dead item-count row, if it ever were reachable. |
| Stacked Delivery Flow (orchestrator) | `pages/delivery/stacked/StackedDeliveryFlow.tsx` | ⚠️ Entirely local/toast-only logic, never calls the real delivery API, and gated off with a literal `false &&` in `CourierHomePage.tsx`. |
| Stacked Delivery Summary | `pages/delivery/stacked/StackedDeliverySummaryPage.tsx` | ⚠️ Fully mock, unreachable. |
| Stacked Leg Complete | `pages/delivery/stacked/StackedLegCompletePage.tsx` | ⚠️ Fully mock, unreachable. |
| Stacked Pickup Nav | `pages/delivery/stacked/StackedPickupNavPage.tsx` | ⚠️ Fully mock, unreachable. Also has dead Account-icon and Phone buttons, if it ever were reachable. |

### 4.6 Earnings & activity

| Screen | File | Verdict |
|---|---|---|
| Activity (history) | `pages/activity/ActivityPage.tsx` | ✅ Real backend earnings/history fetch, real pull-to-refresh, real filters. ❌ Menu (when `onBack` absent) and notifications bell dead. ❌ Tapping any delivery row routes to a broken detail page (Critical #2). |
| Earnings | `pages/earnings/EarningsPage.tsx` | ✅ Real backend fetch, real period tabs, real pull-to-refresh. ❌ Same broken detail-page destination as above. |
| Promotions | `pages/earnings/PromotionsPage.tsx` | ❌ **Entirely mock** — see High #14. Peak Pay list rows dead. |
| Delivery Detail | `pages/earnings/DeliveryDetailPage.tsx` | ❌ **Always shows the same fake order regardless of which real delivery was tapped** — see Critical #2. Star rating and proof-of-delivery photo are also static/decorative. |
| Payout History | `pages/profile/PayoutHistoryPage.tsx` | ✅ Fully real backend fetch. |
| Payout Settings | `pages/profile/PayoutSettingsPage.tsx` | ✅ Fully real — real Stripe Connect onboarding redirect, real weekly-payout request. |

### 4.7 Profile & settings

| Screen | File | Verdict |
|---|---|---|
| Account (menu) | `pages/profile/AccountPage.tsx` | ✅ Real profile load, real menu navigation, real sign-out. ❌ Menu and notifications-bell header icons dead. ⚠️ Avatar/"member since" always blank (query never selects those columns). |
| Edit Profile | `pages/profile/EditProfilePage.tsx` | ✅ Name/phone/email save real. ❌ Avatar is permanently fake and its edit controls are dead (High #12). ⚠️ Can silently retain mock values if backend fields are null. |
| Edit Vehicle | `pages/profile/EditVehiclePage.tsx` | ✅ Fully real — genuine backend upsert. |
| Vehicle Details | `pages/profile/VehicleDetailsPage.tsx` | ✅ Real vehicle record load, real "Edit Vehicle" nav. ❌ "Switch vehicle type" is a functional dead end — writes to local draft only, never persists or updates the display (High #11). |
| Courier Documents | `pages/profile/CourierDocumentsPage.tsx` | ✅ Fully real Supabase Storage upload — this is the document-upload surface that actually works (contrast with onboarding's broken one, Critical #1). |
| Ratings & Stats | `pages/profile/RatingsStatsPage.tsx` | ✅ Fully real backend data. |
| Dash Preferences | `pages/profile/DashPreferencesPage.tsx` | ✅ All toggles/sliders real (as local device preferences). ⚠️ localStorage only, not backend-synced. |
| Notification Settings | `pages/profile/NotificationSettingsPage.tsx` | ✅ Toggles real (as local device preferences). ⚠️ localStorage only. |
| Payout Settings | *(see §4.6)* | |
| Help & Support | `pages/profile/HelpSupportPage.tsx` | ✅ Fully real — search filter, real `tel:911`, real topic navigation, real support email link. |
| Help Topic | `pages/profile/HelpTopicPage.tsx` | ✅ Static FAQ content rendered via native accordion — expected, not a gap. |
| Settings | `pages/profile/SettingsPage.tsx` | ✅ Appearance toggle has a real visual side-effect (dark mode); other selects are real local prefs. ⚠️ localStorage only. Real external legal links and real account-deletion `mailto:`. |
| About | `pages/profile/AboutPage.tsx` | ✅ Real static links (legitimate static content). |

---

## 5. Suggested order of operations

1. Fix the **Critical** section (§3, items 1-6) first — a courier onboarding path that discards ID documents, a doorstep screen showing wrong delivery instructions, and a broken settings deep-link that can strand a courier offline are all things that block or actively mislead someone trying to do their job, not just missing polish.
2. Fix `DeliveryDetailPage` (item #2) next — it's a correctness bug (wrong data shown for a real record), not a missing feature, and it directly affects trust in the pay a courier sees.
3. Sweep the **High** section (items 7-15) — mostly missing `onClick` handlers and hardcoded numbers on already-built screens, should be fast once triaged.
4. Decide whether Promotions/Peak Pay (item 14) is in scope for this launch; if not, hide the entry point rather than showing a fully fake promotions screen.
5. Leave stacked/multi-order delivery alone (§2c) until there's a real backend "order stack" model — the UI already exists and is wired to itself internally, it just has nothing real to plug into yet.
6. Re-run this click-through pass on the full single-order delivery flow end-to-end (offer → pickup → en route → doorstep → complete) after fixes land, since that's both the highest-traffic path and where the highest-severity issues concentrate.
