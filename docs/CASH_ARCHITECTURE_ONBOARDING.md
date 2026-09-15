# Cash Architecture Onboarding Guide

**Audience:** Brand-new engineers, product managers, and ops teammates  
**Purpose:** Explain how cash moves through Roam — from a passenger handing money to a driver, through wallets, into Fleet, and how Delivery COD is different  
**Status:** Canonical onboarding companion to existing money docs  
**Date:** 2026-09-15  

---

## How to use this document

Read top to bottom the first time. You do not need prior knowledge of Roam’s codebase.

When you finish, you should be able to answer:

1. What are Layer A, Layer B, and Layer C?
2. What are the driver’s three wallets, and what does each mean?
3. Why does Fleet “Log Cash” not empty the driver’s Roam Cash wallet?
4. Why must we **not** treat Delivery COD like rideshare Log Cash?

**Related deeper docs (after this one):**

| Doc | When to read it |
|-----|-----------------|
| [`docs/passenger-rides/MONEY_LEDGER_RULES.md`](./passenger-rides/MONEY_LEDGER_RULES.md) | Short canonical product rules |
| [`docs/passenger-rides/CASH_SPLIT_SETTLEMENT.md`](./passenger-rides/CASH_SPLIT_SETTLEMENT.md) | Cash + rider wallet split trips |
| [`docs/passenger-rides/WALLET_ARCHITECTURE_QA.md`](./passenger-rides/WALLET_ARCHITECTURE_QA.md) | QA cases / feature flags |
| [`docs/adr/0005-unified-ledger-schema.md`](./adr/0005-unified-ledger-schema.md) | Ledger account key patterns |
| [`docs/PRICING_COMMISSION_AUDIT.md`](./PRICING_COMMISSION_AUDIT.md) | Delivery COD gaps in production |

---

## Part 1 — Big picture (start here)

### 1.1 The problem cash creates

Cash is different from card:

- With **card**, the platform (or bank) usually holds the money electronically. Settlement is mostly numbers moving between accounts.
- With **cash**, a human is literally holding bills. The system must answer:
  - Did the customer pay enough?
  - Who keeps tips / earnings?
  - Who still owes change?
  - When does the company (fleet or Roam) actually receive the physical cash?

If you mix those questions into one “wallet” or one “Log Cash” button, money will look wrong on every screen.

### 1.2 Roam’s answer: three layers

Roam separates cash into **three layers**. Memorize this table.

| Layer | Name | Who ↔ who | Everyday question it answers |
|-------|------|-----------|------------------------------|
| **A** | Roam Platform Trip Ledger | Rider / driver / (later) fleet org ↔ **Roam** | Was this *trip* paid fairly? Change? Digital credit? Debt for change? |
| **B** | Fleet Operating Ledger | Driver ↔ **Fleet owner** | After a *week* of passenger cash, fuel, tolls, and share — who owes whom? Did the driver bring cash to the office? |
| **C** | Roam Revenue | Fleet or independent ↔ **Roam** | Platform take-rate / fee (often **0%** today) |

```
Passenger hands cash to driver
        │
        ▼
┌───────────────────────────┐
│ Layer A — Trip wallets    │  Cash / Digital / Debt + rider wallet
│ (Roam Rider + Driver apps)│
└─────────────┬─────────────┘
              │ sync completed ride into Fleet books
              ▼
┌───────────────────────────┐
│ Layer B — Fleet desk      │  Weekly periods, cash held, Log Cash, Payout
│ (Roam Fleet)              │
└───────────────────────────┘
```

**Hard rule:** Never merge Layer A wallet chips into Fleet Cash Wallet / Driver Settlements totals (or the reverse). They measure different things.

---

## Part 2 — Rideshare story (passenger → driver → fleet)

This is the happy-path story for a **Roam-dispatched cash ride** (passenger booked in the Rider app, driver accepted in the Driver app).

### 2.1 Before cash: the trip

1. Passenger books a ride and chooses **cash** payment.
2. Driver completes the trip.
3. Fare is locked (final fare in minor units — cents of JMD).
4. Ride status becomes **`awaiting_cash_settlement`**.
5. Passenger waits; driver confirms how much cash was actually received.

Apps involved:

- **Roam Rider** (`apps/rides-passenger`) — shows locked fare, cash settlement UI  
- **Roam Driver** (`apps/driver`) — cash settlement overlay / complete view  

Server entry point:

- `POST /v1/requests/:id/cash-settlement`  
- Implementation: `supabase/functions/rides/cashSettlement/processCashSettlement.ts`

### 2.2 Driver enters cash received

The driver types the **physical amount** handed over (and optional tip).

Important distinction:

| Number | Meaning |
|--------|---------|
| **Owed fare** | What the trip costs (locked fare) |
| **Cash received** | What bills the passenger actually gave the driver |

These can differ (exact, under, over, unpaid).

Outcomes (`computeOutcome.ts`):

| Outcome | Condition | Plain English |
|---------|-----------|---------------|
| `exact` | Cash = fare | Clean trip |
| `overpay` | Cash > fare | Driver owes change to the rider |
| `underpay` | Cash < fare (legacy path) | Shortfall |
| `unpaid` | Cash = 0 | No cash recorded |
| `split` | Partial cash + wallet/platform (flag-gated) | Cash + Roam wallet / guarantee covers fare |

### 2.3 The driver’s three wallets (Layer A)

When cash settlement V2 is enabled, every driver has **three** Roam wallets:

| Wallet | Account key (technical) | What it means in plain English |
|--------|-------------------------|--------------------------------|
| **Cash** | `user:{driverId}:driver:cash` | Accounting for physical cash at *trip settlement* (collection in, fare allocation out) |
| **Digital** | `user:{driverId}:driver:digital` | Electronic earnings pot — card trips, split shortfall credit, tips, fund used to give change |
| **Debt** | `user:{driverId}:driver:debt` | Driver still owes the rider **change** because Digital could not cover the overpay |

Legacy note: older code used a single `user:{id}:driver` account; V2 still falls back to that for Digital reads.

Driver UI: Earnings screen (`IndependentEarningsPage`) loads `GET /v1/drivers/me/wallets`.

#### What each journal step does (exact cash trip, simplified)

1. **`cash_trip_collection`** — Record that physical cash entered the system → credits **Cash** wallet (or fleet org cash if org-payout mode is on).  
2. **`fare_allocation_from_cash`** — Move the fare portion out of Cash toward platform receivable → Cash balance often nets toward zero for exact trips.  
3. If **overpay**: credit the **rider wallet** for change; fund that from **Digital** first; if Digital is short, open **Debt**.  
4. If **underpay / unpaid / split shortfall**: the shortfall is **rider → company**, never “rider owes the driver.”

Builder: `buildSettlementJournalV2.ts`.

#### “Cash in hand” vs Cash wallet chip

Drivers also see **Cash in hand** — the sum of physical amounts entered on completed cash trips (`cash_received_minor`).  

That display number is **not** always identical to the Cash wallet ledger chip. Treat:

- **Cash in hand** ≈ “bills I took from passengers (ops view)”  
- **Cash wallet** ≈ “journaled cash sub-account after fare allocation”

Do not assume they are the same number without checking.

### 2.4 The passenger (rider) wallet

Account key: `user:{riderId}:rider`

| Situation | What happens to rider wallet |
|-----------|------------------------------|
| Overpay / change | Credited (rider is owed change digitally) |
| Split payment | Debited for the wallet portion of the fare |
| Underpay / arrears | Can go negative — that means **owes the company** |
| Later pay-down | Card / Lynk paths clear arrears (cash is not used for arrears pay) |

Product rule: drivers must **never** see “rider owes you.” Shortfall is company receivable.

### 2.5 Split payment (optional, flag-gated)

When `CASH_SETTLEMENT_SPLIT_PAYMENT` is on:

- Passenger pays **some** cash and the rest can come from rider Roam wallet and/or platform guarantee.
- Invariant: `cash_received + wallet_paid + platform_guarantee === owed` → **driver is always made whole**.
- Extra digital credit to the driver for the non-cash portion.

Full contract: `CASH_SPLIT_SETTLEMENT.md`.

### 2.6 Bridge into Fleet (Layer B input)

After the ride completes:

1. Immutable trip reporting lines are written (`rides.ledger_lines`).  
2. The ride is synced into Fleet trip books via `syncRideToFleetKv` / `rideRequestToFleetTrip`.  
3. Cash trips carry `cashCollected` from physical `cash_received_minor`.  
4. That passenger cash feeds the driver’s weekly Fleet period (`cash_collected` on `driver_financial_periods`).

Critical product rule stamped on sync:

- Physical handover of cash to the **fleet company** is **Layer B only** (Log Cash / weekly settlement).  
- Completing a Roam cash trip does **not** mean the fleet owner already received the bills.

Independent drivers (not fleet-attributed) skip org fleet sync so they do not create wrong fleet rows.

### 2.7 Driver hands cash to the fleet owner (Layer B)

This is the **office / remittance** step.

| Action | Direction | What it does |
|--------|-----------|--------------|
| **Log Cash** (Collect) | Driver → Fleet | Increases **Cash Returned** for a Settlement Week |
| **Record Payout** (Pay) | Fleet → Driver | Increases **settlement_paid** when the company owes the driver |
| **Cash write-off** | Forgive held cash | Reduces held cash; **not** returned; **not** a payout |

Where in product:

- **Roam Fleet** → Business Finance → **Driver Settlements** → Collect → Log Cash  
- Also available per driver on Cash Wallet  
- Driver app: **Fleet Settlement** tab (Layer B weeks — separate from Roam Earnings wallets)

Server path (modern desk):

- `POST /settlements/collect` → movement + dual-write + period cash sync  
- Client: `settlementCommandsApi.collect` / `LogCashPaymentModal`

#### Settlement Week

Fleet groups money by **Monday–Sunday** weeks (`period_anchor` = Monday date).  

Log Cash must be tagged to a **Settlement Week** so Cash Returned applies to the right week’s passenger cash.

#### What Log Cash does *not* do

**Log Cash does not zero the driver’s Roam Cash / Digital / Debt wallets.**

Those Layer A wallets already finished their job at trip settlement. Log Cash only updates Fleet’s weekly books (`cash_returned`, `cash_still_held`, residuals).

```
Layer A: “Was the trip settled between rider and Roam/driver?”
Layer B: “Did the driver bring the week’s passenger cash to the fleet?”
```

### 2.8 Weekly math (simplified)

After passenger cash, Log Cash, fuel, tolls, and driver share:

```
cash_still_held ≈ passenger cash still physically with the driver for that week
grossSettlement = netPayout − cash_still_held
```

- Positive outstanding → **fleet owes driver** → use **Pay / Record Payout**  
- Negative outstanding → **driver owes fleet** → use **Collect / Log Cash**  
- Near zero → settled  

Exact formulas live in finance-core / period settlement code; product rule of thumb above is enough for onboarding.

### 2.9 Things that are Layer B only (never Layer A)

These create Fleet cash/earnings but **must not** invent Roam Cash-in-Hand:

- Start Trip  
- Manual trip entry  
- Uber / InDrive imports  

Example from product docs: a driver can show Fleet cash for manual trips while Roam Earnings Cash-in-Hand stays **$0** — that is **correct**.

---

## Part 3 — Feature flags you will see

| Flag / setting | Default idea | What it controls |
|----------------|--------------|------------------|
| `CASH_SETTLEMENT_ENABLED` | Must be on for cash settlement | Master switch |
| `CASH_SETTLEMENT_V2` | Off until enabled | Three wallets + V2 journals |
| `CASH_SETTLEMENT_SPLIT_PAYMENT` | Off | Cash + rider wallet split |
| `CASH_SETTLEMENT_SWITCH_TO_CARD` | Off | Rider arrears pay via card/Lynk |
| `fleet_org_payout_enabled` | Off | Fare credits org accounts instead of driver cash; tips stay driver Digital |
| `manual_start_trip_enabled` | On for fleet | Temporary Start Trip until passenger app is universal |
| `roam_platform_fee_bps` | 0 | Layer C fee |

Never flip production flags without reading the QA matrix in `WALLET_ARCHITECTURE_QA.md`.

---

## Part 4 — Key code map (for engineers)

### Layer A (rides)

| Concern | Location |
|---------|----------|
| Process cash settlement | `supabase/functions/rides/cashSettlement/processCashSettlement.ts` |
| Outcomes | `.../computeOutcome.ts`, `.../computeSplitSettlement.ts` |
| V2 journals | `.../buildSettlementJournalV2.ts`, `.../buildSplitPaymentJournalLines.ts` |
| Routes / wallets API | `.../registerCashSettlementRoutes.ts` |
| Account keys / post journal | `supabase/functions/_shared/paymentAccounts.ts` |
| Debt repayment | `.../cashSettlement/debtRepayment.ts` |
| Sync ride → fleet trip | `supabase/functions/_shared/rideToFleetTrip.ts` |
| Driver wallets UI | `apps/driver/src/hooks/useDriverWallets.ts`, `IndependentEarningsPage.tsx` |
| Rider cash UI | `apps/rides-passenger` cash settlement views |
| Cash-in-hand helper | `packages/types/src/cashInHand.ts` |

### Layer B (fleet)

| Concern | Location |
|---------|----------|
| Log Cash modal | `apps/fleet/src/components/drivers/LogCashPaymentModal.tsx` |
| Driver Settlements desk | `apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx` |
| Collect API client | `apps/fleet/src/services/settlementCommandsApi.ts` |
| Collect command server | `supabase/functions/_fleet-server/settlement_commands_controller.tsx` |
| Period cash sync | `supabase/functions/_fleet-server/driver_financial_periods.ts` |
| Cash returned predicates | `packages/finance-core/src/driverCashPayment.ts` |
| Weekly cash base | `packages/finance-core/src/periodShareCash.ts` |
| Tx builders | `apps/fleet/src/utils/driverSettlementTx.ts` |

### Tables / stores (mental model)

| Store | Layer | Role |
|-------|-------|------|
| `rides.payment_accounts` / journal entries | A | Wallet balances + double-entry lines |
| `rides.ride_requests` cash fields / snapshot | A | Trip settlement facts |
| `rides.ledger_lines` | A→reporting | Trip cash/earnings lines |
| Fleet trips / `fleet_trips` | B input | Synced / imported trips including `cashCollected` |
| `ledger.driver_financial_periods` | B | Weekly cash_collected / returned / still held / settlement |
| `ledger.settlement_movements` | B | Collect / pay / write-off movements |

---

## Part 5 — Delivery COD (different product)

### 5.1 Do not copy rideshare blindly

Delivery cash-on-delivery (**COD**) looks similar (“courier holds cash”) but is a **different accounting object**.

| | Rideshare cash | Delivery COD |
|--|----------------|--------------|
| Who the cash is for | Fare economics between rider, driver, Roam; then fleet remittance | Customer pays for **order** (food/goods + fees); courier remits **platform + merchant** share to Roam |
| Wallets | Cash / Digital / Debt + rider wallet | **One** remittance balance (`courier_cash_balances`) |
| Collection UX | Explicit cash settlement screen | Often implicit when order marked **delivered** |
| Fleet Collect / Log Cash | Correct for rideshare Layer B | **Wrong** place to clear Roam COD |
| Weekly settlement week | Core to Fleet Collect | COD is usually a **running balance**; settle is remittance to Roam |

### 5.2 What Delivery COD balance means

On collection:

```
ledgerAmount = platformDue + merchantDue
```

The courier’s own fee/tip retained (`courierRetained`) generally **does not** increase the remittance balance — that is earning kept in pocket, not “owed to Roam.”

Tables:

- `delivery.courier_cash_balances` — balance, pause threshold, pause flag  
- `delivery.courier_cash_events` — `collected` / `settled` / `adjustment`  

Code:

- `recordCashCollection` — when cash order is delivered  
- `recordCashSettlement` — when remittance is recorded (historically Dash admin)  

Pause: if remittance balance exceeds threshold (default often J$10,000), courier can be paused from new offers until settled.

### 5.3 Fleet Courier Settlements today

`CourierSettlementsPage` shows:

- Delivery earnings summary (from rush delivery trips)  
- COD balances **read-only**  

Fleet is **not** supposed to Log Cash against Roam’s COD receivable. Copy in product: Roam owns remittance; fleet can observe exposure.

### 5.4 Known production risks (read before building)

From pricing/COD audits:

- COD ledger historically under-fired (cash orders not entering `pending_collection` / no events).  
- Collection may lack strong idempotency on `order_id`.  
- Partial settle may clear pause even if balance remains.  
- Projecting full bag `cashCollected` into Fleet weekly “cash held” can **inflate** driver↔fleet cash if not guarded.

Treat these as **prerequisites**, not polish.

---

## Part 6 — Target architecture for Delivery (how to build it right)

### 6.1 Principles (parity of integrity, not clone of UI)

1. **Keep COD as platform remittance (Layer A′), not Fleet Layer B.**  
2. **Separate three money objects:** customer bag total ≠ remittance liability ≠ courier earning.  
3. **Explicit collection** when possible (amount confirmed), with shortfall ops path — do not invent a full rider-style wallet unless product needs change credits.  
4. **Idempotent collect** per order.  
5. **Settlement owned by Roam** (Dash / Lynk / bank), with pause recomputed from **remaining** balance.  
6. **Fleet may observe**, never write off Roam COD via Driver Settlements Collect.  
7. **Courier UX** should show: collect amount, remittance owing, pause progress — separate from earnings/payouts.  
8. Do **not** enable “Rideshare | Delivery” on the rideshare Log Cash wizard until Delivery Layer A is trustworthy and Layer B remittance has a real home.

> **Part 6 is the "why". Parts 11–19 are the "how".**
> A code-level audit of the current COD implementation and a phased build plan
> were added on 2026-09-15. Read Part 11 before writing any code.

### 6.2 Suggested build order

1. Document Delivery money rules (sibling to `MONEY_LEDGER_RULES.md`).  
2. Fix COD collection so every cash delivery writes ledger events (COD-1 class bugs).  
3. Harden settle + pause semantics.  
4. Courier-facing remittance UI + admin settle.  
5. Fleet read-only desk stays observational (or gains deep-links, not Collect writes).  
6. Only then consider a unified “Cash intake” shell that **routes** to the correct backend.

### 6.3 What “Rideshare | Delivery” in one Log Cash overlay would get wrong

If product adds a service picker on **Driver Settlements → Log Cash** and reuses Settlement Weeks for Delivery COD:

- You would apply remittance to the wrong counterparty (fleet vs Roam).  
- You would mix weekly driver↔fleet residuals with order remittance liability.  
- Mixed rideshare+delivery weeks already share **one** `driver_financial_periods` row per driver per Monday — collect hits the **combined** residual today.

That is the unstable architecture this analysis exists to prevent.

---

## Part 7 — Worked examples

### Example A — Exact cash ride (fleet driver)

1. Fare owed: J$1,000. Passenger gives J$1,000.  
2. Layer A: collection + fare allocation; wallets settle cleanly; rider wallet unchanged.  
3. Fleet week: +J$1,000 passenger cash collected.  
4. Driver brings J$1,000 to office → Log Cash tagged to that week → Cash Returned ↑.  
5. Roam Cash/Digital/Debt chips are **not** the thing Log Cash clears.

### Example B — Overpay

1. Fare J$1,000; passenger gives J$1,200.  
2. Change J$200 credited to rider wallet.  
3. Funded from driver Digital if available; else Debt opens.  
4. Fleet still sees passenger cash based on physical cash received rules for Layer B.  
5. Change economics live in Layer A; office remittance is still Layer B.

### Example C — Manual Start Trip only

1. Driver logs a Start Trip in Fleet (no Rider app).  
2. Layer A wallets: **no change** (correct).  
3. Layer B: trip appears in Fleet cash/earnings.  
4. Remittance still via Fleet Log Cash / weekly desk.

### Example D — Delivery COD

1. Customer pays J$2,500 cash for an order.  
2. Suppose remittance due to Roam (platform + merchant) = J$2,200; courier retains J$300 earning.  
3. `courier_cash_balances` increases by ~J$2,200 — **not** J$2,500.  
4. Settling that balance is Roam remittance, **not** Fleet Driver Settlements Log Cash for a rideshare week.

---

## Part 8 — Glossary

| Term | Meaning |
|------|---------|
| **Minor units** | Integer cents (JMD × 100) in rides journals |
| **Settlement Week** | Fleet Monday–Sunday period keyed by `period_anchor` |
| **Cash Returned** | Money logged as remitted to fleet for a week (Log Cash) |
| **Cash still held** | Passenger cash still attributed as with the driver for the week |
| **Collect** | Desk direction: money driver owes fleet |
| **Pay** | Desk direction: money fleet owes driver |
| **COD** | Cash on delivery — customer pays courier in cash for an order |
| **Remittance** | Portion of COD the courier must turn in to Roam (platform + merchant) |
| **Idempotency key** | Client key so retries do not double-post money |
| **Layer A / B / C** | See Part 1 |

---

## Part 9 — Checklist for new teammates

Before you change any cash UI or API, confirm:

- [ ] Am I touching Layer A (trip wallets) or Layer B (fleet week) or Delivery COD?  
- [ ] Will this screen mix two layers’ numbers?  
- [ ] For Collect vs Pay — am I using the correct direction?  
- [ ] For Delivery — am I clearing Roam remittance or fleet weekly cash?  
- [ ] Is the money event idempotent?  
- [ ] Did I read `MONEY_LEDGER_RULES.md` for hard rules?

If any answer is unclear, stop and ask. Cash bugs are expensive and hard to reverse.

---

## Part 10 — Document history

| Date | Change |
|------|--------|
| 2026-09-15 | Initial onboarding guide from architecture analysis (rideshare Layer A/B, three wallets, Fleet Log Cash, Delivery COD contrast, build recommendations) |
| 2026-09-15 | Added Parts 11–19: code-level audit of the live COD implementation (24 findings), the Layer A′ separation contract, target data model, server/UI architecture, 7-phase build plan, test matrix, rollout + rollback |

**Owners:** Platform / Fleet finance engineering + product  
**Source analysis:** Cross-repo review of rides cashSettlement, fleet settlements, delivery courier cash ledger, and existing money docs

---
---

# IMPLEMENTATION PLAN — Delivery Remittance (Layer A′)

**Added:** 2026-09-15  
**Audience:** Engineers implementing Part 6  
**Status:** Plan only — no code written yet  
**Hard constraint from product:** Build this **alongside** Driver Settlements, never **inside** it. Driver Settlements is in active production use and must not regress.

---

## Part 11 — Audit of what exists today

Everything below was verified against the working tree, not assumed. Each finding carries a file reference so you can confirm it yourself before changing anything.

### 11.1 The current COD surface (complete inventory)

| Piece | Location | State |
|-------|----------|-------|
| Ledger logic | [`courierCashLedger.ts`](../supabase/functions/delivery/courierCashLedger.ts) | 275 lines, the entire COD engine |
| Tables | [`20260823120000_dash_pricing_engine.sql:100-123`](../supabase/migrations/20260823120000_dash_pricing_engine.sql) | `courier_cash_balances`, `courier_cash_events` |
| Backfill | [`20260827100000_pricing_commission_rollout.sql:29-135`](../supabase/migrations/20260827100000_pricing_commission_rollout.sql) | One-time PL/pgSQL loop |
| Split math | [`codBalance.ts`](../packages/dash-pricing/src/codBalance.ts) + edge mirror `_shared/dashPricing.ts` | `computeCodTrialBalance` / `assertCodTrialBalance` |
| Collection trigger | [`courierCashLedger.ts:155`](../supabase/functions/delivery/courierCashLedger.ts) `handleOrderDelivered` | Called from 3 places |
| Pause gate | [`courierConsumerRoutes.ts:597`](../supabase/functions/delivery/courierConsumerRoutes.ts) | **1 of 3** accept paths |
| Admin API | [`pricingRoutes.ts:1216-1272`](../supabase/functions/delivery/admin/pricingRoutes.ts) | balances / events / settle |
| Admin UI | [`PricingHubPage.tsx:1027`](../packages/dash-admin/src/pages/pricing/PricingHubPage.tsx) | Raw form inside a 3,820-line page |
| Fleet read | [`rush_settlement_routes.ts:25`](../supabase/functions/_fleet-server/rush_settlement_routes.ts) | Org-scoped, read-only ✅ |
| Fleet UI | [`CourierSettlementsPage.tsx`](../apps/fleet/src/components/couriers/CourierSettlementsPage.tsx) | 173 lines, read-only ✅ |
| Courier UI | — | **Does not exist** |
| Reconciliation | — | **Does not exist** |

Two things in that table are already right and must be preserved: the Fleet read path is genuinely org-scoped and read-only, and it has no write endpoint. Do not "improve" it into a writer.

### 11.2 Findings

Severity: **C** = will corrupt money, **H** = will lose auditability or block safe operation, **M** = usability / hygiene.

#### C-1 — Collection is not idempotent

`recordCashCollection` ([`courierCashLedger.ts:36`](../supabase/functions/delivery/courierCashLedger.ts)) performs no duplicate check. `backfillCashLedgerForOrder` checks `courier_cash_events` for an existing `order_id` (line 258) — the **live** path through `handleOrderDelivered` does not. Any retry, replay, or double status write posts the remittance twice.

#### C-2 — Balance mutation is a read-modify-write race

Both `recordCashCollection` (lines 45–74) and `recordCashSettlement` (lines 107–126) do `select` → compute in JS → `update`. There is no transaction and no lock. Two deliveries completing concurrently for the same courier will read the same `currentBalance` and the second write silently discards the first. **This is not fixable in edge code** — PostgREST gives you no multi-statement transaction. It has to move into the database.

#### C-3 — Settlement always clears the pause

```ts
// courierCashLedger.ts:118-122
.update({ balance_jmd: balanceAfter, is_paused: false, paused_at: null, ... })
```

A J$1 settlement against a J$40,000 balance un-pauses the courier. This is the exact risk Part 5.4 predicted, and it is unconditional.

#### C-4 — Settlement cannot create a missing account row

Line 116 guards the balance update with `if (existing)`, but the event insert at line 128 is unguarded. Settling a courier with no balance row writes an event and updates nothing — permanent divergence between the event stream and the balance.

#### C-5 — Over-settlement is silently absorbed

`Math.max(0, currentBalance - amountJmd)` (line 114) clamps to zero and returns success. Settling J$50,000 against a J$5,000 balance reports `{ balanceAfter: 0 }` with no error, and J$45,000 of unexplained credit disappears from the receivable. The event records `-50000` while the balance moved `-5000`.

#### C-6 — The full customer bag total leaks into Driver Settlements

This is the finding that matters most for the separation constraint.

```ts
// _shared/orderToFleetTrip.ts:41-43
const cashCollected = paymentMethod === "Cash" && !isCancelled ? Number(order.total ?? 0) : 0;
const netPayout = amount - cashCollected;
```

The **entire customer payment** is projected onto the fleet trip as `cashCollected`. From there:

```
order.total (J$2,500)
  └→ fleet trip .cashCollected
     └→ getTripPhysicalCashCollected()          tripPhysicalCash.ts:23
        └→ nonUberTripCash                      periodShareCash.ts:234
           └→ passengerCash                     periodShareCash.ts:243
              └→ driver_financial_periods.cash_collected
                 └→ cash_still_held
                    └→ Driver Settlements residual → Collect / Log Cash
```

`computeWeeklyCashBase` applies **no service-line filter** — `rush_delivery` trips are counted as passenger cash. Two consequences:

1. Roam's J$2,200 receivable is simultaneously booked as cash the courier owes the **fleet**. The same physical bills are counted in two ledgers with two different creditors.
2. `netPayout = courierEarning − bagTotal` goes deeply negative (≈ J$300 − J$2,500), making the courier look thousands in debt to the fleet.

Mitigating fact: `RUSH_TRIP_PROJECTION` and `RUSH_SETTLEMENT` both default **off** ([`feature_flags.ts:386,391`](../supabase/functions/_fleet-server/feature_flags.ts)), so this is latent rather than live. It is nonetheless the hard blocker on ever turning them on, and it is the single point where the two systems touch.

#### C-7 — The pause gate is bypassable

`isCourierCashPaused` is called from exactly one route. These two accept the same work with no COD check:

- [`courierConsumerRoutes.ts:1374`](../supabase/functions/delivery/courierConsumerRoutes.ts) — `POST /courier/offers/stack/accept`
- [`index.ts:1743`](../supabase/functions/delivery/index.ts) — `POST /orders/:id/accept-delivery`

Both call `requireActiveCourier` and stop there. The only control limiting COD exposure is optional in practice.

#### C-8 — A trial-balance mismatch breaks order completion

`computeCodLedgerAmounts` calls `assertCodTrialBalance`, which **throws** (line 240). `handleOrderDelivered` is awaited with no `try/catch` at either call site ([`index.ts:1352`](../supabase/functions/delivery/index.ts), [`index.ts:1444`](../supabase/functions/delivery/index.ts)). The order row is already updated to `delivered` before the throw, so a penny of rounding drift yields: order delivered, payment_status possibly flipped, no ledger event, 500 to the courier's phone, and no retry. Silent revenue loss with a visible error.

#### C-9 — Non-positive remittance writes nothing and reports a false balance

```ts
// courierCashLedger.ts:41-43
if (ledgerAmount <= 0) return { balanceAfter: 0, isPaused: false };
```

`deliveryFeePlatformAmount` is deliberately **signed** ([`codBalance.ts:50`](../packages/dash-pricing/src/codBalance.ts) — "promo/subsidy may be negative"), so a subsidised low-subtotal order can reach this branch. Two bugs in one line: no event is written (the order looks unprocessed forever, and the backfill will keep retrying it), and the function reports `balanceAfter: 0` for a courier who may be holding J$9,000.

#### C-10 — Money is floating point

COD uses `numeric` columns with `Math.round(v * 100) / 100` in JS. Rides uses `bigint` minor units ([`20260618120000_cash_settlement_wallet.sql:36`](../supabase/migrations/20260618120000_cash_settlement_wallet.sql) — `balance_minor BIGINT`). The rides model is correct; COD will accumulate drift across thousands of orders.

#### H-1 — Deleting a user destroys financial history

`courier_id uuid ... REFERENCES auth.users(id) ON DELETE CASCADE` on **both** tables. A courier account deletion silently erases the balance and every event, including settled ones.

#### H-2 — Deleting an order orphans events and breaks idempotency

`order_id ... ON DELETE SET NULL`. The orphaned event survives with a null `order_id`, at which point both `backfillCashLedgerForOrder`'s `NOT EXISTS` check and the migration backfill's `NOT EXISTS` clause stop seeing it — and will re-post the collection. (Same failure class as the `toll_usage` orphan-event problem.)

#### H-3 — No unique constraint on collections per order

Idempotency is enforced only by application-level `NOT EXISTS` checks in two of three code paths. Nothing in the schema prevents duplicates.

#### H-4 — The trial balance is asserted but never persisted

`CashCollectionInput` accepts `collectedAmountJmd` and never writes it. `courierRetainedJmd` reaches `metadata` as JSON text, not a column. The three-way invariant (bag = remittance + retained) can be checked at write time and never again.

#### H-5 — No reconciliation anywhere

`balance_after` is a client-computed snapshot. Nothing compares `courier_cash_balances.balance_jmd` against `SUM(courier_cash_events.amount_jmd)`. Nothing looks for delivered cash orders with no collection event. `finance-recon` has zero COD coverage. Given C-1, C-2, C-4, C-5 and C-9, drift is not hypothetical.

#### H-6 — No reversal path

A wrong settlement can only be fixed by a compensating `adjustment` with no link to what it corrects, or by direct SQL.

#### H-7 — Settlement has no idempotency key, no concurrency control, no receipt

`POST /admin/pricing/cod/settle` ([`pricingRoutes.ts:1240`](../supabase/functions/delivery/admin/pricingRoutes.ts)) takes courier + amount + method. A double-click posts twice. There is no reference number, no evidence attachment, and no version check against the balance the admin was looking at.

#### H-8 — Two engines compute platform/merchant due, with no contract

- Ledger: `computeCodTrialBalance` (commission + service fee + signed delivery platform share + GCT + small-order fee)
- Fleet display: [`orderToFleetTrip.ts:187-188`](../supabase/functions/_shared/orderToFleetTrip.ts) — `snap.platform_fee` and `snap.merchant_receivable` straight off the pricing snapshot

These will disagree, and `fleet_delivery_details` is what a fleet owner actually reads.

#### M-1 — Couriers have no COD interface at all

No file under `apps/dash-courier/src` references the balance, the threshold, or the pause. A paused courier receives:

> "Your account is paused — settle your COD cash balance before accepting new deliveries."

with no screen showing the amount, no history, and no way to settle. Their income stops at a dead end.

#### M-2 — The settle control is a bare UUID form

`handleSettle` ([`PricingHubPage.tsx:1027`](../packages/dash-admin/src/pages/pricing/PricingHubPage.tsx)) requires pasting a courier UUID, shows no current balance at the moment of settling, has no confirmation step, and lives inside a 3,820-line page about pricing.

#### M-3 — RLS is on with no policies

Both tables are `ENABLE ROW LEVEL SECURITY` with `GRANT ALL ... TO service_role` and no policy. Correct default, but it means every courier-facing read must be edge-mediated. Plan for that rather than discovering it later.

#### M-4 — `settlement_method` is unconstrained free text

No CHECK, no enum. `"Lynk"`, `"lynk"`, and `"LYNK "` will all land and will not group in reporting.

### 11.3 What the audit got right, and what it understated

Part 5.4 listed four risks. All four are confirmed. Two were understated:

- *"Collection may lack strong idempotency"* — it has **none** on the live path (C-1), and the DB cannot enforce it (H-3).
- *"Projecting full bag `cashCollected` ... can inflate driver↔fleet cash if not guarded"* — there is no guard, and the inflation path runs all the way to the Collect button (C-6).

Three risks the audit did not name are equally serious: the balance race (C-2), the throwing assertion on the delivery hot path (C-8), and the bypassable pause gate (C-7).

---

## Part 12 — Design decisions

### 12.1 Name the thing: Layer A′, "Delivery Remittance"

COD is a **courier ↔ Roam remittance receivable**, not a wallet and not a weekly settlement. It gets its own layer name so that nobody has to reason by analogy:

| | Layer A (rides) | **Layer A′ (delivery)** | Layer B (fleet) |
|--|----------------|------------------------|-----------------|
| Counterparties | rider ↔ driver ↔ Roam | **courier ↔ Roam** | driver ↔ fleet owner |
| Shape | 3 wallets + rider wallet | **1 running balance** | weekly period rows |
| Time | per trip | **continuous** | Monday–Sunday |
| Clearing verb | *settle the trip* | **remit** | *collect / pay* |
| Owns the receivable | Roam | **Roam** | fleet owner |

### 12.2 The separation contract

"Separate" has to mean more than "different files", or the two systems will grow back together the first time someone is in a hurry. Each rule below has an enforcement mechanism that fails a build or a query — not a convention.

| # | Rule | Enforced by |
|---|------|-------------|
| S-1 | Delivery COD never contributes to `driver_financial_periods.cash_collected` | Projection writes `cashCollected: 0` for delivery orders **and** `computeWeeklyCashBase` skips `serviceLine === 'rush_delivery'`; a fixture test asserts a delivered COD order moves the weekly cash base by exactly 0 |
| S-2 | No Fleet code path writes to remittance tables | Remittance RPC is `SECURITY DEFINER`, granted to the delivery service role only; `_fleet-server` has no grant. A grep test fails the build if `_fleet-server/**` references `courier_remittance_*` outside a read view |
| S-3 | Remittance never uses Settlement Week vocabulary | Vocabulary lint test: `collect`, `log cash`, `period_anchor`, `settlement_week`, `cash_returned`, `cash_still_held` are forbidden identifiers under `delivery/remittance/**` |
| S-4 | Driver Settlements vocabulary never used for remittance UI | Same lint, reversed: `remit`, `remittance` forbidden in `apps/fleet/src/components/fleet-financials/**` |
| S-5 | Fleet may read remittance, never mutate it | Fleet reads go through one org-scoped read view; no `INSERT`/`UPDATE` grant exists to reach |
| S-6 | New code lives in new files | All new server code under `supabase/functions/delivery/remittance/`; all new UI under `apps/dash-courier/src/pages/remittance/` and `packages/dash-admin/src/pages/remittance/`. Zero files under `fleet-financials/` are edited |

**S-6 is the one that protects your production Driver Settlements desk.** The entire build touches no file in `apps/fleet/src/components/fleet-financials/`.

### 12.3 The one exception, stated plainly

S-1 needs a change in territory adjacent to Driver Settlements. Be deliberate about it:

**Required (delivery-owned, safe):** `_shared/orderToFleetTrip.ts` line 41 — a COD order must project `cashCollected: 0`, because the fleet never receives that cash. This file is the delivery→fleet projection, not a Driver Settlements file. `netPayout` then correctly becomes the courier's delivery earning.

**Recommended (finance-core, additive):** a `serviceLine === 'rush_delivery'` skip inside `computeWeeklyCashBase` as a second line of defence, so a bad row can never reach the weekly math even if a future writer regresses.

**Why it is safe to do now:** `RUSH_TRIP_PROJECTION` is off, so no `rush_delivery` trip exists in any production fleet period. Prove it before you ship, don't assume it:

```sql
-- Must return 0. If it does not, STOP and reconcile before changing the math.
SELECT count(*), coalesce(sum(cash_collected_delta), 0) FROM (
  SELECT t.id,
         CASE WHEN lower(t.payment_method) = 'cash'
              THEN coalesce(t.cash_collected, 0) ELSE 0 END AS cash_collected_delta
  FROM fleet_trips t
  WHERE t.service_line = 'rush_delivery'
    AND lower(coalesce(t.status, '')) NOT LIKE '%cancel%'
) s;
```

If it returns 0, both changes are provable no-ops on current data and can ship in Phase 0. If it returns anything else, those periods are already wrong and need reconciling first.

### 12.4 Decisions taken (and the reasoning)

**D-1 — Integer minor units.** `bigint` cents, matching rides. Fixes C-10. Since this is a fresh table, do it now rather than migrating later.

**D-2 — Pause is a computed property, never a stored decision.**

```sql
is_paused boolean GENERATED ALWAYS AS (balance_minor >= pause_threshold_minor) STORED
```

C-3 (partial settle clears pause) becomes **unrepresentable**. There is no code path that can set `is_paused` incorrectly, because there is no code path that sets it at all.

**D-3 — All balance mutation goes through one `SECURITY DEFINER` Postgres function.** This is the only way to get `SELECT ... FOR UPDATE` + insert + update atomically from an edge function. It fixes C-2 structurally and gives a single place to enforce idempotency (C-1), overdraw refusal (C-5), and account auto-creation (C-4).

**D-4 — Events are append-only; corrections are reversals.** No `UPDATE` and no `DELETE` on the events table, enforced by a trigger. Fixes H-6 and makes the ledger genuinely auditable.

**D-5 — Persist all three money objects per collection.** `bag_total_minor`, `platform_due_minor`, `merchant_due_minor`, `courier_retained_minor`. The trial balance becomes a standing SQL check instead of a write-time assertion. Fixes H-4, and turns C-8's throw into a query.

**D-6 — Refuse before the irreversible step.** Every validation (overdraw, idempotency, trial balance, courier existence) runs *before* any row is written. A refused operation writes nothing at all.

**D-7 — Collection never breaks delivery.** `handleOrderDelivered` moves to: try to post; on any failure, write an `exception` row to a parking table and return normally. The courier's delivery always completes. The exception queue is drained by ops, and its depth is a monitored metric. Fixes C-8 without hiding the problem.

**D-8 — No netting against earnings payouts in v1.** `payments.courier_payouts` (earnings Roam owes the courier) and remittance (money the courier owes Roam) stay separate ledgers. Netting is the exact cross-ledger coupling this design exists to prevent. "Settle from my next payout" can be added later as an explicit action that writes one event in each ledger with a shared correlation id. See Part 19.

---

## Part 13 — Target data model

All objects live in the `delivery` schema. Nothing is added to `ledger` or `fleet`.

### 13.1 `delivery.courier_remittance_accounts`

```sql
CREATE TABLE delivery.courier_remittance_accounts (
  courier_id            uuid PRIMARY KEY
                          REFERENCES auth.users(id) ON DELETE RESTRICT,  -- H-1
  balance_minor         bigint  NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  pause_threshold_minor bigint  NOT NULL DEFAULT 1000000,                -- J$10,000
  -- D-2: pause cannot be set wrongly because it cannot be set at all
  is_paused             boolean GENERATED ALWAYS AS
                          (balance_minor >= pause_threshold_minor) STORED,
  paused_since          timestamptz,           -- stamped by trigger on false→true
  lifetime_collected_minor bigint NOT NULL DEFAULT 0,
  lifetime_settled_minor   bigint NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'JMD',
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);
```

`ON DELETE RESTRICT` is deliberate: a courier with a non-zero balance cannot be deleted out of the books. Account closure is an ops procedure that settles or writes off first.

### 13.2 `delivery.courier_remittance_events`

```sql
CREATE TABLE delivery.courier_remittance_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id          uuid NOT NULL REFERENCES delivery.courier_remittance_accounts(courier_id)
                        ON DELETE RESTRICT,
  idempotency_key     text NOT NULL,
  event_type          text NOT NULL CHECK (event_type IN
                        ('collected','settled','adjustment','reversal','write_off')),

  amount_minor        bigint NOT NULL,          -- signed: + increases owing, - reduces
  balance_before_minor bigint NOT NULL,
  balance_after_minor  bigint NOT NULL,

  -- D-5: the three money objects, as columns
  order_id            uuid REFERENCES delivery.orders(id) ON DELETE RESTRICT,  -- H-2
  order_ref           text,                     -- survives even if the FK is ever relaxed
  bag_total_minor        bigint,
  platform_due_minor     bigint,
  merchant_due_minor     bigint,
  courier_retained_minor bigint,

  settlement_id       uuid REFERENCES delivery.courier_remittance_settlements(id),
  reversal_of         uuid REFERENCES delivery.courier_remittance_events(id),

  actor_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type          text NOT NULL DEFAULT 'system'
                        CHECK (actor_type IN ('system','admin','courier','ops','migration')),
  notes               text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT remittance_balance_arithmetic
    CHECK (balance_after_minor = balance_before_minor + amount_minor),
  CONSTRAINT remittance_collection_sign
    CHECK (event_type <> 'collected' OR amount_minor >= 0),
  CONSTRAINT remittance_settlement_sign
    CHECK (event_type <> 'settled'   OR amount_minor <= 0),
  CONSTRAINT remittance_trial_balance
    CHECK (event_type <> 'collected' OR bag_total_minor IS NULL
           OR bag_total_minor = platform_due_minor + merchant_due_minor
                              + courier_retained_minor)
);

CREATE UNIQUE INDEX ux_remittance_idem
  ON delivery.courier_remittance_events(idempotency_key);                -- C-1

CREATE UNIQUE INDEX ux_remittance_one_collection_per_order
  ON delivery.courier_remittance_events(order_id)
  WHERE event_type = 'collected';                                        -- H-3

CREATE INDEX ix_remittance_courier_time
  ON delivery.courier_remittance_events(courier_id, created_at DESC);
```

`remittance_balance_arithmetic` and `remittance_trial_balance` are the important ones: they make a broken ledger row **impossible to insert**, rather than something a nightly job discovers.

Append-only is enforced with a trigger that raises on `UPDATE` or `DELETE` (D-4).

### 13.3 `delivery.courier_remittance_settlements`

The receipt envelope, so a settlement is a document rather than a bare number (H-7).

```sql
CREATE TABLE delivery.courier_remittance_settlements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         text UNIQUE NOT NULL,      -- human-quotable: RMT-2026-000417
  courier_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_minor      bigint NOT NULL CHECK (amount_minor > 0),
  method            text NOT NULL CHECK (method IN
                      ('lynk','bank_transfer','cash_office','wipay','payout_offset','other')),  -- M-4
  status            text NOT NULL DEFAULT 'posted'
                      CHECK (status IN ('posted','reversed')),
  evidence_url      text,
  external_ref      text,
  balance_before_minor bigint NOT NULL,
  notes             text,
  recorded_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

### 13.4 `delivery.courier_remittance_exceptions`

The parking table for D-7 — collections that could not be posted.

```sql
CREATE TABLE delivery.courier_remittance_exceptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL,
  courier_id   uuid,
  reason       text NOT NULL,       -- trial_balance_mismatch | non_positive | rpc_error | no_courier
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts     integer NOT NULL DEFAULT 1,
  resolved_at  timestamptz,
  resolved_by  uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);
```

`SELECT count(*) FROM delivery.courier_remittance_exceptions WHERE resolved_at IS NULL` is a first-class ops metric. It must be zero.

### 13.5 The one mutation function

Everything that moves the balance calls this. Nothing else has write grants.

```sql
CREATE OR REPLACE FUNCTION delivery.apply_remittance_event(
  p_courier_id uuid,
  p_event_type text,
  p_amount_minor bigint,
  p_idempotency_key text,
  p_order_id uuid DEFAULT NULL,
  p_bag_total_minor bigint DEFAULT NULL,
  p_platform_due_minor bigint DEFAULT NULL,
  p_merchant_due_minor bigint DEFAULT NULL,
  p_courier_retained_minor bigint DEFAULT NULL,
  p_settlement_id uuid DEFAULT NULL,
  p_reversal_of uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_notes text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS delivery.courier_remittance_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path = delivery, public AS $$
DECLARE
  v_existing delivery.courier_remittance_events;
  v_before bigint; v_after bigint;
  v_row delivery.courier_remittance_events;
BEGIN
  -- 1. Idempotent replay returns the original result. Not an error. (C-1)
  SELECT * INTO v_existing FROM delivery.courier_remittance_events
   WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  -- 2. Ensure the account exists, then lock it. (C-2, C-4)
  INSERT INTO delivery.courier_remittance_accounts (courier_id)
  VALUES (p_courier_id) ON CONFLICT (courier_id) DO NOTHING;

  SELECT balance_minor INTO v_before
    FROM delivery.courier_remittance_accounts
   WHERE courier_id = p_courier_id
     FOR UPDATE;                      -- serializes every concurrent writer

  v_after := v_before + p_amount_minor;

  -- 3. Refuse BEFORE writing anything. (C-5, D-6)
  IF v_after < 0 THEN
    RAISE EXCEPTION
      'remittance_overdraw: balance %, requested %', v_before, p_amount_minor
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. Append the event, then move the balance. Both or neither.
  INSERT INTO delivery.courier_remittance_events (
    courier_id, idempotency_key, event_type, amount_minor,
    balance_before_minor, balance_after_minor, order_id, order_ref,
    bag_total_minor, platform_due_minor, merchant_due_minor,
    courier_retained_minor, settlement_id, reversal_of,
    actor_id, actor_type, notes, metadata
  ) VALUES (
    p_courier_id, p_idempotency_key, p_event_type, p_amount_minor,
    v_before, v_after, p_order_id, p_order_id::text,
    p_bag_total_minor, p_platform_due_minor, p_merchant_due_minor,
    p_courier_retained_minor, p_settlement_id, p_reversal_of,
    p_actor_id, p_actor_type, p_notes, p_metadata
  ) RETURNING * INTO v_row;

  UPDATE delivery.courier_remittance_accounts SET
    balance_minor = v_after,
    lifetime_collected_minor = lifetime_collected_minor
      + GREATEST(p_amount_minor, 0),
    lifetime_settled_minor = lifetime_settled_minor
      + GREATEST(-p_amount_minor, 0),
    updated_at = now()
  WHERE courier_id = p_courier_id;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION delivery.apply_remittance_event FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.apply_remittance_event TO service_role;  -- S-2
```

Idempotency-key format — deterministic, so a replay produces the same key:

| Event | Key |
|-------|-----|
| Collection | `cod:collect:v1:{order_id}` |
| Settlement | `cod:settle:v1:{settlement_id}` |
| Reversal | `cod:reverse:v1:{original_event_id}` |
| Adjustment | `cod:adjust:v1:{client_uuid}` |
| Write-off | `cod:writeoff:v1:{client_uuid}` |

### 13.6 Reconciliation views (H-5)

```sql
-- Balance vs the event stream. Must always be empty.
CREATE VIEW delivery.v_remittance_drift AS
SELECT a.courier_id,
       a.balance_minor AS account_balance_minor,
       coalesce(sum(e.amount_minor), 0) AS event_sum_minor,
       a.balance_minor - coalesce(sum(e.amount_minor), 0) AS drift_minor
FROM delivery.courier_remittance_accounts a
LEFT JOIN delivery.courier_remittance_events e USING (courier_id)
GROUP BY a.courier_id, a.balance_minor
HAVING a.balance_minor <> coalesce(sum(e.amount_minor), 0);

-- Delivered cash orders with no collection event. Must always be empty. (C-9)
CREATE VIEW delivery.v_remittance_missing_collections AS
SELECT o.id AS order_id, o.courier_id, o.total, o.delivered_at
FROM delivery.orders o
WHERE o.payment_method = 'cash'
  AND o.status IN ('delivered','completed')
  AND o.courier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM delivery.courier_remittance_events e
     WHERE e.order_id = o.id AND e.event_type = 'collected')
  AND NOT EXISTS (
    SELECT 1 FROM delivery.courier_remittance_exceptions x
     WHERE x.order_id = o.id AND x.resolved_at IS NULL);

-- Trial balance per collection. Must always be empty. (H-4, C-8)
CREATE VIEW delivery.v_remittance_trial_balance_breaks AS
SELECT id, order_id, bag_total_minor,
       platform_due_minor + merchant_due_minor + courier_retained_minor AS split_sum_minor
FROM delivery.courier_remittance_events
WHERE event_type = 'collected' AND bag_total_minor IS NOT NULL
  AND bag_total_minor <> platform_due_minor + merchant_due_minor
                       + courier_retained_minor;
```

All three feed `finance-recon` and page when non-empty. A fourth check enforces S-1:

```sql
-- Delivery cash must never appear as fleet-held passenger cash. Must return 0.
SELECT coalesce(sum(cash_collected), 0)
FROM fleet_trips
WHERE service_line = 'rush_delivery';
```

---

## Part 14 — Server architecture

### 14.1 New module layout

```
supabase/functions/delivery/remittance/
  remittanceLedger.ts      -- thin RPC wrapper; the ONLY caller of apply_remittance_event
  collectOnDelivery.ts     -- replaces handleOrderDelivered's COD half
  settleRemittance.ts      -- admin settle + reverse
  pauseGate.ts             -- assertCourierNotPaused, single source
  courierRemittanceRoutes.ts  -- courier-facing read + history
  adminRemittanceRoutes.ts    -- admin desk
  exceptions.ts            -- park / list / resolve
  money.ts                 -- toMinor / fromMinor, the ONLY float↔int boundary
```

Nothing under `_fleet-server/` is created or edited (S-6).

### 14.2 Collection, rewritten (C-8, C-9, D-7)

```ts
export async function collectOnDelivery(sb, orderId, courierId) {
  if (!courierId) return { ok: false, reason: 'no_courier' };

  const order = await loadOrder(sb, orderId);
  if (!order || !isCashOrder(order)) return { ok: false, reason: 'not_cod' };

  try {
    const split = computeCodTrialBalance(toInput(order));   // may throw
    assertCodTrialBalance(split, Number(order.total));      // may throw

    const remit = toMinor(split.platformDueJmd) + toMinor(split.merchantDueJmd);

    // C-9: post a zero event rather than returning silently, so the order
    // is provably processed and never re-attempted.
    await postRemittanceEvent(sb, {
      courierId, eventType: 'collected',
      amountMinor: Math.max(0, remit),
      idempotencyKey: `cod:collect:v1:${orderId}`,
      orderId,
      bagTotalMinor: toMinor(order.total),
      platformDueMinor: toMinor(split.platformDueJmd),
      merchantDueMinor: toMinor(split.merchantDueJmd),
      courierRetainedMinor: toMinor(split.courierRetainedJmd),
      metadata: remit <= 0 ? { non_positive_remittance: true } : {},
    });
    return { ok: true };
  } catch (err) {
    // D-7: the delivery always completes. The problem is parked, not swallowed.
    await parkException(sb, orderId, courierId, classify(err), err);
    return { ok: false, reason: 'parked' };
  }
}
```

Two further changes at the call sites:

- **Trigger on the right condition.** Today the COD branch requires `payment_status === 'pending_collection'`. Trigger instead on `payment_method === 'cash'` and the order reaching `delivered`. The `pending_collection` → `paid` flip stays, but is no longer a precondition for the ledger. This is the root of the "COD ledger under-fired" class of bugs.
- **Wrap both call sites** ([`index.ts:1352`](../supabase/functions/delivery/index.ts), [`index.ts:1444`](../supabase/functions/delivery/index.ts)) so no COD failure can ever produce a 500 on delivery completion.

### 14.3 Settlement, rewritten (C-3, C-4, C-5, H-6, H-7)

`POST /admin/remittance/settle`:

```
1. Load account. Reject if absent (never settle a courier with no balance). (C-4)
2. Require idempotency_key from the client. Replay returns the original receipt. (H-7)
3. Require expected_balance_minor — the balance the admin was shown.
   Mismatch → 409 with the current balance. Optimistic concurrency. (H-7)
4. amount_minor > balance_minor → 422 "cannot settle more than owed".
   Over-settlement is refused, never clamped. (C-5)
5. Insert the settlement row (generates the reference).
6. apply_remittance_event(type='settled', amount = -amount_minor, settlement_id).
7. Pause resolves itself — is_paused is generated. Nothing sets it. (C-3)
8. Return the receipt: reference, amount, balance before, balance after, still_paused.
```

`POST /admin/remittance/settlements/:id/reverse` inserts a `reversal` event with `reversal_of` set and flips the settlement to `reversed`. Nothing is ever mutated or deleted (D-4, H-6).

### 14.4 The pause gate, made unbypassable (C-7)

The fix is not "call it in three places" — that just moves the bug to the fourth place. Fold it into the gate every accept path already calls:

```ts
// requireActiveCourier gains a COD check, so a new accept route
// cannot forget it without deliberately opting out.
export async function requireActiveCourier(sb, userId, opts = {}) {
  const base = await checkActiveStatus(sb, userId);
  if (!base.ok) return base;
  if (opts.skipCashGate !== true) {
    const paused = await isCourierRemittancePaused(sb, userId);
    if (paused.isPaused) {
      return { ok: false, status: 403, error: pauseMessage(paused), code: 'cod_cash_paused',
               balanceMinor: paused.balanceMinor, thresholdMinor: paused.thresholdMinor };
    }
  }
  return base;
}
```

Then remove the standalone call at [`courierConsumerRoutes.ts:597`](../supabase/functions/delivery/courierConsumerRoutes.ts) so there is exactly one implementation. A test enumerates every route that accepts delivery work and asserts each returns 403 for a paused courier.

The 403 body now carries the balance and threshold, so the courier app can render a real screen instead of a bare string (M-1).

### 14.5 Endpoint map

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/courier/remittance` | courier | balance, threshold, pause state, progress |
| GET | `/courier/remittance/events` | courier | own history, paginated |
| GET | `/courier/remittance/orders/:id` | courier | per-order breakdown: bag / remit / kept |
| GET | `/admin/remittance/accounts` | admin | desk list, sortable, filter paused |
| GET | `/admin/remittance/accounts/:id` | admin | detail + history + drift flag |
| POST | `/admin/remittance/settle` | admin (write) | guarded settle → receipt |
| POST | `/admin/remittance/settlements/:id/reverse` | admin (write) | reversal |
| POST | `/admin/remittance/adjust` | admin (write) | correction, reason required |
| GET | `/admin/remittance/exceptions` | admin | parking queue |
| POST | `/admin/remittance/exceptions/:id/retry` | admin (write) | re-attempt |
| GET | `/admin/remittance/reconciliation` | admin | the four checks from 13.6 |

All admin writes go through `requireDashWrite` and `writeKvAudit`, matching the existing pattern.

---

## Part 15 — UI / UX

### 15.1 The one UX rule that matters

A courier holding J$8,000 of COD sees a large number. If the screen is ambiguous for even a moment, they will read it as money they have earned. Every surface must make the direction of the debt unmistakable in the **first** line of text, not in a tooltip.

| Say | Never say |
|-----|-----------|
| "Cash to remit to Roam" | "Cash balance" |
| "You're holding J$8,000 for Roam" | "You have J$8,000" |
| "Your earnings: J$2,400 (paid out separately)" | merged with remittance |
| "Remit J$3,000 to go online again" | "Account paused" |

Remittance and earnings must never appear in the same total, on the same card, or in the same colour. Treat them as two different objects that happen to belong to the same person.

### 15.2 Courier app — `apps/dash-courier/src/pages/remittance/`

**Earnings page** gets one card, visually distinct from earnings, that links out. It shows the amount, a threshold progress bar, and nothing else.

```
┌──────────────────────────────────────────┐
│  Cash you're holding for Roam            │
│                                          │
│  J$8,200                                 │
│  ████████████████████░░░░  82%           │
│  J$1,800 before you're paused            │
│                                          │
│  This is not your earnings.              │
│  [ How to remit → ]                      │
└──────────────────────────────────────────┘
```

**Remittance detail page** — the amount, how it built up (per order: bag total → remitted → *you kept*), remittance instructions per method, and a history of past settlements with references.

**Paused state** is a full-screen block, not a toast. It states the amount, how to clear it, and what happens after. It is reachable from the 403 on any accept path, which is why 14.4 returns the balance in the error body.

**Per-order breakdown** — the three-object model made concrete, because this is where a courier's trust is won or lost:

```
Order #4127 · Cash
  Customer paid            J$2,500
  ─────────────────────────────────
  Remit to Roam            J$2,200
  You kept                 J$  300   ← your delivery fee + tip
```

### 15.3 Admin — `packages/dash-admin/src/pages/remittance/RemittanceDeskPage.tsx`

A dedicated page, extracted out of `PricingHubPage` (M-2). Four things it must do that today's form does not:

1. **Courier picker with search** — never paste a UUID.
2. **Show the live balance at the moment of settling**, and send it as `expected_balance_minor` so a stale screen produces a 409 rather than a wrong settlement.
3. **Confirmation step** stating amount, method, resulting balance, and whether the courier stays paused.
4. **Receipt** with a quotable reference, plus a reverse action.

Layout: KPI strip (total outstanding / paused couriers / exceptions open / drift) → exceptions queue if non-empty → account table → detail drawer.

The exceptions queue is deliberately above the account table. An unresolved exception is money not on the books, and it should be the first thing an operator sees.

### 15.4 Fleet — read-only, sharpened

[`CourierSettlementsPage.tsx`](../apps/fleet/src/components/couriers/CourierSettlementsPage.tsx) keeps its current shape and stays read-only. Two copy changes only:

- "COD owed to Roam" → **"Owed to Roam — you cannot collect this"**
- Add: *"This is Roam's receivable. Do not use Driver Settlements → Log Cash for delivery cash."*

No Collect button. No Log Cash. No Settlement Week. Ever. (S-5)

---

## Part 16 — Build phases

Each phase ends at a gate. Do not start the next phase until the gate passes.

### Phase 0 — Guardrails (no behaviour change)

1. Run the S-1 verification query from 12.3. Record the result.
2. `_shared/orderToFleetTrip.ts` — delivery orders project `cashCollected: 0`. (C-6)
3. `computeWeeklyCashBase` — skip `serviceLine === 'rush_delivery'`. (C-6, defence in depth)
4. Fix `fleet_delivery_details` to use `computeCodTrialBalance` instead of raw snapshot fields. (H-8)
5. Add the vocabulary lint test (S-3, S-4) and the `_fleet-server` grep test (S-2).
6. Add the fixture test: a delivered COD order moves the weekly cash base by exactly 0.

**Gate:** Driver Settlements regression suite green. Weekly cash base unchanged for every existing period. The S-1 query returns 0.

> Phase 0 is the only phase that touches shared finance code, and it is provably a no-op while the Rush flags are off. Everything after this is new files only.

### Phase 1 — Ledger core

1. Migration: the four tables, the generated `is_paused`, all constraints, the append-only trigger, `paused_since` trigger.
2. `apply_remittance_event` + grants.
3. The four reconciliation views.
4. `remittanceLedger.ts` RPC wrapper + `money.ts`.
5. Unit + concurrency tests (Part 17).

**Gate:** 200 concurrent collections for one courier produce exactly 200 events and a balance equal to their sum. Replaying all 200 adds nothing.

### Phase 2 — Collection

1. `collectOnDelivery.ts` + exceptions.
2. Trigger on `payment_method === 'cash'` + delivered, not `pending_collection`.
3. Wrap both call sites; delivery can never 500 on a COD failure.
4. **Dual-write** behind `delivery_remittance_dual_write`: write both old and new tables, read old.
5. Drift monitor comparing old balance to new balance per courier.

**Gate:** 14 days of dual-write with zero drift between `courier_cash_balances.balance_jmd` and `courier_remittance_accounts.balance_minor / 100`. Exceptions queue empty or fully triaged.

### Phase 3 — Settlement + pause

1. `settleRemittance.ts` with the seven-step guard (14.3), reversal endpoint.
2. `assertCourierNotPaused` folded into `requireActiveCourier`; standalone call removed. (C-7)
3. Route enumeration test — every accept path 403s for a paused courier.

**Gate:** Partial settlement provably leaves the courier paused. Over-settlement returns 422 and writes nothing. Double-submit returns the same receipt.

### Phase 4 — Courier UX

1. `GET /courier/remittance` + events + per-order.
2. Remittance card on Earnings, detail page, paused screen, order breakdown.
3. 403 bodies carry balance + threshold.

**Gate:** A paused courier can discover the amount, understand why, see how it accumulated, and find out how to clear it — without contacting support. Test this with a real courier, not a screenshot review.

### Phase 5 — Admin desk

1. `RemittanceDeskPage` with picker, live balance, confirm, receipt, reverse.
2. Exceptions queue with retry.
3. Reconciliation panel.
4. Remove `handleSettle` and the COD block from `PricingHubPage`, leaving a deep link.

**Gate:** An operator completes a settlement with no UUID handling. A stale screen produces a 409, not a wrong settlement.

### Phase 6 — Fleet observability

1. Point the fleet read view at the new tables.
2. Copy changes (15.4).

**Gate:** Fleet page shows identical numbers before and after. Still zero write paths.

### Phase 7 — Cutover and retirement

1. Flip `delivery_remittance_read_v2` — reads come from the new ledger.
2. Soak 14 days with both ledgers written.
3. Stop dual-write.
4. Wire the four checks into `finance-recon` with alerting.
5. Rename `courier_cash_balances` / `courier_cash_events` to `*_legacy`, revoke writes, keep for audit. **Do not drop.**
6. Update Part 5 of this document to describe the built system.

**Gate:** 14 days, zero drift, zero unresolved exceptions, reconciliation green daily.

---

## Part 17 — Test and verification plan

"No bugs" is not a wish — it is a specific list of things that must be impossible. Each row maps to a finding.

### 17.1 Ledger invariants (Phase 1)

| Test | Asserts | Finding |
|------|---------|---------|
| 200 parallel collections, one courier | exactly 200 events; balance = Σ amounts | C-2 |
| Replay every key | no new rows; original returned | C-1 |
| Duplicate `order_id` collection | unique index rejects | H-3 |
| `balance_after ≠ before + amount` | CHECK rejects | — |
| `UPDATE` / `DELETE` on events | trigger raises | D-4 |
| Settle > balance | raises `remittance_overdraw`, **no rows written** | C-5, D-6 |
| Settle on absent account | account auto-created; balance and event agree | C-4 |
| Partial settle below threshold | `is_paused` stays true | C-3 |
| Settle to zero | `is_paused` flips false | C-3 |
| Delete a courier with balance | FK RESTRICT blocks | H-1 |
| Delete an order with a collection | FK RESTRICT blocks | H-2 |
| Fuzz: 10k random ops | `v_remittance_drift` empty | H-5 |

### 17.2 Collection (Phase 2)

| Test | Asserts | Finding |
|------|---------|---------|
| Trial-balance mismatch | order stays delivered, no 500, exception parked | C-8 |
| Subsidised order, remit ≤ 0 | zero-value event written, not skipped | C-9 |
| Order never hit `pending_collection` | collection still fires | §5.4 |
| `handleOrderDelivered` called twice | one event | C-1 |
| Property test: 1,000 pricing shapes | bag = platform + merchant + retained, always | H-4 |
| Bag total persisted | `bag_total_minor` non-null on every collection | H-4 |

### 17.3 Separation (Phase 0, re-run every phase)

| Test | Asserts | Rule |
|------|---------|------|
| COD order → weekly cash base | delta is exactly 0 | S-1 |
| COD order → `driver_financial_periods.cash_collected` | unchanged | S-1 |
| Grep `_fleet-server/**` for `courier_remittance_*` writes | none | S-2 |
| Vocabulary lint both directions | clean | S-3, S-4 |
| Fleet role attempts a remittance write | permission denied | S-5 |
| `git diff --stat` on `fleet-financials/**` | empty, Phases 1–7 | S-6 |
| Full Driver Settlements suite | green, every phase | — |

That last-but-one row is worth automating in CI. It is the cheapest possible proof that your production settlement desk was not touched.

### 17.4 Pause (Phase 3)

Enumerate every route that assigns delivery work and assert each 403s for a paused courier. The test derives the route list from the router rather than hardcoding it, so a new accept path added later fails the test until it is considered. (C-7)

### 17.5 End-to-end (Phase 7)

Example D from Part 7, executed against a real stack:

1. Cash order, bag J$2,500. Split: platform+merchant J$2,200, courier retains J$300.
2. Deliver. Assert: balance +J$2,200 (**not** J$2,500); event carries all four money columns; `bag = 2200 + 300`.
3. Assert Fleet weekly cash base moved by **0**.
4. Accumulate past threshold. Assert all three accept paths 403.
5. Partial settle J$1,000. Assert balance J$1,200 and **still paused**.
6. Settle J$1,200. Assert balance 0, unpaused, receipt has a reference.
7. Reverse the second settlement. Assert balance J$1,200, paused again, both events present, nothing mutated.
8. All four reconciliation views empty throughout.

---

## Part 18 — Rollout, flags, rollback

### 18.1 Flags

| Flag | Default | Controls |
|------|---------|----------|
| `delivery_remittance_v2` | off | Master switch |
| `delivery_remittance_dual_write` | off | Write both ledgers (Phase 2) |
| `delivery_remittance_read_v2` | off | Read from new ledger (Phase 7) |
| `delivery_remittance_courier_ui` | off | Courier surfaces |
| `delivery_remittance_pause_v2` | off | New gate in `requireActiveCourier` |

`RUSH_TRIP_PROJECTION` and `RUSH_SETTLEMENT` stay **off** until Phase 0's gate passes. Turning them on before that re-opens C-6.

### 18.2 Rollback

| Phase | Rollback | Data risk |
|-------|----------|-----------|
| 0 | Revert commit | None — provable no-op |
| 1 | Tables unused | None |
| 2 | Flag off → old path only | None; new events remain as a shadow |
| 3 | Flag off → old settle | Settlements posted to the new ledger need replay |
| 4–5 | Flag off → UI hidden | None |
| 6 | Point read view back | None |
| 7 | Flag off → read old | **Requires dual-write still on.** Do not stop dual-write until the soak passes |

The one-way door is step 3 of Phase 7. Everything before it is reversible with a flag.

### 18.3 Ops metrics (alert on all four)

- `v_remittance_drift` row count — must be 0
- `v_remittance_missing_collections` row count — must be 0
- unresolved exceptions — must be 0
- `SELECT sum(cash_collected) FROM fleet_trips WHERE service_line='rush_delivery'` — must be 0

---

## Part 19 — Open product decisions

These change the build and are not an engineer's call. Decide before Phase 3.

**Q1 — Can COD debt be netted against earnings payouts?**  
Recommendation: **no** in v1 (D-8). Add later as an explicit `payout_offset` settlement method that writes one event in each ledger sharing a correlation id, never as an implicit balance transfer.

**Q2 — Is the pause threshold global, per-market, or per-courier?**  
Schema supports per-courier (`pause_threshold_minor` on the account). Needs a product default and an admin control. Currently hardcoded J$10,000 in two places, which will drift.

**Q3 — What happens to a courier who stops working owing money?**  
There is no write-off procedure, no ageing, and no collections policy. `ON DELETE RESTRICT` means they cannot be deleted while owing. Needs a decision, and the `write_off` event type is reserved for it.

**Q4 — Does a fleet owner have any claim on COD cash from their courier?**  
This design says no — Roam owns the receivable and the fleet observes. If product ever says yes, that is a genuine Layer B obligation and needs its own design. Do not solve it by re-opening C-6.

**Q5 — Should couriers be able to self-report a remittance?**  
"I paid via Lynk, reference X" as a pending settlement an admin confirms. Improves the paused-courier dead end considerably. Out of scope for v1; the settlements table has `status` and `external_ref` ready for it.

---

## Part 20 — Summary for the impatient

- The current COD ledger has **10 correctness bugs**, the worst of which is that concurrent deliveries silently lose money (C-2) and the full customer bag total leaks into the Fleet weekly cash base (C-6).
- Both are unfixable in edge code. Balance mutation has to move into a Postgres function with row locking.
- The pause control — the only cap on COD exposure — is bypassable on two of three accept paths (C-7).
- Couriers have **no COD interface whatsoever**, and get a hard 403 with no way to resolve it (M-1).
- The separation from Driver Settlements is achieved by making the coupling impossible, not by discipline: `cashCollected: 0` on delivery projection, a service-line filter in the weekly cash base, no write grants for fleet roles, a vocabulary lint, and a CI check that `fleet-financials/**` has an empty diff.
- Only **Phase 0** touches shared finance code, and it is a provable no-op while the Rush flags are off. Phases 1–7 are new files.
- Two design choices remove whole bug classes rather than fixing instances: `is_paused` as a **generated column** (partial settle can no longer clear the pause), and every validation running **before** the first write (a refused operation writes nothing).  
