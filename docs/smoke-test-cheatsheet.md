# Roam Rush smoke test cheat sheet

Plain-English guide for running smoke tests. You do **not** need to open the apps in a browser for the scripts below — they talk directly to Supabase.

## Before you run anything

1. Open a terminal in the **Goride** project folder.
2. Be logged into Supabase CLI (`supabase login`) **or** set `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in your environment.
3. Tell your AI assistant which test to run — copy a line from the tables below.

## How to ask your AI to run a test

Examples:

- “Run `scripts/smoke-customer-all.mjs`”
- “Run the Roam Rush customer checkout smoke test”
- “Run the partner order queue smoke test”
- “Run the full delivery E2E smoke test”

You do **not** need to paste script code — the files live in this repo.

---

## Roam Rush (Customer app)

| Say this | Script | What it checks |
|----------|--------|----------------|
| **Full customer API pack** | `scripts/smoke-customer-all.mjs` | Runs all customer scripts below in order |
| Login & profile | `scripts/smoke-customer-auth.mjs` | Sign in, load profile, save profile |
| Signup | `scripts/smoke-customer-signup.mjs` | Create temp account, first profile, cleanup |
| Search & browse | `scripts/smoke-customer-discovery.mjs` | Search dishes, open store, list promos |
| Favorites | `scripts/smoke-customer-favorites.mjs` | Add, list, remove favorite restaurant |
| Checkout | `scripts/smoke-customer-checkout.mjs` | Place cash order + idempotency (creates real test order) |
| Orders & tracking | `scripts/smoke-customer-orders.mjs` | Order history + track latest order |
| Cancel order | `scripts/smoke-customer-cancel.mjs` | Place order, cancel before prep |
| Report issue | `scripts/smoke-customer-issue.mjs` | File support issue on completed order |
| Rate order | `scripts/smoke-customer-review.mjs` | Submit star rating (skips if none eligible) |

**Test account:** `seed-customer@roamrush.app` / `RoamRushCustomer2026!`

**Run one script:**
```bash
node scripts/smoke-customer-checkout.mjs
```

**Run everything:**
```bash
node scripts/smoke-customer-all.mjs
```

### Customer tests that still need the browser

These are **UI-only**. Automated Playwright suite:

```bash
pnpm test:e2e:rush:customer
pnpm test:e2e:rush          # customer + partner UI
```

| Say this | Spec | What it checks |
|----------|------|----------------|
| **Customer cart conflict smoke** | `e2e/rush-customer-cart-conflict.spec.ts` | Cross-store “Start a new cart?” modal |

Still manual / not yet automated:

- Cart survives page refresh
- Checkout button lock / high-tip confirm
- Onboarding screens

Ask AI: “Run `pnpm test:e2e:rush`” or “Run the Playwright customer cart smoke.”

---

## Roam Rush Partner (Merchant app)

| Say this | Script | What it checks |
|----------|--------|----------------|
| **Full partner API pack** | `scripts/smoke-merchant-all.mjs` | Runs all partner scripts below in order |
| Login & profile | `scripts/smoke-merchant-auth.mjs` | Sign in, load profile, application status |
| Menu | `scripts/smoke-merchant-menu.mjs` | Load categories and menu items |
| Order queue | `scripts/smoke-merchant-orders.mjs` | Paid orders in API vs database |
| Analytics | `scripts/smoke-merchant-analytics.mjs` | Dashboard stats |
| Earnings | `scripts/smoke-merchant-earnings.mjs` | Balance and weekly summary |
| Promotions | `scripts/smoke-merchant-promotions.mjs` | Promo list |
| Settings | `scripts/smoke-merchant-settings.mjs` | Delivery settings + notification prefs |
| Hours | `scripts/smoke-merchant-hours.mjs` | Regular + special hours |
| Team | `scripts/smoke-merchant-team.mjs` | Staff list + pending invites |
| Notifications | `scripts/smoke-merchant-notifications.mjs` | Notification feed |
| Stripe Connect | `scripts/smoke-merchant-connect.mjs` | Payout onboarding status |
| Pause orders | `scripts/smoke-merchant-pause.mjs` | Pause/resume accepting orders (restores state) |
| Order flow | `scripts/smoke-merchant-order-flow.mjs` | Accept → preparing → ready (creates test order) |

**Test account:** `seed-island-grill@roamrush.app` / `RoamRushPartner2026!`

**Run one script:**
```bash
node scripts/smoke-merchant-order-flow.mjs
```

**Run everything:**
```bash
node scripts/smoke-merchant-all.mjs
```

### Partner tests that still need the browser

Automated Playwright UI pack (Method #1 / #2) — pick-and-choose like the API scripts.

**Viewports:** every `pnpm test:e2e:rush:partner*` command runs **both**:
- `partner-mobile` — Pixel 7 (bottom nav + drawer)
- `partner-desktop` — Chrome 1280×800 (side nav + TopBar)

**Run all Partner UI (mobile + desktop):**
```bash
pnpm test:e2e:rush:partner
```

**Viewport-only:**
```bash
pnpm test:e2e:rush:partner:mobile
pnpm test:e2e:rush:partner:desktop
```

**Scripts (ask AI: “Run pnpm test:e2e:rush:partner:XXX”)**

- `pnpm test:e2e:rush:partner` — run all Partner UI tests (both viewports)
- `pnpm test:e2e:rush:partner:auth` — login & Island Grill shell
- `pnpm test:e2e:rush:partner:dashboard` — dashboard snapshot + quick actions
- `pnpm test:e2e:rush:partner:orders` — order queue + Ready detail
- `pnpm test:e2e:rush:partner:pause` — pause/resume orders (leaves store open)
- `pnpm test:e2e:rush:partner:menu` — menu overview
- `pnpm test:e2e:rush:partner:analytics` — analytics + exit-nav → Orders
- `pnpm test:e2e:rush:partner:exit-nav` — exit-nav round-trips (dashboard/account/menu/analytics/earnings)
- `pnpm test:e2e:rush:partner:earnings` — earnings drawer / side nav / revenue
- `pnpm test:e2e:rush:partner:account` — every Account settings row + header shortcuts
- `pnpm test:e2e:rush:partner:settings` — Edit Profile + Delivery Settings
- `pnpm test:e2e:rush:partner:hours` — Business Hours
- `pnpm test:e2e:rush:partner:team` — Team Members
- `pnpm test:e2e:rush:partner:promotions` — Promotions & Marketing
- `pnpm test:e2e:rush:partner:notifications` — Notification Settings
- `pnpm test:e2e:rush:partner:bank` — Bank & Payouts (read)

**Release checklist (before promoting desktop Install to merchants):**
1. `pnpm test:e2e:rush:partner:exit-nav` green on mobile + desktop
2. Manual QA: `docs/partner-desktop-shell-qa.md`
3. Web push still works after any SW change
4. Capacitor build: no browser Install banner on native

**Does not click:** Reject order, Delete menu item, Sign Out, Stripe disconnect.

Still manual / Method #3 if needed:

- Drag order cards between columns
- Deep menu editor save flows
- Accept → ready order flow in the UI (API has `smoke-merchant-order-flow.mjs`)
- **No** in-store ops screens (Operations Hub, tablet pairing, kitchen stations) — those live in Command
- First Partner desktop PWA install on staging Chrome (Phase C)

---

## Roam Command (In-store ops)

**URL:** `command.roamrush.app` (local dev: `pnpm dev:command` → port **5176**)

**Access:** Invite-only — merchant must have `in_store_operations` enabled in Rush admin.

| Browser check | What to verify |
|---------------|----------------|
| Rush-only merchant login | Shows “Not invited” — no POS/inventory |
| Invited merchant login | Operations Hub loads; inventory + POS reachable |
| Tablet pairing | QR/link opens `command.roamrush.app/tablet?code=…` |
| Old Partner tablet URL | `partner.roamrush.app/tablet?code=…` redirects to Command with same query |
| Partner Orders tab | Always Rush delivery queue — never kitchen/counter view |
| Partner Account | “Open Roam Command” when invited; no ops settings inside Partner |

**Tablet re-pair:** Required after cutover — sessions are origin-scoped. See `docs/roam-command-cutover.md`.

**Native:** `app.roamrush.command` — `pnpm cap:command:sync`

---

## Roam Rush Courier

| Say this | Script | What it checks |
|----------|--------|----------------|
| **Full courier API pack** | `scripts/smoke-courier-all.mjs` | Runs all courier scripts below in order |
| Login & settings | `scripts/smoke-courier-auth.mjs` | Sign in, load settings |
| Go online / offline | `scripts/smoke-courier-availability.mjs` | Online toggle + GPS |
| App settings sync | `scripts/smoke-courier-settings.mjs` | Load and save cloud settings |
| Peak promotions | `scripts/smoke-courier-promotions.mjs` | Active peak-pay windows |
| Route estimate | `scripts/smoke-courier-route.mjs` | Directions between two points |
| Earnings | `scripts/smoke-courier-earnings.mjs` | Week earnings summary |
| Activity history | `scripts/smoke-courier-history.mjs` | Completed/cancelled jobs |
| Delivery stack | `scripts/smoke-courier-stack.mjs` | Active stacked legs (empty OK) |
| Poll offers | `scripts/smoke-courier-offers.mjs` | List pending offers (empty OK) |
| Decline offer | `scripts/smoke-courier-decline.mjs` | Decline one offer (creates test order) |
| Full delivery | `scripts/smoke-courier-delivery.mjs` | Accept → deliver → complete (creates test order) |
| Report issue | `scripts/smoke-courier-issue.mjs` | Log delivery issue mid-run (creates test order) |
| **Cross-app E2E** | `scripts/smoke-e2e-delivery.mjs` | Customer + partner + courier in one script |

**Test account:** `seed-courier@roamrush.app` / `RoamRushCourier2026!`

**Run one script:**
```bash
node scripts/smoke-courier-delivery.mjs
```

**Run everything:**
```bash
node scripts/smoke-courier-all.mjs
```

### Courier tests that still need the browser

Ask your AI to “run courier browser smoke”:

- Go Online button + map
- Offer card countdown / accept-decline UI
- Active delivery navigation screens
- Proof-of-delivery photo upload

---

## Suggested order for a big release check

1. `node scripts/smoke-customer-all.mjs`
2. `node scripts/smoke-merchant-all.mjs`
3. `node scripts/smoke-courier-all.mjs`
4. Ask AI for **browser smoke** on cart conflict, partner dashboard, and courier offer UI

---

## Notes

- **Checkout / cancel / courier delivery scripts create real test orders** on the GoRide test backend.
- **Signup smoke** creates a temporary user and deletes it afterward.
- **Issue smoke** creates a real support ticket (marked as smoke in the note).
- Scripts target project `csfllzzastacofsvcdsc` (GoRide remote).
- If a script fails, copy the terminal output and ask your AI to fix it.

---

## Copy-paste block for your personal notes

```
ROAM RUSH (Customer)
- smoke-customer-all.mjs — run all customer API tests
- smoke-customer-auth.mjs — login & profile
- smoke-customer-signup.mjs — new account
- smoke-customer-discovery.mjs — search & promos
- smoke-customer-favorites.mjs — favorites
- smoke-customer-checkout.mjs — cash checkout
- smoke-customer-orders.mjs — history & tracking
- smoke-customer-cancel.mjs — cancel order
- smoke-customer-issue.mjs — report issue
- smoke-customer-review.mjs — rate order

ROAM RUSH PARTNER
- smoke-merchant-all.mjs — run all partner API tests
- smoke-merchant-auth.mjs — login & profile
- smoke-merchant-menu.mjs — menu
- smoke-merchant-orders.mjs — order queue vs DB
- smoke-merchant-analytics.mjs — analytics
- smoke-merchant-earnings.mjs — earnings
- smoke-merchant-promotions.mjs — promotions
- smoke-merchant-settings.mjs — settings
- smoke-merchant-hours.mjs — business hours
- smoke-merchant-team.mjs — team
- smoke-merchant-notifications.mjs — notifications
- smoke-merchant-connect.mjs — Stripe Connect
- smoke-merchant-pause.mjs — pause/resume orders
- smoke-merchant-order-flow.mjs — accept → ready

ROAM RUSH COURIER
- smoke-courier-all.mjs — run all courier API tests
- smoke-courier-auth.mjs — login & settings
- smoke-courier-availability.mjs — go online / offline
- smoke-courier-settings.mjs — cloud settings sync
- smoke-courier-promotions.mjs — peak pay promos
- smoke-courier-route.mjs — route estimate
- smoke-courier-earnings.mjs — earnings
- smoke-courier-history.mjs — activity history
- smoke-courier-stack.mjs — stacked deliveries
- smoke-courier-offers.mjs — poll offers
- smoke-courier-decline.mjs — decline offer
- smoke-courier-delivery.mjs — full delivery
- smoke-courier-issue.mjs — report delivery issue
- smoke-e2e-delivery.mjs — customer + partner + courier together
```
