# Roam Courier (Driver App) — Full Click-Through Audit

**Scope:** `apps/dash-courier` only — every page and every shared component it renders (layout, home, offers, delivery, delivery/stacked, map, earnings, activity, profile, forms, auth).
**Method:** Original pass was a read-only source audit of every interactive element. **Re-verified 2026-08-18** after the critical click fixes, leftover click fixes, and leftover closeout. This file is the current source of truth — do not re-test old ❌ items as if they were still open.
**Companion doc:** [Roam Rush (customer) click audit](./roam-rush-customer-app-click-audit.md) — same methodology, other side of the same order.

---

## 1. How to use this document

Go screen by screen, tap everything, use §4 to know whether what you're seeing is real. **❌ dead** = nothing happens when tapped. **⚠️** = works but is cosmetic, local-only, or a parked product. **✅ real** = wired to the backend or real device APIs (GPS, camera, Storage upload).

**Launch rule used in the closeout:** if the backend cannot prove a number or a status, hide it. Do not show J$0 Peak Pay, fake checklists, or fake names.

---

## 2. Demo data — current state

### 2a. Env-gated mock data — leave it
Fallback fixtures gated behind `VITE_COURIER_USE_MOCK_DISPATCH` do not render in a real production build. Confirmed: `.env.example` is `false`; `.env.production` does not set the flag. Default dispatch is live (`RealDispatchProvider`).

### 2b. Previously hardcoded screens — now honest
These were fake in production on the original 2026-08-18 pass. They are **not** fake anymore:

| Screen | Now |
|---|---|
| `OrderCancelledPage` | Loads real `cancelled_by` / `cancellation_reason`. Shows no pay (there is no cancel-compensation column). |
| `AccountPendingPage` checklist | Built from real docs (`drivers_license`, `insurance`), vehicle on file, and `background_check_status`. Approval poll still real. |
| `HomeOfflinePage` / `HomeOnlinePage` | Today’s earnings, delivery count, and acceptance rate come from earnings + profile. Peak Pay banner removed. Session clock is this-device elapsed time from Go Online (resets if the app is killed). |
| `DashSummaryPage` | Same real today totals + this-session online time. |
| `EditProfilePage` | Real photo load/save. Form starts empty; Save is blocked until load finishes; never falls back to “Alex Rivera”. |
| `OfflineModePage` cached trip | Shows the in-memory active delivery, or “No active delivery”. Not Burger King mock. |
| `DeliveryCompletePage` | Base pay + tip + total only. Fake Distance Bonus / Peak Pay rows removed. |
| `DeliveryDetailPage` | Accepts a real delivery ID and loads that order. |
| `DocumentsPage` (onboarding) | Real upload + Continue gated on consent and required docs. |
| `AtCustomerPage` | Real delivery instructions + Call/SMS. Gate/Unit only show if populated (no DB columns — usually hidden). |
| Activity Cancelled tab | Uses `GET /courier/history` (completed + cancelled). **Needs delivery function deploy to be live in production.** |

### 2c. Still hardcoded, but unreachable
- **`PromotionsPage`** — still 100% mock (`mockPromotions.ts`). **Entry points are hidden**; couriers cannot open it from Home, Earnings, or Account. Do not test as a live screen. Delete or productize later.
- **Stacked (multi-order) delivery** — UI exists, gated with `{false && ...}` in `CourierHomePage.tsx`. No backend order-stack model (`active_order_id` is one UUID). Confirm it stays unreachable; do not test as live.

Unused mock constants still sit in `src/lib/mock*.ts`. They are not on live paths.

---

## 3. What’s still open

Nothing in the original Critical or High punch list is still a click-blocker. Remaining work is **parked product**, **ops**, or **low cosmetics**.

### Parked — needs a real product / backend (do not invent)

| Item | Status |
|---|---|
| Promotions / Peak Pay product | **Shipped (MVP)** — `courier_peak_windows`, `GET /courier/promotions/active`, Peak Pay on Earnings tab |
| Stacked multi-order | **Shipped (MVP)** — `courier_stack_legs`, stack accept API, UI enabled when 2 pending offers |
| Grocery Substitute engine | **Shipped (MVP)** — `order_item_substitutions`, courier propose + customer approve API |
| Cancel compensation pay | **Shipped** — `courier_compensation_amount`, 50% before pickup / 100% after pickup |
| Real turn-by-turn routing | **Shipped** — `GET /courier/route`, Google Directions polyline + next-turn on nav screens |
| Gate code / unit as form fields | **Shipped** — `delivery_address_line2` on orders, shown as Unit on At Customer |
| Cloud preference sync | **Shipped** — `courier_profiles.app_settings`, `GET/PATCH /courier/settings` |

### Ops

1. ~~**Deploy the delivery edge function**~~ — **Done** (2026-08-19): includes route, settings, peak pay, substitute, stack APIs.
2. **Apply migration** `20260819120000_courier_roadmap_schema.sql` on all environments.
3. Re-run single-order + stacked smoke after deploy.

### Low / ignore for launch

- ~~Static offer map previews~~ — live `DeliveryMap` on offer screens.
- ~~Dead stacked-offer gates~~ — enabled when dispatch sends 2 offers.
- ~~PlaceholderHomePage~~ — deleted.
- ~~At Customer Help chip~~ — wired to Help flow.
- ~~Help FAQ Promotions tab mention~~ — updated.

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
| Documents | `pages/onboarding/DocumentsPage.tsx` | ✅ Real Storage upload via `listCourierDocuments` / `uploadCourierDocument`. Continue gated on consent + required docs. |
| Permissions | `pages/onboarding/PermissionsPage.tsx` | ✅ Real Capacitor location/notification/camera requests; real open-settings deep link. |
| Profile Setup | `pages/onboarding/ProfileSetupPage.tsx` | ✅ Name/phone real. ✅ Profile photo uploads to Storage and saves `profile_photo_url`. |
| Vehicle Setup | `pages/onboarding/VehicleSetupPage.tsx` | ✅ Fully real, including Storage photo upload. |
| Account Pending | `pages/onboarding/AccountPendingPage.tsx` | ✅ Real approval polling (`status === 'active'`). ✅ Checklist from real docs, vehicle, and background-check status. |
| Login | `pages/auth/LoginPage.tsx` | ✅ Fully real — email/password, OTP, forgot-password, Google OAuth. |

### 4.2 Home / Dashboard

| Screen | File | Verdict |
|---|---|---|
| Placeholder Home | `pages/PlaceholderHomePage.tsx` | Dead/unreachable code, ignore. |
| Courier Home (shell) | `pages/home/CourierHomePage.tsx` | ✅ Go-online, offer accept/decline, pickup/en-route/handoff/complete, report-issue, unassign all real. ✅ Header menu → Account. ✅ Location “Open Settings” is a real device-settings deep link. ⚠️ Stacked-order UI present but hard-disabled (§2c). |
| Home Offline | `pages/home/HomeOfflinePage.tsx` | ✅ Go Online real. ✅ Today’s earnings, deliveries, acceptance from backend. ✅ Avatar uses real photo when present. |
| Home Online | `pages/home/HomeOnlinePage.tsx` | ✅ Live map, Go Offline real. ✅ Today’s earnings/deliveries real. ✅ “Online {elapsed}” is this-session clock (not a stored shift). |
| Home Going-Online | `pages/home/HomeGoingOnlinePage.tsx` | ✅ Transition screen only, no interaction expected. |
| Dash Summary (end of shift) | `pages/home/DashSummaryPage.tsx` | ✅ Both buttons real. ✅ Today earned, deliveries, acceptance, this-session online time. |
| Offline Mode | `pages/home/OfflineModePage.tsx` | ✅ Profile and menu → Account. ✅ Retry connection real. ✅ Cached card is the in-memory active trip, or “No active delivery”. Bottom nav intentionally disabled (by design). |

### 4.3 Delivery offers

| Screen | File | Verdict |
|---|---|---|
| Delivery Offer (single) | `pages/offers/DeliveryOfferPage.tsx` | ✅ Countdown, accept, decline, view-details all real, live dispatch data. ⚠️ Route preview is a static image. |
| Offer Details | `pages/offers/OfferDetailsPage.tsx` | ✅ Accept/decline/swipe-dismiss all real. ⚠️ Map preview is not a live routing thumbnail. Peak Pay line only appears if the offer actually has a non-zero peak (live offers do not). |
| Stacked Offer | `pages/offers/StackedOfferPage.tsx` | ⚠️ Fully mock and unreachable (§2c). |

### 4.4 Active delivery — single order

| Screen | File | Verdict |
|---|---|---|
| Active Delivery Nav (to store) | `pages/delivery/ActiveDeliveryNavPage.tsx` | ✅ Real live map, real Open in Maps, real swipe-to-arrive. ⚠️ Banner is a destination line (“Heading to {store}”), not turn-by-turn. ETA is straight-line. |
| Age Verify Handoff | `pages/delivery/AgeVerifyHandoffPage.tsx` | ✅ Fully real — real ID photo upload, real submit. |
| At Customer (doorstep) | `pages/delivery/AtCustomerPage.tsx` | ✅ Real delivery instructions. ✅ Call/SMS wired when a customer phone exists. ✅ Photo upload and completion real. Gate/Unit hidden unless populated (no dedicated DB fields). ⚠️ Header Help chip is dead. |
| At Restaurant | `pages/delivery/AtRestaurantPage.tsx` | Deprecated alias of At Store, no independent logic. |
| At Store (pickup) | `pages/delivery/AtStorePage.tsx` | ✅ Real live map, real Call Store, real photo upload, real confirm-pickup. ✅ “Order not ready?” wait time posts a `long_wait` issue. |
| Confirm Handoff | `pages/delivery/ConfirmHandoffPage.tsx` | ✅ Fully real, all three actions wired. |
| Customer Unavailable | `pages/delivery/CustomerUnavailablePage.tsx` | ✅ Real call button, real 5-minute timer gating “leave at safe location.” |
| Delivery Complete | `pages/delivery/DeliveryCompletePage.tsx` | ✅ Base pay + tip + total. Fake Distance Bonus / Peak Pay rows removed (no backend fields). |
| En Route (to customer) | `pages/delivery/EnRoutePage.tsx` | ✅ Real live map, real Call/Message/Open in Maps. ⚠️ Banner is destination + remaining km, not routing-engine turns. |
| Order Cancelled | `pages/delivery/OrderCancelledPage.tsx` | ✅ Real cancelled-by and reason from the order. Correctly shows no pay. |
| Report Issue (mid-delivery) | `pages/delivery/ReportIssuePage.tsx` | ✅ Fully real — photo upload, submit, unassign path. |
| Shop And Pick (grocery) | `pages/delivery/ShopAndPickPage.tsx` | ✅ Checklist, report-issue, message/call, done-shopping real. ✅ Can’t find logs an issue. ✅ Edit un-toggles found items. Wallet/Substitute hidden (no wallet or substitute API). |

### 4.5 Stacked delivery (multi-order) — confirmed disabled, don't test as if live

| Screen | File | Verdict |
|---|---|---|
| Stacked At Pickup | `pages/delivery/stacked/StackedAtPickupPage.tsx` | ⚠️ Fully mock, unreachable (§2c). |
| Stacked Deliver Nav | `pages/delivery/stacked/StackedDeliverNavPage.tsx` | ⚠️ Fully mock, unreachable. |
| Stacked Delivery Flow (orchestrator) | `pages/delivery/stacked/StackedDeliveryFlow.tsx` | ⚠️ Local/toast-only; gated `{false &&}` in `CourierHomePage.tsx`. |
| Stacked Delivery Summary | `pages/delivery/stacked/StackedDeliverySummaryPage.tsx` | ⚠️ Fully mock, unreachable. |
| Stacked Leg Complete | `pages/delivery/stacked/StackedLegCompletePage.tsx` | ⚠️ Fully mock, unreachable. |
| Stacked Pickup Nav | `pages/delivery/stacked/StackedPickupNavPage.tsx` | ⚠️ Fully mock, unreachable. |

### 4.6 Earnings & activity

| Screen | File | Verdict |
|---|---|---|
| Activity (history) | `pages/activity/ActivityPage.tsx` | ✅ `GET /courier/history` (completed + cancelled). ✅ Pull-to-refresh, filters, menu → Account, bell → notification settings. ✅ Row tap opens real delivery detail. Cancelled rows tappable; amount is J$0. ⚠️ Production needs the delivery function deployed. |
| Earnings | `pages/earnings/EarningsPage.tsx` | ✅ Real backend fetch, period tabs, pull-to-refresh. ✅ Row tap opens real delivery detail. Totals stay on completed jobs only. Promotions entry removed. |
| Promotions | `pages/earnings/PromotionsPage.tsx` | ⚠️ File still mock — **not mounted / not linked**. Ignore unless you are deleting or productizing it. |
| Delivery Detail | `pages/earnings/DeliveryDetailPage.tsx` | ✅ Loads the tapped order by ID (restaurant, pay, timeline, proof photo when present). |
| Payout History | `pages/profile/PayoutHistoryPage.tsx` | ✅ Fully real backend fetch. |
| Payout Settings | `pages/profile/PayoutSettingsPage.tsx` | ✅ Fully real — Stripe Connect onboarding redirect, weekly-payout request. |

### 4.7 Profile & settings

| Screen | File | Verdict |
|---|---|---|
| Account (menu) | `pages/profile/AccountPage.tsx` | ✅ Real profile load, menu, sign-out. ✅ Bell → notification settings. ✅ Avatar from `profile_photo_url`. ✅ “Member since” from `created_at` (hidden if missing). |
| Edit Profile | `pages/profile/EditProfilePage.tsx` | ✅ Name/phone/email save real. ✅ Photo load/save real. Starts empty; Save blocked until load succeeds. |
| Edit Vehicle | `pages/profile/EditVehiclePage.tsx` | ✅ Fully real backend upsert. |
| Vehicle Details | `pages/profile/VehicleDetailsPage.tsx` | ✅ Real vehicle load, Edit Vehicle nav. ✅ Switch vehicle type persists via vehicle upsert + profile `vehicle_type`. |
| Courier Documents | `pages/profile/CourierDocumentsPage.tsx` | ✅ Fully real Storage upload. |
| Ratings & Stats | `pages/profile/RatingsStatsPage.tsx` | ✅ Fully real backend data. |
| Dash Preferences | `pages/profile/DashPreferencesPage.tsx` | ✅ Toggles/sliders real as **this-device** prefs. ⚠️ localStorage only (parked cloud sync). |
| Notification Settings | `pages/profile/NotificationSettingsPage.tsx` | ✅ Toggles real as this-device prefs. ⚠️ localStorage only. |
| Payout Settings | *(see §4.6)* | |
| Help & Support | `pages/profile/HelpSupportPage.tsx` | ✅ Search filter, `tel:911`, topic nav, support email. ⚠️ FAQ copy may still mention a hidden Promotions tab. |
| Help Topic | `pages/profile/HelpTopicPage.tsx` | ✅ Static FAQ via accordion — expected, not a gap. |
| Settings | `pages/profile/SettingsPage.tsx` | ✅ Appearance (dark mode) and other local selects. Real legal links and account-deletion `mailto:`. ⚠️ localStorage only. |
| About | `pages/profile/AboutPage.tsx` | ✅ Real static links (legitimate static content). |

---

## 5. Original punch list — status (do not re-fix)

### Critical (all done)
1. Onboarding docs upload — **fixed**
2. Delivery detail fake order — **fixed**
3. At Customer fake instructions — **fixed** (Gate/Unit still have no DB fields; hidden unless filled)
4. At Customer Call/Chat dead — **fixed** (Call/SMS)
5. Open Settings was `window.alert` — **fixed**
6. Profile setup photo dead — **fixed**

### High (done or parked)
7. Cancel screen fake pay — **fixed** (honest: no pay)
8. Distance Bonus / Peak Pay J$0 — **fixed** by hiding the rows
9. Wait-time discarded — **fixed** (`long_wait` issue)
10. Grocery dead controls — **fixed** / Substitute **hidden** (parked engine)
11. Vehicle type switch local-only — **fixed**
12. Edit Profile fake photo + mock draft leak — **fixed**
13. Account Pending fake checklist — **fixed**
14. Promotions fully fake — **hidden**, product **parked**
15. Shift stats fabricated — **fixed** (real today stats + this-session clock)

### Medium
16. Turn-by-turn placeholder — **honesty pass done**; real routing **parked**
17. Dead hamburger/bell — **fixed**
18. Prefs localStorage only — **accepted for launch**; cloud sync **parked**
19. Offline cached Burger King — **fixed**

### Low
20–22. Unchanged: static offer maps; stacked dead buttons moot; Placeholder Home unreachable.

---

## 6. Suggested next steps

1. Deploy `delivery` so cancelled history is live.
2. Spot-check the single-order path after deploy (offer → complete).
3. Leave stacked orders, Peak Pay, grocery Substitute, and cloud prefs until those products exist.
4. Optional cleanup: delete or quarantine `PromotionsPage.tsx` and unused mock fixtures so they cannot be re-linked by accident.
