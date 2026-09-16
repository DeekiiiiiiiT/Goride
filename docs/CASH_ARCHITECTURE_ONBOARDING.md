# Cash Architecture Onboarding Guide

**Audience:** Brand-new engineers, product managers, and ops teammates  
**Purpose:** Explain how cash moves through Roam — from a passenger handing money to a driver, through wallets, into Fleet, and how Delivery COD is different  
**Status:** Canonical onboarding companion to existing money docs  
**Date:** 2026-09-15  

---

## Table of contents (two audiences)

| Who | Read |
|-----|------|
| Everyone (PM, ops, new eng) | **Parts 1–10** — layers, wallets, Fleet Log Cash, Delivery contrast, examples, glossary |
| Implementers (current truth) | **Part 23** (production authority) + **Part 34** (remittance freeze / final state) |
| Implementers (historical) | **Parts 11–22** — original audit, plan, ship verification (do not treat open items as current); **Parts 27–33** — admin/threshold path to closeout; **Parts 31–32** — AA-1 / AB-1 audits that led to Part 33 |

**Phase 2 note:** Historical backfill from `courier_cash_balances` / `courier_cash_events` into `courier_remittance_*` is a required Phase 2 deliverable (opening balances and/or event replay with audit notes) — not optional polish.

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

### Delivery remittance (Layer A′) — edge env, not org flags

These are **environment variables on the delivery edge function**, not per-org feature flags,
and both are unset in normal operation. Remittance is live and is the sole COD authority.

| Env var | Normal | What it does |
|---------|--------|--------------|
| `DELIVERY_REMITTANCE_OFF=1` | unset | Kill-switch — stops remittance collection writes; **auto-fails over to legacy `courier_cash_*`** so COD is never unrecorded (V-2) |
| `DELIVERY_COD_LEGACY_WRITE=1` | unset | Emergency dual-write — also writes legacy while remittance stays on |

⚠️ **Kill-switch alone is safe for recording:** with remittance off, legacy posts automatically (loud `REMITTANCE_KILL_SWITCH_LEGACY_FAILOVER` log). Use `DELIVERY_COD_LEGACY_WRITE=1` only when you intentionally want **both** ledgers while remittance is still on.

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

### Layer A′ (delivery remittance) — live since the 2026-09-15 cutover

| Concern | Location |
|---------|----------|
| Collect on delivery | `supabase/functions/delivery/remittance/collectOnDelivery.ts` |
| RPC wrapper (only caller of the ledger fn) | `.../remittance/remittanceLedger.ts` |
| Settle + reverse | `.../remittance/settleRemittance.ts` |
| Pause gate (folded into `requireActiveCourier`) | `.../remittance/pauseGate.ts` |
| Exception park / retry / resolve | `.../remittance/exceptions.ts` |
| Minor-unit boundary + idempotency keys | `.../remittance/money.ts` |
| Courier + admin HTTP routes | `.../delivery/courierConsumerRoutes.ts`, `.../delivery/admin/pricingRoutes.ts` |
| Courier UI | `apps/dash-courier/src/pages/remittance/` |
| Admin desk | `packages/dash-admin/src/pages/remittance/RemittanceDeskPage.tsx` |
| Fleet observe-only | `supabase/functions/_fleet-server/rush_settlement_routes.ts` |
| Separation guard (CI) | `scripts/check-remittance-separation.mjs` |

### Tables / stores (mental model)

| Store | Layer | Role |
|-------|-------|------|
| `rides.payment_accounts` / journal entries | A | Wallet balances + double-entry lines |
| `rides.ride_requests` cash fields / snapshot | A | Trip settlement facts |
| `rides.ledger_lines` | A→reporting | Trip cash/earnings lines |
| `delivery.courier_remittance_accounts` | **A′** | COD owing to Roam (minor units); `is_paused` is generated |
| `delivery.courier_remittance_events` | **A′** | Append-only; one collection per order; bag / platform / merchant / retained |
| `delivery.courier_remittance_settlements` | **A′** | Settle receipts — `pending` → `posted` / `void` / `reversed` |
| `delivery.courier_remittance_exceptions` | **A′** | Collections that could not post; must be drained to zero |
| `delivery.courier_cash_*` | A′ (retired) | Legacy COD — audit-only, not written |
| Fleet trips / `fleet_trips` | B input | Synced / imported trips. **Delivery trips always carry `cashCollected: 0`** — COD is Roam's receivable, never fleet-held cash |
| `ledger.driver_financial_periods` | B | Weekly cash_collected / returned / still held / settlement |
| `ledger.settlement_movements` | B | Collect / pay / write-off movements |

---

## Part 5 — Delivery COD (different product)

> **Production authority (2026-09-15 cutover):** Layer A′ remittance
> (`delivery.courier_remittance_*` + `apply_remittance_event`) is the **only** live COD
> ledger. Legacy `courier_cash_*` is read-only audit (emergency write only via
> `DELIVERY_COD_LEGACY_WRITE=1`). Kill remittance writes with `DELIVERY_REMITTANCE_OFF=1`.
> Admin settle: Remittance Desk. Fleet: observe-only. Do not use Driver Settlements Collect for COD.

### 5.1 Do not copy rideshare blindly

Delivery cash-on-delivery (**COD**) looks similar (“courier holds cash”) but is a **different accounting object**.

| | Rideshare cash | Delivery COD |
|--|----------------|--------------|
| Who the cash is for | Fare economics between rider, driver, Roam; then fleet remittance | Customer pays for **order** (food/goods + fees); courier remits **platform + merchant** share to Roam |
| Wallets | Cash / Digital / Debt + rider wallet | **One** remittance balance (`courier_remittance_accounts`; legacy `courier_cash_*` audit-only) |
| Collection UX | Explicit cash settlement screen | Often implicit when order marked **delivered** |
| Fleet Collect / Log Cash | Correct for rideshare Layer B | **Wrong** place to clear Roam COD |
| Weekly settlement week | Core to Fleet Collect | COD is usually a **running balance**; settle is remittance to Roam |

### 5.2 What Delivery COD balance means

On collection:

```
ledgerAmount = platformDue + merchantDue
```

The courier’s own fee/tip retained (`courierRetained`) generally **does not** increase the remittance balance — that is earning kept in pocket, not “owed to Roam.”

Tables (target / v2):

- `delivery.courier_remittance_accounts` — balance_minor, generated `is_paused`, threshold  
- `delivery.courier_remittance_events` — append-only collected / settled / adjustment / reversal  
- `delivery.courier_remittance_settlements` — settle receipts  
- `delivery.courier_remittance_exceptions` — parked failures (never 500 deliver)

Legacy (until Phase 7 rename to `*_legacy`):

- `delivery.courier_cash_balances` / `courier_cash_events`  

Code:

- `collectOnDelivery` / `postRemittanceCollected` — cash order delivered  
- `settleRemittance` — Remittance Desk (admin)  

Pause: if remittance balance ≥ threshold (default J$10,000 = 1_000_000 minor), courier paused from new offers until settled (`requireActiveCourier` + `pauseGate`).

### 5.3 Fleet Courier Settlements today

`CourierSettlementsPage` shows:

- Delivery earnings summary (from rush delivery trips)  
- COD balances **read-only** (“Owed to Roam — you cannot collect this”)  
- Always reads `courier_remittance_accounts` (no READ_V2 gate)

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
3. `courier_remittance_accounts.balance_minor` increases by ~J$2,200 (**not** J$2,500).  
4. Settling that balance is Roam remittance on Remittance Desk, **not** Fleet Driver Settlements Log Cash for a rideshare week.

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
| 2026-09-15 | Implementation landed. Added Parts 21–22: verification of what shipped (19 of 24 original findings closed) and 13 remaining items (R-1…R-13), 2 of them Critical |
| 2026-09-15 | Remediation round 2 verified (R-items + N-items). Production remittance cutover (no dual-write soak): remittance sole writer; Part 18/23 rewritten |
| 2026-09-15 | Part 24 residuals closed: V-1 alert hygiene, V-2 kill-switch legacy failover, V-3 admin write-off; Parts 21–22 marked historical |
| 2026-09-15 | Part 25 W-1/W-2 closed: write_off sign CHECK + desk reverse of wrong write-offs |
| 2026-09-15 | Round 5 independently verified (12 Deno + 1397 fleet tests green). Added Part 26: ledger is finished; 3 remaining items are legacy **admin surface** — X-1 no admin event history, X-2 Pricing COD tab reads the dead table, X-3 market pause threshold is decorative |
| 2026-09-15 | Part 27 admin surface closeout: X-1/X-2/X-3 closed; TOC points at Part 23 + 26–27; legacy `/pricing/cod/*` → 410 |
| 2026-09-15 | Round 6 independently verified (15 Deno + 1403 fleet tests green). Added Part 28: X-1/X-2 fully closed; 3 refinements — Y-1 market threshold seeds new accounts only, Y-2 seed resolved on every collection, Y-3 no PostgREST reload after the RPC signature change |
| 2026-09-15 | Round 7 independently verified (15 Deno + 1404 fleet tests green). Added Part 29: Y-3 closed; **Z-1** `threshold_source` landed but is never set to `'override'` by the desk PATCH — do not build the re-seed until it is; Z-2 (ex Y-2) unchanged |
| 2026-09-15 | Part 30: Z-1 PATCH override + Default reseed; Z-2 skip seed lookup when account exists |
| 2026-09-15 | Round 8 independently verified (17 Deno + 1404 fleet tests green). Added Part 31: Z-1/Z-2 closed; **AA-1** seeding is layer-aware but re-seeding is flat and global-only — needs a product decision on whether COD pause threshold is a courier attribute or a platform default |
| 2026-09-15 | Round 9 independently verified (17 Deno + 1404 fleet tests green). AA-1 answered by making the rules-form copy scope-aware. Added Part 32: **AB-1** — `threshold_source` has 2 values for 3 provenances, so a Default save still overwrites area-seeded couriers the new copy says it won't |
| 2026-09-15 | Part 33: AB-1/AA-1 closed — COD pause is platform Default + desk override only; seed and reseed share the global Default; town/parish pause knobs removed from Pricing UI |
| 2026-09-15 | Round 10 independently verified — **Delivery Remittance closed, no open findings**. Added Part 34 with the final-state summary. Note: `@roam/fleet` CI is red on 2 **fuel** tests from the concurrent fuel workstream, unrelated to remittance |
| 2026-09-15 | Remittance freeze: TOC → Part 23 + Part 34; Part 30 town-seed ops struck; Part 23 Q2 widened; Part 33/34 labels; workstream frozen (no Part 35) |

**Owners:** Platform / Fleet finance engineering + product  
**Source analysis:** Cross-repo review of rides cashSettlement, fleet settlements, delivery courier cash ledger, and existing money docs

---
---

# IMPLEMENTATION PLAN — Delivery Remittance (Layer A′)

**Added:** 2026-09-15  
**Audience:** Engineers implementing Part 6  
**Status:** Historical plan — build and cutover completed 2026-09-15. See Part 23 (authority) and Part 27 (admin closeout).  
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
| GET | `/courier/remittance` | courier | balance, threshold, pause state |
| GET | `/courier/remittance/events` | courier | own history |
| GET | `/admin/remittance/accounts` | admin | desk list |
| GET | `/admin/remittance/events?courier_id=` | admin | history timeline (X-1) |
| PATCH | `/admin/remittance/accounts/:courierId/threshold` | admin (write) | per-courier pause override |
| POST | `/admin/remittance/settle` | admin (write) | guarded settle → receipt |
| POST | `/admin/remittance/write-off` | admin (write) | forgive owed balance |
| POST | `/admin/remittance/reverse` | admin (write) | reverse settlement **or** write-off (`settlementId` xor `eventId`) |
| GET | `/admin/remittance/exceptions` | admin | parking queue |
| POST | `/admin/remittance/exceptions/:id/retry` | admin (write) | re-attempt |
| POST | `/admin/remittance/exceptions/:id/resolve` | admin (write) | mark resolved |
| GET | `/admin/remittance/reconciliation` | admin | drift / missing / trial / stale pending |
| GET/POST | `/admin/pricing/cod/*` | — | **410 Gone** — retired with X-2 |

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

> **Historical.** This 7-phase plan was written before the build and assumed a 14-day
> dual-write soak. That soak was dropped at the 2026-09-15 cutover (no real delivery users
> yet), so Phases 2 and 7 no longer describe reality. Kept for the reasoning behind each gate.
> **For what is actually running, read Part 23.**

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
4. ~~Dual-write soak~~ — **skipped** (no real delivery users). Remittance-only writes from day one of cutover.
5. Drift / missing / exceptions / stale-pending views for remittance invariants (legacy drift is audit-only).

**Gate (historical):** dual-write soak was the original plan. **Production cutover (2026-09-15):** remittance is sole writer; see Part 18 / Part 23.

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

### Phase 7 — Cutover and retirement (done without soak)

1. Remittance reads always on (fleet + desk) — no `READ_V2` gate.
2. Remittance writes always on; legacy writes off unless `DELIVERY_COD_LEGACY_WRITE=1`.
3. Remittance settle + pause always on.
4. Wire remittance checks into `finance-recon` (drift, missing, exceptions, **stale pending**).
5. Optional later: rename `courier_cash_*` → `*_legacy`, revoke writes, keep for audit. **Do not drop.**
6. Part 5 / 18 / 23 describe production authority.

**Gate:** remittance invariants green (`v_remittance_drift`, missing collections, exceptions, `v_remittance_stale_pending`). Legacy drift emptiness is **not** a cutover blocker.

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

### 18.1 Production flags (cutover complete)

| Env | Default | Controls |
|-----|---------|----------|
| *(none)* | remittance on | Cash deliver always writes remittance |
| `DELIVERY_REMITTANCE_OFF=1` | unset | Emergency kill-switch — stop remittance writes; **auto legacy failover** (V-2) |
| `DELIVERY_COD_LEGACY_WRITE=1` | unset | Emergency dual-write while remittance stays on |
| *(deprecated)* `DELIVERY_REMITTANCE_*_V2` / `DUAL_WRITE` | ignored | Reads, settle, and pause always use remittance |

`RUSH_TRIP_PROJECTION` and `RUSH_SETTLEMENT` stay **off** until Phase 0's gate passes. Turning them on before that re-opens C-6.

### 18.2 Rollback

| Path | Rollback | Data risk |
|------|----------|-----------|
| Remittance write bugs | `DELIVERY_REMITTANCE_OFF=1` | Remittance stops; **legacy auto-writes** (V-2) so COD still records |
| Need legacy shadow again | `DELIVERY_COD_LEGACY_WRITE=1` | Dual write resumes (emergency only) |
| Settle / desk | Code revert | Posted settlements stay in remittance ledger |
| Fleet COD read | Code revert to legacy tables | Observe-only; no write risk |

There is **no** dual-write soak gate. Production authority is remittance; legacy is audit.

### 18.3 Ops metrics (alert on all)

| Metric | Source | Alert when |
|--------|--------|------------|
| Ledger drift | `v_remittance_drift` | any row |
| Missing collections | `v_remittance_missing_collections` | any row |
| Unresolved exceptions | `courier_remittance_exceptions` where `resolved_at` is null | rising / stuck |
| Stale pending settle | `v_remittance_stale_pending` | any row older than 15m |
| Fleet rush cash sum | S-1 / period cash base | ≠ 0 |

**R-10 restated:** do **not** require `v_remittance_legacy_drift` empty. Once legacy writes stop, unexplained legacy drift is irrelevant to cutover. Keep [`scripts/remittance_legacy_drift_explained.sql`](../scripts/remittance_legacy_drift_explained.sql) for historical/audit only.

### 18.4 Daily remittance health

Watch:

- `v_remittance_drift` — must be 0
- `v_remittance_missing_collections` — must be 0 (or exceptions triaged)
- unresolved exceptions — must be 0
- `v_remittance_stale_pending` — must be 0
- fleet rush delivery cash base contribution — must be 0

---

## Part 19 — Open product decisions


These change the build and are not an engineer's call. Decide before Phase 3.

**Q1 — Can COD debt be netted against earnings payouts?**  
Recommendation: **no** in v1 (D-8). Add later as an explicit `payout_offset` settlement method that writes one event in each ledger sharing a correlation id, never as an implicit balance transfer.

**Q2 — Is the pause threshold global, per-market, or per-courier?**  
**Decided (Part 33):** COD pause is a **platform Default** with per-courier Remittance Desk override. Seed and Default reseed both use the global Default only. Town/parish do **not** set remittance pause (area knobs removed from Pricing UI). Desk `PATCH` sets `threshold_source = 'override'`; Pricing Default save reseeds rows still `'seeded'`.

**Q3 — What happens to a courier who stops working owing money?**  
**Decided (Part 24 V-3 / Part 25 W-2):** Dash admin Write Off on Remittance Desk posts a
`write_off` ledger event (reason + notes required; not a cash receipt). Wrong write-offs are
reversible on the desk (restores owed balance). Prefer Settle when money was received.
`ON DELETE RESTRICT` still blocks deleting a courier who owes until balance is cleared (settle or write-off).

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

---
---

# Part 21 — Implementation status (verified 2026-09-15)

> **Historical audit.** Superseded by Part 23 (production cutover) and Part 24 (residuals). Do not treat open items below as current.

The build landed. This part records what was verified against the working tree, so the next
engineer does not have to re-derive it. Part 22 lists what is still open.

## 21.1 What shipped

| Phase | Artefact | State |
|-------|----------|-------|
| 1 | [`20260915120000_courier_remittance_ledger.sql`](../supabase/migrations/20260915120000_courier_remittance_ledger.sql) | 4 tables, generated `is_paused`, all CHECKs, append-only trigger, `apply_remittance_event`, 3 views, grants |
| 2 | [`20260915130000_courier_remittance_backfill_and_drift.sql`](../supabase/migrations/20260915130000_courier_remittance_backfill_and_drift.sql) | Opening balances from legacy + `v_remittance_legacy_drift` |
| 1–3 | [`delivery/remittance/`](../supabase/functions/delivery/remittance/) | `remittanceLedger`, `collectOnDelivery`, `settleRemittance`, `pauseGate`, `exceptions`, `money`, 3 test files |
| 4 | [`apps/dash-courier/src/pages/remittance/`](../apps/dash-courier/src/pages/remittance/) | Card, detail page, paused screen — all routed |
| 5 | [`RemittanceDeskPage.tsx`](../packages/dash-admin/src/pages/remittance/RemittanceDeskPage.tsx) | Routed at `/remittance`, in nav |
| 6 | [`rush_settlement_routes.ts`](../supabase/functions/_fleet-server/rush_settlement_routes.ts), [`CourierSettlementsPage.tsx`](../apps/fleet/src/components/couriers/CourierSettlementsPage.tsx) | Always remittance accounts; "you cannot collect this" copy; still zero write paths |
| 7 | [`finance-recon/index.ts`](../supabase/functions/finance-recon/index.ts) | Drift / missing / exceptions / stale pending wired |
| S-2/3/4 | [`scripts/check-remittance-separation.mjs`](../scripts/check-remittance-separation.mjs) | In CI, passing |

## 21.2 Original findings — closed

**19 of 24 closed.** Verified individually:

| Finding | Closed by |
|---------|-----------|
| C-1 idempotency | `ux_remittance_idem` + key short-circuit in the RPC *(but see R-2)* |
| C-2 balance race | `SELECT … FOR UPDATE` inside `apply_remittance_event` |
| C-3 settle clears pause | `is_paused` is `GENERATED ALWAYS` — nothing can set it |
| C-4 missing account | `INSERT … ON CONFLICT DO NOTHING` before the lock; settle 404s on absent account |
| C-5 over-settle | 422 refusal in `settleRemittance` + `remittance_overdraw` in the RPC |
| C-6 bag total leak | `cashCollected = 0` in `deliveryOrderToFleetTrip` **and** `rush_delivery` skip in `computeWeekCashBase`; fixture test passes *(but see R-5)* |
| C-7 pause bypass | Folded into `requireActiveCourier`; covers all three accept paths **and** go-online |
| C-8 throwing assert | Both call sites wrapped; failures park, delivery always completes |
| C-9 non-positive silent skip | Zero-value event written with `non_positive_remittance` metadata |
| C-10 float money | `bigint` minor units throughout |
| H-1 CASCADE delete | `ON DELETE RESTRICT` on accounts, events, settlements |
| H-2 orphan events | `order_id … ON DELETE RESTRICT` |
| H-3 no unique per order | `ux_remittance_one_collection_per_order` |
| H-4 trial balance unpersisted | Four money columns + `remittance_trial_balance` CHECK *(but see R-1)* |
| H-5 no reconciliation | 4 views + finance-recon alerts |
| H-6 no reversal | `reverseSettlement` + `reversal_of` |
| H-8 two engines | `fleet_delivery_details` now uses `computeCodTrialBalance` |
| M-1 no courier UI | Card, detail page, paused screen; 403 carries balance + threshold |
| M-4 free-text method | CHECK constraint on 6 methods |

M-2 (admin desk) and M-3 (RLS) are addressed in shape: the desk exists and is routed, RLS
stays service-role-only with edge-mediated reads as designed.

## 21.3 Separation contract — verified

| Rule | Verified how | Result |
|------|--------------|--------|
| S-1 | `periodShareCash.test.ts` — COD trip + rideshare trip, asserts `passengerCash === 800` | ✅ passing |
| S-2 | `check-remittance-separation.mjs` in CI | ✅ passing |
| S-3 | Vocabulary lint over `delivery/remittance/**` | ✅ passing |
| S-4 | Vocabulary lint over `fleet-financials/**` | ✅ passing |
| S-5 | Fleet route reads only; no write grant exists | ✅ |
| S-6 | **Zero files edited under `fleet-financials/`** during remittance work | ✅ restored — LogCashWizard removed; S-6 structural check in CI |

---

# Part 22 — What is left

> **Historical audit.** Superseded by Part 23 (production cutover) and Part 24 (residuals). Do not treat Criticals / soak language below as current blockers.

Two Criticals block the Phase 2 soak. R-6 is the one to decide on first, because it touches
the production desk this build was supposed to leave alone.

## 22.1 Critical

### R-1 — The trial-balance tolerance gap parks real money

`assertCodTrialBalance` tolerates `|split sum − total| ≤ 0.02` ([`codBalance.ts:72`](../packages/dash-pricing/src/codBalance.ts)).
The DB constraint `remittance_trial_balance` requires **exact** equality in minor units.
`collectOnDelivery` rounds all four values independently, so any order inside the tolerance
but not exactly equal is rejected by the database.

Verified against the real functions — orders that pass the JS assertion:

```
delta=0.00  total=2395.75  JS: PASS   DB: bag=239575 vs sum=239575  PASS
delta=0.01  total=2395.76  JS: PASS   DB: bag=239576 vs sum=239575  REJECT
delta=-0.01 total=2395.74  JS: PASS   DB: bag=239574 vs sum=239575  REJECT
delta=0.02  total=2395.77  JS: PASS   DB: bag=239577 vs sum=239575  REJECT
```

The insert throws → `collectOnDelivery` catches → the order is parked as an exception and
**never enters the ledger**. The tolerance exists because someone already knew this drift
happens, so this will fire in production.

**Fix:** make the retained figure the exact residual, so the constraint holds by construction.
Remittance stays computed and authoritative; the cent lands in the display-only number.

```ts
const bagTotalMinor   = toMinorMoney(Number(row.total ?? 0));
const platformDueMinor = toMinorMoney(split.platformDueJmd);
const merchantDueMinor = toMinorMoney(split.merchantDueJmd);
// Residual absorbs sub-cent drift the ±0.02 assertion already tolerates.
const courierRetainedMinor = bagTotalMinor - platformDueMinor - merchantDueMinor;
```

Add a test that asserts an order with ±0.02 drift posts successfully.

### R-2 — Concurrent duplicate collection errors instead of replaying

In `apply_remittance_event` the idempotency `SELECT` (line 161) sits **outside** the row lock
taken at line 172. Two simultaneous calls with the same key both miss, both reach the INSERT,
and the second hits `ux_remittance_idem` — raising a unique violation rather than returning
the original row.

The whole point of the collection path is that a double-fire is free. Today it produces a
throw, a parked exception, and a polluted "must be zero" queue.

**Fix:** catch the violation and re-read.

```sql
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM delivery.courier_remittance_events
   WHERE idempotency_key = p_idempotency_key;
  RETURN v_existing;
```

## 22.2 High

### R-3 — Orphaned settlement rows are unrepresentable and unrecoverable

`settleRemittance` inserts the settlement row (line 117) and *then* posts the event (line 134).
If the event fails — the overdraw race between the balance check at line 70 and the RPC, or any
transport error — the settlement row persists as `status='posted'` with no event and no balance
movement. `reverseSettlement` cannot clean it up: it 404s with `settled_event_not_found`.

The `status` CHECK allows only `posted` and `reversed`, so there is no way to represent
"attempted but not applied".

**Fix (either):** add `pending` and `void` to the CHECK, insert as `pending`, promote to
`posted` only after the event lands, and void on failure — or move the settlement insert
inside the RPC so both rows commit together.

### R-4 — Settle idempotency is unreachable in the case it exists for

The replay lookup (line 95) runs *after* the `expectedBalanceMinor` check (line 70). On a
double-submit the balance has already moved, so the stale expectation fails first and the
caller gets **409 `balance_changed`** — never the original receipt.

Compounding it, the admin client generates a fresh key per click:

```ts
// RemittanceDeskPage.tsx:91
idempotencyKey: crypto.randomUUID(),
```

so the two submissions do not even share a key.

**Fix:** move the replay lookup to the top of `settleRemittance`, before every validation; and
generate the idempotency key once when the settle dialog opens, not on submit.

### R-5 — `canonical_from_ops` re-invents delivery cash from the fare

Phase 0 is incomplete. `deliveryOrderToFleetTrip` now sets `cashCollected: 0`, but the trip
still carries `paymentMethod: "Cash"`, and
[`canonical_from_ops.ts:54-62`](../supabase/functions/_fleet-server/canonical_from_ops.ts) does:

```ts
const explicit = Math.abs(coerceAmount(trip.cashCollected));
if (explicit > 0) return explicit;                 // 0 falls through
const pmRaw = String(trip.paymentMethod ?? "").toLowerCase();
if (pmRaw === "cash") return Math.abs(fareGross > 0 ? fareGross : netAmount);  // reinvents
```

so `metadata.cashCollected` is written as the courier's gross earning. This directly
contradicts the rule documented in
[`tripPhysicalCash.ts:29`](../packages/finance-core/src/tripPhysicalCash.ts) — *"Present
cashCollected (including 0) is authoritative — never invent from fare."* The two helpers
disagree, and the fleet-side one is the permissive reading.

Smaller than C-6 (earning, not bag total) but the same class: delivery money surfacing as
fleet-held cash.

**Fix:** align `computeTripFareCashCollected` with `getTripPhysicalCashCollected` — a present
`cashCollected`, including `0`, is authoritative. Add a `rush_delivery` guard as well.

### R-6 — S-6 breached: a service-picker Log Cash wizard landed in the production desk

[`LogCashWizard.tsx`](../apps/fleet/src/components/fleet-financials/settlements/LogCashWizard.tsx)
is new, lives under `fleet-financials/`, and
[`DriverSettlementsPage.tsx:2262`](../apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx)
now renders it in place of the previous one-step driver picker (`10 insertions, 60 deletions`).

Three problems:

1. **It breaches S-6**, the rule whose entire purpose was to leave the production Driver
   Settlements desk untouched during this build.
2. **It is the affordance Part 6.3 exists to prevent.** Step 1 is a Rideshare | Delivery
   choice. Delivery is disabled and the copy correctly says "use Remittance desk" — but the
   picker is now on the page, and the next person to enable that tile re-creates exactly the
   architecture this design was written to avoid.
3. **It delivers no remittance capability.** It is a UX change to a live money desk that turns
   one step into three, where the added step has a single enabled option.

**Recommendation: revert it.** Restore the previous dialog. If a service picker is wanted
later, it belongs in a separate, deliberate piece of work with its own review — not folded
into the remittance build. The vocabulary lint does not catch this, because the wizard uses
no forbidden identifiers.

**Also add the missing S-6 check to CI**, which would have caught it:

```bash
git diff --stat origin/main -- apps/fleet/src/components/fleet-financials/ | grep . && exit 1
```

## 22.3 Medium

### R-7 — `delivery/remittance/routes.ts` is dead code

It is never imported anywhere. The courier routes were inlined into
[`courierConsumerRoutes.ts:1532`](../supabase/functions/delivery/courierConsumerRoutes.ts) and
the admin routes into [`pricingRoutes.ts:1311`](../supabase/functions/delivery/admin/pricingRoutes.ts).
`routes.ts` duplicates both and is unreachable — someone will edit it and wonder why nothing
changes. Delete it, or register it and remove the inline copies.

### R-8 — Settlement references will collide

```ts
function nextReference(): string {
  const y = new Date().getUTCFullYear();
  const n = Math.floor(Math.random() * 900000) + 100000;
  return `RMT-${y}-${n}`;
}
```

`reference` is `UNIQUE NOT NULL`. With 900,000 values per year, the birthday bound puts
collision probability near 50% at roughly 1,100 settlements in a year. A collision fails the
insert and returns a raw Postgres message. No money moves, but it is an avoidable outage.

**Fix:** a Postgres sequence — `RMT-2026-` plus `lpad(nextval(…)::text, 6, '0')`.

### R-9 — The Phase 1 and Phase 3 gates are not actually verified

- `concurrency.test.ts` does not test concurrency. It asserts that
  `collectIdempotencyKey('order-1')` is deterministic — a pure string function. The real
  200-parallel soak is [`scripts/remittance_concurrency_soak.sql`](../scripts/remittance_concurrency_soak.sql),
  which runs against a database and is **not in CI**.
- `pauseRoutes.test.ts` greps source text for `requireActiveCourier` and asserts `hits >= 3`.
  It is not the route enumeration Part 17.4 specified, and it cannot catch a new accept path
  that never calls the gate.
- **No remittance Deno test runs in CI at all.** The CI change added the fuel tests only.

Until the soak runs somewhere repeatable, "200 concurrent collections produce exactly 200
events" is an assertion about the design, not a measured fact — and R-2 is a concrete reason
to doubt it.

### R-10 — The Phase 2 drift gate cannot pass as written

Legacy collection is still gated on `payment_status === 'pending_collection'`, while v2 fires
on `payment_method` cash + delivered. That asymmetry is **correct** — it is the fix for the
under-firing bug — but it guarantees `v_remittance_legacy_drift` is non-empty whenever legacy
skips an order.

The gate "14 days with zero drift" is therefore unachievable by construction.

**Restate it:** drift is expected *only* for orders legacy never collected. The gate becomes:
every row in `v_remittance_legacy_drift` is explained by an order where
`payment_status <> 'pending_collection'` at delivery, and no row is explained by anything else.
Write that as a query before starting the soak.

### R-11 — The exceptions queue can be read but not drained

`GET /admin/remittance/exceptions` exists. The planned
`POST /admin/remittance/exceptions/:id/retry` does not, and nothing ever writes `resolved_at`
or `resolved_by`. Given R-1 and R-2 will both park exceptions, the queue will fill with no
way to clear it — and `v_remittance_missing_collections` suppresses orders with an unresolved
exception, so a parked order is invisible in both places.

### R-12 — `classifyRemittanceError` has no bucket for concurrency

It returns `rpc_error` for unique violations, so R-2's false exceptions are indistinguishable
from genuine failures. Add a `duplicate_concurrent` class (and once R-2 is fixed, it should
never appear).

### R-13 — `codBagTotal` on the fleet trip payload is unverified

`deliveryOrderToFleetTrip` now emits `codBagTotal` alongside `cashCollected: 0`. Confirm the
`/internal/trips/project` endpoint does not persist it anywhere a future cash query could
pick up. It is ops-only display data and should stay that way.

## 22.4 Still open from Part 19

None of the product decisions have been made. Q2 is now load-bearing: the J$10,000 threshold
is hardcoded in three places (migration default, `remittanceLedger.ts:117`, `:128`) with no
admin control, so it will drift.

## 22.5 Suggested order

1. **R-6** — decide on the Log Cash wizard. It is the only item touching production today.
2. **R-1, R-2** — both park money that should be on the books. Neither can be found later
   without draining the exceptions queue, which R-11 makes impossible.
3. **R-11** — you need the drain before the soak, not after.
4. **R-3, R-4** — settlement integrity, before any real settle happens.
5. **R-5** — completes Phase 0.
6. **R-9, R-10** — make the Phase 2 gate real and achievable, then start the 14-day soak.
7. **R-7, R-8, R-12, R-13** — hygiene, any time before cutover.

Do not treat dual-write soak as a blocker — production cutover skipped it (no real delivery users).
Close remittance invariants instead (Part 18 / Part 23).

---
---

# Part 23 — Production remittance cutover (verified 2026-09-15)

Remittance Harden + open items (N-1…N-4, R-9, R-10) closed. **No 14-day dual-write soak** —
product lock: no real delivery users yet; remittance is the sole live COD authority.

## 23.1 Item status

| ID | Status | Notes |
|----|--------|-------|
| R-1 | Closed | Retained = bag − platform − merchant residual; test imports `remittanceMinorsFromSplit` |
| R-2 | Closed | `unique_violation` replay in `apply_remittance_event` |
| R-3 | Closed | Settlement `pending` → `posted` / `void` |
| R-4 | Closed | Replay-first settle; desk idempotency key per panel open |
| R-5 | Closed | `canonical_from_ops` respects cashCollected including 0; rush_delivery → 0 |
| R-6 | Closed | LogCashWizard removed; S-6 filename + `REMITTANCE_S6_DIFF=1` in CI |
| R-7 | Closed | Dead `remittance/routes.ts` deleted |
| R-8 | Closed | `next_remittance_settlement_ref` sequence |
| R-9 | Closed | GoRide soak 2026-09-15: **200** events (`cod:collect:v1:prod-cutover-soak-*`); replay ×2 no growth; cleanup settle → balance 0 |
| R-10 | Closed | Cutover gate = remittance invariants only; legacy drift empty is **not** required |
| R-11 | Closed | Exception retry + resolve APIs + desk actions |
| R-12 | Closed | `duplicate_concurrent` classifier |
| R-13 | Closed | `codBagTotal` under `payload_json` only |
| N-1 | Closed | `orderToFleetTrip.test.ts` asserts `payload_json.codBagTotal` |
| N-2 | Closed | `v_remittance_stale_pending` + finance-recon + Remittance Desk strip |
| N-3 | Closed | CI sets `REMITTANCE_S6_DIFF: '1'` |
| N-4 | Closed | Test imports production `remittanceMinorsFromSplit` |
| Q2 | Closed | Platform Default seeds/reseeds `'seeded'`; desk sets `'override'` (Parts 33–34) |

## 23.2 Production authority

| Path | Behavior |
|------|----------|
| Cash deliver write | Remittance always (`DELIVERY_REMITTANCE_OFF=1` kill-switch) |
| Legacy write | Off unless `DELIVERY_COD_LEGACY_WRITE=1` |
| Fleet COD balances | Always `courier_remittance_accounts` |
| Admin settle / reverse | Remittance settle (legacy settle only if emergency legacy write) |
| Pause | Remittance pause always; legacy pause secondary while old rows exist |
| Recon | Drift / missing / exceptions / **stale pending** |

Migration notes: [`20260915170000_remittance_production_cutover_and_stale_pending.sql`](../supabase/migrations/20260915170000_remittance_production_cutover_and_stale_pending.sql).

## 23.3 Still open from Part 19 (non-goals this pass)

**Q1, Q4, Q5** remain deferred — no netting, no fleet COD claim, no courier self-report.
**Q3** closed in Part 24 (admin Write Off on Remittance Desk).

## 23.4 Definition of done

| Check | Pass |
|-------|------|
| CI | Fleet + remittance Deno + S-6 (with diff) green |
| Write | Cash deliver → remittance only |
| Read | Fleet + desk use remittance accounts |
| Settle | Pending/posted/void; replay-first; sequence refs |
| Recon | Drift / missing / exceptions / stale pending alerted |
| Docs | One Part 23; production authority; **no soak blocker** |

---
---

# Part 24 — Residual items after cutover (closed 2026-09-15)

Fourth pass closed V-1 / V-2 / V-3. Remittance remains sole production COD authority.

## 24.1 Verification run

```
REMITTANCE_S6_DIFF=1 node scripts/check-remittance-separation.mjs   OK (S-2/S-3/S-4/S-6)
deno test supabase/functions/delivery/remittance/                   write-off + prior suites green
```

| Path | Verified |
|------|----------|
| V-1 legacy drift | Removed from finance-recon alerts + desk recon strip; view/script remain for audit |
| V-2 kill-switch | `DELIVERY_REMITTANCE_OFF=1` auto-enables legacy COD write + `REMITTANCE_KILL_SWITCH_LEGACY_FAILOVER` log |
| V-3 / Q3 write-off | `POST /admin/remittance/write-off` + Remittance Desk Write Off (reason + notes + type-confirm) |
| Q1 / Q4 / Q5 | Still deferred (non-goals) |

## 24.2 Closed residuals

| ID | Status | Notes |
|----|--------|-------|
| V-1 | Closed | No `REMITTANCE_LEGACY_DRIFT` alerts; desk strip is drift / missing / trial / stale pending only |
| V-2 | Closed | Kill-switch ⇒ legacy failover (any cash deliver, not only `pending_collection`) |
| V-3 | Closed | Admin write-off event; no fake settlement receipt; Q3 decided in Part 19 |

## 24.3 What is genuinely done

- Ledger core + Driver Settlements separation remain intact.
- Ops alerts are actionable (no permanent legacy-drift noise).
- Incident kill-switch cannot orphan COD.
- Stuck owing couriers have an auditable desk write-off path.

Deferred only: Q1 netting, Q4 fleet COD claim, Q5 courier self-report.

---
---

# Part 25 — Post-write-off review (closed 2026-09-15)

Write-off hardening complete. **W-1 and W-2 closed.** V-1–V-3 remain closed from Part 24.

## 25.1 Verification

| Claim | Status |
|-------|--------|
| W-1 write_off sign CHECK | [`20260915180000_remittance_write_off_sign.sql`](../supabase/migrations/20260915180000_remittance_write_off_sign.sql) applied on GoRide |
| W-2 reverse write-off | `POST /remittance/reverse` accepts `eventId` → `reverseWriteOffEvent`; desk has Reverse this write-off + by event ID |
| Settlements reverse | Unchanged (`settlementId` path) |
| Failover caveat | Ops note only — legacy C-1/C-2 under kill-switch; drain back to remittance after incidents |

## 25.2 Closed residuals

| ID | Status | Notes |
|----|--------|-------|
| W-1 | Closed | `remittance_write_off_sign`: write_off ⇒ amount_minor ≤ 0 |
| W-2 | Closed | Reversal restores receivable; idempotent; 409 if already reversed |

## 25.3 Ops note — kill-switch failover

Under `DELIVERY_REMITTANCE_OFF=1`, collections use legacy `recordCashCollection` (no idempotency / race-safe RPC). Short-term incident only — drain back to remittance and use `v_remittance_missing_collections` when restoring.

## 25.4 Still deferred

Q1 (netting), Q4 (fleet COD claim), Q5 (courier self-report) remain non-goals.

---
---

# Part 26 — Legacy admin surface review (verified 2026-09-15)

Fifth pass. **W-1 and W-2 confirmed closed.** The `write_off` sign constraint is applied, and
`reverseWriteOffEvent` is well-built — it validates the target really is a `write_off`, guards
double-reversal both by `reversal_of` and by idempotency key, and restores the receivable
through a `reversal` event rather than mutating anything.

## 26.1 Verification run

```
REMITTANCE_S6_DIFF=1 node scripts/check-remittance-separation.mjs   OK (S-2/S-3/S-4/S-6)
deno test supabase/functions/delivery/remittance/                   12 passed, 0 failed
pnpm --filter @roam/fleet test                                      240 files, 1397 passed, 0 failed
```

| Claim | Verified |
|-------|----------|
| W-1 | `remittance_write_off_sign` CHECK present — `collected`, `settled` and `write_off` now all sign-constrained |
| W-2 server | `POST /remittance/reverse` accepts `settlementId` **xor** `eventId`; rejects both-or-neither |
| W-2 client | `reverseRemittanceWriteOff` wired through the desk |
| Legacy settle back-door | `/pricing/cod/settle` delegates to `settleRemittance` — no legacy write unless `DELIVERY_COD_LEGACY_WRITE=1` |

## 26.2 Open — the admin side still reads a dead table

Three findings of the same shape: **the cutover moved the write path and the courier-facing
read path, but left the older admin COD surface pointing at legacy.** None corrupts stored
money. All three show an operator a number that is no longer true.

### X-1 — There is no admin-facing remittance history

Nothing anywhere reads `courier_remittance_events` for an admin. The desk has a Settle panel, a
reconciliation strip and an exceptions queue — **no ledger view**. An operator can see a
courier's balance but not what built it: which collections, which settlements, which write-offs.

The courier can. `GET /courier/remittance/events` returns their own history with the full
per-order breakdown. The visibility is inverted — the person who can *move* the money sees less
than the person who owes it.

This also undercuts W-2. Reversing an older write-off means pasting its event UUID
([`RemittanceDeskPage.tsx:534`](../packages/dash-admin/src/pages/remittance/RemittanceDeskPage.tsx)),
with no in-product way to find it; the "last write-off" shortcut only survives the current page
session. A mistake discovered the next morning is back to direct SQL — exactly what W-2 set out
to prevent.

**Fix:** `GET /admin/remittance/events?courier_id=…` over `courier_remittance_events`, rendered
as a history panel in the courier drawer with a Reverse action on `write_off` rows. The
courier-side query is already written and reuses nearly verbatim.

### X-2 — The Pricing hub's "COD Ledger" tab shows frozen balances

[`PricingHubPage.tsx:362`](../packages/dash-admin/src/pages/pricing/PricingHubPage.tsx) still
calls `fetchCodBalances` → `GET /admin/pricing/cod/balances` → `courier_cash_balances`, which
has not been written since the cutover. The tab renders those rows at line 2303, including a
`pause_threshold_jmd` column at 2321.

The settle copy on that tab correctly points at the Remittance Desk, so nobody moves money from
here. But the **numbers** are stale and diverge further every day: Pricing → COD Ledger shows
one balance, the Remittance Desk another, and neither screen says which is authoritative. That
is the "two engines, no contract" pattern this build exists to remove — reintroduced by
omission rather than by design.

**Fix:** point the tab at `courier_remittance_accounts` (the fleet route is a good template), or
delete the tab and deep-link to the Remittance Desk. Retire `fetchCodBalances` / `fetchCodEvents`
/ `settleCourierCash` from `dashAdminService` once nothing consumes them — `settleCourierCash`
already has no callers.

### X-3 — The market COD pause threshold is decorative

`rules.cod.pause_threshold_jmd` is editable in the market rules form, validated in
`rulesBlob.ts`, shown in the Pricing hub summary, and read by `dash-pricing/engine.ts` into
`pauseThresholdJmd`.

**Nothing in the remittance path reads it.** Pausing is driven entirely by
`courier_remittance_accounts.pause_threshold_minor`, which defaults to a hardcoded `1000000` in
the migration and changes only via `PATCH /remittance/accounts/:courierId/threshold`.

So an operator can set a market's COD pause threshold to J$5,000, save it, see it persisted and
displayed — and no courier's pause behaviour changes. A knob that looks live and is not is worse
than no knob, because it produces confident wrong decisions.

This is Part 19 Q2 resurfacing: Q2 was closed by adding the *per-courier* control, which was
right, but the *global* control it duplicates was left in place still looking authoritative.

**Fix — decide which is the source of the default:** either seed a new account's
`pause_threshold_minor` from the courier's market profile (Pricing sets the default, the desk
sets per-courier overrides), or remove the setting from the market rules form and its blob.
Prefer seeding — a global default with per-courier overrides is the shape operators expect.
Record the decision in Part 19 Q2 either way so it does not drift back.

### Note — `/pricing/cod/settle` weakens the stale-balance guard

When `expected_balance_minor` is absent the shim fills it from the **current** balance
([`pricingRoutes.ts:1261`](../supabase/functions/delivery/admin/pricingRoutes.ts)), so the 409
concurrency check can never fire on that path. Deliberate for backwards compatibility and
harmless while the route has no UI caller — but it should not outlive the legacy clients. Retire
the route together with X-2.

## 26.3 What is done

The ledger itself is finished. Every event type is sign-constrained, every money endpoint is
replay-first with an expected-balance check and an overdraw refusal, every correction is a new
event rather than a mutation, and the four reconciliation views plus the exceptions queue are
alerted and drainable.

Part 26 is not ledger work — it is **retiring the old admin surface the cutover left behind**.
Until X-1 and X-2 land, the admin experience of a finished system is a stale balance list, no
history, and a UUID paste box.

---
---

# Part 27 — Admin surface closeout (verified 2026-09-15)

X-1 / X-2 / X-3 closed. Remittance Desk is the sole admin COD home.

## 27.1 Closed items

| ID | Status | What shipped |
|----|--------|--------------|
| X-1 | Closed | `GET /admin/remittance/events?courier_id=` + desk History timeline with in-row reverse for write-offs / settlements |
| X-2 | Closed | Pricing **COD Ledger** tab removed; Overview deep-links to `/remittance`; `/admin/pricing/cod/*` returns **410**; dead client helpers removed |
| X-3 | Closed | Market `pause_threshold_jmd` seeds new `courier_remittance_accounts.pause_threshold_minor` via `p_pause_threshold_minor` on collect; desk override unchanged; Pricing labels say “default for new accounts” |

## 27.2 Ops playbook — first live COD week

Daily (must stay empty / drained):

- `v_remittance_drift`
- `v_remittance_missing_collections`
- unresolved `courier_remittance_exceptions`
- `v_remittance_stale_pending`
- Fleet rush delivery contribution to weekly cash base === 0 (S-1)

On-call money moves: **Remittance Desk only** (settle / write-off / reverse from History).

Kill-switch:

- `DELIVERY_REMITTANCE_OFF=1` stops remittance writes and auto-fails over to **legacy** `courier_cash_*` (known weak: no race-safe RPC). Use for short incidents only.
- After restore: drain missing collections / exceptions back onto remittance; do not leave kill-switch on.
- Emergency dual-write while remittance stays on: `DELIVERY_COD_LEGACY_WRITE=1`.

Do **not** enable `RUSH_TRIP_PROJECTION` / `RUSH_SETTLEMENT` until S-1 stays green for delivery trips.

## 27.3 Explicit non-goals (deferred)

| ID | Topic | Status |
|----|-------|--------|
| Q1 | Net COD against earnings payouts | Deferred — needs Layer A′/B design review |
| Q4 | Fleet claim on courier COD cash | Deferred — Roam owns receivable |
| Q5 | Courier self-report remittance | Deferred — schema ready (`pending` + `external_ref`) |

## 27.4 Definition of done

- One admin COD number (Remittance Desk); Pricing has no second balance list.
- Operator can see how a balance was built and reverse a write-off without pasting a UUID.
- New remittance accounts inherit market pause default; desk can override per courier.
- Docs TOC lands on Part 23 + Part 27 for current truth.

---
---

# Part 28 — Threshold seeding review (verified 2026-09-15)

Sixth pass. **X-1 and X-2 are fully closed.** X-3 is closed for new couriers but not for the
existing population, and the signature change in the seeding migration needs one ops guard.

## 28.1 Verification run

```
REMITTANCE_S6_DIFF=1 node scripts/check-remittance-separation.mjs   OK (S-2/S-3/S-4/S-6)
deno test supabase/functions/delivery/remittance/                   15 passed, 0 failed
pnpm --filter @roam/fleet test                                      242 files, 1403 passed, 0 failed
```

| Claim | Verified |
|-------|----------|
| X-1 | `GET /admin/remittance/events?courier_id=` live; desk has a **History** panel via `fetchRemittanceEvents`, carrying `settlement_id` + `reversal_of` so a write-off row can be reversed in place |
| X-2 | Pricing hub COD tab **removed entirely** — no `codBalances` state, no `'cod'` tab; the three `/pricing/cod/*` routes return **410 Gone** with a pointer to the replacement rather than disappearing silently |
| X-3 (new accounts) | `apply_remittance_event` gained `p_pause_threshold_minor`; `collectOnDelivery` resolves the market rule and seeds it on first create |

Returning 410 with the replacement endpoint named is the right call — a deleted route gives a
caller a 404 and no idea why.

## 28.2 Open

### Y-1 — The market threshold still does nothing for existing couriers

The seed is `INSERT … ON CONFLICT (courier_id) DO NOTHING`, so it applies **only when the
account row is first created**. Every account that already exists — including every one the
Phase-2 backfill created from legacy balances — keeps `1000000`.

So an operator who changes a market's COD pause threshold still changes nothing for the
couriers already collecting, which is the population they actually care about. X-3's symptom is
narrowed, not removed: the knob is now live for couriers who have never delivered, and inert
for everyone else.

It also cannot be safely bulk-applied as things stand, because the schema cannot distinguish
**"1000000 because nobody ever set it"** from **"1000000 because an operator chose it"**. A
re-seed would silently stomp deliberate per-courier overrides.

**Fix:** record provenance, then re-seed only what was never overridden.

```sql
ALTER TABLE delivery.courier_remittance_accounts
  ADD COLUMN IF NOT EXISTS threshold_source text NOT NULL DEFAULT 'seeded'
    CHECK (threshold_source IN ('seeded','override'));
```

`PATCH /remittance/accounts/:courierId/threshold` sets `'override'`; a market-rules save re-seeds
`WHERE threshold_source = 'seeded'`. That makes "global default, per-courier override" true
rather than aspirational, which is the shape Part 26 recommended and operators expect.

Until then, Part 19 Q2 should say plainly: **the market threshold seeds new accounts only;
changing it does not move existing couriers.**

### Y-2 — The seed is resolved on every collection but used only on first create

[`collectOnDelivery.ts:162-163`](../supabase/functions/delivery/remittance/collectOnDelivery.ts)
calls `marketIdForOrder` (a `merchants` lookup) and then `resolveCodPauseThresholdMinor`
(`resolvePricingLayers`) for **every** cash delivery — but the value is discarded by
`ON CONFLICT DO NOTHING` on all but the courier's first one.

It is safely written (try/catch, falls back to `1000000`, cannot break collection), so this is
cost rather than risk: two or more extra queries on the hot path of every COD order, for a value
used once per courier in their lifetime.

**Fix:** look up the account first and resolve the threshold only when it is missing — or pass
it lazily and let the RPC ask only on the insert branch.

### Y-3 — The function signature changed with no PostgREST schema reload

[`20260915190000_remittance_pause_threshold_seed.sql`](../supabase/migrations/20260915190000_remittance_pause_threshold_seed.sql)
drops the 15-argument `apply_remittance_event` and creates a 16-argument one. PostgREST caches
function signatures, and RPC calls resolve against that cache.

If the cache does not refresh at deploy, **every COD collection fails until it does** — and
because collection is wrapped by D-7, the failures are silent to couriers and land as parked
exceptions. A working system quietly stops booking money.

Supabase normally reloads the schema cache when migrations apply, so this may never bite. Making
it deterministic costs one line at the end of the migration:

```sql
NOTIFY pgrst, 'reload schema';
```

Worth adding before the next signature change regardless, since this is the first migration in
the series to alter an RPC signature rather than its body.

## 28.3 What is done

The admin surface is now coherent: one balance list, one history view, one settle path, and the
retired routes announce their replacement. Combined with the ledger work closed in Parts 21–25,
Layer A′ is complete as designed.

Everything in Part 28 is refinement of a working system — a knob whose scope should be widened
(Y-1), a query that should move off the hot path (Y-2), and a deployment guard (Y-3).

---
---

# Part 29 — Threshold provenance review (verified 2026-09-15)

Seventh pass. **Y-3 is closed.** Y-1 landed its schema but not its behaviour, and Y-2 is
unchanged.

## 29.1 Verification run

```
REMITTANCE_S6_DIFF=1 node scripts/check-remittance-separation.mjs   OK (S-2/S-3/S-4/S-6)
deno test supabase/functions/delivery/remittance/                   15 passed, 0 failed
pnpm --filter @roam/fleet test                                      243 files, 1404 passed, 0 failed
```

| Item | State |
|------|-------|
| **Y-3** | **Closed** — `NOTIFY pgrst, 'reload schema'` added to migration 190000, plus a dedicated `20260915200000_remittance_pgrst_reload.sql` and a trailing NOTIFY in 210000 |
| Y-1 schema | Landed — `threshold_source` column, CHECK `('seeded','override')`, backfill, and `apply_remittance_event` stamps `'seeded'` on create |
| **Y-1 behaviour** | **Not wired — see Z-1** |
| **Y-2** | **Unchanged — still resolved on every collection** |

## 29.2 Open

### Z-1 (important) — `threshold_source` is inert, and that makes it a trap

The column exists and is stamped `'seeded'` on account creation. Nothing else touches it:

```
grep -rn "threshold_source" supabase/functions/ packages/   →   no matches
```

Two consequences, and the second is worse than the first.

**1. Y-1's actual symptom is unchanged.** There is still no re-seed path, so changing a market's
COD pause threshold still does nothing for couriers who already have an account. That was the
whole point of Y-1 — the column was the enabling step, not the deliverable.

**2. The column is currently wrong, not merely unused.**
`PATCH /remittance/accounts/:courierId/threshold`
([`pricingRoutes.ts:1407`](../supabase/functions/delivery/admin/pricingRoutes.ts)) upserts
`pause_threshold_minor` and `updated_at` — and **does not set `threshold_source = 'override'`**.
So every threshold an operator deliberately sets from the desk remains labelled `'seeded'`.

That is the dangerous state. The column's only purpose is to let a future re-seed know what it
may safely overwrite. Whoever writes that re-seed will trust it — and it will silently stomp
every genuine per-courier override, because none of them are marked. Right now the data says
"nobody has ever overridden anything", and that is false the moment the desk control is used.

**Fix — both halves, and the first one before any re-seed exists:**

```ts
// PATCH .../threshold — an operator setting a value IS the override
await db.from("courier_remittance_accounts").upsert({
  courier_id: courierId,
  pause_threshold_minor: thresholdMinor,
  threshold_source: "override",
  updated_at: new Date().toISOString(),
}, { onConflict: "courier_id" });
```

```sql
-- Re-seed on market-rules save: seeded rows follow the market, overrides do not.
UPDATE delivery.courier_remittance_accounts a
   SET pause_threshold_minor = :market_threshold_minor, updated_at = now()
 WHERE a.threshold_source = 'seeded'
   AND a.courier_id = ANY(:courier_ids_in_market);
```

Until the PATCH is fixed, **do not build the re-seed** — an unwired provenance column is
harmless, but a re-seed reading a provenance column that was never maintained will quietly undo
operator decisions. This is the same shape as the lesson recorded for the settlement week
recon: *an SQL check is only as good as the writers that maintain its input.*

There is also a smaller issue in the same handler: the `upsert` will **create** an account row
for a courier who has none, bypassing the market seed entirely and landing whatever the operator
typed with `threshold_source` defaulted. Guard it to update-only, or stamp it `'override'` as
above so at least the label is true.

### Z-2 — Y-2 is unchanged

[`collectOnDelivery.ts:162-163`](../supabase/functions/delivery/remittance/collectOnDelivery.ts)
still calls `marketIdForOrder` then `resolveCodPauseThresholdMinor` on **every** cash delivery,
and `ON CONFLICT DO NOTHING` discards the result on all but the courier's first.

Still cost rather than risk — it is try/caught with a `1000000` fallback and cannot break
collection. But it is two-plus queries per COD order for a value used once per courier ever, and
it grows with order volume rather than with courier count.

**Fix:** read the account first; resolve the market threshold only when it is absent.

## 29.3 What is done

Ledger, admin surface, and deployment safety are all complete. Y-3 in particular is worth
noting as closed properly — the NOTIFY was added to the migration that caused the risk *and* to
the two around it, so the RPC signature change cannot leave PostgREST serving a stale cache.

What remains is one wiring gap with a sharp edge (Z-1) and one hot-path optimisation (Z-2).
Neither affects money already recorded.

---
---

# Part 30 — Threshold wiring closeout (verified 2026-09-15)

Z-1 and Z-2 closed. Lesson: do not re-seed until writers maintain `threshold_source`.

## 30.1 Closed

| ID | Status | What shipped |
|----|--------|--------------|
| Z-1 PATCH | Closed | Update-only `PATCH …/threshold` stamps `threshold_source = 'override'`; 404 if no account |
| Z-1 reseed | Closed | After **global/Default** pricing save, `reseedSeededPauseThresholds` updates `'seeded'` rows only |
| Z-2 | Closed | `needsThresholdSeed` — market/pricing lookup only when remittance account is missing |
| Desk UX | Closed | Default vs Custom override badge; Pricing labels distinguish Default vs town |

## 30.2 Ops

- Desk Save threshold = custom override; survives Default pricing saves.
- Pricing Default COD pause moves couriers still on Default.
- **Superseded by Part 33:** COD pause is platform Default only — town/parish no longer set remittance pause.
- `NOTIFY pgrst` remains on RPC/schema migrations (Y-3).

Q1 / Q4 / Q5 remain deferred.

---
---

# Part 31 — Threshold layering review (verified 2026-09-15)

Eighth pass. **Z-1 and Z-2 are both closed, and closed well.** One thread remains, and it is a
design question rather than a bug.

## 31.1 Verification run

```
REMITTANCE_S6_DIFF=1 node scripts/check-remittance-separation.mjs   OK (S-2/S-3/S-4/S-6)
deno test supabase/functions/delivery/remittance/                   17 passed, 0 failed
pnpm --filter @roam/fleet test                                      1404 passed, 0 failed
```

| Item | Verified |
|------|----------|
| **Z-1 override stamping** | `PATCH .../threshold` now sets `threshold_source: 'override'` — and was changed from `upsert` to `update` + `.eq(courier_id)` with a 404, closing the account-creating edge too |
| **Z-1 re-seed** | `reseedSeededPauseThresholds` filters `.eq("threshold_source", "seeded")`, wired into the global pricing save |
| **Z-1 visibility** | Desk shows whether a courier's threshold is seeded or an override |
| **Z-2 hot path** | `getRemittanceAccount` first; market lookup + layer resolution only when the account is absent |

Both halves of Z-1 landed in the right order — the writer that maintains the column was fixed
before the reader that trusts it. That was the part that mattered.

## 31.2 Open

### AA-1 — Re-seeding is flat, but seeding is layered

The two paths disagree about what a courier's threshold should be.

**Seeding at creation is layer-aware.** `resolveCodPauseThresholdMinor` calls
`resolvePricingLayers(db, { marketId })` and reads the resolved `cod.pauseThresholdJmd`, so a
new courier picks up their market's or parish's value.

**Re-seeding is flat.** `reseedSeededPauseThresholds` writes one value to every seeded row:

```ts
.update({ pause_threshold_minor: thresholdMinor })
.eq("threshold_source", "seeded");          // no market or parish scope
```

Two consequences:

1. **A global pricing save flattens the layers.** A courier seeded at a market's J$20,000 is
   silently reset to the global J$10,000 the next time anyone saves global pricing. The market
   layer is honoured exactly once and then discarded.
2. **Market and parish saves re-seed nobody.** Only the `global_pricing_profiles` route calls
   the re-seed; the `market_pricing_profiles` and `parish_pricing_profiles` routes
   ([`pricingRoutes.ts:741,862,878,920`](../supabase/functions/delivery/admin/pricingRoutes.ts))
   do not. So the original Y-1 complaint — *changing a threshold does not move existing
   couriers* — still holds at exactly the layer where operators tune it.

### The design question underneath

Scoping the re-seed by market is not simply a missing `WHERE` clause, because **a courier has
no market.** The seed uses `marketIdForOrder` — the market of whichever COD order happened to be
their first. A courier who works across Kingston and Spanish Town gets whichever one they
delivered in first, permanently, by accident.

So there are two coherent designs, and the code currently implies both:

- **Threshold is a courier attribute** (today's storage). Then it needs a defensible source —
  the courier's home market or fleet, not their first order — and re-seeding scopes to that.
- **Threshold is a market rule evaluated at pause time.** Then `pause_threshold_minor` stops
  being stored per courier except as an override, `is_paused` can no longer be a generated
  column, and the pause gate resolves layers on read.

The first keeps the generated-column guarantee that made C-3 unrepresentable, and is the
smaller change. The second is more correct but gives up the structural pause guarantee — not
worth it.

**Recommended:** keep the threshold on the account, but source it from something stable. If
couriers have a home market or fleet attribution, seed from that instead of
`marketIdForOrder`, and scope the re-seed the same way. If they genuinely have no stable
market, then say so and make the **global** value the only seed source — flat re-seeding is
then correct, market-layer COD thresholds should be removed from the rules form, and Part 19
Q2 records that COD pause is a platform-wide default with per-courier overrides.

Either way the current state is the one to avoid: a layered seed and a flat re-seed that
overwrite each other, with the winner decided by which screen someone saved last.

## 31.3 What is done

Everything else. The ledger, the separation from Driver Settlements, the admin surface,
deployment safety, and threshold provenance are all complete and verified across eight passes.
AA-1 affects only which number a courier is paused at — never how much they owe, which is
recorded correctly regardless.

---
---

# Part 32 — Threshold scope review (verified 2026-09-15)

Ninth pass. AA-1 was answered with a **third option I did not list, and it is the better
one**: rather than changing the layering, the knobs were relabelled to state exactly what each
scope does. A control that tells the truth about its blast radius is usually worth more than a
control that does something cleverer.

## 32.1 Verification run

```
REMITTANCE_S6_DIFF=1 node scripts/check-remittance-separation.mjs   OK (S-2/S-3/S-4/S-6)
deno test supabase/functions/delivery/remittance/                   17 passed, 0 failed
pnpm --filter @roam/fleet test                                      1404 passed, 0 failed
```

The COD field in the rules form is now scope-aware
([`RiderRulesForm.tsx:113`](../packages/dash-admin/src/pages/pricing/marketRules/RiderRulesForm.tsx)):

| Scope | Label | Tip |
|-------|-------|-----|
| Default | "Default COD pause (applies to couriers still on Default)" | Saving Default updates couriers still on Default; desk Save locks an override |
| Area | "Default for new remittance accounts in this area (first cash delivery)" | Applies at account creation; **does not bulk-update existing couriers** |

`RiderRulesReadonly` takes the same `scopeLabel`, so the read-only view cannot drift from the
editable one.

## 32.2 Open

### AB-1 — The new copy is accurate for two cases out of three

`threshold_source` has two values, but there are three real provenances:

| Real case | Stored as |
|-----------|-----------|
| Seeded from the global Default | `'seeded'` |
| Seeded from a market / parish layer | `'seeded'` ← same value |
| Operator set it on the desk | `'override'` |

`apply_remittance_event` stamps `'seeded'` unconditionally
([`20260915210000_remittance_threshold_source.sql:64`](../supabase/migrations/20260915210000_remittance_threshold_source.sql)),
regardless of whether `p_pause_threshold_minor` was resolved from the global default or from a
market layer. The re-seed then matches on `.eq("threshold_source", "seeded")` with no scope
distinction.

So for a courier seeded at a market's J$20,000:

- The Default tip says a Default save updates "couriers still on Default" — **this courier is
  not on Default**, but a Default save moves them to J$10,000 anyway.
- The Area tip says the area value "does not bulk-update existing couriers" — true, but it
  understates: the area value is applied once at account creation and then **silently
  overwritten by the next Default save**.

Both statements are individually defensible and together they are misleading, which is the
failure mode the relabelling set out to fix. The copy is now honest about *when* each knob
applies and still silent about *which one wins*.

**Fix — one more provenance value, so the re-seed can honour the promise:**

```sql
ALTER TABLE delivery.courier_remittance_accounts
  DROP CONSTRAINT courier_remittance_accounts_threshold_source_check;
ALTER TABLE delivery.courier_remittance_accounts
  ADD CONSTRAINT courier_remittance_accounts_threshold_source_check
  CHECK (threshold_source IN ('seeded_default', 'seeded_area', 'override'));
```

`apply_remittance_event` gains a `p_threshold_scope` (the caller already knows — `collectOnDelivery`
resolves the layer and can compare it against the global default), and the re-seed narrows to
`.eq("threshold_source", "seeded_default")`. Existing `'seeded'` rows migrate to
`'seeded_default'`, which is what they effectively are today.

That makes both tips literally true: a Default save moves only couriers actually on Default, and
an area value survives until someone overrides it.

**Cheaper alternative if the layering is not worth the schema churn:** drop `cod.pause_threshold_jmd`
from the area rules form entirely and keep it only at Default. The area knob currently buys one
courier one initial value that the next Default save erases — that is close to no value, and the
simplest honest control is the one that is not there.

## 32.3 What is done

Everything else, across nine passes: the ledger, the separation from Driver Settlements, the
admin surface, deployment safety, threshold provenance and now threshold copy. AB-1 is the last
thread of the threshold story and, like AA-1, touches only which number a courier is paused at —
never what they owe.

---

# Part 33 — Platform-only COD pause (verified 2026-09-15)

**Closeout implementation.** AB-1 / AA-1 closed by the cheaper alternative from Part 32.3: **drop area COD pause**
and keep one platform Default plus Remittance Desk overrides.

## 33.1 Locked decision

| Source | Role |
|--------|------|
| Pricing **Default** `cod.pause_threshold_jmd` | Seeds new remittance accounts; reseeds rows with `threshold_source = 'seeded'` on Default save |
| Remittance Desk Save threshold | Sets `threshold_source = 'override'`; survives Default saves |
| Town / parish rider rules | **No** COD pause control; historical blob values ignored for remittance |

`threshold_source` stays `'seeded' | 'override'` (no three-value schema). Couriers have no stable
home market, so layered seed + layered reseed was expensive and still accidental (first COD order).

## 33.2 What changed

- [`resolveCodPauseThresholdMinor`](../supabase/functions/delivery/remittance/collectOnDelivery.ts)
  resolves **global** pricing layers only (`resolvePricingLayers(db, {})`). `marketIdForOrder` is
  gone from the threshold path.
- Rider / legacy Pricing forms show the COD pause field **only** on Default scope.
- Desk copy: “Saving here locks a custom override. Pricing Default updates only couriers still on
  Default.” (no town / first-delivery sentence.)
- [`reseedSeededPauseThresholds`](../supabase/functions/delivery/remittance/reseedSeededThresholds.ts)
  unchanged — still Default-only on global save.

## 33.3 Optional ops (report only)

Seeded accounts whose `pause_threshold_minor` ≠ current global Default may be listed in SQL for
ops to desk-override or wait for the next Default save. No auto-migrate.

## 33.4 Gates

| Check | Pass |
|-------|------|
| Deno remittance | green (`--allow-read --allow-env`) |
| Fleet tests | green |
| `REMITTANCE_S6_DIFF=1` | OK; empty `fleet-financials` diff |
| Manual | Town form has no COD pause; Default save moves seeded, not override; first collect matches Default |

Money path (bag split, settle, write-off) unchanged. Q1 / Q4 / Q5 remain deferred.

---
---

# Part 34 — Remittance closeout (verified 2026-09-15)

**Independent verification / freeze.** **AB-1 is closed, and the whole threshold thread with it.** Nothing remains open in
the Delivery Remittance workstream.

## 34.1 Verification run

```
REMITTANCE_S6_DIFF=1 node scripts/check-remittance-separation.mjs   OK (S-2/S-3/S-4/S-6)
deno test supabase/functions/delivery/remittance/                   17 passed, 0 failed
pnpm --filter @roam/fleet test                                      2 failed | 1402 passed   ← see 34.3
```

The two fleet failures are **not** remittance — see 34.3.

## 34.2 AB-1 closed, and closed the right way

The cheaper option was taken, and taken completely — the control was removed *and* the code that
read it was removed, in the same change:

| Layer | Before | Now |
|-------|--------|-----|
| Seed | `resolveCodPauseThresholdMinor(sb, marketId)` → `resolvePricingLayers(db, { marketId })` | `resolveCodPauseThresholdMinor(sb)` → `resolvePricingLayers(db, {})` — global only, with the reason in a comment |
| `marketIdForOrder` | merchant lookup per collection | **deleted** |
| Re-seed | global Default | unchanged — now agrees with the seed |
| Rules form | COD pause on every scope | rendered only when `scopeLabel === 'default'`, in both the editable and read-only views |

This is why the fix is complete rather than cosmetic: hiding the field alone would have left
area profiles seeding couriers from a value nobody could see. Removing the layered lookup means
the stale `cod.pause_threshold_jmd` still serialized into area rule blobs is now genuinely dead
data rather than an invisible input.

**`threshold_source` is now correct as designed.** Two stored values for two real provenances:
seeded from the platform Default, or overridden on the desk. The third case AB-1 identified no
longer exists, so the column does not need a third value.

The threshold story across Parts 26–34 ended in the right place: **COD pause is a platform-wide
default with per-courier overrides**, seed and re-seed read the same source, the desk shows which
couriers are overridden, and the UI offers exactly one knob for it. Part 19 Q2 is answered.

## 34.3 Not remittance — two fuel tests are failing

```
FAIL src/utils/fuelBrainClassify.test.ts
  > flag-off recon parity (legacy residual) > with brainClassification puts residual in Personal
  AssertionError: expected 0 to be greater than 0

FAIL src/utils/personalAllowance.recon.test.ts
  > calculateReconciliation personal allowance
  > flag-on: company absorbs earned; overage to driver; shares balance
  AssertionError: expected +0 to be 40
```

Neither file references remittance, and no remittance change in this round touches fuel. They
come from the concurrent fuel reconciliation workstream — `FuelPeriodWizard`, `FuelLeakageStep`,
`buildFuelWizardRows`, `useFuelWizardActions` and a dozen sibling files are modified in the same
working tree.

**This suite passed 1404/1404 at the Round 9 check and fails 2 now**, so the regression landed
between those two points, from the fuel side. Flagged here only because
`pnpm --filter @roam/fleet test` is a CI step and is currently red — the fix belongs to the fuel
workstream, not this one.

## 34.4 Delivery Remittance — final state

Ten passes. Every finding raised in Parts 11, 22, 24, 25, 26, 28, 29, 31 and 32 is closed.

| Area | State |
|------|-------|
| Ledger | All five event types sign-constrained; balance arithmetic and trial balance enforced by CHECK; append-only |
| Concurrency | One `SECURITY DEFINER` RPC under `FOR UPDATE`; idempotent on replay **and** on concurrent duplicate |
| Refusals | Every endpoint validates before the first write — overdraw, stale balance, invalid reason, short notes |
| Corrections | Reversal for settlements and write-offs; nothing mutates, nothing deletes |
| Pause | `is_paused` generated from balance vs threshold; gate folded into `requireActiveCourier` so no accept path can skip it |
| Separation | `fleet-financials/**` untouched; S-2/S-3/S-4/S-6 enforced in CI with the diff gate on |
| Recon | Drift, missing collections, trial-balance breaks, stale pending — all alerted; exceptions queue drainable |
| Admin | One balance list, one history view, one settle path; retired routes return 410 naming their replacement |
| Courier | Balance, threshold progress, per-order breakdown, paused screen — remittance never mixed with earnings |
| Ops | Kill-switch fails over to legacy rather than going silent; `NOTIFY pgrst` on signature changes |

Deferred by product decision, not oversight: **Q1** netting COD against earnings payouts, **Q4**
fleet claim on courier COD, **Q5** courier self-reported remittance. The schema is ready for Q5
(`pending` status plus `external_ref`) whenever it is wanted.

**Remittance workstream frozen.** No Part 35. Further cash questions are product (Q1 / Q4 / Q5) or
other streams (e.g. fuel CI).

