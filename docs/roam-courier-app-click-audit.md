# Roam Courier (Driver App) — Full Click-Through Audit

**Scope:** `apps/dash-courier` only — every page and every shared component it renders (layout, home, offers, delivery, delivery/stacked, map, earnings, activity, profile, forms, auth).
**Method:** Read-only source audit. Original pass 2026-08-18. Re-verified 2026-08-18 after a first round of fixes. **Re-verified again 2026-08-19** — this pass specifically fact-checked every claim in the prior "closeout" note against current source (several turned out to be only partially true), and hunted for new functional bugs and production-readiness gaps beyond click-through, since this app moves real couriers' real pay. No code was changed to produce this document.
**Companion doc:** [Roam Rush (customer) click audit](./roam-rush-customer-app-click-audit.md) — same methodology, other side of the same order.

---

## 1. Where things stand

**The good news:** every item from the original two-pass punch list — dead buttons, hardcoded gate codes, fake ETAs, mock document upload, mock shift stats — checks out as genuinely fixed against current source. The single-order delivery flow (offer → pickup → en route → doorstep → complete) is largely real: live maps, real Google Directions-backed routing, real photo uploads, real cancellation compensation math, real cloud-synced preferences.

**The bad news, and the reason this pass mattered:** the prior closeout note claimed several *new* features shipped since the last audit — most importantly "stacked multi-order delivery." That claim is **dangerously half-true**. The gating and backend plumbing to *offer and accept* a stacked delivery are genuinely real now. But the screens a courier actually taps through to *complete* that delivery were never rewired to call the backend at all — meaning a courier can physically complete two real deliveries today and get paid for **zero** of them, while also permanently losing the ability to be offered a stacked delivery again. This is worse than the feature being disabled, because it now looks live to a courier. See §2, item 1 — **fix or re-disable before this reaches any real courier.**

A second, systemic issue cuts across the *entire* delivery flow, not just stacked orders: every order-status update a courier's app sends (pickup confirmed, delivered, cancelled, unassigned) is fire-and-forget, with no check that the backend actually accepted it. See §2, item 4.

---

## 2. New findings from this pass — ranked

### 🔴 Launch blockers — fix or disable before any real courier uses this

1. **Stacked (multi-order) delivery is live, but couriers who complete one are never paid, and it can permanently disable further stacked offers for that courier.** The gate that used to block this feature (`{false && ...}` in `CourierHomePage.tsx`) has been removed, and offering/accepting a stacked delivery now genuinely hits the real backend (`courier_stack_legs` table, a real accept endpoint). But the actual delivery screens (`StackedDeliveryFlow.tsx` and the six pages it drives) never call the real order-status-update function anywhere — "Confirm Pickup" and "Delivery Complete" only show a toast and move a local screen index. The result: the two real orders never get marked `delivered` on the backend, so they never appear in the courier's Earnings, Activity, or Payout History — the courier did the work and is shown a hardcoded fake "J$1,120 added to your balance" toast instead of their real pay. Separately, because the backend never sees the delivery finish, that courier's "stack capacity" is never freed, so they silently can never be offered a stacked delivery again. On top of that: the offer screen shown before accepting is 100% fabricated data (fake restaurant names, fake dollar amount) even though tapping Accept commits the courier to the real, different orders underneath — and **declining** a real stacked offer doesn't reach the backend at all, so the courier gets stuck seeing the same un-declinable offer indefinitely while the real orders are never released back to dispatch for anyone else. **Recommendation: re-disable the stacked-delivery gate until the completion handlers are wired to the real API, since it currently causes real unpaid courier labor.**
2. **Every order-status transition in the single-order delivery flow — not just stacked — is fire-and-forget, with no retry and no failure shown to the courier.** Confirm Pickup, Delivery Complete, Report-Issue-triggered cancellation, and Unassign all fire the backend update and immediately advance the UI without waiting for or checking the result. If a network drop coincides with one of these taps, the courier's screen can advance to "delivered"/earnings while the backend order is still sitting at its prior status — the courier believes they were paid for a delivery the backend never recorded as complete.
3. **Signing out doesn't clear a courier's local preferences/cache, so on a shared or reused device the next courier who signs in can inherit — and then overwrite — the previous courier's settings.** Same class of bug found in the customer app's sign-out flow. If the second courier saves any preference before their own cloud settings finish loading, the first courier's leftover local values get written into the second courier's real account.
4. **Courier profile and document photos are stored as signed URLs with a 7-day expiry, not a stable reference — every courier's avatar and every uploaded document photo will go permanently, silently broken exactly one week after upload**, with no self-healing path. This affects the avatar shown throughout the app and documents that admins may review after the link has already died.

### 🟠 High — real risk to safety, pay accuracy, or trust
5. **"Leave at safe location" tells the courier a photo is required, but the app never actually captures one.** A customer-unavailable delivery can be marked complete with zero proof-of-delivery photo on file, despite the on-screen text explicitly saying a photo is required — a real liability gap the next time a customer disputes non-delivery.
6. **Photo upload failures are completely silent on the two screens where photos matter most** (doorstep drop-off, store pickup) — no error toast, no retry prompt, just a button that quietly reverts as if nothing happened. Contrast: the Report Issue and age-verification screens do show an error in the identical failure case, so the pattern to fix this already exists elsewhere in the app.
7. **A courier can go online with no GPS coordinates captured, with nothing telling them their location wasn't recorded.** Dispatch/routing quality for that entire shift is silently degraded — offers may be poorly matched with no indication why.
8. **There's no handling anywhere in the app for a courier's session expiring or being signed out while they're online or mid-delivery.** Every subsequent backend write (location updates, offer responses, status changes) starts silently failing with generic errors — a courier could believe they're online and eligible for work while nothing they do is actually being recorded.
9. **A partial failure when accepting a two-order stacked offer can leave one order "assigned" to a courier on the backend with no corresponding screen in their app** — an orphaned assignment nobody notices until a customer or the restaurant asks where their courier is.
10. **The emergency-call button dials 911.** This app is built and marketed for Jamaica specifically — the real local emergency numbers are 119 (police) and 110 (fire/ambulance). A courier in an actual emergency tapping the button the app gives them may not reach local dispatch.

### 🟡 Medium — real gaps worth fixing, lower blast radius
11. **The item-verification checklist at pickup starts with every item already checked off**, so a courier can confirm pickup without ever actually reviewing what's in the bag — defeats the point of having a checklist at all. (The equivalent grocery-shopping checklist elsewhere in the app does this correctly, only pre-checking items the backend actually confirmed.)
12. **The age-verification "compliance checklist" at handoff is purely cosmetic** — checking the three boxes ("appears 18+," "ID checked," "ID matches") has no real enforcement behind it beyond "a photo exists somewhere." Worth knowing this is the actual extent of the compliance mechanism, not a bug so much as a gap between what the screen implies and what it enforces.
13. **A courier's typed "additional details" note at the customer's door is captured and then silently discarded** — never sent anywhere.
14. **A courier's displayed online/session time resets to zero if the app is killed or crashes mid-shift**, with no warning that the displayed number no longer reflects their real elapsed time online.
15. **A location-permission-issue prompt can pop up over an already-online courier** due to a timing mismatch between an 8-second watchdog and the actual (slower-but-successful) GPS fix — a confusing false alarm.
16. **A countdown-timer expiry and a courier's accept-tap can race** with no guard preventing both from firing for the same now-expired offer.
17. Vehicle license plate has no format validation before saving.

### 🟢 Low — cosmetic, safe to defer
18. The stacked-offer screen still uses a static map image while every other offer/delivery screen has moved to a real live map — an inconsistency, not a functional bug (moot anyway until item #1 is resolved).
19. Gate Code display is dead code with no backing database column — Unit does have a real column and works; Gate Code was never actually wired end-to-end and can't be, as currently built.
20. Minor memory-leak pattern (unreleased object URLs) on two onboarding photo-picker screens — low impact given how short-lived those screens are.
21. A vehicle-edit screen can briefly flash stale draft data before the real record loads — cosmetic only.

### ✅ Confirmed correct — no action needed
Payout settings (Stripe Connect onboarding, weekly payout request) both handle failure with a clear message, no silent failures. Earnings and Activity screens both distinguish a real backend error (with retry) from a genuine empty period. No hardcoded secrets or API keys were found anywhere in the app.

---

## 3. Re-verification of prior findings and closeout claims

Every item below was checked against current source directly — not assumed from the prior note.

### Onboarding, Auth, Home
| Claim | Status |
|---|---|
| Document upload now real (Storage upload + gated Continue) | ✅ **Confirmed** |
| Profile-setup photo upload now real | ✅ **Confirmed** |
| Home shift stats (earnings/deliveries/acceptance) now real; Peak Pay banner removed | ✅ **Confirmed** |
| Dash Summary (end-of-shift) now real | ✅ **Confirmed** |
| Offline-mode cached delivery now real (or honest "none") | ✅ **Confirmed** |
| Account-pending checklist now built from real docs/vehicle/background-check | ✅ **Confirmed** |
| "Open Settings" on location sheet now a real device deep link | ✅ **Confirmed** |
| Header hamburger menu now wired (→ Account) | ✅ **Confirmed** |

### Offers & Dispatch
| Claim | Status |
|---|---|
| Offer preview maps are now live (`DeliveryMap`) | ✅ **Confirmed for the two single-offer screens.** ⚠️ Overstated for the stacked-offer screen specifically — still a static image. |
| Real turn-by-turn routing (Google Directions) shipped | ✅ **Confirmed** — real `/courier/route` call feeds both the offer screens and the active-delivery nav screens; the old synthetic "Head to X" text remains only as a fallback while the real route is loading, which is reasonable. |
| Stacked multi-order — "Shipped (MVP)" | ⚠️ **Half true, and the false half is dangerous** — see §2, item 1. The offer/accept plumbing is real; the completion plumbing is not. |

### Active Delivery (single order)
| Claim | Status |
|---|---|
| Real delivery instructions + Call/SMS on the doorstep screen | ✅ **Confirmed** |
| Gate Code / Unit only show if populated | ⚠️ **Partially accurate** — Unit is a real, working field. Gate Code has no backing database column at all and can never populate; low-priority dead code, not a live bug. |
| Real cancellation reason shown | ✅ **Confirmed** |
| Cancel compensation pay (50% before pickup / 100% after) | ✅ **Confirmed shipped and correctly computed** — this resolves an earlier contradiction in the doc between "no compensation column exists" and "compensation shipped"; the column and logic are both real. |
| Fake Distance Bonus / Peak Pay rows removed from delivery-complete screen | ✅ **Confirmed** |
| Grocery substitution ("Can't find" / "Substitute") now real | ✅ **Confirmed** — real propose-substitution API |
| "Order not ready?" wait time now reported to backend | ✅ **Confirmed** |

### Earnings, Activity, Promotions
| Claim | Status |
|---|---|
| Delivery-detail screen now loads the real tapped delivery | ✅ **Confirmed** |
| Promotions/Peak Pay — this doc previously said "still 100% mock, hidden" | ❌ **That earlier note is now stale/wrong** — Promotions is real (`GET /courier/promotions/active`) and reachable from Earnings via a "Peak Pay" button. Superseded by the "Shipped" claim, which is accurate. |
| Unused mock earnings/payout files aren't secretly feeding real screens | ✅ **Confirmed** — orphaned, zero import sites |

### Profile & Settings
| Claim | Status |
|---|---|
| Edit Profile photo now real (load/save), form starts empty, Save blocked until load finishes | ✅ **Confirmed** |
| Vehicle "switch type" now persists to backend and updates the display | ✅ **Confirmed — this was a previously-unverified item, now genuinely fixed** |
| Cloud preference sync (Dash Preferences / Notifications / Settings → real backend) | ✅ **Confirmed for all three** |
| Account header Menu + notification-bell icons now wired | ⚠️ **Partially — the Menu icon was actually removed entirely rather than fixed**; only the notification bell remains and is wired correctly. Functionally resolved either way. |

---

## 4. Suggested order of operations

1. **Re-disable or fix stacked delivery today** (§2, item 1) — this is actively worse than the previous "safely disabled" state, because it now looks live to a courier while silently failing to pay them for completed work. This is the single most urgent item in this document.
2. Fix the fire-and-forget order-status updates across the single-order flow (§2, item 2) — add a retry/failure state to pickup-confirm, delivery-complete, cancel, and unassign so a dropped connection can't leave a courier's real status out of sync with what their screen shows.
3. Clear per-courier local storage on sign-out (§2, item 3) and move photo storage off signed URLs onto stable references (§2, item 4) — both are silent, time-delayed failures that will surface as confusing support tickets days or weeks after a courier signs up, not immediately.
4. Sweep the **High** section (§2, items 5-10) before broad launch — the missing proof-of-delivery photo on "leave at safe location" and the wrong emergency number are the two with real safety/liability weight.
5. **Medium** and **Low** items (§2, 11-21) are reasonable to fix in the weeks after launch.
6. Re-run this pass once more after the blockers land — specifically: complete a real stacked delivery end-to-end and confirm it appears in Earnings; kill the app mid-delivery and confirm the backend status matches what's shown on relaunch; sign two different courier accounts in back-to-back on the same device.
