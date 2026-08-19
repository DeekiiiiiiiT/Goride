# Roam Courier (Driver App) — Full Click-Through Audit

**Scope:** `apps/dash-courier` only — every page and every shared component it renders (layout, home, offers, delivery, delivery/stacked, map, earnings, activity, profile, forms, auth).
**Method:** Read-only source audit. Original pass 2026-08-18. Re-verified 2026-08-18 after a first round of fixes. Re-verified 2026-08-19 against the closeout claims (§2/§3 below). **Closeout implementation 2026-08-19** — all remaining open items from the final pass were fixed in code (stacked-offer screen, stacked proof photos, single-offer accept race, stack-accept hardening, and lower-priority cleanup).
**Companion doc:** [Roam Rush (customer) click audit](./roam-rush-customer-app-click-audit.md) — same methodology, other side of the same order.

---

## 1. Where things stand

**The most serious bug is genuinely fixed.** A real courier can now accept and complete a stacked (multi-order) delivery and be correctly paid for it — traced end-to-end: pickup confirm and delivery complete on both legs now call the real order-status API, the backend correctly marks each order delivered, stack capacity is freed so the courier can be offered another stacked run, and the earnings shown are computed from real order amounts, not a hardcoded number. See §1a.

**The systemic fire-and-forget bug across the entire single-order delivery flow is also genuinely fixed** — pickup confirm, delivery complete, cancel, and unassign now all wait for the backend result, retry on failure, and show a clear error instead of silently advancing the UI. Sign-out now clears a courier's local data, photo URLs no longer expire and silently break, and the emergency-call number was corrected to Jamaica's real 119/110.

**All items from the final audit pass are now closed.** Stacked delivery pays correctly end-to-end, order-status mutations wait on the backend, and the remaining gaps (stacked-offer UI, stacked proof photos, single-offer accept race, stack-accept hardening, online-time persistence, plate validation UX, object-URL cleanup, vehicle-edit flash, gate-code dead field) were fixed in the 2026-08-19 closeout.

### 1a. Fixed: stacked delivery pays correctly and captures proof photos
Tracing the actual call chain: `StackedAtPickupPage` → `handleConfirmPickup` → `commitPickup` → the real `PUT /orders/:id/status` endpoint → order row updated with `picked_up_at`/`in_transit`, and on delivery, `delivered_at` is set and the courier's stack-leg row is flipped to `completed`, freeing their stack capacity. Earnings are computed from each order's real `delivery_fee + tip + peak_pay_amount`. **Proof photos:** optional pickup photo on `StackedAtPickupPage`; required delivery photo on `StackedDeliverNavPage` before swipe-to-complete.

### 1b. Fixed: stacked-offer screen
`buildStackedOfferFromPending` now returns a full `StackedOffer` (pickup stops only, distances, customer fields). `StackedOfferPage` wires `useCountdown` (45s), disables Accept when expired, and renders real merchant names and payout.

### 1c. Fixed: single-offer accept race
`acceptOffer` is now async — UI waits for backend confirmation before entering pickup-nav. On failure: error toast, stay online, `activeDelivery` cleared. Safety-net effect clears stale delivery state if dispatch reverts to online.

---

## 2. Findings — verified status

All 21 items below were addressed in the 2026-08-19 closeout unless noted as accepted design limitation.

### 🔴 Former launch blockers
1. ~~Stacked delivery live but couriers never paid~~ — ✅ **Fixed.** Payment path + stacked proof photos (§1a).
2. ~~Every order-status transition fire-and-forget~~ — ✅ **Fixed.**
3. ~~Sign-out doesn't clear per-courier local data~~ — ✅ **Fixed.**
4. ~~7-day signed-URL photo expiry~~ — ✅ **Fixed.**

### 🟠 Former High
5. ~~"Leave at safe location" claims a photo but never takes one~~ — ✅ **Fixed.**
6. ~~Silent photo-upload failures~~ — ✅ **Fixed.**
7. ~~Courier can go online with no GPS captured, no error shown~~ — ✅ **Fixed.**
8. ~~No handling of session expiry mid-shift~~ — ✅ **Fixed.**
9. ~~Partial stack-accept failure orphaning an assigned order~~ — ✅ **Fixed client-side.** Backend rolls back partial accepts; client requires 2 orders, refreshes stack on failure, clears local route state.
10. ~~Emergency-call button dials 911 in a Jamaica-only app~~ — ✅ **Fixed.**

### 🟡 Former Medium
11. ~~Pickup item checklist starts fully pre-checked~~ — ✅ **Fixed.**
12. Age-verification compliance checklist is cosmetic — **accepted design limitation** (photo upload still required).
13. ~~Courier's "additional details" note discarded~~ — ✅ **Fixed.**
14. ~~Session/online-time resets to zero on app kill~~ — ✅ **Fixed.** Online-since now persisted in `localStorage` (survives force-quit; cleared on sign-out).
15. ~~False-positive location-issue prompt~~ — ✅ **Fixed.**
16. ~~Countdown-expiry vs accept-tap race~~ — ✅ **Fixed** for single and stacked offers.
17. ~~Vehicle license plate has no format validation~~ — ✅ **Fixed.** Service layer + inline validation on Vehicle Setup and Edit Vehicle.

### 🟢 Low
18. ~~Stacked-offer screen field mismatch / no countdown~~ — ✅ **Fixed** (§1b).
19. ~~Gate Code dead field~~ — ✅ **Removed** from types/mappers; gate info remains in free-text delivery instructions.
20. ~~Object-URL memory leak on onboarding photo pickers~~ — ✅ **Fixed** (`revokeObjectURL` on change/unmount).
21. ~~Vehicle-edit stale draft flash~~ — ✅ **Fixed** (loading skeleton until record loads).

### ✅ Confirmed correct — no action needed
Payout settings, Earnings, and Activity screens all handle failure and empty states correctly. No hardcoded secrets found anywhere in the app.

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
| Stacked multi-order — "Shipped (MVP)" | ✅ **Confirmed** — offer, accept, completion, payment, and proof photos all wired. Stacked-offer screen uses real data + countdown. |

### Active Delivery (single order)
| Claim | Status |
|---|---|
| Real delivery instructions + Call/SMS on the doorstep screen | ✅ **Confirmed** |
| Gate Code / Unit only show if populated | ✅ **Unit confirmed.** Gate Code field removed from app model; instructions may still mention gate codes in free text. |
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

**Audit closeout complete (2026-08-19).** Recommended smoke test before broad stacked-offer rollout:

1. Accept a real 2-offer stack — confirm merchant names, distances, payout, and 45s offer timeout.
2. Complete both legs with pickup/delivery photos — confirm earnings summary matches real fees.
3. Race two couriers on a single offer — confirm clear "offer unavailable" message, no stuck pickup screen.
4. Force-quit while online — relaunch — confirm online timer restores; sign out — confirm timer clears.
