# Roam Partner (Merchant App) — Full Click-Through Audit

**Scope:** `apps/dash-merchant` only — every page and every shared component it renders across all six sub-systems: onboarding/auth, the core dashboard/orders/menu, earnings/analytics/account settings, the restaurant-management module (in-store POS + enterprise inventory), staff station screens (kitchen/bar/counter/drive-thru/expo), and the separate store-tablet/venue-ops device flow.
**Method:** Read-only source audit. Every interactive element (button/link/toggle/tab/input/upload) was traced to its actual handler to determine whether it does something real or nothing at all. No code was changed to produce this document.
**Date:** 2026-08-19
**Companion docs:** [Roam Rush (customer) click audit](./roam-rush-customer-app-click-audit.md) · [Roam Courier click audit](./roam-courier-app-click-audit.md)

---

## 1. How to use this document

Same format as the other two audits: go screen by screen, use §4 to know whether what you're seeing is real. **❌ dead** = nothing happens when tapped, no error, no toast. **⚠️** = works but is cosmetic, local-only, or a labeled placeholder. **✅ real** = genuinely wired to the backend.

**Headline finding, read this first:** this app is, overall, the most solidly-built of the three Roam apps audited so far — the core order queue, menu management, in-store POS (including real Stripe Terminal card-present payments), and inventory system are all genuinely wired to live backend data with real-time updates. But two things found in this pass are real launch blockers, and one is a plain code bug, not a UI gap — see §2.

---

## 2. Launch blockers — read this section first

### 🔴 1. There is no way for a merchant to actually set up how they get paid
`AccountSettingsHub`'s "Bank & Payouts" row navigates to the Earnings page. The Earnings page's own "Update Bank Details" button navigates back to Account settings. **Neither destination contains an actual bank-account or payout-method setup form anywhere in the app** — no Stripe Connect onboarding, no manual bank-detail entry, nothing. This isn't a broken button, it's a missing screen: a real merchant signing up today has no way to tell Roam where their money should go. (Compare: the sibling courier app has a real, working Stripe Connect onboarding flow for couriers — this is the equivalent piece missing on the merchant side.)

### 🔴 2. A malformed URL breaks staff sign-in on every station kiosk screen — this is a code bug, not a wiring gap
The station roster fetch (used by the PIN-based staff sign-in flow that feeds all five staff-ops screens — Kitchen, Bar, Counter, Drive-Thru, Expo) builds its request path with backslashes (`\merchant\station\roster`) instead of forward slashes (`/merchant/station/roster`). The backend only registers the forward-slash route. In any real deployment this request will fail, and the staff picker screen will permanently show "No team members yet" — meaning nobody can sign in to work a station kiosk. This is a straightforward typo in a URL-building call, not an architecture problem, but it will completely block the staff-facing side of the app until it's fixed.

### 🔴 3. Two "editor" screens in Inventory don't actually let you edit anything
The recipe editor's "Save recipe" button calls a real backend API — but the screen provides no input fields to change a recipe's ingredients or yield percentage, so pressing Save just re-submits the same data that's already there. Separately, the UOM (unit-of-measure) conversion editor's Save button never actually renders at all, because the screen that opens it never passes it the function it needs — so there's currently no way to edit unit conversions from the app despite the screen being reachable and named "editor."

### 🔴 4. A real-looking settings field silently discards what you type into it
On the Delivery Settings screen, "Max daily order capacity" is a normal-looking number input, but nothing in the save logic actually includes it in the request sent to the backend — type a value, save, reload, and it's gone. A merchant trying to cap their daily order volume would reasonably believe this worked.

---

## 3. Do you need to remove demo data?

Good news here: unlike the other two apps, this audit did not find any unconditionally-hardcoded screen showing fake data to real merchants in production. The few fixture/mock fallbacks that exist (onboarding carousel slides, enterprise-inventory preview fixtures, restaurant-mgmt preview fixtures) are either legitimate static content or explicitly gated behind `allowMocks()`/dev-only flags with a clearly-labeled "preview mode" banner shown to the merchant — not silently swapped in.

**One thing worth knowing that isn't exactly "demo data" but behaves similarly:** the Operations Hub's station toggles are gated behind a client-only `localStorage` feature flag (`venueOpsV2`/`staffOperationsV1`) that defaults to off for every merchant. Until that flag is on (or the merchant has restaurant-mgmt capability), the "Active stations" panel shows fixture data and the toggle switches don't actually save anything — they flip visually, show a "Preview mode" banner, and silently no-op. This is disclosed in the UI, but it's easy to miss, and it means most merchants by default get a working-looking control that doesn't persist.

---

## 4. Master punch list — ranked

### 🔴 Critical — see §2 above for the full writeup
1. No bank/payout setup flow exists anywhere in the app.
2. Staff roster fetch is broken by a malformed URL (backslashes), blocking every station kiosk sign-in.
3. Recipe editor and UOM conversion editor don't actually let you edit their subject matter.
4. "Max daily order capacity" setting is silently discarded on save.

### 🟠 High
5. **The top bar's notification bell and account avatar are dead on every single screen in the app** — `PartnerTopBar.tsx`, no `onClick` on either. These are the two most persistently-visible controls in the whole product.
6. **Operations Hub station toggles silently don't save for most merchants** — gated behind a default-off local feature flag; disclosed via a banner, but the checkboxes still respond as if they worked.
7. **Website/Instagram/Facebook fields on Edit Profile save to `localStorage` only** — never reach the backend, so they don't survive a reinstall or show up on a second device/session.
8. **Desktop menu view has two dead controls**: the "Filter" button and the Grid/List layout toggle both have no handler at all (`MenuDesktopDashboard.tsx`).

### 🟡 Medium
9. "Help" button on the Ready-for-pickup order detail screen is dead.
10. Menu page's notification bell icon is dead.
11. Earnings page's "Wallet" header icon is dead; its "History" tab duplicates "Orders" instead of showing an actual order-history view.
12. "More options" (⋮) icon on the Top Selling Items card is dead.
13. "Remember me" checkbox on Login toggles local state that's never read anywhere — it has no effect on whether the session persists.
14. Bar Queue's station-matching is a name/keyword heuristic ("bar," "drink," "beverage," "cocktail") — a merchant who names their bar prep station anything else gets a permanently, silently empty Bar Queue with no error shown.
15. The dashboard's order-preview card "Accept Order"/"Mark Ready" button only navigates to the Orders tab rather than performing the action inline — the label implies a direct action it doesn't take.
16. POS register's "Add note" icon is dead; the POS staff-PIN header's notification/settings icons are dead too (though that header isn't currently reachable from the live POS entry point, so low real-world exposure today).

### 🟢 Low — labeled placeholders (honest, not deceptive) or cosmetic
17. "Download Statement" on the payout detail screen is a clearly-labeled "coming soon" placeholder.
18. "Legal & Terms" in Account settings is a clearly-labeled "coming soon" placeholder.
19. "Live Chat" in Help & Support is a clearly-labeled "coming soon" placeholder.
20. The delivery-radius picture on the onboarding wizard is a decorative pulsing circle, not a real map — it isn't clickable, so it doesn't mislead, just doesn't look as polished as the rest of the flow.
21. Tablet-pairing QR codes are rendered via a third-party public QR-image service (`api.qrserver.com`) rather than client-side — not broken, but it means a pairing code/URL briefly transits a non-Roam service. Worth knowing, not urgent.
22. `RestaurantProfileSettings.tsx` is an orphaned, unreferenced file — not part of any live screen, and would not even compile cleanly against the current data model if it were wired in. Safe to delete, not a live bug.
23. `ActingShiftBar.tsx` appears unused by any of the five audited staff-ops pages — likely dead code in this area, though it may be used by a station-kiosk shell outside this audit's file list.
24. A second, non-functional decorative "drag handle" icon appears on desktop menu item cards, separate from the real drag handle — implies draggability it doesn't have on that specific icon.

---

## 5. Full screen-by-screen click-through reference

### 5.1 Onboarding, Auth, Chrome
| Screen | Verdict |
|---|---|
| Splash / Boot loading | ✅ No interaction by design. |
| Login | ✅ Real Supabase auth, Google OAuth, forgot-password all real. ⚠️ "Remember me" checkbox is a no-op. |
| Onboarding carousel | ✅ Skip/swipe/next all real; slide content is legitimate static copy. |
| Onboarding wizard (business details, categories, location, hours, branding, documents) | ✅ Every step genuinely persists to the backend, with a real autosave draft. ⚠️ Delivery-radius "map" is a decorative, non-interactive placeholder graphic. |
| Onboarding complete | ✅ Real "Go Live" flow, real application-status check. |
| Account pending | ✅ Real verification-status polling. |
| Team invite landing | ✅ Real invite preview + accept flow. |
| Top bar (shared, every screen) | ❌ Notification bell and account avatar both dead — see High #5. ✅ Store status toggle and settings button (when provided) are real. |
| Side nav / mobile nav drawer | ✅ Fully real navigation. |

### 5.2 Core dashboard, orders, menu
| Screen | Verdict |
|---|---|
| Dashboard | ✅ Real live order data, real-time subscription, real pause/resume store status. ⚠️ Order-preview card's action button just navigates rather than acting inline. |
| Orders (queue) | ✅ Fully real — accept/reject/start-preparing/mark-ready/call-customer, real-time updates, swipe actions all wired to the real order-status API. |
| Order detail (all four status views) | ✅ Real status transitions, real print, real call-courier. ❌ "Help" icon on the Ready view is dead. |
| Menu management | ✅ Real category/item CRUD, real availability toggling, real drag-reorder, real CSV catalog import. ❌ Notification bell dead. ❌ Desktop-only Filter and Grid/List toggle both dead; a second decorative drag icon on item cards isn't functional. |

### 5.3 Earnings, Analytics, Account Settings
| Screen | Verdict |
|---|---|
| Earnings | ✅ Real backend figures, real weekly chart, real payout drill-down. ❌ Wallet icon dead. ❌ "History" tab duplicates Orders instead of showing history. ❌ "Update Bank Details" routes into a dead loop — see Critical #1. |
| Payout detail | ✅ Real data. ⚠️ "Download Statement" is a labeled placeholder. |
| Analytics (overview, sales, operational, reviews, top items) | ✅ Fully real across all five sub-views — no mock data, no dead controls found, aside from: |
| Top Selling Items card | ❌ "More options" icon dead. |
| Account settings hub | ✅ Most rows route correctly. ❌ "Bank & Payouts" is the other end of Critical #1's dead loop. ⚠️ "Legal & Terms" is a labeled placeholder. |
| Edit Profile | ✅ Core fields, logo/cover upload all real. ⚠️ Website/Instagram/Facebook fields are localStorage-only — see High #7. |
| Business Hours | ✅ Fully real, including special-date overrides. |
| Delivery Settings | ✅ Radius/minimum-order/fee/prep-time/pickup/scheduled all real. ❌ "Max daily order capacity" silently discards input — see Critical #4. |
| Promotions | ✅ Fully real create/edit/performance-tracking. |
| Team Members | ✅ Fully real invite/accept/decline/edit/remove. |
| Help & Support | ✅ Real search, real call/email links. ⚠️ "Live Chat" is a labeled placeholder. |
| Notification Settings | ✅ Fully real, real push subscribe, real test-sound. |

### 5.4 Restaurant Management: in-store POS + enterprise inventory
| Screen | Verdict |
|---|---|
| Restaurant-mgmt hub / module picker / opt-in / setup wizard | ✅ All real — the setup wizard genuinely persists the merchant's opt-in choice. |
| POS Register | ✅ Genuinely real, not a shell — real cart, real order creation, real Stripe Terminal card-present payment capture, real cash sales, real print-job creation. This is the single most substantial piece of engineering found in this audit. ❌ "Add note" icon dead. |
| POS staff-PIN header | ❌ Notification/settings icons dead (low real-world exposure — this header isn't reached from the live POS entry point today). |
| Print settings | ✅ Real save, real test print, real print-job history. |
| Enterprise inventory (items, receiving, transfers, physical counts, variance, ledger, vendors) | ✅ Genuinely real across the board — real stock ledger, real receiving/transfer/count workflows, properly gated preview fixtures in dev only. |
| Recipe editor | ❌ Calls a real save API but has no input controls to actually change anything — see Critical #3. |
| UOM conversion editor | ❌ Save action never renders — no way to edit conversions at all — see Critical #3. |

### 5.5 Staff station screens (Kitchen, Bar, Counter, Drive-Thru, Expo)
| Screen | Verdict |
|---|---|
| Kitchen Queue | ✅ Real live orders, real-time updates, real start-preparing/mark-ready. |
| Bar Queue | ✅ Same real wiring. ⚠️ Station-matching is a name-keyword heuristic — can silently show an empty queue if the bar station isn't named recognizably (Medium #14). |
| Counter Orders | ✅ Fully real — accept/reject/ready/handoff, real-time new-order alert with sound, tabs all wired. No dead elements found. |
| Drive-Thru Lane | ✅ Fully real send-to-kitchen/complete actions. |
| Expo/Runner | ✅ Fully real single handoff action. |
| Staff PIN sign-in (feeds all five screens above) | ❌ **Broken by a malformed URL** — the roster fetch will fail in production, blocking every staff member from signing in to any station. See Critical #2. |

### 5.6 Store Tablet device mode + Venue Ops
| Screen | Verdict |
|---|---|
| Store-tablet entry, code entry, station picker, pairing success | ✅ Fully real — genuine backend enrollment/pairing endpoint, real error handling, no bypass credentials found. |
| Store-tablet settings (regenerate code, staff-ops/PIN toggles) | ✅ Fully real. |
| Operations Hub | ⚠️ Station toggles are a no-op save for most merchants by default (client-only feature flag, disclosed banner) — see High #6. |
| Tablet pairing card / devices | ✅ Real backend pairing data. ⚠️ QR codes rendered via a third-party service (Low #21). |
| Team summary / admin links | ✅ Real. |

---

## 6. Suggested order of operations

1. **Fix the malformed roster URL first** (§2 item 2) — this is a one-line-class bug blocking the entire staff-facing side of the app, and it's the cheapest of the four critical items to fix.
2. **Build the missing bank/payout setup flow** (§2 item 1) — this is the biggest gap in the app; without it, no real merchant can actually get paid, which is a hard blocker for launch regardless of how well everything else works.
3. Fix the "Max daily order capacity" silent-discard (§2 item 4) and decide whether to fix or remove the two non-functional inventory editors (§2 item 3) — both are quick, contained fixes.
4. Sweep the **High** section (§4, items 5-8) — the dead top-bar icons are the highest-visibility item in the whole list since they're present on every screen.
5. **Medium** and **Low** items are reasonable to fix in the weeks after launch — none of them block a merchant from actually running their store day-to-day.
6. Re-run a pass on the staff-ops flow specifically once the roster URL is fixed, since it was never actually testable end-to-end with this bug in place.
