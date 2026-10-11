# Roam Rush — In-House Processing (Concierge Ordering)

**Architecture audit and implementation plan** · **Rev 2** · 2026-10-11
Rev 1 (2026-10-10) was the design. Rev 2 checks the build against it and changes one rule: the feature is now **invisible to customers and couriers**.

---

## 0. Where things stand

**Built and working:**
- The database layer, ledger, task machine, buyer desk, cron sweep and recon views all exist.
- Migrations `20261011120000` and `20261011130000` are applied in production with the same version numbers as the repo files.
- The `delivery` function with the In-House routes is deployed. The `rush-in-house-sweep` cron returns HTTP 200 every minute.
- Unit tests pass: 19 of 19 across the In-House, ledger and worker-guard suites.
- Production has **0 In-House stores and 0 tasks**, so no customer has been affected yet.

**Not done:**
- **One Critical security hole is live in production** (§1, item 1).
- **The customer and courier apps were changed**, which now has to be undone (§2).
- There are **5 correctness bugs on the money path** and **2 access-control leaks** (§1).
- The desk cannot yet create an In-House store end to end (§1, item 18).
- Nothing is committed. All 48 changed files and 15 new ones are uncommitted on `main`, even though part of the work is deployed.

---

## 1. What's left — the open list

Work through it in this order. **P0 is live or blocks launch. P1 loses money or leaks data. P2 blocks the pilot. P3 is hygiene.**

### P0 — live now, or blocks launch

| # | Finding | Evidence | Fix |
|---|---|---|---|
| **1** | **CRITICAL, live in prod: anyone can rewrite your feature flags.** The migration creates `public.platform_feature_flags` without RLS. In production, `anon` and `authenticated` both hold INSERT, UPDATE, DELETE and TRUNCATE. `getFlag()` reads this table for **every** flag that isn't set by an env var. With only the public anon key, a person can insert `DELIVERY_CUSTOMER_ORDERS_ENABLED=false` (stopping all orders) or flip any other flag. | `20261011120000_in_house_procurement.sql:3-11`. Prod check: `relrowsecurity = false`, anon has all privileges. | `ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.platform_feature_flags FROM anon, authenticated; GRANT SELECT, INSERT, UPDATE ON public.platform_feature_flags TO service_role;` Ship it as a new migration file and apply it the same day. |
| **2** | **Customer and courier screens were changed.** The new rule is that they must not be (§2). Nineteen app files and five backend payloads carry the change. | §2.3 lists every change to remove. | Revert as listed in §2.3. |
| **3** | **`IN_HOUSE_ENABLED` is ON in production, but the launch checklist in ADR 0023 is still unticked.** Nothing is visible yet because no store exists. The first store saved with `live = true` goes public immediately. | `20261011130000_in_house_enabled.sql`; prod flag `enabled = true` | Turn it off with a new migration until the ADR checklist is signed. Keep it off while P0–P2 are open. |
| **4** | **The courier dispatch origin changed for every Rush order**, not only In-House ones, and that change is live. Offers are now ranked from the restaurant instead of the customer pin. I think this is the right behaviour, but it is a production change outside this feature. | `courierConsumerRoutes.ts:265-278` | Keep it as a deliberate decision (ADR 0023 item 12). For a week, watch offer acceptance rate and time-to-assign on partner orders. |

### P1 — correctness (money)

| # | Finding | Where | Fix |
|---|---|---|---|
| **5** | **Double purchase after the food is already bought.** A courier reports "not ready", so the task goes to `exception`. Ops clicks **Retry**, which sets it back to `queued` with `attempt + 1`. A buyer claims it and buys the food **again**. The second purchase journal reuses `procure:{task_id}`, so the ledger silently ignores it: real money is spent twice but booked once. | `taskMachine.ts` (`exception → retry → queued`); `routes.ts:309-320`; `courierConsumerRoutes.ts:958-974` | Split the exception states into **before purchase** and **after purchase**. After purchase, the only allowed actions are *wait / re-dispatch*, or *abandon* (which writes off the food). Never re-queue. Add a guard in the `retry` handler: refuse when a `procure:` journal exists. |
| **6** | **Claim race.** `claim` updates with `.eq("state", task.state)` but never checks that a row actually changed. If two buyers click Claim at the same moment, **both get `ok: true`**. The loser finds out only at "Mark placed" (403), which is after they've already paid the restaurant. | `routes.ts:136-145` | Add `.select("id")` and treat 0 rows as 409 ("Someone else took this order"). Do the same on `placed` (`routes.ts:323-334`) and every other conditional update in the module. |
| **7** | **The customer can cancel while the buyer is paying.** The order stays `accepted` throughout `claimed/placing`, and the customer cancel route allows `placed/accepted`. That gives a full refund and an `abandoned` task. The buyer then presses "Mark placed", gets a 409, and the food has been bought with **no record**. | `createTask.ts` (sets `accepted`), `customerOrderRoutes.ts:884`, `routes.ts:301-306` | Move the order to **`preparing` at claim**. This is the same moment a partner kitchen "starts", so the customer's cancel window closes exactly as it does at a partner, with no new UI (§2.2). Also let `placed` record the purchase and post a writeoff when the task was abandoned in between, so a spend is never lost. |
| **8** | **Refunds after delivery on an In-House order fail to book.** `executeRefund` builds `refundUnwindLines`, which debits `merchant_payable`. The new trigger rejects that for In-House merchants, the journal error is only logged, and the customer is refunded by WiPay with **nothing in the ledger**. The missing-item auto-refund (`fault: merchant`) always takes this path. Merchant-fault debits do the same thing: `disputeResolution/merchantDebit.ts` and the support charge door in `rushMoney/routes.ts:961` bill `merchant_receivable` to a restaurant that isn't a partner. | `_shared/rushMoney/executeRefund.ts:60-79`, `journalLines.ts:153` | For an In-House order, route the "food" share of any refund or fault charge to `platform_cost` (component `procurement_refund`). Roam is the restaurant. Add a test that runs a post-delivery partial refund through the real builders for an In-House order. |
| **9** | **Orders get stuck in `placing` forever.** Opening the workspace moves `claimed → placing` immediately, but stale-claim release only looks at `claimed`. The 20-minute auto-refund only looks at `queued`. A buyer who walks away leaves a paid order that never moves, and nobody is alerted. The 7-minute SLA alert from Rev 1 was not built. | `routes.ts:192-197`, `sweep.ts:16-37, 39-53` | Do **not** auto-release `placing`, because the buyer may already have paid. Instead, at 7 minutes send an ops alert. At 15 minutes, page ops and set `exception: other`. Add the SLA alert for `queued` at 7 minutes as well. |
| **10** | **A paid In-House order can end up with no task.** `ensureProcurementTask` runs inside a `try` after capture, and any error is only logged. Nobody would ever buy that food. | `payments/index.ts:426-427` | Add view `v_in_house_paid_without_task` (In-House merchant, `money_state = captured`, no task, older than 2 minutes). Add it to `recon_runs`, and make the sweep call `ensureProcurementTask` for each row. |
| **11** | **"Ready" can be set without a purchase.** The `concierge` actor on `PUT /orders/:id/status` accepts any dash admin role, including courier roles. `applyConciergeOrderStatus` doesn't check the task state or the order's current status, so it can send couriers to a restaurant where nothing was ordered. | `index.ts:1386-1399`, `applyStatus.ts` | Gate the route on `CONCIERGE_ROLES`. Allow `ready` only when the task is `placed_external`, and guard every order update with the expected from-status. |
| **12** | **Card statement matching can hide a double charge.** `UNIQUE(card_id, posted_on, amount_minor, merchant_text)` merges two real identical charges into one row, and those are exactly the double purchases you're trying to catch. Matching uses `.maybeSingle()` on card + amount, so two tasks with the same total never match. There is also no date window. | migration `:140-151`, `routes.ts:471-484` | Drop the unique key and add an import batch id plus a line number. Match on card + amount + `posted_on` within ±3 days of `placed_at`, pick the oldest unmatched task, and require `task.id` not to be already matched. |
| **13** | **The card daily limit resets at 7 pm Jamaica time.** Edge runs in UTC, so `setHours(0,0,0,0)` means UTC midnight. | `routes.ts:283-288, 445-447` | Compute the day start in `America/Jamaica`. `jamaicaMinutes()` already exists in `pricing.ts`. |
| **14** | **Switching an existing partner to In-House breaks its open orders.** `POST /admin/in-house/stores` sets `procurement_mode = 'in_house'` on any merchant id. That partner's in-flight orders then fail at settlement, because the trigger rejects their `merchant_payable`. | `routes.ts:544-547` | Refuse when the merchant has an owner or team, any `merchant_payable` history, or any open order. In-House stores should only be created through the new create flow (item 18). |
| **15** | **`price_approved` can reopen any task.** It forces `state = 'placing'` from any state, including `closed` and `abandoned`, without going through the machine. | `routes.ts:372-381` | Allow it only from `exception` or `awaiting_customer`, through `transitionOrThrow`. |

### P1 — access

| # | Finding | Fix |
|---|---|---|
| **16** | **The buyer role can read the whole Ops Console API.** `dash_concierge` was added to `PRODUCT_ADMIN_ROLES.dash`, so it passes `requireProductAdmin(c, "dash")` on **42 routes**, including all orders, all customers and finance reads. The nav hides those pages, but the API doesn't. | Remove `dash_concierge` from `PRODUCT_ADMIN_ROLES.dash`. Give `requireDesk()` its own check that accepts `dash_concierge` only on `/admin/in-house/*` (and on chat for In-House orders). |
| **17** | **Desk roles join every order chat on the platform.** Any desk role becomes `support` on **every** order chat, not just In-House ones. It also calls `auth.admin.getUserById` on every chat request. | Check that the order belongs to an In-House merchant before granting `support`. Read roles from the JWT claims you already have rather than an admin API call. |

### P2 — the pilot can't run without these

| # | Gap | Fix |
|---|---|---|
| **18** | **There's no way to create the restaurant.** Today, Stores takes a raw merchant UUID and saves only `{live: false, markup: 1500}`. You can't set the order URL, phone, hours, tolerance, terms review or the live switch. Menu prices only edits items that already exist. An In-House store also needs a `merchants` row with address and pin, `market_id`, pricing tier, hours, categories and items, and it must pass the normal discovery filters (`is_active`, `is_accepting_orders`). | Build **"Add In-House store"**, which creates the merchant row with no owner, then the store, hours, categories and items. Then build a full store edit form, a menu item create/edit form, and a live switch. |
| **19** | **Orders over J$15,000 can never be placed.** The two-person approval endpoint exists, but no screen calls it. | Add an **Approve purchase** button for ops on the queue card and the Exceptions page. |
| **20** | **An approved price change still can't be saved.** In the workspace, the over-tolerance warning blocks saving even after ops records the customer's approval, because the UI never reads `customer_price_approved_at`. | Unblock when `task.customer_price_approved_at` is set. Under the §2.2 rule, also unblock when the variance is within Roam's absorb cap. |
| **21** | **The cart helper (L1) isn't real yet.** "Copy cart for helper" sends the item label (for example "2× Coke") as the name, with quantity 1. The server's `cart` payload is ignored. The extension types into the first N text boxes on any page. | Use the `cart` payload from `GET /tasks/:id`. Leave the extension at **not built**: it needs a per-site recipe before any buyer uses it. L0 manual stays the launch mode. |
| **22** | **Customers don't get the usual status texts.** Partner customers get an SMS at accepted, preparing and ready. In-House orders get none, because `createTask`, `placed` and the sweep never call `notifyCustomerOrderStatus`. Under the invisible rule, the texts have to match. | Call `notifyCustomerOrderStatus` in each place, with the same templates as partners. |
| **23** | **Customer messages can go unanswered.** The workspace has no chat. A customer messaging the "restaurant" reaches the desk only if someone happens to open the order chat. | Embed the existing order chat in the workspace and badge unread messages on the queue. Buyers reply as the restaurant thread, in plain neutral wording. |

### P3 — hygiene

| # | Item |
|---|---|
| 24 | The new Deno tests (`inHouse/*.test.ts`, `journalLines.inHouse.test.ts`, `tools/in-house-worker/guard.test.ts`) aren't in `ci.yml`. Deno tests don't glob there, so list them. |
| 25 | Changing a store's `markup_bps` doesn't reprice its existing items, because the trigger only fires on item writes. Reprice them in the store save. |
| 26 | Any desk user can overwrite the receipt on any task, even after it's placed. Restrict that to the claimer while the task is `placing`. |
| 27 | `createTask.expectedCostMinor` falls back to the customer price when `in_store_price` is missing, which overstates cost. Refuse to sell an In-House item without `in_store_price`. |
| 28 | The GCT setting on the store's merchant row decides whether the customer is charged food GCT, and that tax currently lands in Roam's residual. Leave the store **not** GCT-registered until the accountant answers D4. |
| 29 | Commit the work. Before calling it done, check that the repo and `schema_migrations` match (they do today). |

### Verified good — no action needed

- **Evidence CHECK.** `placed_requires_evidence` refuses "placed" without an order number, total, receipt and card.
- **One task per order.** `order_id UNIQUE` holds. `procurement_events` is append-only through a trigger.
- **Payout guard.** The trigger refuses `merchant_payable` for In-House merchants. The five recon views exist and feed `recon_runs`.
- **Ledger builders.** `procurementPurchaseLines`, `inHouseSettleLines`, `procurementCardReconLines` and `procurementWriteoffLines` all balance, and the residual comment is in place. Settle branches correctly and refuses cash.
- **Cancel after purchase.** It books a writeoff and skips the partner merchant legs.
- **Capture gate.** Claim and place both refuse unless `money_state = captured`.
- **Card and receipt handling.**
  - Cards are stored as the last 4 digits only, and the receipt bucket is private.
  - Receipts are checked by magic bytes and scanned for malware.
  - The per-card daily limit and the J$15,000 two-person rule are enforced on the server.
- **Worker guard.** It refuses unless the level is L3, the terms allow it, and the helper has 30 stable days. It never retries payment.

---

## 2. The invisible rule (new in Rev 2)

> **To the customer, an In-House store is just another restaurant. To the courier, an In-House pickup is just another delivery.**
> All the In-House machinery lives on the Roam side: the desk, the ledger and the cron.

Rev 1 described a "Concierge" chip, a disclaimer, a checkout tick box, a "Roam is placing your order" step, a prepaid banner and a required pickup photo. **All of that is withdrawn.** Here is how each need is met without the customer or courier seeing anything different.

### 2.1 Customer: how each need is met with no new UI

| Need | Rev 1 answer (withdrawn) | Rev 2 answer: invisible |
|---|---|---|
| Brand, photos | Name only, no logo | Normal logo, cover photo and menu photos, like any store. **Your risk call** (see 2.4). |
| "Not affiliated" disclosure | Banner on store page | One clause in Roam's general **Terms of Service**: *"For some restaurants, Roam places the order with the restaurant on your behalf."* No per-store text. |
| Card only | "Card only" label, hidden Change button | Cash is **off platform-wide today** (`DASH_ALLOW_CASH_ORDERS`), so nothing shows. **When you turn cash on**, add a *generic* per-merchant "accepts cash" setting that partners can use too, and set it false for In-House stores. Then it looks like any restaurant that doesn't take cash. |
| Food not refundable once bought | Checkout tick box | **Same rule partners already have.** The customer can cancel only before the restaurant "starts preparing" (`customerOrderRoutes.ts:884`). The order moves to `preparing` **the moment a buyer claims it** (finding 7). After that, cancelling goes through support, exactly as at a partner. |
| Longer prep | "10–15 min longer" text | Set the store's normal `avg_prep_time_mins` to cover real placing plus cooking time (for example 25 + 10). The ETA just looks like a slower kitchen. |
| Placing step | New "Placing" tracking step | Standard steps: **Confirmed → Preparing → On the way → Delivered**. |
| Price went up on the restaurant's site | Customer approve or decline prompt | **Roam absorbs it** up to a per-store cap (for example 10% or J$500). Above the cap, the buyer either swaps the item through the **existing substitution flow** (customers already know it from partner stores), or cancels the order with a **full refund** (`desk_failed`). There is no new prompt. |
| Desk not staffed | Store disappears (404 on direct link) | Use the store's **normal pause / not-accepting state**, so it shows as *closed* like any partner outside hours. Don't return 404. |
| Status texts | — | Same SMS as partners at each status (finding 22). |

### 2.2 How the order statuses line up (revised)

| Procurement task | `orders.status` | What the customer sees (unchanged screens) |
|---|---|---|
| queued | `accepted` | "Confirmed". Can still cancel, full refund, no money spent yet. |
| claimed / placing | **`preparing`** | "Preparing". Cancel window closed, same as at a partner. |
| placed_external | `preparing` | "Preparing" |
| ready_for_pickup (timed from restaurant ETA) | `ready` | Courier assigned / on the way, as normal |
| picked_up → delivered | courier drives it | unchanged |

### 2.3 Exactly what to remove

**Customer app** (`apps/dash-customer`), reverting every In-House change in:
- `components/discovery/DiscoverStoreCard.tsx`: the Concierge chip
- `components/tracking/OnTheWayView.tsx`, `components/ui/OrderStatusStepper.tsx`: `CONCIERGE_ORDER_STEPS`
- `components/tracking/PreparingTrackingView.tsx`: the "Placing" copy, the buyer text and the logo removal
- `lib/discoverContent.ts`, `lib/merchantDiscovery.ts`, `lib/merchantMenu.ts`, `lib/restaurantContent.ts`, `lib/trackingContent.ts`: `concierge`, `legalDisclaimer`, `cardOnly`, the `placing` phase, `readyEta`, and the logo/image blanking
- `pages/CheckoutPage.tsx`: the menu fetch, the tick box, the card lock, the "Card" label, `inHouseAcknowledged`
- `pages/OrderTrackingPage.tsx`: the concierge hint and the `placing` case
- `pages/RestaurantPage.tsx`: hero hiding, the disclaimer and the "Concierge" badge

**Courier app** (`apps/dash-courier`), reverting every In-House change in:
- `lib/courierApi.ts`, `lib/mapOrderToActiveDelivery.ts`, `lib/mockActiveDelivery.ts`, `lib/mockStackedRoute.ts`, `lib/stackedRouteBuilder.ts`: the `procurement` / `prepaid` / `pickupCode` / `externalOrderRef` / `pickupInstructions` fields
- `pages/delivery/AtStorePage.tsx`, `pages/delivery/stacked/StackedAtPickupPage.tsx`: the prepaid banner and the required photo

**Backend payloads**, so the apps never receive In-House-only data:
- `inHouse/visibility.ts` `filterDiscoveryMerchants`: stop nulling `logo_url`/`cover_image_url`, and stop adding `concierge` / `legal_disclaimer`. Keep the hide-when-closed logic, but express it as the normal not-accepting state (§2.1).
- `index.ts` `GET /merchants/:id` (`:392-415`): same changes, plus drop `card_only`. Return the normal closed state instead of 404. Keep the stale-price item filter, since a missing item looks normal.
- `customerDiscoveryRoutes.ts` (`:338-341`): drop `procurement_mode`, `concierge` and `legal_disclaimer` from the response.
- `customerOrderRoutes.ts` `GET /orders/:id` (`:651-662, 730`): don't null the logo, and don't attach `procurement`.
- `customerOrderRoutes.ts` `POST /orders` → `inHouse/checkout.ts`: remove the `inHouseAcknowledged` requirement. Keep card-only, the cap and the stale-price checks as **server** rules. A refusal uses the same generic messages a partner store produces (for example `"Unavailable menu item"`, `"Cash is not available"`), never "In-House".
- `courierConsumerRoutes.ts` offers (`:583-607`): don't attach `procurement`.
- `index.ts` courier `picked_up` (`:1334-1350`): remove the required pickup photo (409 `in_house_pickup_photo`). Keep the task `picked_up` update.

### 2.4 How the courier pickup works with no courier UI change

- **Pickup name = the Roam order number the courier already sees.** The courier app shows `order_number` (`mapOrderToActiveDelivery.ts:163`, `stackedRouteBuilder.ts:49`). The buyer orders under the name **"Roam {order_number}"**, so the courier tells the counter the same number they'd give any partner.
  - **Replace the random `ROAM XXXX` code** in `createTask.ts`.
  - The pickup-day unique index can stay, keyed on that value.
- **Prepaid:** couriers never pay at partner restaurants either, so no banner is needed. Leave the existing courier rule as it is.
- **Counter instructions** (for example "left counter"): put them in whatever merchant pickup notes the courier app already shows for partners. If it shows none, leave them out. The order number is enough.
- **"Not ready"** uses the courier's existing report button. The backend side effect (task → exception) stays, and is fixed by finding 5.
- **Pilot check, before go-live:** confirm the pilot restaurant will hand a **prepaid online carry-out** order to someone who gives only a name and order number. Some chains ask to see the card that paid. If this one does, it can't be a web In-House store. Switch it to **phone ordering** (`order_channel = 'phone'`), or leave it out.

### 2.5 The trade-off, stated once

Making the feature invisible means:
- the customer is **not told** Roam is buying on their behalf (only the Terms say so),
- the brand's **logo and photos** appear without permission, and
- the no-refund rule is the **standard partner cancel rule**, not a special notice.

That was the intent of Rev 1's D2, D3 and D8. This is your call, and the design supports it. Two things are worth keeping:
1. a written **takedown process**: if a brand objects, set `in_house_live = false` the same day, and
2. the attorney line in ADR 0023, re-scoped to *"Terms of Service clause covers agency ordering"*.

---

## 3. Architecture as built (reference)

### 3.1 Where things live

| Layer | Location |
|---|---|
| DB | `delivery.merchants.procurement_mode / in_house_live`, `delivery.in_house_stores`, `procurement_tasks`, `procurement_events`, `in_house_cards`, `in_house_card_statement_lines`, `in_house_desk_presence`, `menu_items.source_*`, trigger `trg_in_house_menu_price`, bucket `in-house-receipts` |
| Ledger | `rush_money.accounts.kind` + `vendor_prepaid`, `procurement_card_payable`. Trigger `reject_in_house_merchant_payable`. Five `v_in_house_*` views in `recon_runs`. |
| Edge | `supabase/functions/delivery/inHouse/` (routes, taskMachine, createTask, checkout, visibility, applyStatus, sweep, pricing, adapter, access, dispatchOrigin). Hooks in `customerOrderRoutes`, `index.ts`, `courierConsumerRoutes`, `rushMoney/{settleOrder,cancelOrder,routes}`, `payments/index.ts`, `rush-cron`. |
| Ops Console | `packages/dash-admin/src/pages/inhouse/` (Queue, Workspace, Exceptions, Stores, Menu prices, Cards, Reports). Client: `packages/dash-admin-client/src/inHouse.ts`. Role `dash_concierge`. |
| Off-platform | `tools/in-house-cart-fill` (L1 placeholder), `tools/in-house-worker` (L3 guard only) |

**Deploy note:** `payments/index.ts` now imports `../delivery/inHouse/createTask.ts`. If you deploy through the MCP file-list flow rather than the CLI, include that file **and** `inHouse/orderStatus.ts` + `inHouse/taskMachine.ts` in the `payments` bundle, or capture will throw on import. Confirm the deployed `payments` version includes them.

### 3.2 Task state machine (with the finding 5 fix)

```
queued ─claim─▶ claimed ─start─▶ placing ─record_purchase─▶ placed_external ─dispatch─▶ ready_for_pickup ─pickup─▶ picked_up ─close─▶ closed
  ▲                │                 │                              │                           │
  └──release───────┘                 │                              ▼                           ▼
                                     ▼                    exception_after_purchase ◀───────────┘
                         exception_before_purchase           ├─ wait / redispatch → ready_for_pickup
                           ├─ retry → queued                 └─ abandon → writeoff + full refund
                           ├─ substitute (existing flow) → placing
                           └─ abandon → full refund
```

`retry` must be impossible once a `procure:{task_id}` journal exists.

### 3.3 Money (unchanged from Rev 1, now built)

| Event | Lines (debit-positive) |
|---|---|
| Purchase recorded | `vendor_prepaid` (order) **+food** / `procurement_card_payable` (card:last4) **−food** |
| Delivered: `inHouseSettleLines` | `order_clearing` **+captured** / `vendor_prepaid` **−food** / `courier_earnings` **−courier** / `platform_revenue` or `platform_cost` **−residual** |
| Card statement matched | `procurement_card_payable` **+food** / `bank` **−food** |
| Cancelled after purchase | `platform_cost:procurement_loss` **+food** / `vendor_prepaid` **−food** |
| **Refund after delivery (finding 8, to build)** | `gateway_clearing` **−refund** / `platform_cost:procurement_refund` **+food share** / `courier_earnings` **+courier share, if courier fault** / `platform_revenue` **+rest** |

Worked example (Rev 1, still valid): the customer pays 2,850, the food costs 2,080, the courier gets 350, and Roam keeps 420. The variance of −80 shows on the task.

### 3.4 Automation ladder (unchanged)

- **L0, manual checklist:** the launch mode, and the only one that's real today.
- **L1, buyer cart helper:** a placeholder (finding 21).
- **L2, phone / WhatsApp / email channel:** handled by `order_channel`. Phone ordering is the fallback for the pilot check in §2.4.
- **L3, Playwright worker:** off Supabase, only where the restaurant's terms allow it, and it never pays. Only the guard is built.

---

## 4. Order of work

1. **Today:** finding 1 (flag table RLS), then finding 3 (flag off). Commit the current work so there's a baseline.
2. **Invisible rule:** carry out §2.3 and §2.4, plus findings 7 (preparing at claim) and 22 (SMS parity).
3. **Money:** findings 5, 6, 8, 9, 10, 11, 12, 13, 14 and 15. For each one, add a test that fails on today's code and passes after the fix.
4. **Access:** findings 16 and 17.
5. **Desk:** findings 18, 19, 20 and 23 (21 can wait).
6. **Hygiene:** findings 24–29.
7. **Pilot:** finish the ADR 0023 checklist (re-scope the attorney line per §2.5), do the §2.4 counter check at the pilot store, and run a 1-week closed beta. Then turn on `IN_HOUSE_ENABLED`.

**Acceptance for the next verification pass:**
- every P0–P2 row closed;
- `git diff` on `apps/dash-customer` and `apps/dash-courier` shows **no In-House changes**;
- a staging order at an In-House store goes through the unchanged customer and courier apps, with only the desk different;
- all six recon views return 0 (the five existing plus `v_in_house_paid_without_task`).
