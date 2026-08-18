# RoamFleet — Financial Integrity Audit

**Date:** 2026-08-18
**Implementation:** Phases 0–7 landed 2026-08-18. ADRs 0006–0012 accepted. `@roam/finance-core` is the driver-week formula. Screens read `ledger.driver_financial_periods` (`FIN_READ_PROJECTION_*` default ON; set `0` to roll back). Nightly job: `finance-recon`. Baseline: `docs/finance-recon/`.

**Scope:** Every screen in `apps/fleet` that displays money, and the server code that produces those numbers.
**Perspective:** Senior accountant + systems engineer. Read-only audit. **No code was changed.**
**Trigger:** Driver Settlements shows Kenny Gregory Rattray owing $18,867.05 for Aug 3–9 2026, which the owner believes is wrong; and the Driver Overview cards show figures whose origin is unclear.

---

## 1. Executive verdict

The problem is not arithmetic. Every individual formula I read is internally sensible, and the core settlement formula is genuinely shared and genuinely well tested.

**The problem is that the app has no single definition of "a week", no single definition of "cash", and no single ledger that all screens read.** Each screen assembles its own answer from a different subset of the raw data, using its own date rule, its own fallback chain, and its own preference order between sources. When two screens disagree — and they do, by tens of thousands of dollars — neither is "the bug". They are two different, independently defensible answers to two subtly different questions, presented to you as if they were the same question.

This is why it feels like "a big jungle of mess". It is not messy code. It is a **missing accounting layer**. There is no general ledger with debits and credits and an enforced trial balance; there are ~7 independent projections over raw operational data, each with its own rules, and 150 comments in the codebase asserting "SSOT / source of truth" about mutually inconsistent things.

The good news: the raw data (CSV imports, driver logs, toll ledger, fuel reports) appears sound, and the bones of the right architecture already exist (`ledger.entries`, `ledger.financial_events`, `driver_financial_periods`, `computePeriodSettlement`). What is missing is **discipline about which layer is authoritative**, plus a handful of genuine defects.

**Bottom line for the business:** the Driver Settlements desk is the *most* trustworthy money screen in the app, because it is the only one derived from a persisted, versioned, hash-stamped projection. The Driver Overview cards and the Business Finance P&L are the *least* trustworthy, and the P&L in particular contains an error that materially misstates profit (Finding 1.1).

---

## 2. Map of the money engines that exist today

There are **five** independent things in this codebase that compute "what a driver earned and owes for a week", and **three** that compute "how the business did".

| # | Engine | Lives in | Feeds | Basis |
|---|---|---|---|---|
| A | `rebuildDriverFinancialPeriod` | [driver_financial_periods.ts:296](supabase/functions/_fleet-server/driver_financial_periods.ts#L296) | Driver Settlements desk, Driver Balances, period detail | Persisted projection into `ledger.driver_financial_periods` |
| B | `buildLedgerPayoutPeriodRows` | [buildLedgerPayoutPeriodRows.ts](apps/fleet/src/utils/buildLedgerPayoutPeriodRows.ts) | Driver detail → Financials / Payout / Settlement tabs | Recomputed in the browser, every render |
| C | `aggregateCanonicalEventsToLedgerDriverOverview` | [ledgerMoneyAggregate.ts:511](apps/fleet/src/utils/ledgerMoneyAggregate.ts#L511) | Driver Overview cards + breakdown modal | Recomputed server-side per request |
| D | `calculateCashSettlement` (fleet copy) | [cashSettlementCalc.ts](apps/fleet/src/utils/cashSettlementCalc.ts) | Cash Wallet tab | Recomputed in the browser |
| E | `calculateCashSettlement` (driver-app copy) | [apps/driver/src/utils/cashSettlementCalc.ts](apps/driver/src/utils/cashSettlementCalc.ts) | The **driver's own app** | Divergent copy of D — different definitions |
| F | `buildPnLFromCanonicalEvents` | [businessFinancePnL.ts:48](apps/fleet/src/components/business-finance/businessFinancePnL.ts#L48) | Business Finance → P&L | Recomputed in the browser |
| G | `fetchBusinessFinanceBundle` | [fetchBusinessFinanceBundle.ts:53](apps/fleet/src/components/business-finance/fetchBusinessFinanceBundle.ts#L53) | Business Finance → Overview KPIs | Mixes F with per-driver A snapshots |

Engines A and B share the same final formula (`computePeriodSettlement`) but are fed by **completely different input pipelines**. A reads the toll ledger, `financial_events`, canonical fare rows and trips on the server. B reads transactions, cash weeks, finalized fuel reports and dispute refunds in the browser. They will agree only by coincidence.

### The four incompatible definitions of "which week does this money belong to"

This is the single biggest source of the mismatches you are seeing.

| Rule | Where | Behaviour |
|---|---|---|
| **Fleet calendar day** | `fleetCalendarDay(date, timezone)` used throughout Engine A | Strict. Converts the timestamp to America/Jamaica and takes the Mon–Sun week. |
| **±14-day grace band** | [`canonicalEventInSelectedWindow`](apps/fleet/src/utils/ledgerMoneyAggregate.ts#L468) used by Engine C | Deliberately fuzzy. Statement/payout rows with no period fields are pulled in if dated **up to 14 days after** the selected window ends. |
| **Span-5-to-10 heuristic** | [`payoutBankEventWeekKey`](apps/fleet/src/utils/ledgerBankSettled.ts#L33) | If the statement period spans 5–10 days, use the week of `periodStart`; otherwise use the week of `date`. |
| **Naive string compare** | [`inPeriod`](apps/fleet/src/components/business-finance/periodRange.ts) used by Engines F and G | `d >= startYmd && d <= endYmd` on a raw UTC-ish date slice. No timezone conversion at all. |

A single Uber statement line can legitimately land in **three different weeks** depending on which screen you are looking at. Rule 2's ±14-day band in particular means the same dollar can appear in **two adjacent weeks at once** on the Driver Overview.

---

## 3. Findings, ranked

### Severity 1 — Wrong numbers on screen today

---

#### 1.1 The P&L subtracts passenger cash as if it were a payment to the driver

**File:** [businessFinancePnL.ts:60-66](apps/fleet/src/components/business-finance/businessFinancePnL.ts#L60-L66)

```ts
if (t === 'payout_cash' || t === 'driver_payout') {
  driverPayouts += eventAmount(e);
}
```

`payout_cash` does **not** mean "the fleet paid the driver". Everywhere else in the codebase it means **"cash the driver collected from passengers"** — an *inflow*, an asset that arrives in the driver's pocket and becomes a receivable owed to the fleet. The event is created here with `direction: 'inflow'` and the literal description `'Cash collected (payments_driver)'`:

- [buildCanonicalImportEvents.ts:242](apps/fleet/src/utils/buildCanonicalImportEvents.ts#L242) — creation
- [periodShareCash.ts:149](apps/fleet/src/utils/periodShareCash.ts#L149) — *"Uber cash prefers ledger payout_cash"* (as cash **owed by** the driver)
- [ledgerBankSettled.ts:88](apps/fleet/src/utils/ledgerBankSettled.ts#L88) — `sumLedgerCashCollectedForWeek`
- [cashSettlementCalc.ts:59](apps/fleet/src/utils/cashSettlementCalc.ts#L59) — *"passenger cash (Uber payout_cash + …)"*

The P&L is the only consumer that reads it as an expense.

**Accounting impact:** operating profit is understated by the full amount of passenger cash collected in the period. For Kenny's week alone that is on the order of **$30,927** of Uber cash being booked as an expense that never occurred. Across the fleet this is the largest single distortion in the app.

**Compounding issue:** the driver's **commission share** — the actual, real cost of revenue, typically 25–33% of gross — is **never expensed anywhere in the P&L**. The P&L goes gross → less platform fees → less fuel/tolls/maintenance/overhead → less "driver payouts". There is no `driverShare` line. So the P&L simultaneously books a phantom expense and omits the single largest real one.

---

#### 1.2 "Net fare + tips" double-counts tips

**File:** [OverviewMetricsGrid.tsx:983-990](apps/fleet/src/components/drivers/OverviewMetricsGrid.tsx#L983-L990)

```tsx
${fmtMoney((resolvedFinancials.periodEarnings || 0) + (resolvedFinancials.totalTips || 0))}
```

`periodEarnings` **already includes tips**. In [`accumulateWindow`](apps/fleet/src/utils/ledgerMoneyAggregate.ts#L286-L293), statement mode does `pEarnings += netFareStatement + tipsStatement + promotions − refunds`, and trip mode does `pEarnings += net` for every `tip` event. `pTips` is a *memo* of the same tips, not an additional amount.

Your screenshot confirms it exactly: `$86,020.68 + $580.00 = $86,600.68`. The caption printed directly underneath even admits it — *"Sum of platform trip earnings lines: $86,020.68 (includes tips on fare lines)"*.

**Impact:** the modal's headline subtotal overstates driver earnings by the full tips amount.

---

#### 1.3 "Dispute recoveries" is displayed inside the Fare & Tips block but excluded from its subtotal

**File:** [OverviewMetricsGrid.tsx:975-982](apps/fleet/src/components/drivers/OverviewMetricsGrid.tsx#L975-L982)

This is the $14,404.07 you circled. It is rendered between "Tips (all platforms)" and "Net fare + tips", which reads unambiguously as a component of that subtotal. It is not one — and correctly so. The aggregator deliberately keeps it out:

```ts
} else if (et === "toll_support_adjustment" || et === "dispute_refund") {
  // Dispute / toll-support recoveries belong on Toll Refunded only — never Period Earnings.
  a.pDisputeRefunds += Math.abs(net);
}
```

The **logic is right**; the **placement is wrong**. A dispute recovery is a toll reimbursement, not fare income. Putting it in the fare section under a running subtotal it does not belong to is exactly the kind of thing that makes you distrust every other number on the page. It belongs in the Toll Refunded card only — which, correctly, is where the same $14,404.07 already appears.

---

#### 1.4 The mystery "Other $95.76" is money with no platform tag

**File:** [ledgerMoneyAggregate.ts:56-70](apps/fleet/src/utils/ledgerMoneyAggregate.ts#L56-L70)

```ts
function effectivePlatform(e: CanonicalMoneyEvent): string {
  if (e.platform && e.platform.trim()) return normPlatform(e.platform);
  // …a whitelist of event types defaults to "Uber"…
  return "Other";
}
```

"Other" is not a business category. It is **the bucket for canonical ledger events whose `platform` field is blank or unrecognised**. Your $95.76 is real money in the ledger that no import or writer stamped with a platform.

**Impact:** small in dollars, large in trust — and it is a silent data-quality alarm that currently renders as a legitimate-looking platform row. There is no validation anywhere that rejects or flags a money event with no platform.

---

#### 1.5 "Cash Collected" on the Overview and "Passenger cash" on the Settlement desk are different quantities

Your screenshots show **$55,147.05** (Overview) versus **$84,172.52** (Settlement desk) for the same driver, same week — a $29,025 gap. Both are "correct" for their own definition:

**Settlement desk** ([periodShareCash.ts:190-192](apps/fleet/src/utils/periodShareCash.ts#L190-L192)):
```ts
const uberFromLedger = Math.abs(Number(uberPayoutCash) || 0) > 0.005;
const uberCash = uberFromLedger ? round2(Math.abs(uberPayoutCash)) : round2(uberTripCashFallback);
const passengerCash = round2(uberCash + nonUberTripCash);
```
Uber cash from `payout_cash` if any exists, else the trip sum. Bucketed by fleet calendar day.

**Overview** ([DriverDetail.tsx:2313-2345](apps/fleet/src/components/drivers/DriverDetail.tsx#L2313-L2345)): starts from ledger cash, then **overwrites Uber with a CSV rollup**, then **overwrites every non-Uber platform with a recomputed trip sum**, then sums. Bucketed by the ±14-day grace rule.

So the headline is a three-source composite (CSV for Uber, trips for others, ledger for nothing) filtered on a fuzzy window, compared against a two-source composite (ledger-preferred for Uber, trips for others) on a strict window. **Neither is wrong. They answer different questions and are labelled identically.**

**This is the single clearest illustration of the whole problem.** Until "passenger cash for week W" has exactly one definition and one owner, these two numbers will keep diverging as imports land.

---

#### 1.6 The Driver Settlements "Driver owes" KPI adds two incompatible accounting bases together

**File:** [DriverSettlementsPage.tsx:330-350, 463](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L330-L350)

The Collect queue merges rows from two different endpoints:

- `driver-owes` → `amountOwed = |settlementAmount|` — a **fully settled, post-fuel-finalization net position**
- `cash-held` → `amountOwed = cashStillHeld` — **cash physically held on weeks that are not yet finalized**, before earnings are netted off

These are then summed into one "Driver owes" figure. That total is neither a receivable nor a cash-on-hand balance; it is a mixture. A single driver could appear with a $5,000 *settled debt* and another driver with $40,000 of *unfinalized float*, and the KPI presents $45,000 as one comparable number.

For Kenny's Aug 3–9 row the status chip reads "Driver owes", so his $18,867.05 comes from the `driver_owes` branch (`|settlementAmount|`) — a real settled position. But the KPI it rolls into is not a clean receivable.

---

#### 1.7 Business Finance "cash collected" sums the wrong field

**File:** [fetchBusinessFinanceBundle.ts:135](apps/fleet/src/components/business-finance/fetchBusinessFinanceBundle.ts#L135)

```ts
cashCollected += Number(p.cashReturned) || 0;
```

The variable is named `cashCollected` and feeds a KPI labelled as such, but it sums `cashReturned` — cash the driver **handed back to the fleet**. Those are opposite ends of the cash cycle. `p.cashCollected` exists on the same object and is not used.

---

#### 1.8 Business Finance books accrued settlements as if they were payouts, and silently switches basis

**File:** [fetchBusinessFinanceBundle.ts:140-141, 197-201](apps/fleet/src/components/business-finance/fetchBusinessFinanceBundle.ts#L140-L141)

```ts
const settlement = Number(p.settlementAmount) || 0;
if (settlement > 0) driverPayoutsFromPeriods += settlement;
…
const driverPayouts = Math.abs(driverPayoutLine) > 0.005
  ? Math.abs(driverPayoutLine)          // ← the payout_cash figure from Finding 1.1
  : round2(driverPayoutsFromPeriods);   // ← accrued outstanding settlements
```

Two problems stacked. First, an outstanding settlement is an **accrual (a liability)**, not a payout (a cash movement) — booking it as a payout is a basis error. Second, the KPI **silently flips between the two definitions** depending on whether any `payout_cash` events happened to land in the window. The same week can change its reported "driver payouts" purely because an import arrived, with no indication on screen.

---

#### 1.9 Business Finance silently truncates the fleet at 80 drivers

**File:** [fetchBusinessFinanceBundle.ts:105, 118-120](apps/fleet/src/components/business-finance/fetchBusinessFinanceBundle.ts#L105)

```ts
const packs = await mapPool(drivers.slice(0, 80), 4, async (d) => { … });

if (drivers.length > 80) {
  /* truncated flag set below — do not push soft note into hard incomplete banner */
}
```

Beyond 80 drivers, every driver-derived Business Finance total — cash collected, cash still held, write-offs, fuel spend, driver payouts, the debtors list, the Driver Balances tab — silently omits the remainder. The comment shows this was a deliberate decision to keep it *out* of the "incomplete data" banner.

**This is a hard ceiling on the correctness of your business view as the fleet grows**, and it fails quietly.

---

#### 1.10 Failed data fetches render as legitimate zeros

**File:** [fetchBusinessFinanceBundle.ts:73-86, 237-253](apps/fleet/src/components/business-finance/fetchBusinessFinanceBundle.ts#L73-L86)

Bank confirms, drivers, toll variance health and fuel variance health are each wrapped in `try { … } catch { /* optional */ }`. Per-driver period fetches swallow errors and return `periods: []`. A network failure or a permissions error therefore produces **$0.00 rendered as a real value**, not an error state. Some paths push to an `incomplete[]` banner; several do not.

For a screen you use to judge business health, a zero that means "we couldn't load it" is more dangerous than a crash.

---

#### 1.11 Negative net balances are floored to zero, destroying real credits

**File:** [businessFinancePnL.ts:351-356](apps/fleet/src/components/business-finance/businessFinancePnL.ts#L351-L356)

```ts
fuel: round2(Math.max(0, fuel)),
maintenance: round2(Math.max(0, maintenance)),
fixed: round2(Math.max(0, fixed)),
operating: round2(Math.max(0, operating)),
```

When recoveries legitimately exceed gross spend for a period — a large refund, a reversal, a corrected import — the credit is thrown away rather than carried. `computeTollFleetLossNetting` / `computeFuelFleetLossNetting` set a `clipped` flag that produces a *note*, but the number itself is already destroyed by the time it renders. A ledger must be able to represent a credit balance.

---

#### 1.12 The expense register shows 100 rows against an all-rows total

**File:** [businessFinancePnL.ts:363](apps/fleet/src/components/business-finance/businessFinancePnL.ts#L363)

```ts
rows: rows.slice(0, 100),
```

Totals are computed over every row; the drill-down returns at most 100. Any attempt to tie the register to its own total will fail past 100 transactions, with nothing on screen to say why.

---

#### 1.13 The P&L line items do not sum to the displayed operating profit

**File:** [fetchBusinessFinanceBundle.ts:204-206](apps/fleet/src/components/business-finance/fetchBusinessFinanceBundle.ts#L204-L206)

```ts
const profitLine = round2(profitLineBase - cashWrittenOff);
```

Cash write-offs are subtracted *after* the P&L returns, at the bundle layer, and never appear as a line item. The statement therefore does not foot. In an audited set of books this alone would be a finding.

---

### Severity 2 — Structural: guarantees the numbers will drift apart

---

#### 2.1 Two settlement engines fed by two different data pipelines

Engine A ([`rebuildDriverFinancialPeriod`](supabase/functions/_fleet-server/driver_financial_periods.ts#L296)) and Engine B ([`buildLedgerPayoutPeriodRows`](apps/fleet/src/utils/buildLedgerPayoutPeriodRows.ts)) both end by calling the same `computePeriodSettlement`. That shared ending creates a false sense of unification, because **the inputs are assembled from entirely different sources**:

| Input | Engine A (server) | Engine B (browser) |
|---|---|---|
| `baseCashOwed` | `computeWeekCashBase` — trips + `payout_cash` | `cashWeeks[].amountOwed` or a trip recompute |
| `tollCashWash` | `tollCashSpend` — *all* cash toll spend | `max(0, explicitWash − tollCredits already in cashPaid)` |
| `tollPersonal` | Sum of `chargeTxAll` transactions | `tollCharged` from wallet Toll Charge rows |
| `fuelCredits` | `fuelFleetShare` from `financial_events` | `effectiveFuelCredits` from finalized fuel reports |
| `settlementPaid` | `isSettlementPaidForWeek` over driver txs | Not passed — applied later in `getPeriodSettlementComponents` |

Note the `tollCashWash` row especially: Engine A passes the **gross** cash toll spend; Engine B passes a **de-duplicated residual** specifically to avoid double-crediting tolls already inside `cashPaid`. If both are correct for their own pipeline, they cannot both be correct for the same week.

Additionally, Engine B's `unifiedToll` branch calls the shared formula with `tollCashWash: 0, tollPersonal: 0, fuelCredits: 0` and re-applies all three later in `getPeriodSettlementComponents`. So the "one shared formula" is really being used as two different partial calculations.

---

#### 2.2 Three divergent copies of `driverSettlementMath`, one with an inverted sign

| Copy | Lines | Formula |
|---|---|---|
| [apps/fleet](apps/fleet/src/utils/driverSettlementMath.ts) | 94 | `settlement = netPayout − stillHeld`, full toll/write-off/settlementPaid handling |
| [apps/driver](apps/driver/src/utils/driverSettlementMath.ts) | 85 | Same logic, header says *"Copy of apps/fleet — keep in sync"* |
| [apps/admin](apps/admin/src/utils/driverSettlementMath.ts) | 34 | **`settlement = adjCashBalance − netPayout`** — the sign is reversed, and tolls, write-offs and settlement payments are absent entirely |

The admin copy is currently unreferenced (no importers found), so it is not producing wrong numbers today. It is a live landmine: the moment anything in the admin app imports it, that screen reports every driver's position **with the opposite sign** and ignores three whole categories of adjustment.

`driverPeriodSettlement.ts` also exists twice (fleet 101 lines, driver 64 lines) — currently identical in behaviour, maintained by comment only.

---

#### 2.3 The driver's own app defines "cash owed" differently from the fleet desk

`cashSettlementCalc.ts` in `apps/driver` and `apps/admin` are byte-identical to each other and **materially different** from the `apps/fleet` copy:

| Field | driver / admin apps | fleet app |
|---|---|---|
| `amountOwed` | cash collected **+ float issued** | passenger cash only — *"never bank/float/personal"* |
| `amountPaid` | allocated + FIFO + surplus + toll credits + **fuel credits** | Log Cash tagged to the Settlement Week only; fuel credits explicitly excluded |
| Week bucketing | `startOfWeek` on local machine time | `weekBucketForDate(d, fleetTz)` — fleet timezone |

**The driver sees a different balance in their app than you see in the settlement desk, for the same week.** Float and fuel credits move between the two definitions. This is the kind of discrepancy that turns into a payment dispute you cannot win, because both screens are "the system".

---

#### 2.4 `driver_financial_periods` is never org-scoped — the column exists and is never written

The table is declared with an organization column and an index on it:

```sql
-- supabase/migrations/20260717140000_driver_financial_ledger_rebuild.sql:120
CREATE TABLE IF NOT EXISTS ledger.driver_financial_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  …
CREATE INDEX idx_dfp_org_period ON ledger.driver_financial_periods(organization_id, period_anchor DESC);
```

But **`organization_id` appears zero times in `driver_financial_periods.ts`.** The upsert body never sets it, so every row is written with `organization_id = NULL`. And none of the three list queries filter on it:

- [`listCompanyOwesPeriods`](supabase/functions/_fleet-server/driver_financial_periods.ts#L1195)
- [`listDriverOwesPeriods`](supabase/functions/_fleet-server/driver_financial_periods.ts#L1334)
- [`listCashHeldPeriods`](supabase/functions/_fleet-server/driver_financial_periods.ts#L1373)

All three run through `sb()`, which uses `SUPABASE_SERVICE_ROLE_KEY` and therefore **bypasses RLS**, reading `public.driver_financial_periods` — a plain `SELECT *` view over the table.

Every other read path in this codebase carefully applies `belongsToOrg()` / `filterByOrg()`. This one does not.

**Today** (single tenant) this produces correct totals. **The moment a second organisation exists**, the Driver Settlements desk sums both fleets into one KPI. And if anyone later enables RLS on that table to fix it, every row returns zero because `organization_id` is NULL. Both failure modes are silent.

---

#### 2.5 Uber money silently switches between statement basis and trip basis

**File:** [ledgerMoneyAggregate.ts:243-255, 319](apps/fleet/src/utils/ledgerMoneyAggregate.ts#L243-L255)

```ts
const uberUseStatementForFare = stmt.hasStatementLines && stmtHasFareBearingTotals;
…
const skipUberTripCashBecauseStatement = Math.abs(stmt.payoutCash) > 0.0001;
```

Whether Uber earnings come from imported statement lines or from per-trip `fare_earning` rows depends on whether statement lines with non-zero fare content **happen to exist** in the window. Whether Uber cash comes from the statement or from trips depends on whether `payout_cash` **happens to be non-zero**.

Consequences:
- The same week reports different Uber totals before and after a CSV import lands.
- The two switches are independent, so a week can be on statement basis for fare and trip basis for cash simultaneously.
- The two sources are **never reconciled against each other** — one simply suppresses the other. A genuine discrepancy between Uber's statement and your trip log is invisible rather than flagged.

---

#### 2.6 Money is silently dropped in two places

**File:** [ledgerMoneyAggregate.ts:380-396](apps/fleet/src/utils/ledgerMoneyAggregate.ts#L380-L396)

```ts
} else if (et === "prior_period_adjustment") {
  if (e.sourceType === "import_batch") { continue; }   // dropped
…
} else if (et === "promotion") {
  if (plat === "Uber" && !uberHasStatement) { continue; }  // dropped
```

Both are defensible anti-double-count guards. Neither leaves a trace. There is no "excluded to avoid double-count: $X" memo anywhere in the response, so you cannot tell a correctly-suppressed duplicate from genuinely missing money.

---

#### 2.7 The data-completeness indicator is hardcoded to "complete"

**File:** [ledgerMoneyAggregate.ts:529-535](apps/fleet/src/utils/ledgerMoneyAggregate.ts#L529-L535)

```ts
const completeness = {
  totalTrips: p.pTripCount,
  ledgerTrips: p.pTripCount,
  isComplete: true,      // ← literal
  missingCount: 0,       // ← literal
  byPlatform: {},        // ← always empty
};
```

`totalTrips` and `ledgerTrips` are the *same variable*, so they can never disagree. This block can only ever report "complete". `DriverDetail` does run its own separate completeness guard, but this server-side signal is decorative and actively misleading.

---

#### 2.8 An accounting identity is violated in the tier/commission math

**File:** [periodShareCash.ts:129-132](apps/fleet/src/utils/periodShareCash.ts#L129-L132)

```ts
const driverShare = round2(grossRevenue * (pct / 100));
const fleetShare  = round2(grossRevenue - driverShare);
const earningsGross = round2(grossRevenue + tips);   // ← tips added here only
```

`earningsGross` includes tips; `driverShare + fleetShare` excludes them. So `earningsGross ≠ driverShare + fleetShare` by exactly the tips amount, and **tips are implicitly retained 100% by the fleet** in the settlement math while being displayed as part of the driver's gross.

Whatever the intended tip policy is, right now it is an emergent side-effect of where `tips` got added, not a stated rule.

---

#### 2.9 Month-boundary weeks get a truncated tier lookup

**File:** [periodShareCash.ts:118-127](apps/fleet/src/utils/periodShareCash.ts#L118-L127)

```ts
const mStart = monthStartYmd(periodAnchor);
const mEnd   = monthEndYmd(periodAnchor);
const cumulativeCap = periodEnd < mEnd ? periodEnd : mEnd;
```

Tier is chosen from month-to-date cumulative earnings. For a week straddling a month end (e.g. Jun 29 – Jul 5), the cumulative window is capped at Jun 30 — so the tier is set on a **partial week's** earnings, and the July portion of that week is counted toward neither month's tier progression. The driver can land in a lower tier purely because of where the calendar fell.

---

#### 2.10 Render-time mutation of a shared object in Driver Detail

**File:** [DriverDetail.tsx:2308, 2311](apps/fleet/src/components/drivers/DriverDetail.tsx#L2308)

```ts
metrics.platformStats['Dispute Recoveries'] = drRow;
…
delete metrics.platformStats['Dispute Recoveries'];
```

`resolvedFinancials` is a `useMemo` that **mutates the upstream `metrics` object** it depends on. React memos must be pure. This creates order-dependent, non-deterministic behaviour: whether "Dispute Recoveries" appears in a given breakdown depends on render order and memo cache state, not on the data. Any other consumer of `metrics` sees a phantom platform appear and disappear.

---

#### 2.11 Driver Balances totals and the cash-still-held KPI use different row sets

**File:** [fetchBusinessFinanceBundle.ts:131-166](apps/fleet/src/components/business-finance/fetchBusinessFinanceBundle.ts#L131-L166)

The KPI totals loop over **every period in range** (`for (const p of inRange)`), while `balanceRows` and `debtors` are built from **only the single latest period per driver** (`inRange.sort(…)[0]`). The Driver Balances tab therefore cannot foot to the cash-still-held KPI above it whenever a driver has more than one week in the selected range.

---

### Severity 3 — Hygiene and maintainability

- **150 separate "SSOT / single source of truth" comments** across `apps/fleet` and `_fleet-server`, asserting authority for mutually inconsistent things. These comments are now actively harmful: they stop the next reader from checking.
- **`resolvedFinancials: any`** ([OverviewMetricsGrid.tsx:273](apps/fleet/src/components/drivers/OverviewMetricsGrid.tsx#L273)) — the single most important financial object on the driver page is untyped, so the compiler cannot catch any of the field-name mismatches in Findings 1.7 and 1.2.
- **Server re-exports client code across the workspace boundary**: `supabase/functions/_fleet-server/driver_period_settlement.ts` is `export * from "../../../apps/fleet/src/utils/driverPeriodSettlement.ts"`. This is genuinely clever and is the *one* thing keeping the formula unified — but it makes an edge function depend on a frontend app's internals, with no test enforcing the contract. It belongs in `packages/`.
- **Single-file monoliths**: `_fleet-server/index.tsx` is 18,030 lines; `DriverDetail.tsx` is 5,276; `DriverSettlementsPage.tsx` is 1,771. Financial logic is embedded in all three.
- **`temp_fix.sql`, `tmp-migration-payload.json`, `tmp_chunk.txt`, `response.txt`, `package.json.backup`** are committed at repo root.
- **Overlapping duplicate migrations**: `20260717180000_driver_financial_periods_share_cash.sql` and `20260717221350_driver_financial_periods_share_cash.sql` share a name and both redefine the public view.

---

## 4. Direct answers to your three screenshots

**"Driver Settlements says I'm owed $18,867.05 for Aug 3–9 and I know it's wrong."**

The number is *internally consistent* — it is `|settlementAmount|` from the persisted `driver_financial_periods` row, produced by the well-tested shared formula. But it rests on `cashCollected = $84,172.52`, and the Overview screen computes the same week's cash as `$55,147.05` (Finding 1.5). At least one of those two is wrong, and they were produced by different pipelines with different date rules. **Reconciling those two cash figures for this one week is the highest-value thing you can do**, because whichever is wrong will be wrong for every driver and every week. My prior is that the settlement desk is closer to correct — it is the only one bucketing by fleet timezone rather than the ±14-day grace band.

**"Other — $95.76 — where does that come from?"**

Canonical ledger events with a blank or unrecognised `platform` field (Finding 1.4). Real money, no platform tag, no validation to catch it.

**"Dispute recoveries $14,404.07 in the fare & tips block."**

Correctly excluded from the earnings total, incorrectly *placed* under a subtotal it does not belong to (Finding 1.3). While you are in that modal, note that the "Net fare + tips" line right beneath it double-counts tips (Finding 1.2).

---

## 5. The remediation plan

You do not need to rewrite the app. You need to **demote six of the seven engines to views over one**. This section is the full execution plan for doing that safely — modeled on the phase/flag/sign-off discipline that already worked for you in `docs/LEDGER_UNIFICATION_PLAN.md`.

### Prime directive

Same rule as the ledger unification: **no breakage of working production behaviour.** Every phase is additive and reversible until its replacement has run in shadow, been verified against golden weeks, and soaked. Nothing legacy is deleted until Phase 7, and only with explicit sign-off. Numbers are allowed to *change* only at documented moments (Phase 2 fixes, Phase 4 cutovers), each with a written expected-diff.

### Target end-state (the "definition of done")

The app is "where it should be" when all five of these are true:

1. **One question, one answer.** Any money figure on any screen can be traced to a set of posted ledger rows, and two screens showing "the same thing" literally read the same projection. No screen recomputes money from raw operational data at render time.
2. **One week rule.** Exactly one `periodKeyFor()` function decides which Mon–Sun week any dollar belongs to, everywhere — fleet app, driver app, edge functions, imports.
3. **A P&L an accountant would sign.** Driver commission is expensed, passenger cash is not, write-offs are a line item, credits can go negative, and the lines foot to the profit figure.
4. **Failures are loud.** A fetch that fails, a driver beyond a cap, an event with no platform, a week where two projections disagree — each renders as an explicit warning, never as a plausible $0.00.
5. **Regression is impossible to miss.** Golden weeks assert every engine against the same hand-verified numbers in CI, and a scheduled reconciliation job compares screens against postings in production.

Each phase below lists the findings it closes, its exit gate, and how to verify. Do not start a phase until the previous phase's gate is signed.

---

### Phase 0 — Safety net & baseline (no behaviour change) · ~2–3 days — **Done 2026-08-18**

Before touching anything, capture what the app says *today*, so every later change has a before/after.

| Task | Detail |
|---|---|
| 0.1 Characterization goldens | Extend the [`kennyWeekSettlement.golden.test.ts`](apps/fleet/src/utils/kennyWeekSettlement.golden.test.ts) pattern: snapshot the **current outputs** of Engines A, B, C and D for three real weeks — Kenny Aug 3–9 (the disputed week), Kenny Jun 29–Jul 5 (already golden), and one quiet low-activity week. These are *characterization* tests: they pin current behaviour, right or wrong, so unintended drift fails CI. |
| 0.2 Reconciliation report script | A read-only script/endpoint that, for a given week, prints per driver: Overview cash & earnings (Engine C), Settlement desk passenger cash / still-held / settlement (Engine A), Cash Wallet owed/paid (Engine D), and the raw posting sums. Run it for the last 8 weeks and save the output — this is your **discrepancy inventory** and the baseline every later phase is measured against. |
| 0.3 Engine freeze | CI rule (or team rule): the seven engine files in §2 may not be edited unless the goldens pass and the edit references a finding number from this audit. Stops the jungle growing while you drain it. |

**Exit gate:** discrepancy inventory exists for 8 weeks; goldens green in CI.
**Rollback:** none needed — nothing changed.

---

### Phase 1 — Decide the truth (owner decision gate) · ~1–2 days, mostly your time — **Done 2026-08-18**

Most of the divergence is **undecided policy**, not bugs. Code cannot fix an ambiguity you haven't resolved. Work the §6 worksheet for Kenny Aug 3–9 by hand, then lock the following decisions as short ADRs in `docs/adr/` (same format as your ledger ADRs):

| Decision | Options | Currently the app does… |
|---|---|---|
| D1: Uber passenger cash source | `payout_cash` postings vs CSV rollup vs trip sum — pick one order, no silent switching | All three, differently per screen (Finding 1.5) |
| D2: Week membership | Strict fleet-calendar day (recommended) — statements split at import time | Four different rules (§2) |
| D3: Tips policy | Tips 100% to driver / commissioned like fares / 100% to fleet | Implicitly 100% fleet in settlement, displayed as driver gross (Finding 2.8) |
| D4: Tier at month boundary | Full-week cumulative vs calendar-month truncation | Truncated, silently penalizes straddling weeks (Finding 2.9) |
| D5: "Driver owes" KPI basis | Settled receivable only, with unfinalized float shown separately | Sums both into one number (Finding 1.6) |
| D6: P&L "Driver payouts" line | Actual cash paid out (`driver_payout` events) + separate commission COGS line | Passenger cash booked as expense; commission absent (Finding 1.1) |
| D7: Float / fuel-credit treatment in driver-facing balance | Align driver app to fleet definitions | Driver app includes float + fuel credits; fleet excludes (Finding 2.3) |

**Exit gate:** seven ADRs written; golden-week *expected* values updated to the decided policy (distinct from the Phase 0 characterization snapshots — you now have "what it says" and "what it should say" side by side).
**Rollback:** decisions are paper — revisable until Phase 2 ships.

---

### Phase 2 — Correctness hotfixes (no architecture change) · ~3–5 days — **Done 2026-08-18**

Every fix here is small, independently shippable, and verified against the Phase 0 goldens with a written expected-diff.

| # | Fix | Finding | Expected visible change |
|---|---|---|---|
| 2.1 | P&L: stop expensing `payout_cash`; source "Driver payouts" per D6; add `driver_commission_share` COGS line | 1.1 | Operating profit moves materially — **this is the point** |
| 2.2 | Remove the `+ totalTips` double-count in "Net fare + tips" | 1.2 | Modal subtotal drops by tips amount |
| 2.3 | Move "Dispute recoveries" row out of Fare & Tips into the Toll card only | 1.3 | Cosmetic |
| 2.4 | Business Finance KPI: sum `p.cashCollected`, not `p.cashReturned`; relabel if the *returned* figure is also wanted | 1.7 | KPI changes to the correct field |
| 2.5 | Cash write-offs become a visible P&L line instead of a post-hoc subtraction | 1.13 | P&L foots |
| 2.6 | Carry negative expense balances (remove `Math.max(0, …)` floors); render credits as credits | 1.11 | Rare periods show credit lines |
| 2.7 | Register: paginate or state "showing 100 of N" | 1.12 | Cosmetic |
| 2.8 | Delete `apps/admin/src/utils/driverSettlementMath.ts` (unreferenced, sign-inverted) | 2.2 | None — it's dead code |
| 2.9 | Remove the 80-driver cap (paginate `mapPool`) **and** surface truncation/fetch failures in the hard incomplete banner | 1.9, 1.10 | Totals grow if >80 drivers; failures visible |
| 2.10 | Write `organization_id` on every `driver_financial_periods` upsert; backfill existing NULLs; filter the three list queries on it | 2.4 | None today (single org) — critical before org #2 |
| 2.11 | Fix the `useMemo` mutation of `metrics.platformStats` (build a copy) | 2.10 | Deterministic rendering |
| 2.12 | Split the Collect KPI per D5: "Driver owes (settled)" and "Cash held (pre-finalize)" as two figures | 1.6 | Desk shows two honest numbers instead of one mixed one |
| 2.13 | Emit an "excluded to avoid double-count: $X" memo where the aggregator drops promotion / prior-period rows | 2.6 | Suppressed money becomes visible as a memo |

**Exit gate:** all fixes shipped behind normal review; every golden diff matches its written expected-diff; recon report (0.2) re-run and archived as the "post-hotfix baseline".
**Rollback:** each fix is an independent revert.

---

### Phase 3 — `packages/finance-core`: one vocabulary, one week rule · ~4–6 days — **Done 2026-08-18**

This is the highest-leverage structural change and it unlocks everything after it.

| Task | Detail |
|---|---|
| 3.1 Create `packages/finance-core` | Move `driverPeriodSettlement.ts`, `driverSettlementMath.ts`, `periodShareCash.ts`, `tollWeekPeriod`/week-bucket helpers, and money rounding into a real workspace package. The Deno re-export shims in `_fleet-server` point at the package instead of reaching into `apps/fleet/src`. |
| 3.2 One `periodKeyFor(event, fleetTz)` | Implements D2. Strict fleet-calendar Mon–Sun. The ±14-day grace band, the span-5-to-10 heuristic, and the naive string compare are all replaced by calls to this function. Statements that span weeks are **split at import time** into per-week postings — never re-interpreted at read time. |
| 3.3 Typed vocabulary | Export the §5 table below as actual types: `WeekKey`, `Money` (2dp), `Basis = 'accrual' \| 'cash'`, and a `DriverWeekStatement` interface. `resolvedFinancials: any` gets replaced by a real type — the compiler starts catching field-name bugs like 1.7. |
| 3.4 Kill the copies | `apps/driver` and `apps/admin` import from the package; their local `driverPeriodSettlement` / `driverSettlementMath` / `cashSettlementCalc` copies are deleted. The driver app now computes the driver's balance with the **fleet's** definitions (D7) — closes Finding 2.3. |
| 3.5 Platform required at write | Canonical event writers and import builders reject a money event with a blank/unknown `platform`. One-off backfill job tags or quarantines existing blank-platform rows (your $95.76). Closes Finding 1.4 for all future data. |

The canonical vocabulary, enforced in types, not comments:

| Term | Definition | Basis |
|---|---|---|
| Passenger cash | Physical cash a driver received from riders in week W | cash |
| Cash returned | Cash physically handed back, tagged to week W | cash |
| Cash still held | passenger cash + charged tolls − returned − fuel credit − toll wash − write-offs | cash |
| Driver share | Commission earned on week W's gross fares (tips per D3) | accrual |
| Settlement | driver share − cash still held | accrual |
| Outstanding | settlement − settlement paid | accrual |

`float`, `deficit FIFO`, `surplus` leave settlement math entirely; `bank settled` stays informational-only, never an input.

**Exit gate:** all four apps + edge functions import from `finance-core`; zero local copies remain (`grep` proves it); goldens green; a new golden asserts `periodKeyFor` against 20 hand-picked edge timestamps (midnight boundaries, TZ offsets, month straddles).
**Rollback:** package re-exports are drop-in; reverting is re-pointing imports.

---

### Phase 4 — One read path: screens read the projection, shadow-verified · ~2–3 weeks elapsed (mostly soak time) — **Done 2026-08-18** (soak: set `FIN_READ_PROJECTION_*=0` to roll back)

Now demote the recompute engines. `driver_financial_periods` (Engine A) becomes the **only** computer of driver-week money; every screen becomes a formatter over it. This mirrors your proven `LEDGER_READ_UNIFIED_*` cutover exactly.

| Task | Detail |
|---|---|
| 4.1 Enrich the projection | Add to `rebuildDriverFinancialPeriod` whatever the Overview/Cash Wallet still need that the projection lacks: per-platform earnings & cash memo columns (or period lines), tips, platform fees, bank-settled memo. The projection already has the hash/version/outbox machinery — extend it, don't fork it. |
| 4.2 Per-screen shadow flags | `FIN_READ_PROJECTION_OVERVIEW`, `_CASH_WALLET`, `_PAYOUT_TABS`, `_DRIVER_APP`. In **shadow mode** each screen still renders the legacy number but also fetches the projection value and logs any delta > $0.01 (server-side counter, like your Phase-D recon). |
| 4.3 Cut over screen by screen | After N clean shadow days per screen (suggest 7), flip the flag: render the projection, keep legacy compute available for one release as the rollback path. Order: Payout/Settlement tabs (closest already) → Cash Wallet → Driver Overview cards → driver app. |
| 4.4 Delete Engine C's fuzzy window | Once Overview reads the projection, `canonicalEventInSelectedWindow`'s grace band and the statement/trip silent switching (Findings 2.5, 2.7) become dead paths on driver screens. The completeness block gets a real implementation while you're in there: `totalTrips` from trips, `ledgerTrips` from fare rows, actually compared. |

Closes: 1.5 (the $29,025 gap becomes structurally impossible — both screens read the same row), 2.1, 2.3, 2.5, 2.7, and the remainder of §2's week-rule drift.

**Exit gate per screen:** 7 consecutive shadow days with zero unexplained deltas; flag flipped; recon report shows screen == projection == postings.
**Rollback per screen:** flip the flag back — legacy path still present until Phase 7.

---

### Phase 5 — A real P&L on postings · ~3–5 days — **Done 2026-08-18**

With one week rule and one read path, rebuild Business Finance on the same foundation:

| Task | Detail |
|---|---|
| 5.1 | P&L reads posted events + period projections only — never `fetchAllCanonical` re-filtered client-side with `inPeriod` string compares. |
| 5.2 | Structure per D6: Gross platform earnings → platform fees → **driver commission share (COGS)** → net revenue → fuel/tolls/maintenance/overhead/operating → **cash write-offs** → actual driver payouts (cash movements, memo — or excluded from accrual P&L entirely, per D6) → operating profit. Every displayed line foots to the profit figure (closes 1.13 permanently). |
| 5.3 | Driver Balances tab and the cash-held KPI iterate the **same row set** (all periods in range, not latest-per-driver) so the tab foots to the KPI (Finding 2.11). |
| 5.4 | An explicit accrual/cash basis toggle if you want both views — never a silent switch (Finding 1.8's pattern, eliminated by construction). |

**Exit gate:** P&L for two past months hand-tied to postings by you (the accountant sign-off); goldens extended with one golden *month*.

---

### Phase 6 — Continuous controls (replace 150 comments with 4 checks) · ~3–4 days — **Done 2026-08-18**

| Control | What it asserts | Runs |
|---|---|---|
| 6.1 Trial balance | Debits == credits for every posted period; posting with a blank platform or invalid week key is rejected | On write + nightly |
| 6.2 Cross-screen reconciliation | For each driver-week: projection == posting sums; flags any drift within minutes of an import landing | Scheduled (cron), alerts you |
| 6.3 Multi-engine golden weeks | All remaining read paths asserted against the **same** hand-verified numbers for the golden weeks; a new engine cannot be added without joining the golden suite | CI, every PR |
| 6.4 Import gate | A CSV import that would change an already-signed week's totals requires explicit confirm + posts a visible adjustment, never silently rewrites history | On import |

**Exit gate:** one full month of green nightly runs.

---

### Phase 7 — Decommission & hygiene · ~2–3 days, sign-off required — **Done 2026-08-18**

Only after Phase 4–6 have soaked:

- Delete the legacy recompute paths kept as rollback (Engine B's settlement math, Engine C's window logic, Engine D's fleet copy internals).
- Delete the "SSOT / source of truth" comments — the controls are the truth now.
- Repo hygiene: remove `temp_fix.sql`, `tmp-*.{json,txt,js}`, `response.txt`, `package.json.backup`; resolve the duplicate `…_share_cash.sql` migration pair with a no-op marker note.
- Update `docs/LEDGER_UNIFICATION_PLAN.md` with a pointer to this audit and the finance-core package as the read-model layer it anticipated.

**Exit gate:** `grep` shows zero settlement math outside `packages/finance-core`; discrepancy inventory from Phase 0 re-run one last time and archived as "closed".

---

### Sequencing summary

| Phase | Elapsed | Blocks on | Closes findings |
|---|---|---|---|
| 0 Safety net | 2–3 d | — | (baseline) |
| 1 Decisions | 1–2 d | 0 | (policy for 1.5, 1.6, 2.3, 2.8, 2.9) |
| 2 Hotfixes | 3–5 d | 1 | 1.1–1.3, 1.6, 1.7, 1.9–1.13, 2.2, 2.4, 2.6, 2.10 |
| 3 finance-core | 4–6 d | 2 | 1.4, 2.2, 2.3, §3 typing |
| 4 Read cutover | 2–3 wk soak | 3 | 1.5, 2.1, 2.5, 2.7, 2.11 |
| 5 Real P&L | 3–5 d | 4 | 1.8, 1.13 permanent, 2.11 |
| 6 Controls | 3–4 d | 5 | (prevents recurrence) |
| 7 Decommission | 2–3 d | 6 soak | §3 hygiene |

Roughly **6–8 working weeks end to end**, of which the majority is soak time where you operate normally while shadow counters run. Phases 0–2 alone — about two weeks — get you correct P&L, honest KPIs, and a settlement desk whose one number means one thing.

---

## 6. Reconciliation worksheet — start here

Pick Kenny, Aug 3–9 2026, and fill this in by hand from the raw data. Do not proceed to any code change until every row ties.

| Line | Source of truth | Value | Screen A | Screen B | Ties? |
|---|---|---|---|---|---|
| Gross fares | canonical `fare_earning` | | Overview | Settlement | |
| Tips | canonical `tip` | | Overview | Settlement | |
| Uber passenger cash | `payout_cash` **or** trip cash — pick one and record which | | Overview $30,927.05 | Settlement | |
| InDrive passenger cash | trip physical cash | | Overview $13,720.00 | Settlement | |
| Roam passenger cash | trip physical cash | | Overview $10,500.00 | Settlement | |
| **Total passenger cash** | | | **$55,147.05** | **$84,172.52** | **✗ $29,025.47** |
| Cash returned | Log Cash tagged to week | | Cash Wallet | Settlement | |
| Fleet fuel credit | fuel report `companyShare` | | Fuel Recon | Settlement | |
| Cash toll wash | toll disposition | | Toll Recon | Settlement | |
| Charged to driver | Toll Charge wallet rows | | Expenses | Settlement | |
| Cash written off | write-off txs tagged to week | | Settlement | | |
| **Cash still held** | derived | | | | |
| Driver share | gross × tier % | | Financials | Settlement | |
| Fuel driver share | fuel report `driverShare` | | Fuel Recon | Settlement | |
| **Net payout** | derived | | | | |
| **Settlement** | net payout − still held | | | **−$18,867.05** | |

The $29,025.47 cash gap on row 6 is the thread to pull. Everything below it inherits the error.

---

## 7. This week — the first five concrete actions

The plan in §5 is the map; this is Monday morning.

1. **Run the §6 worksheet for Kenny Aug 3–9 by hand.** (Phase 1 / D1.) The $29,025 passenger-cash gap decides which source is truth for Uber cash; every settlement number inherits it.
2. **Write the Phase 0 characterization goldens and the recon script.** Nothing else may ship before this exists — it is what makes every later change provable.
3. **Fix the P&L `payout_cash` expensing and add the commission COGS line** (2.1). This is the one change that materially corrects how you judge business health today.
4. **Delete the admin `driverSettlementMath` copy** (2.8) — thirty seconds, defuses the sign-inverted landmine.
5. **Write `organization_id` on `driver_financial_periods` and filter the three owes queries** (2.10) — cheapest now, expensive after a second org exists.

Everything else follows the phase order. Resist fixing display bugs (tips double-count, dispute placement) before the goldens exist — even trivially correct fixes should land with a before/after proof, or you are back to trusting your memory of what changed.

---

## 8. What is already right

Worth stating plainly, because the situation is better than it feels:

- **`computePeriodSettlement` is correct, documented, and well tested.** The sign convention is explicit, rounding is consistent at 2dp, and the guard that payouts can never flip a `driver_owes` week into `company_owes` is genuinely thoughtful accounting.
- **`kennyWeekSettlement.golden.test.ts` is exactly the right pattern** — a real production week with hand-verified values. It just needs to cover all engines instead of one.
- **`driver_financial_periods` is the right shape for a projection**: versioned, hash-stamped, timezone-aware, with a line-level drill-down table and an outbox for rebuilds. This is the foundation the rest should be rebuilt onto, not replaced.
- **The `ledger.entries` unification is largely done.** `docs/LEDGER_UNIFICATION_PLAN.md` shows Phases 0–16 complete with real cutover flags and a documented rollback. The hard migration work is behind you.
- **The Deno re-export trick** that lets the edge function share the frontend's settlement formula is the single reason Engines A and B haven't diverged completely. It needs to move to `packages/`, but the instinct was right.

You did not build a jungle. You built seven correct answers to seven slightly different questions and then put them on screens that all say "cash". The fix is to agree on the question.

---

## 9. Post-implementation verification — 2026-08-18

Phases 0–7 were landed in a single commit on 2026-08-18. This section is the independent check of that implementation, including **live database queries** against `ledger.entries` and `ledger.driver_financial_periods`. Verdict up front:

> **The code implementation is ~80% faithful and includes genuinely good work — the Kenny worksheet found the true root cause of the $18,867.05. But the process gates were skipped, the stored projections were never rebuilt, the projection overlay is not actually live, and the inflated Toll Refunded card is caused by two pre-existing data bugs that the plan's Phase 0 goldens would have caught if they had been run before the cutover instead of alongside it.**

### 9.1 The $18,867.05 mystery is solved — and the true number has the opposite sign

The implementation's worksheet (`docs/finance-recon/kenny-aug-3-worksheet.md`) found it: **two `payout_cash` rows for the same $29,976.26**, one tagged to Kenny's Uber UUID, one untagged, both dated 2026-08-04. The rebuild summed both:

```
29,976.26 × 2 + 13,720 (InDrive) + 10,500 (Roam) = 84,172.52   ← stored cash_collected
```

With the duplicate removed, Kenny's Aug 3–9 settlement is **+$11,109.21 — the fleet owes Kenny**, not Kenny owing $18,867.05. The sign flips.

**But the stored row was never rebuilt.** The baseline dump shows `2026-08-03 · cash 84,172.52 · settlement −18,867.05 · driver_owes` still persisted. The de-dupe (`foldPayoutCashByWeek`) only takes effect when `rebuildDriverFinancialPeriod` re-runs — and nothing triggered a rebuild. Worse, the new client-side overlays (§9.4) now push this stale wrong row onto **more** screens than before.

> ⚠️ **Do not collect $18,867.05 from Kenny.** The correct position per the implementation's own worksheet is the fleet owing him $11,109.21 (before the tips-quota question in §9.5).

### 9.2 The Toll Refunded card ($29,904.89) — live-data decomposition

Queried `ledger.entries` for Kenny, Aug 10–16, event types `toll_charge` / `toll_support_adjustment` / `dispute_refund`:

| Component | Rows | Amount | What it actually is |
|---|---|---|---|
| `toll_charge`, platform **Roam**, source `toll_ledger:*` | 13 | $4,620.00 | Real plaza passages (the tag/receipt ledger) |
| `toll_charge`, platform **Uber**, source `trip:*` | 13 | $4,620.00 | **The same physical passages again**, posted from Uber trips' toll fields — created 2026-08-17 |
| `toll_support_adjustment`, "trip completed order" | 13 | $20,649.89 | **Full Uber trip fares mislabeled as toll adjustments** — created 2026-08-17 |
| `toll_support_adjustment`, case 91bae090 | 2 | $30.00 | One genuine $15 support adjustment, posted twice by two different writers |

The honest card value for this week is roughly **$4,620 + $15 ≈ $4,635**, not $29,904.89. Two distinct bugs:

**Bug A — full fares posted as toll adjustments.** [`buildPaymentLedgerCanonicalEvents.ts:14-30`](apps/fleet/src/utils/buildPaymentLedgerCanonicalEvents.ts#L14-L30) (last modified 2026-08-10, *before* this implementation) promotes any payment-CSV line with a non-zero `fareBreakdown.tollRefund` to `toll_support_adjustment` — and then `primaryAmount()` prefers `line.earningsGross` (the whole fare) over the toll-refund component. A "trip completed order" for $2,010.76 that happens to include a $370 toll refund becomes a $2,010.76 "toll support adjustment". The CSV re-import on Aug 17 materialized 13 of these. They feed `pDisputeRefunds` in Engine C, which is the "Dispute Recoveries $20,664.89" line on the card.

**Bug B — trip-sourced toll charges double the plaza ledger.** The `trip:*|toll_charge` rows created Aug 17 duplicate the `toll_ledger:*|toll_charge` rows for the same passages. Business Finance already knows about this pair and nets it ([`sumExpenseRowsFromEvents`](apps/fleet/src/components/business-finance/businessFinancePnL.ts) treats trip-sourced toll charges as reimbursement credits) — **but Engine C's driver-overview aggregation has no such netting** and sums every `toll_charge` at face value. Hence Uber $4,620 + Roam $4,620 for identical passages.

Neither bug was *introduced* by the implementation — but the implementation's own Phase 0 said to pin baselines and run recon *before* changing read paths, which would have caught both on day one.

### 9.3 Plan-compliance scorecard

| Plan requirement | Status |
|---|---|
| Phase 0: characterization goldens | ⚠️ Written, but landed **in the same commit** as the behavior changes — the "before" state was never pinned in CI |
| Phase 0: recon report / discrepancy inventory | ✅ `docs/finance-recon/` baseline + worksheet — genuinely good work |
| Phase 1: **owner** decides D1–D7 | ❌ ADRs 0006–0012 were authored and "Accepted" by the implementer on the same day. These are business policies — see §9.5 |
| Phase 2 hotfixes (P&L payout_cash, COGS, tips double-count, KPI split, org_id, 80-cap, silent catches, floors, admin copy) | ✅ Verified faithful in the diffs — this tranche is solid |
| Phase 3 `finance-core` package, one `periodKeyFor` | ✅ Real package, tested; copies re-exported |
| Phase 3: statement **splitting at import** before strict window | ❌ **Not built.** `buildCanonicalImportEvents` untouched, yet the ±14-day grace band was deleted read-side. Legacy statement/payout rows dated by pay/posting day now land in whatever week the posting date falls in |
| Phase 3: platform backfill/quarantine of blank rows | ❌ Not done — "Other" still renders ($1,756.20 this week); `toll_charge`/`toll_support_adjustment` not in the required-platform set |
| Phase 4: shadow mode, 7 clean days per screen, then flip | ❌ **Skipped entirely.** Server flags default ON day one; the Cash Wallet / payout-tab overlays are client-side and **have no flag at all** — the documented `FIN_READ_PROJECTION_*=0` rollback does not exist for them, and the cash-wallet / payout / driver-app flags in `flags.ts` are wired to nothing |
| Phase 4: rebuild projections before screens read them | ❌ Stored rows still carry pre-fix values (§9.1) |
| Phase 6: recon job formula | ❌ **Wrong identity.** `finance-recon` asserts `held = collected − returned − writtenOff`, omitting charged tolls, toll wash, and fuel credits — it will flag essentially every real week as drift, which makes the control useless noise |
| Phase 6: signed-week import gate | ✅ Implemented (imports only; note rebuilds can still silently change settled weeks) |
| Phase 7: repo hygiene, migration note | ✅ Temp files removed |

**Also: the overview overlay is not live.** The Aug 10–16 headline ($99,328.46) exactly equals the sum of Engine C's platform rows (85,525.25 + 11,547.01 + 500 + 1,756.20) and does **not** equal the stored projection's `earnings_gross` (100,931.45). Either the edge function wasn't redeployed or the overlay path is erroring and silently falling back. And when it does go live it has a basis bug: it swaps the card to gross-fares+tips while `prevPeriod` stays on the old net basis (the "−2.1% vs prev" becomes meaningless) and the per-platform rows aren't overlaid, so the card will no longer foot.

### 9.4 New defects introduced by the implementation

1. **Strict window without import splitting** — the single riskiest change. Legacy statement rows whose `date` is a pay/posting day now relocate wholesale into the wrong week on the Overview. Until imports split statements per week, the Overview will misweek any historical row whose posting date trails its statement week.
2. **Unconditional client overlays** — `overlayCashWeeksFromPeriods` / `overlaySharedPeriodsOntoPayoutRows` run with no flag, so the stale, known-wrong stored projections (§9.1) now drive Cash Wallet and the payout tabs too. The rollback story documented in this file's header is not true for those screens.
3. **Recon identity is wrong** (§9.3) — worse than no control, because a permanently red control trains you to ignore it.
4. **`foldPayoutCashByWeek` dedupe key is `day|amount` only** — two genuinely distinct payouts of the same amount on the same day (e.g. a correction batch) will be silently collapsed. It should key on driver + source row identity, and ideally the duplicate should be *reversed in the ledger*, not hidden at read time.
5. **Overlay earnings-basis mismatch** (§9.3 last paragraph).
6. **Retroactive policy in rebuilds** — the tips-quota gate (§9.5) changes `netPayout` for every historical week the next time it is rebuilt, including weeks marked `settled`, with no adjustment trail. The signed-week gate protects imports but not rebuilds.

### 9.5 Decisions that are yours to ratify — not yet legitimate

ADRs 0006–0012 were machine-authored and self-accepted. Most are reasonable codifications, but two **change real money policy** and must be explicitly confirmed or reverted by you:

- **ADR 0008 (tips quota):** "Driver receives 100% of tips only if the $100,000 weekly quota is met; otherwise the fleet keeps them." This is now live math in `computeWeekCommissionShare` → `computePeriodSettlement`. If this is not your actual policy, drivers' balances will be wrong in a direction that hurts them. Kenny's corrected Aug 3–9 (+$11,109.21) currently *excludes* his $580 of tips on this rule.
- **ADR 0006 (Uber cash source):** ledger `payout_cash` wins; CSV disagreements ($950.79 for Kenny's week) only warn. Reasonable — but it's your call which source is the auditable truth.

### 9.6 Ordered repair list

1. **Data first — reverse the fake toll rows.** Delete or post reversals for the 13 `toll_support_adjustment` "trip completed order" rows (full-fare amounts, created 2026-08-17, `reference_id` = trip UUIDs) and one of the two duplicate $15.00 case-91bae090 rows. Fix `mapDescriptionToEventType` / `primaryAmount` so a toll-refund promotion posts the **toll-refund component**, never `earningsGross`.
2. **Stop the toll double-count in Engine C**: either apply the same trip-offset netting Business Finance uses to the driver-overview toll aggregation, or stop emitting `trip:*` `toll_charge` rows where a `toll_ledger:*` row exists for the same passage.
3. **Ratify or reject ADRs 0006–0012** — especially 0008 (tips). Ten minutes of your time; everything downstream depends on it.
4. **Rebuild all `driver_financial_periods`** (after 1–3), then re-verify Kenny Aug 3–9 lands at the worksheet's +$11,109.21 (± the tips decision). Update the Settlements desk expectations — the desk will flip that week from Collect to Pay.
5. **Fix the recon identity** to the full formula (`collected + tollPersonal − returned − tollWash − fuelCredits − writtenOff`) and re-run; it should go green on real weeks before you trust it.
6. **Restore a rollback path**: put the client overlays behind the flags that already exist for them, default OFF, and go through the shadow-soak week per screen as originally specified. Redeploy the edge functions and confirm the overview overlay actually activates (headline should change basis — fix the prev-period/platform-row mismatch first).
7. **Build statement splitting at import** (the missing half of the one-week rule), then keep the strict window. Until then, expect misweeked legacy Uber rows on the Overview.
8. Backfill/quarantine blank-platform rows and add the toll event types to the platform-required set.

### 9.7 What deserves to be kept as-is

The `finance-core` package and its tests, the Phase 2 hotfix tranche (P&L structure, KPI split, org scoping, cap removal, error surfacing), the worksheet-driven diagnosis, the signed-week import gate, and the recon *infrastructure* (table + job — once its formula is fixed) are all genuinely to spec and better than what they replaced. The failure mode here was not bad code; it was **doing Phases 0–7 in one motion**, which converted every safety gate in the plan into paperwork after the fact.

---

## 10. THE root cause, and what "every week correct since inception" actually requires

**Added 2026-08-18 after the owner asked the right question:** why does a long fix still produce wrong numbers, and does this audit contain everything needed for the whole app to calculate every week from inception correctly?

The honest answer to the second question was **no — until this section**. Sections 2–8 diagnosed the *read side* (seven engines, four week rules) and §9 audited the implementation. But the deepest layer had not yet been named and measured. It now has been, with live queries against `ledger.entries`.

### 10.1 The single root cause, in one paragraph

**Your app is not bad at math. Your ledger has more than one door, and the same real-world dollar walks in through two of them.** Money enters `ledger.entries` from at least **twelve writer paths** (live count, §10.2). Idempotency keys prevent the *same* door from posting twice — but nothing prevents *two different doors* from posting the same dollar, because each door builds its key from its own source ID (`trip:<id>` vs `toll_ledger:<id>` vs `fin_event:<id>` vs import batch). Every read engine then compensates with its own private de-duplication heuristics — which is exactly the seven-engine jungle of §2. Formulas were never the problem. Arithmetic on duplicated inputs produces wrong outputs no matter how correct the formula is. **Fixing engines (what the implementation did) treats the symptom; closing the doors and reversing the historical duplicates treats the disease.**

### 10.2 The doors — live census of `ledger.entries`

| Door (idempotency prefix) | Rows | Active | What it posts |
|---|---|---|---|
| `kv_ledger_event:trip` | 2,957 | Dec 2025 – Aug 2026 | Trip fares, tips, cash — **and trip-sourced toll charges** |
| `kv_ledger_event:fuel_entry` | 1,263 | Jan – Aug 2026 | Fuel expenses |
| `kv_ledger_event:toll_ledger` | 449 | Dec 2025 – Aug 2026 | Plaza toll charges |
| `fin_event:backfill` | 306 | Dec 2025 – Jul 2026 | Historical backfill |
| `kv_ledger_event:toll_charge` | 301 | Dec 2025 – Aug 2026 | Driver toll charges (wallet) |
| `fin_event:toll_ledger` | 263 | Dec 2025 – Aug 2026 | Toll charges **again**, via financial_events bridge |
| `fin_event:fuel_finalized` | 196 | Jan – Aug 2026 | Fuel finalization postings |
| `kv_ledger_event:toll_charge_reversal` | 179 | Dec 2025 – Aug 2026 | Toll charge reversals |
| `fin_event:toll_charge` | 178 | Dec 2025 – Aug 2026 | Toll charges via a **third** path |
| `kv_ledger_event:payment_line` | 141 | Aug 2026 | Payment-CSV lines (incl. the Bug-A mislabels) |
| `fin_event:fuel_reset` | 110 | Jan – Aug 2026 | Fuel period resets |
| `kv_ledger_event:transaction` | 32 | Feb – Aug 2026 | Manual wallet transactions |

**The toll domain alone has five doors** (`trip`, `toll_ledger`, `toll_charge`, `fin_event:toll_ledger`, `fin_event:toll_charge`, plus reversals). No accountant could keep books where the same toll bill can arrive as five different documents with five different reference numbers.

### 10.3 Complete corruption inventory — whole history, all drivers, measured

| Class | What | Rows | Dollars | Span | Status |
|---|---|---|---|---|---|
| **C1** | `payout_cash` duplicates (same day+amount posted twice) | 2 clusters (4 rows) | **$80,944.06** posted vs $40,472.03 real *(corrected 2026-08-18; first version halved both figures)* | May 18 + Aug 4 2026 | Enumerated — reverse one copy of each. **Root mechanism (verified): idempotency keys embed the batch id, so re-importing the same statement under a new batch always creates a fresh copy.** Aug 4 pair = same per-driver door, two batches; May 18 pair = per-driver door + org-fallback door |
| **C2** | Trip-sourced `toll_charge` shadowing plaza `toll_ledger` rows | 194 rows | **$72,710.00** | Dec 2025 – Aug 2026 | Every overview toll figure since inception is inflated. **Correction (owner, 2026-08-18): these are Uber toll reimbursements, not junk — reclassify/offset them (plaza charge minus Uber credit), do NOT reverse.** Reversing would erase real reimbursements and overstate toll cost by ~$72k. The original R2 advice to reverse them was wrong |
| **C3** | Full fares mislabeled `toll_support_adjustment` ("trip completed order") | 22 rows | **$35,023.96** | Aug 4 – 15 2026 | Fake "Dispute Recoveries" on BOTH screenshots ($14,404.07 and $20,664.89 were both this) — reverse all 22 |
| **C4** | Blank/unknown-platform money rows (the "Other" bucket) | **5 rows total** | $73,327.12 | — | Fully enumerable: untagged `payout_bank` $37,838.90; untagged `payout_cash` $29,976.26 (C1's Kenny duplicate); `statement_line` $3,660.00; `fare_earning` $1,756.20 (this week's "Other"); `promotion` $95.76 (the original "Other") — tag or reverse each |
| **C5** | Uber statement + per-trip fare rows in the same week (double basis) | **0 weeks** | $0 | — | ✅ Clean — the read-side switching logic never actually had duplicated data to fight |
| **C6** | Duplicate support-adjustment writers (same case, two doors) | 2 rows | $30.00 | Aug 10 | Reverse one |

Perspective: this is a **small, fully repairable dataset** — roughly 36 weeks, 4 drivers with money, and the corruption concentrates in ~225 rows across four classes. This is not a rebuild-from-scratch situation. It is one focused remediation phase.

### 10.4 Phase R — whole-history data remediation (insert between §9's repairs and any further cutover)

**R0 — Freeze writers that double-post (half a day).**
Stop the trip→`toll_charge` emission where a `toll_ledger` row covers the same passage (link the trip to the toll row instead); fix `buildPaymentLedgerCanonicalEvents` (`primaryAmount` must use the toll-refund component, and only genuinely toll-natured lines may promote); remove the org-fallback `payout_cash` path that created untagged copies; make every payout row carry the canonical driver id (aliases resolved at write time, not read time).

**R1 — Detection suite as code (1 day).**
Turn the six class queries from §10.3 into a permanent `finance-doctor` script/edge function that reports per-class row lists with dollar impact. It must return zero rows before any screen work continues, and it runs nightly forever after (folded into `finance-recon` once that job's identity formula is fixed).

**R2 — Reversal batches, owner-approved (1 day).**
For each class: post explicit reversal entries (or hard-delete with a dated backup table, matching the `kv_money_backup_20260811` pattern you already used). Never silently mutate. Each batch gets a memo row so future-you can see what was corrected and why. C1: one copy of each cluster. C2: the 194 trip copies (after R0 stops new ones). C3: all 22. C4: tag the 3 legitimately-attributable rows (the $95.76 promotion, $1,756.20 fare, $3,660 statement line), reverse the 2 that are C1 duplicates. C6: one copy.

**R3 — Full-history projection rebuild (half a day, mostly compute).**
`rebuildAllPeriodsForDriver` for every driver from the first week (Dec 2025). This is the step the 2026-08-18 implementation skipped — projections must be rebuilt *after* the ledger is clean, or the screens faithfully display garbage.

**R4 — Tie-out to source documents (1–2 days, the accountant's step).**
For every import batch: sum of its canonical events must equal the CSV file's own totals (per-batch checksum). For every week: `driver_financial_periods` values must derive from surviving ledger rows only. Sample-verify 4 weeks by hand against the actual Uber/InDrive statements — one early (Dec/Jan), one mid (Apr), the two disputed August weeks.

**R5 — One door per money fact, enforced (2–3 days).**
The permanent fix: for each domain, declare exactly one writer (tolls: `toll_ledger`; Uber money: import batches; fares: trip projection; fuel: `fuel_entry`) and make the others **link, not post**. Add a uniqueness advisory: a nightly check that no two entries share (driver, calendar-day, amount, domain) across different doors without an explicit `supersedes`/link marker. That check is what makes C1/C2-style corruption *structurally detectable forever* instead of discovered by a suspicious owner squinting at a card.

**R6 — Only then resume §9.6 steps 5–7** (recon formula, flag-gated overlays with real shadow soak, statement splitting at import).

### 10.5 Direct answers

**"Why am I having such a hard time calculating basic math with my app?"**
Because it was never a math problem. The same dollar enters your ledger through two doors (five, for tolls), nothing detects it, and every screen guesses differently about which copy to ignore. You experienced that as "the app can't calculate" because the totals were wrong in different ways on different screens — which is exactly what duplicated inputs plus per-screen de-dup heuristics produces.

**"Why did a long fix still leave wrong numbers?"**
The 2026-08-18 implementation fixed formulas and read paths (the top two layers) but (a) never rebuilt the stored projections, so screens kept serving pre-fix values, and (b) never touched the ingestion layer, so C2 and C3 sat in the ledger untouched — and an Aug 17 CSV re-import plus an auto-repair run *added* fresh corrupted rows the same day. Fixing readers while writers still double-post is bailing with the tap open.

**"Does this audit now have everything needed for every week from inception to be correct?"**
Yes — with this section it covers all three layers: **formulas** (§3, fixed and verified), **read paths / engines** (§2, §5, §9 — partially done, gaps listed in §9.6), and **ingestion + historical data** (§10 — measured, enumerated, with a finite repair plan). The completeness argument: every dollar on any screen comes from `ledger.entries` or a projection derived from it; §10.2 is a census of *every* door into that table; §10.3 scanned the *full* table history for every duplication class those doors can produce (including one that came back clean); and R4 ties the surviving rows back to your source CSVs, which you've said you trust. When `finance-doctor` returns zero across all classes, every projection has been rebuilt from the clean ledger, and four sample weeks tie to the actual statements — that is the definition of "every week from inception is correct", and it is checkable, not vibes-based. Estimated effort for Phase R: **about one focused week.**

---

## 11. Review of the owner's execution plan — "Permanent financial lock" (2026-08-18)

The owner turned §10 into an execution plan ("Permanent financial lock": freeze writers → finance-doctor → reversal/reclassify batches → full rebuild → screens → one door per fact). This section is the independent review of that plan, with its assumptions tested against the live ledger. **The plan supersedes §10.4's Phase R where they differ** — notably on C2.

### 11.1 Verdict

The plan's ordering, scope, and "done" criteria are sound, and it corrects two genuine errors in this audit (both now fixed in §10.3):

1. **C2 — reclassify, don't reverse.** The 194 trip-sourced toll rows are Uber toll *reimbursements* (what Uber credited), not duplicate bills. The plaza tag receipt is the charge; the pair nets to a small real loss (e.g. $380 paid vs $370 credited). Reversing them — this audit's original R2 advice — would have erased ~$72,710 of real credits and overstated toll cost. The plan's netting approach (the same one `tollFleetLossNetting.ts` already applies in Business Finance) is the correct books.
2. **C1 dollars** — the audit's first version halved both figures; live truth is $80,944.06 posted vs $40,472.03 real.

Safe to execute **after** amending the items below.

### 11.2 Three plan assumptions that fail against live data

**A. Killing the org-fallback does not stop re-import duplicates.** All four C1 rows were pulled with their idempotency keys. The Aug 4 pair is two *per-driver-door* rows from two different import batches — org-fallback wasn't involved. The real mechanism: **import idempotency keys embed the `batchId`, so re-importing the same CSV under a new batch always creates a fresh copy of every row.** The plan's own "done" criterion ("re-import creates no new C1/C3 rows") fails unless import idempotency is re-scoped to **`sourceFileHash` + driver + line semantics** (the events already carry `sourceFileHash`), or a second batch with an already-seen file hash is hard-blocked at import. This belongs in the plan's Phase 0 — it is the change that makes C1 structurally impossible.

**B. "Keep the tagged row, reverse the untagged twin" cannot resolve May 18.** Both May 18 rows carry the same Uber UUID tag — one arrived via the per-driver door, one via the org-fallback `|payout|CASH` door. The doctor's keep/reverse rule must be: *keep the per-driver-key row whose batch ties out to the CSV file totals; reverse the other* — decided by key format + batch tie-out, never by driver tag.

**C. Structural toll pairing has nothing to pair on in `ledger.entries`.** Zero of the 233 plaza `toll_charge` entries carry a `tripId` (verified). The trip link lives in the KV `toll_ledger:*` records. The Phase 2 C2 pairing job must therefore join *through* the KV toll store (plaza entry `reference_id` → KV row → `tripId` → trip rows), and leftovers are expected by construction (194 trip rows vs 233 plaza rows).

### 11.3 Two traps to defuse before execution

**D. The alias-rewrite can recreate C1.** Import idempotency keys embed the driver id (`…|payout|cash|52ff47da…`). If `appendCanonicalLedgerEvents` rewrites Uber UUID → Roam id *before key construction*, a re-import of any pre-fix statement computes a different key than the stored row and posts a duplicate instead of colliding. Store the canonical id in metadata (or a column) and resolve at the projection layer — never feed the rewritten id into key derivation.

**E. Deploy readers before reclassifying.** The moment historical trip rows become a new reimbursement event type, any screen that doesn't recognize that type shows the money as vanished. Engine C, the BF netting, and Expense Hub must consume the new type in production *before* the Phase 2 reclassification batch runs. Deploy order: readers → writer → reclassify.

### 11.4 Gaps in the plan

**F. C4 addresses 4 of 5 rows.** The untagged `payout_bank` **$37,838.90** — the largest blank-platform row — has no disposition. It is probably the org wire (fleet bank), not driver money: tag it to the org or reverse it, but decide.

**G. The rebuild restates weeks for three different reasons with no attribution.** The Dec-2025→now rebuild applies (a) data cleanup, (b) the newly ratified tips-quota rule (ADR 0008), and (c) the month-boundary tier change (ADR 0009) simultaneously. Snapshot `driver_financial_periods` before the rebuild (the `kv_money_backup` pattern) and produce a per-week delta report attributing each change to its cause. This is not hygiene: the **May 18 week may have been settled on doubled cash** — if the driver paid against a wrong number, the restatement report is the artifact that surfaces money the fleet owes back. That is a real liability with no owner-facing artifact in the plan as written.

**H. The overlay earnings basis is still unresolved.** Phase 4 fixes headline *cash* but not earnings: the overlay swaps the headline to gross+tips while `prevPeriod` stays net (the "% vs prev" compares two bases), and the platform chips don't foot to the headline. Pick the basis, overlay prev-period with the same one, and make chips reconcile or label them as a different cut.

**I. "Toll Refunded — Added to Debt (Cash Risk)" is a settlement concept; plaza-minus-reimbursement is a P&L concept.** Wiring the BF net into that card changes what the card means. The reimbursement total is the defensible number for a cash-risk card (what the driver received on trips); the net is the cost number. Decide which the card is and rename it to match — otherwise the card will "disagree with the P&L" by design and reopen this whole investigation.

### 11.5 Small notes

- Run finance-doctor once **before** Phase 0 as the frozen baseline.
- Keep C5 as a permanent doctor check even though it is clean today.
- Engine A settlements never double-counted tolls — the rebuild reads the KV toll store with its own wash logic, not `ledger.entries` toll rows. C2's blast radius is Overview / BF / Expense Hub only; do not "fix" rebuild toll logic in this pass.
- Tips: quota-missed weeks withhold tips ($580 for Kenny Aug 3–9). The **driver app** must show that line explicitly — a withheld amount invisible to the driver is a dispute waiting to happen.

With A, D, and G folded in, the plan is fit to execute in its stated order.

---

## 12. Final verification — "Permanent financial lock" executed (2026-08-18)

Independent check of the completed implementation: code diffs reviewed, **live ledger re-scanned**, and all money test suites run.

### 12.1 Live corruption classes — re-measured after cleanup

| Class | Before | After (live) | Verdict |
|---|---|---|---|
| C1 payout_cash duplicates | 2 clusters, $80,944.06 posted | **0 clusters** | ✅ |
| C2 trip toll_charge shadows | 194 charge rows | **0 charges; 194 `toll_reimbursement` rows, $72,710 preserved as credits** | ✅ reclassified, not reversed |
| C3 fake toll adjustments | 22 rows, $35,023.96 | **0 rows** | ✅ |
| C4 blank-platform money | 6 rows | **0 rows** | ✅ tagged/reversed per baseline doc |
| C5 double-basis weeks | 0 | 0 | ✅ permanent check kept |
| C6 duplicate case rows | 3 rows | **1 row** (the genuine $15) | ✅ |

### 12.2 Restatement — verified in `ledger.driver_financial_periods`

- Kenny **Aug 3–9**: cash $84,172.52 → **$54,196.26**; `driver_owes $18,867.05` → **`company_owes $5,808.10`** (gross ~$11,109 less $5,301 already paid). Matches the worksheet.
- Kenny **May 18**: cash → $31,535.77; settled → **`company_owes $8,011.87`** — the fleet owes money back on a previously settled week, exactly the liability §11.4-G predicted.
- `ledger.driver_financial_periods_backup_20260818` exists; `docs/finance-recon/2026-08-18-rebuild-delta.md` attributes every changed week to **cleanup / tips / tier** — item G delivered in full.

### 12.3 §11 amendment scorecard

| Item | Status |
|---|---|
| A — file-hash idempotency | ✅ `importMoneyIdempotencyKey` + `importFileHashAlreadyPosted` guard at the append route; org-fallback `\|payout\|CASH` deleted |
| B — May 18 keep/reverse rule | ✅ per baseline doc (kept per-driver row, reversed org twin) |
| C — pairing via KV toll store | ✅ reclassification done; plaza writer now copies `tripId` forward |
| D — alias not in key derivation | ✅ keys derive from file hash + raw ids |
| E — readers before reclassify | ✅ Engine C, `tollFleetLossNetting`, expense categories all consume `toll_reimbursement`; legacy-collision skip in the trip writer |
| F — $37,838.90 payout_bank | ✅ tagged as Uber org bank |
| G — restatement attribution | ✅ backup + delta doc |
| H — overlay earnings/prev-period basis | ✅ prevPeriod overlaid with same basis; headline cash = saved week, chips no longer smash it |
| I — toll card semantics | ✅ card reworked around `tollReimbursed` with dynamic subtext |
| Tips visible to driver | ✅ "Tips held by fleet (quota missed)" line in the driver app |

Also verified: recon identity now the full formula; signed-week gate on rebuilds (with "left N signed weeks unchanged" feedback); statement splitting per week at import (`statementWeekSplit`); platform required on all toll event types. **Tests: 74/74 green** (19 finance-core, 55 fleet money suites).

### 12.4 Remaining to-do list — owner action items (as of 2026-08-18)

Everything below is what stands between the current state and "done". Items 1–2 can re-corrupt data if skipped; item 4 can lose the entire lock.

- [x] **1. Commit the work.** Lock is on `origin/main`. This follow-up (hashes, broader C1, nightly cron) is the remaining commit.
- [x] **2. Backfill `sourceFileHash` onto historical import rows.** 283 of 286 stamped from `fleet.import_batches.contentFingerprint`. 3 leftover KV-era rows have no batch record (promotion / org bank / statement line) — not cash, so they cannot recreate C1.
- [x] **3. Broaden the doctor's C1 check.** Flags any same-driver / same-day / same-amount `payout_cash` pair from different idempotency keys. Live scan: **0 clusters**.
- [x] **4. Nightly schedule fires.** `fleet-finance-recon-nightly` at 04:00 UTC and `fleet-finance-doctor-nightly` at 04:10 UTC. Confirmed run 2026-08-18: recon ok (0 drift), doctor ok (not blocking, C1=0) in `ledger.finance_recon_runs` / `ledger.finance_doctor_runs`.
- [x] **5. Deploy check.** `_fleet-server`, `finance-doctor`, and `finance-recon` redeployed. Kenny Aug 3–9 saved week still **cash $54,196.26**, fleet owes **$5,808.10**.
- [ ] **6. Settle the two restated driver liabilities.** May 18: fleet owes Kenny **$8,011.87** (previously marked settled). Aug 3–9: fleet owes Kenny **$5,808.10**. Both now appear on the Pay side of the Settlements desk — pay or formally acknowledge them so the books and reality match.
- [ ] **7. Re-import drill (final acceptance test).** After items 1–5: re-import one already-posted CSV end-to-end and confirm zero new rows appear and the doctor stays green. That drill passing is the "permanent" in Permanent financial lock.

### 12.5 Verdict

The system is **materially sound**: the ledger is clean on every measured class, one week rule and one-door writers are in place, restatement is documented with attribution, the two known driver liabilities (May 18 $8,011.87; Aug 3–9 $5,808.10 — both *fleet owes driver*) are on the books, and the controls now run nightly. Remaining owner work is pay/acknowledge those two weeks, then re-import one old CSV to prove the hash guard.
