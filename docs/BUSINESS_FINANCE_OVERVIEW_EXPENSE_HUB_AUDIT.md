# Business Finance Overview + Expense Hub — Enterprise Audit

**Rev 6 · 2026-10-23 · audit + revamp design + cross-section sync check, no code changed**

> **Rev 6: readiness.**
> - **§16** states what was fully audited (Overview, Expense Hub) versus sync-checked (the six linked sections).
> - Adds an all-weeks sweep: the fuel ledger is wrong in 15 of 21 weeks, and Uber earnings are off in 13 of 14.
> - Gives one **master implementation order (§16.4)**. Start there.

> **Rev 5: owner answers + root causes found (§15.6).** Three new defects outside Business Finance feed its wrong numbers:
> - **X-13 (Critical):** the Oct 12–18 driver settlement paid **$17,183.53** where **$3,991.65** was owed. Fuel finalize credited the driver with the company's whole fuel share, including fuel bought on the company gas card. Overpaid by **$13,191.88**.
> - **X-14 (High):** a gas-card upload duplicated a $4,000 fill, and a $1,500 cash fill never reached the ledger. That's the "$2,500".
> - **X-15 (Medium):** Uber imports drop cancellation fees and other fare lines, while Business Finance double-counts promotions.

> **Rev 4: cross-section sync.** I traced Bank Deposits, Week Reconciliation, Driver Settlements, Courier Settlements, InDrive Wallet and Ledgers against Business Finance for Oct 12–18 (**§15**).
>
> **Answer: no, they are not in sync.** The same week shows different fuel, gross, bank and payout numbers depending on which screen you open, and some money (driver payouts, courier cash, Rush) never reaches Business Finance at all. §14 is updated so the new design reads from each section's authoritative source.

> **Rev 3: owner direction.** The fleet owner must be able to enter renewals and other bills themselves, and must never be locked out. The section is to be rebuilt on a new architecture. The full revamp design is **§14**; §11 remains the summary.
>
> **Why the owner is locked out (plain version):** the app keeps a list of what each role may do. On 1 Sep 2026 that list was moved to a shared package, and the seven Expense Hub entries ("view expenses", "create", "approve", "pay", "manage recurring", "manage vendors", "export") weren't copied over. The server's own copy still has them. So the server would let you in, but the screen checks the incomplete list first and says no. No one decided to lock owners out; it was a gap in a move, and no test checks that the two lists match.

> **Rev 2: owner answers applied.**
> - **Insurance was renewed on 15 Oct 2026.** The $120,504.08 charge is a real bill. The problem is that the full year lands in one week (F-02), and the rule still says coverage ended 15 Oct 2026 with auto-renew off, so it is out of date.
> - **Amber GPS is not renewed yet.** The $47,725.00 dated 15 Oct 2026 is a charge for a renewal that hasn't happened (F-01 confirmed for GPS).
> - **Fuel:** the headline should show total spend, with a breakdown you can open underneath (F-11 / UX-4 updated).
> - **Owners may approve their own bills.** F-07 is now about *how* that's allowed, not *whether* (downgraded to Medium).
Scope: Business Finance → **Overview** tab, and the **Expense Hub** desk (Overview / Register / Approvals / Recurring), including the server routes and ledger writes behind them. Other Business Finance tabs (P&L, Cash & Bank, Budgets, Driver Balances, Workbench) are touched only where Overview numbers come from them.

Evidence labels: **[Observed]** = read in code or queried in production (read-only SELECTs, project `csfllzzastacofsvcdsc`). **[Inferred]** = follows from code but not run end-to-end. **[Assumption]** = needs you to confirm.

---

## 1. Executive summary

**Is it enterprise-grade today? No.**

Three things stop it outright:

1. **The headline number is wrong for the week you're looking at.** The Oct 12–18 Overview shows Fixed overhead **$168,229.08** and Operating profit **−$150,187.39**. That $168,229.08 is two annual bills (AutoSmart insurance $120,504.08 + Amber GPS $47,725.00) booked in full on 15 Oct 2026. Both rules have coverage **15 Oct 2025 → 15 Oct 2026, auto-renew off**. The schedule treats the *end date* as another due date, so it charged a second full year on the day coverage expired. **Owner confirmed (Rev 2):** the insurance was renewed, so that bill is real but sits entirely in one week. The GPS hasn't been renewed, so its $47,725.00 is a charge that shouldn't exist yet.
- **Even under today's method** (full bill on the due date), removing the GPS charge leaves fixed overhead at $120,504.08 and profit at about **−$102,462.39**.
- **On a proper accrual basis** (spread over the cover period), that week should carry roughly **$2,800–$3,300**: about $2,310 for a week of insurance plus the last few days of the old GPS cover. Profit would be roughly **+$15,000**, not −$150,187.39.

The exact figure depends on the new policy's start and end dates and premium (§13 Q1). **[Observed]**
2. **The Expense Hub is locked for every user, owner included.** On 1 Sep 2026 (`ea8c6772`) the fleet permission list was moved into `@roam/auth-client`, and the seven `expenses.*` permissions were dropped from it. The Hub checks `can('expenses.view')`, which now returns false for everyone. That's your second screenshot. The server still grants these permissions, so the browser and server disagree. **[Observed]**
3. **The Overview doesn't add up on screen.** Money in ($55,312.11) minus Money out ($189,729.08) = −$134,416.97. Operating profit shows −$150,187.39. The missing **$15,770.42** is platform fees + driver commission: they're in the profit figure but never listed under Money out. A senior accountant could not tie this page out. **[Observed]**

Beyond those, the Hub's bill workflow has never run in production (0 bills, 0 payments), and it has latent defects that would break the first real use. The one-step "paid now" path always fails halfway (F-04). Self-approval is a client-settable flag (F-07). Voiding hard-deletes ledger rows (F-09). Payments never reach the ledger (F-08).

**Architecture verdict:** the reading side (Overview) needs a **server-side read model**, not more client-side assembly. The writing side (Expense Hub) needs **proper recognition rules** (prepaid → amortised expense) and a **transactional posting service**. Both are described in §11. You don't need a rewrite. Most of the pieces exist: the Hub already has a correct "spread" coverage engine, it just isn't used by the P&L.

---

## 2. Scope and assumptions

| Item | What I used |
|---|---|
| App | Roam Fleet (`apps/fleet`), Business Finance page + Expense Hub page |
| Frontend | React + TanStack Query, components in `apps/fleet/src/components/business-finance/` |
| Backend | Supabase Edge (Hono) — `supabase/functions/_fleet-server/expense_hub_routes.ts`, canonical ledger writers in `canonical_from_ops.ts` |
| DB | `public.ledger_entries` (canonical ledger, 9,303 rows; 2,834 in last 90 days), `fleet.fixed_expenses` (5), `fleet.expense_rule_groups` (5), `fleet.expense_documents` (0), `fleet.expense_payments` (0) |
| Scale | Small today: one vehicle carries all 5 fixed rules; ~30 ledger events/day |
| Screenshots | Overview, week Oct 12–18 2026; Expense Hub "no permission" |

**Assumptions you need to confirm:**
- **A1 (answered, Rev 2).** Insurance **renewed** on 15 Oct 2026. Amber GPS **not yet renewed**, but will be soon.
- **A2.** You want the Overview P&L on an **accrual** basis by default (that's what the toggle defaults to).
- **A3.** JMD only; no multi-currency.
- **A4.** You are signed in as `fleet_owner` (or legacy `admin`).

The template's Context section was blank, so I didn't have SLO targets, user counts or constraints. I've proposed targets in §12.

---

## 3. Functional walkthrough (what happens today)

### 3.1 Business Finance → Overview
1. `BusinessFinancePage` keeps period, tab, and accrual/cash basis in local React state (lost on refresh; not in URL).
2. `useBusinessFinanceBundle` fires **one giant client-side job**, `fetchBusinessFinanceBundle`, which runs these steps in order:
   1. Pages every canonical ledger event in range (500/page, **max 40 pages = 20,000 events, silently capped**).
   2. Pages `payout_bank` events again (second full pass).
   3. Loads **all** bank confirms (not date-scoped).
   4. Loads **all** drivers, then calls `getDriverFinancialPeriods(driverId)` **once per driver** (4 at a time), each returning that driver's full period history, then filters to the range in the browser.
   5. Builds P&L (`buildPnLFromCanonicalEvents`), a second expense aggregation (`sumExpenseRowsFromEvents`), wallet loads, and business payments.
   6. Calls toll health, fuel health (**both all-time, not period-scoped**) and InDrive wallet (period-scoped).
3. The page renders 5 cards: Money in, Money out, Transfers, Profit health, Risk flags. The rows link to other tabs and pages.
4. An "incomplete data" banner concatenates failures, risk counts and P&L notes into one sentence.

### 3.2 Expense Hub
1. `ExpenseHubPage` has **its own** period state (defaults to Last 90 days; doesn't inherit the Business Finance period, as the screenshot shows).
2. `useExpensesSnapshot` re-downloads the entire ledger range and re-runs the same category builder.
3. `ExpenseHubShell` checks `can('expenses.view')` → **false for everyone** → "You don't have permission".
4. Past that gate (if fixed), the Overview subview calls `/expense-hub/summary` (Hub bills only) and `/expense-hub/spend-breakdown` (coverage "spread" vs "as paid"). Register / Approvals / Recurring call the document and rule routes.
5. **Bill lifecycle (server):** create (draft/submitted) → approve → *auto-posts* (writes accrual journal + canonical ledger rows + GCT input tax) → payment(s) → paid. Void deletes the canonical rows.
6. **Recurring rules:** saving a rule writes a `fixed_expenses` config, **deletes every canonical event for that config** (past included) and re-writes occurrences from the start date to **today + 5 years**.

---

## 4. Architecture findings

| # | Finding | Evidence |
|---|---|---|
| AR-1 | **No server read model for the Overview.** Each tab load re-derives the whole company's financials in the browser from raw events, N+1 driver calls and 3 unscoped health calls. There's no stored, versioned "period financials" row, so Overview, P&L, Expense Hub and Week Reconciliation can each produce a different number. | `fetchBusinessFinanceBundle.ts:55-358` |
| AR-2 | **Four different formulas for the same "Tolls"/"Fuel" figure.** `computeTollFleetLossNetting` (P&L), `sumExpenseRowsFromEvents` running tally (rows table; treats `toll_reimbursement` as a *cost*), spend-breakdown server loop (treats it as a *credit*, skips trip-sourced charges), and driver-period fuel fallbacks. | `businessFinancePnL.ts:113,331-340`; `expense_hub_routes.ts:338-365` |
| AR-3 | **Fixed-expense recognition is "due date, full amount".** Annual prepayments hit one day. The P&L is labelled "Accrual" but this is cash-timing. The correct coverage-spread engine already exists (`expenseCoverageRunRate.resolveCoverageWindow`) but is only used for a chart. | `fixedExpenseOccurrences.ts:174-181`; `canonical_from_ops.ts:526-551` |
| AR-4 | **Rule edits rewrite history.** `projectFixedExpenseFromAssignment` calls `deleteCanonicalLedgerBySource` for the config (all dates), then re-appends. A closed week's P&L silently changes. There's no period-lock check. | `expense_hub_routes.ts:174-178` |
| AR-5 | **Future-dated "actuals".** Rules write 5 years of future events into the ledger (3 future rows in prod today: Fitness 2028–2030). Any custom range into the future shows them as posted spend. | prod query; `expense_hub_routes.ts:175-177` |
| AR-6 | **Hub writes are not transactional.** The create → approve → post → pay chain is a series of separate KV/table writes, ledger appends and a GCT insert with no transaction and no compensation. A failure midway leaves partial state (see F-04). | `expense_hub_routes.ts:487-604` |
| AR-7 | **Hub storage goes through the legacy KV shim.** Reads are `kv.getByPrefix("expense_doc:")` (full scan of the domain, then filter by org in memory) even though the data now lives in `fleet.expense_*` tables. No indexes are used, there's no pagination at the DB, and payment totals are computed by scanning all payments. | `expense_hub_routes.ts:219-221,404,428-433,764-766` |
| AR-8 | **Client/server permission tables drifted.** Server `rbac_middleware.ts:312,341` still lists `expenses.*`; client `@roam/auth-client` doesn't. This is the same class of bug your Rush Ops audit warned about ("client/server role tables must stay in step"), and there's no shared source or parity test. | |
| AR-9 | **Two category taxonomies.** Hub maps `other`, `gps`, `software`, etc. to `fixed_expense` (`hubCategoryToCanonicalEventType`). The Overview category cards expect some of them under `operating_expense`. Categories not on a fixed list (e.g. prod's `ValuationReport`, $8,500) appear in **no** card. | `expenseHubJournal.ts:142-153`; `expensesSnapshot.ts:89-143` |

---

## 5. Performance findings

| Layer | Finding | Impact today → at scale |
|---|---|---|
| Network | Overview = 2 full ledger pagings + 1 bank confirms + 1 drivers + **N driver-period calls** + toll health + fuel health + wallet. With ~20 drivers that's ~30 requests on every period change. | OK now; linear in drivers. 100 drivers ≈ 110 requests. |
| API | `getDriverFinancialPeriods` returns full history per driver; filtered client-side. | Payload grows every week forever. |
| Client | Every basis toggle (accrual/cash) changes the query key and **re-fetches everything**, though only the P&L line changes. | Seconds of spinner for a pure recompute. |
| Client | Expense Hub re-downloads the same ledger range the Business Finance bundle already has (separate query key). | Double transfer when moving BF → Hub. |
| DB | Hub routes full-scan domain tables per request (AR-7). `/documents/:id` scans **all** payments, journals and audits to find one document's rows. | Fine at 0 rows; O(total) per click later. |
| Correctness-under-load | Ledger paging caps at 20,000 rows **with no "truncated" signal** (`truncated = false` is hard-coded). A busy "Last 90 days" would silently under-count. | 2,834 rows/90 days now → cap ~7× away. |
| Background jobs | None. Everything is computed on view. There's no nightly snapshot to compare against. | |

---

## 6. UX findings

| # | Finding |
|---|---|
| UX-1 | **The Overview doesn't foot.** Money out lacks Platform fees and Driver commission, so the user can't see how −$150k is reached. |
| UX-2 | "Share of gross eaten by costs (not profit margin)" sits under **Operating profit**, but it describes the **ratio** below it. 371.53% with no explanation reads as a bug. |
| UX-3 | The incomplete-data banner is one run-on sentence mixing hard failures ("Driver periods (5ec79f6c-…)", raw UUID/email), risk counts, and an informational toll note. It's dismissible for the session, so a new failure after dismissing stays hidden. |
| UX-4 | **"Fuel" on the Overview is gross pump spend ($21,500 = $19,000 card + $2,500 fare cash)**, not fleet cost after driver share. The label doesn't say which. |
| UX-5 | The accrual/cash toggle lives only on the P&L tab but silently changes the Overview's profit figure. The Overview never says which basis it's showing. |
| UX-6 | The period isn't carried into the Expense Hub (BF shows Oct 12–18; Hub opens Last 90 days with blank From/To). It isn't in the URL either, so refresh or share loses it. |
| UX-7 | Permission denial says "Ask a fleet owner" to the fleet owner. There's no diagnostic (role shown, permission missing). |
| UX-8 | Failed sources show **$0.00**, not "—" or "unavailable". If the ledger fetch fails, Gross shows $0.00 and Profit shows minus driver commission, a believable but false number. The banner says "never invented", but a $0 is invented. |
| UX-9 | Risk flag "High cash drivers" counts **driver-weeks** over $10,000, not drivers (one driver with 3 weeks = 3). The threshold is hard-coded. |
| UX-10 | Expense Hub "Expense detail" table shows `toll_reimbursement` inflows as positive costs (sign from the running tally, AR-2). |
| UX-11 | Expense Hub nav item is visible to roles that will be denied (no `PAGE_PERMISSION_MAP` entry for `expense-hub`). |
| UX-12 | Accessibility: Overview rows are `<button>`s even when they have no action (`cursor-default`, still focusable, no `aria-disabled`); amounts carry colour-only meaning (amber/rose) with no text cue. |

---

## 7. Correctness findings (the critical workflow: "is the profit number right?")

**F-01 — Phantom annual renewal on the coverage end date. Critical.** **[Observed]**
`buildFixedExpenseOccurrences` loops `occ ≤ configEnd` (inclusive). A rule with start 2025-10-15, end 2026-10-15, annual, `autoRenew=false` produces **two** occurrences: 2025-10-15 and 2026-10-15. Production:
```
Insurance  AutoSmart  120,504.08  2025-10-15 and 2026-10-15   autoRenew=false  end=2026-10-15
Security   Amber GPS   47,725.00  2025-10-15 and 2026-10-15   autoRenew=false  end=2026-10-15
```
Registration (end 2026-09-30) is correct only because its anniversary falls after the end date. The spread engine (`inclusiveDayCount(start, end)` = one 366-day coverage) does **not** double-bill, so the Hub chart and the P&L disagree on the same rules.

**Rev 2: what this means with the owner's answers.**
- **Insurance:** the 2026-10-15 charge happens to be right, but only by luck. The rule says cover ended that day with auto-renew off, and the system still billed it. Correct fix: record the renewal as a **new coverage period** (new start/end dates, new premium if it changed) rather than relying on the end-date bug.
- **GPS:** the 2026-10-15 charge of $47,725.00 is premature. It should be **reversed** (a reversing entry, not a delete), and the real renewal posted on its actual date and amount when it happens.
- **Renewal workflow gap:** the Hub has no "Renew" action. A renewal today means editing the old rule, which (AR-4) deletes and re-writes that rule's past ledger rows. Add a **Renew** action that ends the old coverage and starts a new rule linked to it, so last year's history stays untouched.

**F-02 — Annual prepayments expensed in one day under "Accrual". Critical.** **[Observed]**
Even without F-01, the Oct 2025 week absorbed $168k and every other week of that year absorbed $0. Weekly profit, operating ratio and budgets are meaningless around renewals. Accrual should recognise ≈ amount × (overlap days ÷ coverage days).

**F-03 — Overview doesn't reconcile to its own profit line. High.** **[Observed]**
`operatingProfit` subtracts `platform_fees`, `driverCommission`, `cashWriteOffs` and adds `otherIncome`; Money out shows neither fees nor commission, nor other income. On screen: $15,770.42 unexplained.

**F-04 — "Paid now" bills always fail halfway. Critical (latent, 0 bills in prod).** **[Inferred from code]**
`approveAndPayDocument` calls `transitionDocument(…'approved')`, which **already sets status `posted`** and writes the ledger, GCT and journal. It then calls `transitionDocument(posted → 'posted')`. `canTransition('posted','posted')` is false and neither escape clause matches, so it throws `Invalid transition posted → posted`. The route doesn't catch it, so the user gets a 500 while the expense is already in the P&L with no payment recorded.
```ts
const approved = await transitionDocument(c, doc, "approved", {}); // returns status 'posted'
const posted   = await transitionDocument(c, approved, "posted", {}); // throws
```
For a non-owner creator it fails even earlier (separation-of-duties throw), leaving an orphan `submitted` bill.

**F-05 — Expense Hub permission gate locks out every role. Critical.** **[Observed]** See §1.2. The client also references `expenses.create/approve/pay/manage_rules` in Register, Approvals, Detail and Wizard, so even after the view gate every write button stays hidden. **[Inferred]** these are TypeScript errors (string not in the `Permission` union), absorbed into the fleet `tsc` baseline of ~500, which is why nothing flagged it.

**F-06 — Service-line scope applied to half the inputs. High.** **[Observed]**
With the scope switcher on Rideshare, ledger events are filtered (`filterLedgerEventsByServiceLineScope`), but `getDriverFinancialPeriods(driverId)` is called **without** its `serviceLine` argument. Driver commission, cash collected and write-offs stay all-lines, so the profit mixes scopes.

**F-07 — Self-approval is decided by the request, not by policy. Medium (was High).** **[Observed]**
`allowSelfApprove` comes straight from the request body (`/approve` route), and is also forced true when `actorId === orgId`. **Owner decision (Rev 2): owners may approve their own bills.** The remaining problem is that *any* approver (e.g. a fleet manager) can also self-approve by sending `{allowSelfApprove:true}`, and the `actorId === orgId` shortcut only works when the owner's user id happens to equal the org id.

**Fix:** the server decides. Self-approval is allowed when the actor's role is `fleet_owner` (optionally an org setting for other roles), regardless of what the request says. Every self-approval is written to the audit log as `self_approved: true` and shown on the bill ("Approved by creator — owner policy").

**F-08 — Hub payments never reach the ledger or Cash & Bank. High.** **[Observed]**
`recordPayment` writes a KV payment and a journal only. Cash & Bank "Business payments" reads `sourceType === 'transaction'` ledger events, so Hub payments are invisible there, and the "Cash" P&L basis never sees them. There's no AP balance anywhere on the Overview.

**F-09 — Void hard-deletes ledger rows; no period lock. High.** **[Observed]**
`transitionDocument('voided')` → `deleteCanonicalLedgerBySource`. Same for rule edits (AR-4). A closed week's P&L changes retroactively, with no reversing entry dated in the open period. This conflicts with your settlement-close rules ("make invariants unrepresentable").

**F-10 — Overpayment and double-payment allowed. Medium.** **[Observed]**
There's no check that `amount ≤ balance`, and no idempotency key. A double-click records two payments. The status is computed after a non-atomic scan of all payments.

**F-11 — Fuel on Overview doesn't tie to the settlement engine. Medium.** **[Observed]**
Oct 12–18: ledger `fuel_expense` = $19,000 Gas_Card + $2,500 RideShare_Cash = **$21,500**; settlement rows = `fuel_gas_card_spend` $15,000 + `fuel_driver_spend` $4,000 = **$19,000**; driver `fuel_deduction` $1,808.12 has no matching `fuel_charge_offset`, so it isn't netted out of fleet fuel. **[Assumption]** some of this is the "40 fuel fills missing" flag. Either way, nothing on the page shows the tie-out.

**Owner decision (Rev 2):** the Overview **Fuel** row shows **total spend** ($21,500.00 this week), with an expandable breakdown underneath. The P&L tab already builds this data (`pnl.fuelBreakdown`), so reuse it:

| Breakdown line | Oct 12–18 | Source |
|---|---|---|
| Gas card | $19,000.00 | `fuel_expense`, paymentSource Gas_Card |
| Driver / fare cash | $2,500.00 | `fuel_expense`, cash-style sources |
| **Total spend** (headline) | **$21,500.00** | |
| Already charged to drivers | $1,808.12 *(currently not netted, see above)* | driver share / `fuel_charge_offset` |
| Reimbursed to drivers (memo) | — | `fuel_reimbursement` |
| **Fleet cost** | $19,691.88 *(once the driver share is netted)* | |
| Tie-out vs Driver Settlements | settlement shows $19,000.00 → **$2,500.00 unexplained** | flag when ≠ $0 |

**Keep the profit line consistent:** since the headline is total spend, Operating profit must subtract **fleet cost**, not total spend. Otherwise driver-recovered fuel is counted as a cost twice (once here, once inside driver commission). The breakdown should end on the fleet-cost line the P&L actually uses, so the Overview still adds up (F-03).

**F-12 — Health counts are all-time, shown as if period-scoped. Medium.** **[Observed]**
`getTollReconciliationPeriods()` and `getFuelReconciliationPeriodsHealth()` take no dates. "40 fuel fills missing" and "1 tag toll missing" sit on an Oct 12–18 page but count all history.

**F-13 — Categories that fall through. Medium.** **[Observed]**
`ValuationReport` ($8,500) and any custom category posted as `fixed_expense` don't map to a card. The "Other" card subtracts only Insurance, Software/Subscription and Registration from operating, so Lease/Security/Equipment posted as `operating_expense` are **counted twice** (own card + Other). Hub category "Other" maps to `fixed_expense` but the Other card reads only `operating_expense`, so those bills disappear from category cards.

**F-14 — Silent truncation at 20,000 events. Medium (latent).** **[Observed]** `fetchAllCanonicalEvents` stops at 40 pages with no flag; the bundle hard-codes `truncated = false`.

**F-15 — Cross-org document IDs crash routes. Low.** **[Observed]** `/approve`, `/reject`, `/payments`, `/void` use `filterByOrg([raw])[0]` without a null check. Another org's id gives a 500 (TypeError), not a 404. No data leaks, but it's noisy and it's a probe signal.

**F-16 — Spread-breakdown uses UTC day bounds. Low.** **[Observed]** `from: ${start}T00:00:00Z` vs Business Finance's Jamaica calendar day. Events 19:00–24:00 local on boundary days shift period.

**F-17 — Hub summary hard-codes `operationalFuel: 0, operationalTolls: 0`. Low.** Fields exist in the contract but are always zero, an invented zero.

---

## 8. Findings table (sorted by severity)

| ID | Sev | Category | Evidence | Impact | Recommendation | Effort |
|---|---|---|---|---|---|---|
| F-01 | Critical | Correctness | `fixedExpenseOccurrences.ts:174-181`; prod rows 2026-10-15 | GPS $47,725.00 charged before renewal; insurance right only by luck | Treat `endDate` as coverage end unless `autoRenew`; reverse the GPS 2026-10-15 row; record the insurance renewal as a new coverage period; add a **Renew** action | S |
| F-05 | Critical | Access | `auth-client/permissions.ts` (no `expenses.*`); `ExpenseHubShell.tsx:192` | Hub unusable by everyone | Restore 7 `expenses.*` perms in `@roam/auth-client` matching server; add parity test | S |
| F-02 | Critical | Accounting | `canonical_from_ops.ts:526-551` | Weekly P&L swings by full annual premiums | Recognise prepaid rules by coverage-day amortisation (reuse `resolveCoverageWindow`); keep the due-date entry as a cash/AP event | M |
| F-04 | Critical | Correctness | `expense_hub_routes.ts:487-504` | First "paid now" bill → 500 + posted expense with no payment | Single post-and-pay function in one DB transaction; never call transition twice | S |
| F-03 | High | UX/Accounting | `OverviewTab.tsx:319-367` vs `businessFinancePnL.ts:153-164` | Page can't be tied out | Add Platform fees, Driver commission, Other income rows; show "Money in − Money out = Operating profit" check line | S |
| F-06 | High | Correctness | `fetchBusinessFinanceBundle.ts:124` | Scoped profit mixes service lines | Pass `serviceLine` scope to driver periods (or read from read model) | S |
| F-07 | Medium | Controls | `expense_hub_routes.ts:521-528,701-703` | Any approver can self-approve via request flag | Server allows self-approve for `fleet_owner` (owner decision); ignore the request flag; audit + label every self-approval | S |
| F-08 | High | Accounting | `expense_hub_routes.ts:735-785`; `fetchBusinessFinanceBundle.ts:225-239` | Payments invisible to Cash & Bank / cash P&L; no AP | Post payment to canonical ledger (`expense_payment` cash outflow); show AP open balance on Overview | M |
| F-09 | High | Controls | `expense_hub_routes.ts:174,592` | Closed periods rewritten | Reversing entries dated in open period; refuse edits into locked weeks | M |
| AR-1 | High | Architecture | `fetchBusinessFinanceBundle.ts` | Numbers drift across screens; slow | Server read model (§11) | L |
| AR-8 | High | Architecture | `rbac_middleware.ts:312` vs auth-client | Repeat of F-05 class | One permission source for client + server; CI parity test | S |
| F-10 | Medium | Correctness | `expense_hub_routes.ts:741-766` | Overpay / double pay | Balance check + idempotency key + row lock | S |
| F-11 | Medium | Reconciliation | prod Oct 12–18 fuel rows | Fuel $21,500 vs settlement $19,000, unexplained | Headline = total spend (owner decision) with expandable breakdown ending in fleet cost + settlement tie-out; profit uses fleet cost | M |
| F-12 | Medium | Correctness | `api.ts:3800,5956` | All-time counts on a weekly page | Pass period to health endpoints or label "all time" | S |
| F-13 | Medium | Correctness | `expensesSnapshot.ts:129-143`; `expenseHubJournal.ts:142-153` | Cards don't sum to total; double count / invisible categories | One category map; derive "Other" as total − named cards; show a check total | S |
| F-14 | Medium | Correctness | `expensesSnapshot.ts:19`; bundle `truncated=false` | Silent under-count at scale | Server aggregation or explicit truncated flag | S |
| UX-8 | Medium | UX | bundle catch blocks | Failed source shows believable $0 | Render "Unavailable" and block profit when a required input failed | S |
| UX-3 | Medium | UX | `IncompleteDataBanner.tsx` | Unreadable, hides new failures | Structured list: Errors / Warnings / Notes; driver names, not IDs; re-show on new items | S |
| UX-5 | Medium | UX | `BusinessFinancePage.tsx:44,171-188` | Hidden basis change | Basis badge on Overview; recompute locally, don't refetch | S |
| UX-6 | Medium | UX | `ExpenseHubPage.tsx:22`; `BusinessFinancePage.tsx:80-83` | Period lost between screens | Period in URL; seed Hub from BF | S |
| AR-2 | Medium | Architecture | §4 | Four toll/fuel formulas | One shared `costLines()` in finance-core used by P&L, rows, chart | M |
| AR-5 | Medium | Correctness | prod 3 future rows | Future "actuals" | Generate occurrences only up to today (or a rolling 1 period ahead) via scheduled job | S |
| AR-7 | Medium | Performance | `expense_hub_routes.ts` getByPrefix | O(all rows) per click | Query `fleet.expense_*` directly with org + status + date indexes | M |
| UX-2 | Low | UX | `OverviewTab.tsx:407-415` | Misleading caption | Move caption to the ratio; consider "Costs as % of gross" label | XS |
| UX-9 | Low | UX | `fetchBusinessFinanceBundle.ts:296` | Over-counts drivers | Count distinct drivers; threshold in settings | XS |
| UX-10 | Low | UX | `businessFinancePnL.ts:331-340` | Wrong sign in table | Use shared signed-amount function | XS |
| UX-11 | Low | UX | `PAGE_PERMISSION_MAP` | Nav shows denied page | Map `expense-hub` → `expenses.view` | XS |
| UX-12 | Low | A11y | `OverviewTab.tsx:13-52` | Non-actions focusable; colour-only cues | Render non-clickable rows as `div`; add text/icon for warning states | XS |
| F-15 | Low | Robustness | `expense_hub_routes.ts:700,723,746,797` | 500 on foreign id | Null-check → 404 | XS |
| F-16 | Low | Correctness | `expense_hub_routes.ts:333-334` | Boundary-day drift | Use fleet TZ bounds | XS |
| F-17 | Low | Correctness | `expense_hub_routes.ts:244-245` | Invented zeros | Remove fields or fill them | XS |

Effort: XS < ½ day · S ≤ 2 days · M ≤ 1 week · L multi-week.

---

## 9. Quick wins (1–3 days)

1. **F-05 + AR-8 + UX-11.** Restore `expenses.*` in `@roam/auth-client` exactly as the server lists them (owner/manager all 7; accountant `view` + `export`). Add a test that diffs client vs server role maps.
2. **F-01.** Fix the inclusive end-date loop for non-renewing rules. Then:
   - **Reverse** the GPS 2026-10-15 row ($47,725.00). Post a reversing entry; don't delete it.
   - **Update the insurance rule** to the new policy period (2026-10-15 onward, new premium if it changed), so its existing $120,504.08 row has a rule that matches it.
   - When Amber GPS renews, record it as a new coverage period on the real date and amount.
3. **F-03 + UX-2.** Add the three missing Money-out/in rows and a visible "check" line that proves Money in − Money out = Operating profit.
4. **F-04 + F-10 + F-15.** Rewrite paid-now as one call. Add a balance check and idempotency key on payments. Null-check foreign ids.
5. **F-06, F-12, UX-9.** Pass scope and period through; count distinct drivers.
6. **UX-8 + UX-3.** Show "Unavailable" for failed inputs. Restructure the banner.

## 10. Strategic improvements (1–2 quarters)

1. **Recognition engine (F-02, AR-3).** Every fixed/prepaid rule produces two things: a **cash/AP event** on the due date and **daily amortised expense** over its coverage window. P&L accrual reads the amortised series; Cash basis reads the cash events. The spread math in `expenseCoverageRunRate` becomes the single source.
2. **Period locks + reversals (F-09, AR-4).** No ledger delete in a locked week; edits post reversing entries in the first open period. Reuse your Week Reconciliation close status as the lock.
3. **Business Finance read model (AR-1).** See §11.
4. **Hub on real tables (AR-6, AR-7).** Move document/payment/journal writes into a Postgres function that does status change + journal + ledger + GCT in **one transaction**. Read with indexed queries.
5. **AP and cash on the Overview (F-08).** Add "Bills owed (AP)", "Paid this period", "Overdue" to Money out, sourced from Hub payments posted to the ledger.
6. **One cost-line library (AR-2, F-13).** A finance-core module that classifies every event into a P&L line with a sign, used by P&L, Overview, Expense table, spend chart and server summary. Add a golden test from a real week.

---

## 11. Proposed architecture

**Today:** Browser → ~30 API calls → client recompute (4 formulas) → screen. Expense Hub → KV shim → ad-hoc writes.

**Proposed:**

```
 writers (fuel, toll, settlement, Expense Hub post_and_pay(), rule scheduler)
        │  one transaction each, idempotency keys, period-lock check
        ▼
 public.ledger_entries  (append-only; reversals, never deletes)
        │
        ▼  incremental refresh on write + nightly full rebuild
 finance.period_pl  (org, service_line, basis, day) → one row per P&L line
 finance.period_tieouts (fuel ledger vs settlement, toll, bank, AP)
        │
        ▼  GET /business-finance/overview?start&end&scope&basis
 Overview + Expense Hub + P&L read the SAME rows
```

- **Trade-offs:** a new table and refresh job, which add operational surface. In return you get one number everywhere, sub-second loads, a stored history you can compare against, and a natural place for tie-out checks. Incremental refresh risks drift from writers that bypass it; the nightly rebuild + diff catches that (your Settlement audit lesson: "an SQL check is only as good as the writers that maintain its input").
- **Migration path:**
  1. Build `period_pl` alongside the existing code and compute both.
  2. Shadow-compare daily for 2 weeks; log any line that differs by > $0.01.
  3. Switch the Overview to the endpoint behind a flag.
  4. Switch the P&L tab and Expense Hub.
  5. Delete the client bundle math.

  Fixed-expense amortisation lands in step 1 as a new line source, so the shadow diff will show exactly the renewal weeks changing, which you can sign off on.

---

## 12. Instrumentation and validation plan

| Fix | How you prove it worked |
|---|---|
| F-01 | SQL: `select reference_id, count(*) from ledger_entries where entry_type='fixed_expense' group by 1` → each non-renewing annual rule has exactly 1 row per coverage year. Oct 12–18 Fixed overhead shows $0 (or the amortised amount). |
| F-02 | For a 12-month range, sum of weekly fixed overhead = sum of annual amounts (± cents). No single week > 2× the weekly average without a one-off flag. |
| F-03 | Automated test: for any period, `moneyIn.gross − Σ moneyOut = operatingProfit` (± $0.01). Visible check line shows ✓. |
| F-04/F-10 | Integration test: paid-now creates 1 doc (paid), 1 payment, 1 accrual journal, 1 payment journal, N ledger rows; replaying the same idempotency key creates nothing. Overpay returns 400. |
| F-05 | Test: every `can('…')` string in `apps/fleet` exists in the client catalog, and the client and server role maps are equal. Manual: owner opens Expense Hub. |
| F-06 | Toggle Rideshare vs All: driver commission changes accordingly; Rideshare + Rush = All (± $0.01). |
| F-08 | Record a Hub payment → Cash & Bank "Business payments" rises by the same amount on the payment date. |
| F-09 | Attempt rule edit dated in a closed week → refused; edit in open week → reversal rows visible, closed week total unchanged. |
| Performance | Log Overview time-to-data and request count. **Proposed SLOs:** p95 Overview data ≤ 1.5 s, ≤ 3 requests per load, INP ≤ 200 ms on basis toggle (local recompute). |
| Drift | Nightly job: read model vs full recompute; any diff > $0.01 alerts. |

---

## 13. Open questions and what to collect next

1. **A1 (answered):** insurance renewed; GPS soon. **Still needed:** the new insurance policy's start date, end date and premium (was it still $120,504.08?), plus the expected GPS renewal date and amount.
2. Why did two driver-period loads fail (`5ec79f6c-5828-458d-8da0-7d898f381cc1` and `deekiiiiiii+fleet.join.courier`)? Please grab the Network tab response for `getDriverFinancialPeriods` for those two, or the fleet-core function logs for that minute.
3. ~~Fuel meaning~~ **Answered:** total spend + breakdown dropdown (see F-11).
4. ~~Owner self-approval~~ **Answered:** yes, owners may. Should fleet managers also be allowed, or owners only?
5. Who uses this and how often (owner only, or an accountant weekly)? This sets whether the read model refreshes on write or nightly.
6. Is the Week Reconciliation close the period lock you want the Hub to respect?
7. Confirm the `tsc` output for `expenses.` errors (`npx tsc --noEmit -p apps/fleet | grep "expenses\."`) so we know how many were hidden in the baseline.

---

## Prioritised implementation order

1. **F-05 / AR-8 / UX-11:** unlock the Hub; add the permission parity test. *(stops the outage)*
2. **F-01:** fix the end-date loop; reverse the GPS row; update the insurance rule to the new policy; add a Renew action. *(fixes the headline number)*
3. **F-03 / UX-2 / UX-8:** make the Overview foot and refuse to show invented $0s.
4. **F-04 / F-10 / F-15 / F-07:** make the bill workflow safe before anyone creates the first bill.
5. **F-06 / F-12 / F-13 / UX-9 / UX-10:** scope, period and category correctness.
6. **UX-3 / UX-5 / UX-6:** banner, basis badge, shared period in the URL.
7. **F-02 + AR-3:** amortised recognition for prepaid rules.
8. **F-09 / AR-4 / AR-5:** period locks, reversals, no future rows.
9. **F-08:** payments to the ledger; AP on the Overview.
10. **AR-1 / AR-2 / AR-7 / F-14:** server read model + one cost-line library + indexed Hub reads, shipped behind a flag with a 2-week shadow compare.

> Rev 3: this order is superseded by the phased plan in §14.8, which covers the same items.

---

## 14. Revamp design: Business Finance Overview + Expense Hub v2 (Rev 3)

**Goal.** An owner opens the Overview and sees a statement a senior accountant would sign: every number footed, every cost recognised in the right period, every figure traceable to its source. The owner runs the whole expense side themselves (bills, renewals, payments, approvals) without being blocked and without a developer.

**Design rules** (taken from your earlier audits):
- **Ledger is append-only.** Corrections are reversals, never deletes.
- **One posting command per action.** Each runs in one database transaction with an idempotency key and a period-lock check, and checks every refusal before anything irreversible happens.
- **One calculation library** shared by the server and every screen. No screen does its own money math.
- **One permission source** shared by the browser and the server, with a parity test in CI.
- **Additive rollout.** Existing screens stay until the new ones match them in a shadow comparison (your rule: never replace a view you like).

### 14.1 Access: the owner is never blocked
- `@roam/auth-client` becomes the **only** permission catalog. The server's `rbac_middleware.ts` imports it instead of keeping its own copy.
- Expense permissions are restored:

  | Role | Permissions |
  |---|---|
  | `fleet_owner` | all 7 |
  | `fleet_manager` | all 7 |
  | `fleet_accountant` | `view`, `export` (optionally `pay`) |

- **Guard rail:** a test asserts `fleet_owner` holds every customer permission, and that every `can('…')` string in the app exists in the catalog. A future move that drops a permission fails CI instead of locking you out.
- **Better denied screen:** it shows your role and the missing permission, and gives owners a "report this" path instead of "ask a fleet owner".
- **Owner self-approval:** decided by the server from role (`fleet_owner` may), recorded as `self_approved` on the bill and in the audit log. The request can no longer ask for it.

### 14.2 Data model (Postgres tables, replacing the KV shim)

| Table | What it holds | Key rules |
|---|---|---|
| `fleet.vendors` | Fleet-visible vendors (Jamaica catalog + owner-added) | Owner can add directly; Roam verification becomes a badge, not a blocker |
| `fleet.contracts` | Ongoing obligations: insurance policy, GPS subscription, registration, fitness, lease, software | One per thing per vehicle (or fleet-wide) |
| `fleet.contract_periods` | Each coverage term: start, end, premium, renewal status (`active` / `renewal_due` / `renewed` / `not_renewing` / `lapsed`) | No overlapping periods per contract (exclusion constraint). End date = **coverage end**, never a billing date |
| `fleet.bills` | Every bill, one-off or from a contract period | Status machine enforced in SQL; `version` for optimistic locking |
| `fleet.bill_lines` | Allocation per vehicle / service line / category | Lines must sum to bill total |
| `fleet.payments` | Payments against bills | Sum ≤ bill total; idempotency key unique |
| `fleet.journal_lines` | Double-entry lines (expense, prepaid, AP, cash, GCT input) | Each journal balances |
| `fleet.period_locks` | Locked weeks (fed by Week Reconciliation close) | Posting refuses dates in locked weeks |

Your 5 existing `fixed_expenses` rows migrate to 5 contracts with their periods (§14.8).

### 14.3 Recognition: how money lands in the P&L
For a prepaid contract period (e.g. insurance $120,504.08 for 15 Oct 2026 → 14 Oct 2027):

| When | Journal | P&L effect |
|---|---|---|
| Bill entered | Dr Prepaid / Cr Accounts payable | none |
| Each day of coverage | Dr Insurance expense / Cr Prepaid (amount ÷ 365) | ~$330.15/day ≈ $2,311/week |
| Payment | Dr Accounts payable / Cr Bank or Cash | none (cash view only) |

- **Accrual P&L** reads the daily expense lines.
- **Cash view** reads the payments.
- **Balance figures on the Overview:** "Prepaid remaining" and "Bills owed (AP)".
- One-off bills (repairs, parking, valuation) are expensed on their incurred date, as today.
- Daily lines are generated by a scheduled job **up to today only**, so there are no future-dated actuals. Upcoming costs live in a separate forecast view.

This promotes the spread engine you already have (`expenseCoverageRunRate.resolveCoverageWindow`) from "chart only" to the P&L source.

### 14.4 Owner self-service: renewals and bills
**Expense Hub → Overview → "Renewals"** lists every contract period ending within 30 days (alerts at 30 / 14 / 7 / 0 days) and anything lapsed.

| Owner action | What happens |
|---|---|
| **Renew** | Form pre-filled: new start = day after old end, new end = +1 term, last premium, vendor, vehicle(s). Owner edits premium/dates, sets due date, uploads policy/receipt, optionally "paid now". One command creates the new period, bill, amortisation schedule and optional payment, in one transaction. Last year's records are untouched. |
| **Not renewing** | Period marked `not_renewing`; nothing is charged; vehicle readiness can warn "no insurance after X". |
| **Change** (wrong amount/dates) | Reversal of affected unlocked days + re-post. Refused for locked weeks, with a message naming the week. |
| **Log a bill** | Same wizard as today: vendor, category, amount, GCT, vehicles, receipt, pay now or later. |
| **Pay** | Shows the balance; can't overpay; double-clicks are safe. |
| **Void** | Reversing entries (original date if that week is open, otherwise today); payments must be refunded or reallocated first. |

`autoRenew` becomes only a reminder preference. **Nothing is ever charged for a renewal the owner hasn't confirmed.** This is the root fix for F-01.

### 14.5 Posting service (server)
Postgres functions, called by thin Edge routes:

`post_bill`, `record_payment`, `renew_contract_period`, `end_contract_period`, `void_bill`, `reverse_and_repost`

Each one:
1. Checks permission + org.
2. Checks period lock.
3. Validates (balance, overlap, sums).
4. Writes the domain rows, journal lines, canonical `ledger_entries` (reversals where needed) and GCT input tax in **one transaction**.
5. Writes the audit row.
6. Returns the new state.

A replay with the same idempotency key returns the first result. This removes F-04, F-08, F-09, F-10 and AR-6 by construction.

### 14.6 One read model for every screen
- `finance.period_lines` holds one row per org × service line × day × P&L line × basis, with source counts. It's refreshed by the posting functions and specialist writers (fuel, toll, settlement), and rebuilt nightly with a diff alert.
- `finance.tieouts` holds per-period checks with status and difference:
  - fuel ledger vs settlement
  - tolls vs Toll Recon
  - bank expected vs received
  - AP vs bills
  - Overview footing
- **Rev 4: authoritative source per line** (details in §15.4):
  - **Closed weeks:** revenue, driver share, fuel company share and toll loss come from the sealed `week_statements`. **Open weeks:** they come from the live engines.
  - **Driver payouts and cash collections:** from `settlement_movements`.
  - **Rush / courier:** from `rush_money` journals and the COD remittance ledger.
  - **Bank:** from one shared "expected bank" function (also used by Bank Deposits and Ledgers).
  - **Wallet loads:** from the Wallet Center endpoint.
  - **Toll tag top-ups:** as transfers.
- **One endpoint:** `GET /business-finance/statement?start&end&scope&basis` returns lines, breakdowns, tie-outs, alerts and data health. Overview, P&L, Expense Hub and Week Reconciliation all read it, so they can't disagree.
- **Target:** p95 under 1.5 s, one request per load. Switching accrual/cash is instant because both bases come in the same response.

### 14.7 New Overview layout (statement first)

```
Oct 12 – 18, 2026 · Accrual · All service lines                [Cash view]
─────────────────────────────────────────────────────────────────────────
Gross platform earnings                                       55,312.11
  Platform fees                                              (x,xxx.xx)
Net trip revenue                                              xx,xxx.xx
  Driver commission                                         (xx,xxx.xx)
  Fuel  (total spend 21,500.00)                        >    (xx,xxx.xx)
      gas card | driver/fare cash | charged to drivers | fleet cost | tie-out
  Tolls                                                >          0.00
  Maintenance                                          >          0.00
  Fixed costs (insurance, GPS, permits)                >     (2,8xx.xx)
      this week's share of each contract
  Other operating expenses                             >          0.00
  Other income                                                    0.00
  Cash written off                                                0.00
─────────────────────────────────────────────────────────────────────────
Operating profit                                              xx,xxx.xx   [foots]
Costs as % of gross                                               xx.x%

Cash & obligations: Bank received/expected | Cash held | Bills owed (AP) | Prepaid remaining | Renewals due
Checks: [ok] Overview foots   [!] Fuel vs settlement 2,500.00   [!] 1 tag toll not in ledger
```

- Every line opens its source records.
- Failed inputs show **"Unavailable"**, and profit is withheld rather than guessed.
- Alerts are grouped as Errors / Warnings / Notes, with driver names instead of IDs.
- The period lives in the URL and carries into the Expense Hub.

### 14.8 Migration path (each phase shippable on its own)

| Phase | Work | Proof it worked |
|---|---|---|
| **0. Unblock** (≈1 day) | Restore `expenses.*` perms; permission parity test; owner-never-blocked test | Owner opens Hub; CI green |
| **1. Stop the wrong number** (1–2 days) | Fix end-date loop; reverse GPS 15 Oct row; enter insurance renewal as a new period; Overview footing check + missing rows | Oct 12–18 fixed costs ≠ $168k; footing passes |
| **2. Tables + posting functions** (1–2 weeks) | §14.2 + §14.5 behind `expense_hub_v2`; migrate 5 contracts | Tests: paid-now, overpay, replay, locked-week refusal |
| **3. Renewals + self-service UI** (≈1 week) | §14.4 screens, additive next to current Hub | Owner renews GPS end to end without help |
| **4. Amortisation + read model** (2–3 weeks) | §14.3 job, §14.6 tables + endpoint; 2-week daily shadow compare vs old math | Diffs only in renewal weeks, signed off line by line |
| **5. Switch screens** (≈1 week) | New Overview (§14.7), P&L and Hub read the endpoint; old client math removed after sign-off | p95 < 1.5 s; one request per load; tie-outs green or explained |

**Out of scope for v2:** multi-currency, budgets redesign, bank-feed import. The design leaves room for each.

**Rev 4 addition, Phase 1b (2–3 days, after Phase 1):** a read-only **"Does this week agree?"** panel on the Overview. It compares Business Finance to each linked section using the §15.1 table, so every mismatch is visible before the bigger rebuild lands.

---

## 15. Cross-section sync check (Rev 4)

Sections traced:

| Section | Code |
|---|---|
| Bank Deposits | `FleetFinancialsPage.tsx` |
| Week Reconciliation | `business_week_pnl.ts`, `week_close.ts` |
| Driver Settlements | `DriverSettlementsPage.tsx`, `settlementCommandsApi` |
| Courier Settlements | `CourierSettlementsPage.tsx` |
| InDrive Wallet | `IndriveWalletCenterPage.tsx`, `ledger_indrive_wallet_routes.ts` |
| Ledgers | `TabbedTransactionList`, `ledger_query_summary_routes.ts` |

All figures below are from production for the week Oct 12–18 2026 (one driver, one vehicle 5179KZ), using read-only queries.

### 15.1 The same week, screen by screen

| Figure | Business Finance shows | Linked section shows | Difference | Why |
|---|---|---|---|---|
| Gross earnings | $55,312.11 | Week Recon (closed) / Driver Settlements: **$55,140.77** | $171.34 | BF adds Uber `promotion` events on top of `fare_earning`; settlement and Ledgers treat the promotion as already inside the fare (X-03) |
| Driver commission | $15,770.42 *(not shown on Overview)* | Week Recon / Settlements: $15,770.42 | $0 | Agrees, but missing from Overview Money out (F-03) |
| Fuel | $21,500.00 | Week Recon fuel statement: spend **$19,000.00**, company share **$17,191.88** | $4,308.12 | $2,500 of RideShare_Cash fills not in the closed fuel statement + driver's $1,808.12 fuel share never netted in BF (X-01) |
| Tolls | $0.00 | Week Recon toll statement: net loss $0.00 | $0 | Agrees |
| Bank expected | $33,757.62 | Bank Deposits: $33,757.62 **+ any Roam card trips**; Ledgers Statement Summary: **$33,757.62 or $67,384.03** (whichever row comes last) | varies | Three different "expected bank" rules (X-04) |
| Cash collected | $23,970.65 | Driver Settlements: $23,970.65 (returned $10,000.00, still held $0.00) | $0 | Agrees; but BF can't show the roll-forward (X-11) |
| Driver payouts | **$0.00** | Driver Settlements: **$17,183.53 paid** (23 Oct, cash) | $17,183.53 | No code writes `driver_payout` to the ledger BF reads (X-02) |
| Courier cash held / Rush revenue | not shown | Courier Settlements + `rush_money` (17 journals, 4–17 Oct) | unknown | BF never reads Rush money (X-06) |
| Toll tag top-up | not shown | Toll ledger: $5,000.00, recorded **twice** (`tag_top_up` + `toll_top_up`, same reference) | $5,000 transfer missing | X-07 |
| InDrive wallet loads | $0.00 (client calc) | Wallet Center (server calc) | none this week | Two calculators for one figure (X-08) |
| "P&L" | Operating profit −$150,187.39 | Week Recon "P&L tie" = earnings share + fuel share + toll loss | different by design | Two things both called P&L (X-10) |

**If Business Finance used the closed week as its source** (and the GPS fix from F-01), Oct 12–18 would read approximately:

| Line | Amount |
|---|---|
| Revenue | $55,140.77 |
| Driver commission | −$15,770.42 |
| Fuel (company share) | −$17,191.88 |
| Tolls | $0.00 |
| Fixed costs (one week of insurance, spread) | ≈ −$2,300 to −$3,300 |
| **Operating profit** | **≈ +$18,900 to +$19,900** |
| *Shown today* | *−$150,187.39* |

### 15.2 New findings

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| X-01 | **Critical** | **A closed, signed-off week disagrees with Business Finance.** BF never reads sealed `week_statements`, so it re-derives fuel and gross its own way and gets different answers ($4,479.46 apart on Oct 12–18 before fixed costs). | `week_statements` (week 2026-10-12, status closed); `fetchBusinessFinanceBundle.ts` reads only `ledger_entries` + driver periods | For closed weeks, BF uses the sealed statements; for open weeks, the same engines Week Recon uses. Show "Closed" or "Provisional" per week |
| X-02 | **High** | **Driver payouts never reach Business Finance.** Settlement desk writes `settlement_movements` (28 posted pays **$128,768.71**, 8 collects **$50,939.51** since 6 Sep). No code writes a `driver_payout` ledger event. BF's Driver payouts line is permanently $0 and the Cash view never subtracts payouts. | prod `settlement_movements`; no `driver_payout` writer in `supabase/functions` | Read payouts/collections from `settlement_movements` (or post them to the ledger in the same transaction as the movement) |
| X-03 | High | **Uber promotions likely counted twice in BF gross** ($171.34 this week). Settlement and Ledgers treat `fare_earning` as already containing the promotion; BF's `recognizePlatformGrossAndFees` adds `promotion` events again. | `platformFeeRecognition.ts:92`; `ledger_query_summary_routes.ts` (`netFare − promotions`); settlement `earnings_gross` 55,140.77 | Confirm against one Uber CSV, then use one definition in finance-core |
| X-04 | High | **Three different "bank expected" rules.** BF counts org deposit rows only; Bank Deposits also adds Roam card trips; Ledgers' Statement Summary **overwrites** `bankTransfer` with whichever `payout_bank` row it sees last (`bankTransfer = mag`), so with two rows the answer depends on row order. The week also holds two incompatible `payout_bank` shapes: an org deposit inflow ($33,757.62) and a statement payout line on driver `00000000…` ($67,384.03). Both Oct 12 rows also carry `periodStart = periodEnd = 2026-10-19`. | `fleetBankReceive.ts`, `FleetFinancialsPage.tsx:328-331`, `ledger_query_summary_routes.ts` (`case "payout_bank"`) | One `expectedBankForWeek()` in finance-core used by all three; sum, never overwrite; fix import metadata |
| X-05 | Medium | Ledgers Statement Summary also **overwrites** cash collected (`case "payout_cash": cashCollected = mag`), discarding cash fares already summed. | same file | Same shared function |
| X-06 | Medium | **Rush delivery and courier COD are invisible to Business Finance.** BF reads `public.ledger_entries` only; Rush money lives in `rush_money.journals/lines` and the COD remittance ledger. The "Rush Delivery" revenue split and courier "cash still held" can never show real numbers. | prod `rush_money.journals` (17, 4–17 Oct); `CourierSettlementsPage.tsx:28-34` | Read model includes Rush journals + courier cash balances; Overview shows courier cash held next to driver cash held |
| X-07 | Medium | **Toll tag top-ups are recorded twice and shown nowhere.** The $5,000 top-up on 12 Oct exists as `tag_top_up` (toll_workflow) and `toll_top_up` (toll) with the same reference. BF's Transfers card lists only InDrive wallet loads, so money moved onto toll tags vanishes from the cash picture. | prod `ledger_entries` | One event type; show "Bank → toll tags" under Transfers; tag balance as prepaid |
| X-08 | Medium | **InDrive wallet loads computed twice.** BF sums canonical `wallet_credit` in the browser; Wallet Center uses the server summary. BF already calls that endpoint (for short-driver count) but ignores its `periodLoads`. Last `wallet_credit` in the ledger is 6 Sep 2026. | `fetchBusinessFinanceBundle.ts:213-217,261-265` | Use the server figure; **[Assumption]** confirm no wallet loads since 6 Sep, otherwise they're missing |
| X-09 | Medium | **No reliable period-lock signal.** `week_close_locks` has one row ever (2026-09-07), yet the Oct 12 week is closed in `driver_financial_periods` and `week_statements`. Anything that wants to respect closed weeks (Expense Hub, rule edits, F-09) has no single source to check. | prod `week_close_locks` | Define "week closed" in one place (closed statements + period status) and write the lock row on every close |
| X-10 | Medium | **Two things called "P&L".** Week Recon's tie is a driver-lane contribution (earnings company share + fuel company share + toll loss), with no fixed costs or other bills. BF's Operating profit is a full P&L. The owner sees two different "P&L" numbers for one week. | `business_week_pnl.ts:29-43` | Rename Week Recon's figure to "Driver-lane contribution"; show it as a subtotal on the BF statement so the two visibly connect |
| X-11 | Low | **Driver cash roll-forward can't be explained from Business Finance.** The week reads: collected $23,970.65, returned $10,000.00, still held $0.00, net pay $13,962.30, paid $17,183.53. BF shows only the first and third. **[Needs verification]** whether the $3,221.23 between net pay and paid is expected (e.g. reimbursements). | `driver_financial_periods` week 2026-10-12 | Driver cash roll-forward panel: opening + collected − returned − kept as pay − paid = closing |
| X-12 | Low | Earlier Ledgers findings (S-01 refunds added to expenses, S-02 dropped `toll_reimbursement`): the code has since moved to `presentStatementToll`. **Not re-verified in this pass.** | `ledger_query_summary_routes.ts:438-452` | Re-check with the shared toll netting test |

### 15.3 What this tells us about the architecture

Every mismatch above is the same pattern your earlier audits found: **two or more copies of one truth.**
- **Gross:** 3 definitions
- **Bank expected:** 3 rules
- **Fuel:** 2 sources
- **Wallet loads:** 2 calculators
- **Payouts:** 2 stores, one never read

Business Finance assembles its numbers in the browser from the raw ledger and quietly misses anything stored elsewhere (settlements, Rush, sealed weeks). That confirms the §14 direction: **one read model that takes each line from the section that owns it**, plus a standing tie-out for every link, so a disagreement is shown, not hidden.

### 15.4 Source of truth per Business Finance line (adopted into §14.6)

| BF line | Owner section | Source |
|---|---|---|
| Revenue, platform fees, driver commission | Week Recon / Driver Settlements | sealed `week_statements` (closed) or earnings engine (open) |
| Fuel (total spend + breakdown) | Fuel Recon / Week Recon | fuel statement: total spend, driver share, company share |
| Tolls | Toll Recon / Week Recon | toll statement net loss |
| Fixed costs, bills, AP, prepaid | Expense Hub v2 | contracts, bills, payments (§14.2) |
| Maintenance | Maintenance Hub | posted maintenance events |
| Driver cash collected / held / written off / paid | Driver Settlements | `driver_financial_periods` + `settlement_movements` |
| Courier cash held, Rush revenue | Courier Settlements / Rush | `rush_money` journals + COD remittance |
| Bank expected / received | Bank Deposits | one shared `expectedBankForWeek()` + `bank_confirmations` |
| Transfers (InDrive wallet, toll tags) | InDrive Wallet / Toll | Wallet Center server summary; single toll top-up event |
| Record-level drill-down | Ledgers | same read model, filtered |

**Tie-outs shown on every Overview:**
1. BF revenue = sealed earnings
2. BF fuel = fuel statement
3. BF tolls = toll statement
4. Payouts = settlement movements
5. Bank expected (BF) = Bank Deposits
6. Ledgers summary = BF for the same week
7. Statement foots

Each shows ✓ or the exact difference.

### 15.6 Rev 5: owner answers and what the data shows

**Owner answers:**
1. **Uber net fare includes promotions.** Confirmed by Uber's own driver statements.
2. **The $67,384.03 is the previous week's payout.** Confirmed.
3. **No $2,500 fuel transaction exists in Transaction Logs.** Confirmed; the cause is below.
4. **No InDrive wallet loads since 6 Sep.** So X-08 is not missing data; it stays a Low duplication issue.
5. **The settlement overpaid the driver.** Confirmed, and the amount is larger than $3,221.23 (see X-13).

#### Uber earnings: checked against the Uber screens you sent

| Week | Uber "Total earnings" | Ledger fares + tips | Ledger short by | BF gross (Uber part) | BF over/under Uber |
|---|---|---|---|---|---|
| Oct 12–18 | $53,693.27 | $52,880.77 + $760.00 = $53,640.77 | **$52.50** (exactly the cancellation fee) | $53,640.77 + $171.34 promotion = $53,812.11 | **+$118.84** |
| Oct 5–11 | $81,613.19 | $80,202.76 + $910.00 = $81,112.76 | **$500.43** ($63.00 cancellation + $437.43 unexplained) | + $64.56 promotion | −$435.87 |

- Uber shows **no promotion line** in either week. The "Promotions" figure in `payments_driver.csv` is already inside Uber's Fare, so Business Finance adding it again is a **double count** (X-03 confirmed).
- **Uber's Net earnings tie exactly to the bank rows:**
  - Oct 12: $53,693.27 + $2,535.00 refunds − $22,470.65 cash = **$33,757.62**, the org deposit Business Finance uses. ✓
  - Oct 5: $81,613.19 + $4,910.00 − $19,139.16 = **$67,384.03**, the "so.payout" row dated 12 Oct. So that row belongs to the **Oct 5** week (X-04 confirmed). Each week's ledger holds its own org deposit plus the previous week's payout line.
- The Oct 12 import batch also records `period_start = period_end = 2026-10-19` (should be 10-12 → 10-18).

**Correct Oct 12–18 gross:** Uber $53,693.27 + Roam $1,500.00 = **$55,193.27**.

| Screen | Shows | Off by |
|---|---|---|
| Settlement / Week Recon | $55,140.77 | −$52.50 |
| Business Finance | $55,312.11 | +$118.84 |

#### X-15 (Medium): Uber import loses fare lines; Business Finance double-counts promotions
- **Evidence:** ledger `fare_earning` excludes the cancellation fee ($52.50 Oct 12, $63.00 Oct 5) plus $437.43 more on Oct 5. Promotions are posted as a separate `promotion` event that `platformFeeRecognition.ts:92` adds on top.
- **Impact:** gross is wrong on every screen; driver share is calculated on the short figure, so the driver is slightly under-credited.
- **Fix:**
  - Post cancellation fees (and any other Uber fare components) as earnings.
  - Treat `payments_driver` Promotions as informational, not additive.
  - **Import tie-out:** for each driver-week, the sum of ledger Uber earnings must equal `payments_driver` Total earnings to the cent, or the import is flagged.

#### X-14 (High): fuel ledger has a duplicate $4,000 card fill and is missing a $1,500 cash fill
Four fuel records exist for 17 Oct:

| Record | Source | Amount | Odometer | In ledger? | In Transaction Logs? |
|---|---|---|---|---|---|
| `3c947d9f` | driver portal, Manual_Entry, Gas card | $4,000 | 192,213 | no (correct, matched) | yes |
| `aac1f282` | card statement, Anchor | $4,000 | 192,213 | **yes** | (merged into the row above) |
| `03807df5` | card statement, **Floating** (no odometer), created 2 s after `aac1f282` | $4,000 | — | **yes, duplicate** | no |
| `1b4ed81c` | driver portal, Buds, RideShare_Cash, type "Reimbursement" | $1,500 | 192,145 | **no, missing** | yes |

- Ledger fuel = $21,500 = true $19,000 + $4,000 duplicate − $1,500 missing.
- Transaction Logs ($19,000) and the closed fuel statement ($19,000 = $15,000 card + $4,000 cash) are right; **the ledger Business Finance reads is wrong.**
- "Unmatched (0)" on Transaction Logs hides the floating duplicate.
- **Fix:**
  - Card import dedupe (same card + date + amount + upload → one row).
  - Ledger writer for Reimbursement-type cash fills.
  - Nightly tie-out: Σ ledger `fuel_expense` = Σ Transaction Logs for each week.
  - Reverse the `03807df5` ledger row and post the missing $1,500.

#### X-13 (Critical): driver settlement overpaid by $13,191.88 (Oct 12–18, Kenny Gregory Rattray)
Settlement history from sealed `week_statements` and `settlement_movements`:

| When | What happened | Amount owed (+ to driver / − by driver) |
|---|---|---|
| 19 Oct 16:35 | Earnings sealed: driver share $15,770.42 − cash collected $23,970.65 | −$8,200.23 |
| 20 Oct 16:02 | Driver returned $10,000 cash | |
| 20 Oct 18:59 | Restated | +$1,799.77 ✓ |
| 20 Oct 23:48 | **Fuel finalized → restated** | **+$17,183.53** ✗ |
| 21 Oct 15:24 | Week closed | |
| 23 Oct 02:44 | **Paid $17,183.53 cash**, `approval_state: none` | |

**What fuel finalize did:**

| | Amount |
|---|---|
| Owed before fuel finalize | $1,799.77 |
| \+ company's share of **all** fuel | $17,191.88 |
| − driver's fuel share | $1,808.12 |
| **= what it said was owed** | **$17,183.53** (exact to the cent) |

It credited the driver with the company's share of all $19,000 of fuel, as if the driver had paid for all of it. But $15,000 was on the **company gas card**; the driver only spent **$4,000** of fare cash on fuel.

**Correct settlement:**

| | Amount |
|---|---|
| Driver share | $15,770.42 |
| − driver's fuel share | $1,808.12 |
| = net pay | $13,962.30 |
| − cash still held ($23,970.65 collected − $4,000 spent on fuel − $10,000 returned) | $9,970.65 |
| **= owed to driver** | **$3,991.65** |

**Overpaid: $17,183.53 − $3,991.65 = $13,191.88**, which is the company's share of fuel ($17,191.88) minus the $4,000 the driver actually spent. Your $3,221.23 (paid − net pay) leaves out the $9,970.65 of fare cash the driver still held.

**Also wrong:**
- `cash_still_held` now reads $0.00, so the $9,970.65 the driver kept is no longer tracked anywhere.
- The payment went through **with no approval**, two days **after** the week closed, using an amount from a draft restatement. The closed statement carries no settlement amount at all.

**Assumption:** the three cash fills ($1,000 + $1,500 + $1,500) were paid from fare cash (RideShare_Cash says so). If the driver used personal money, the correct amount owed is still $3,991.65, because the $4,000 is credited either way.

**Fix:**
- Fuel finalize credits the driver only for fuel the driver paid for (cash/personal), never gas-card spend.
- Payments must match the **closed** statement's amount, and above a threshold need approval.
- Add a regression test from this exact week.
- **Check every other settled week for the same jump.** Only Oct 12 is settled for this driver so far.
- **Operationally:** record **$13,191.88 owed by the driver** (recover, offset next week, or write off by decision). Don't reverse the cash payment silently.

This needs a dedicated Driver Settlements audit. It sits outside this document's scope, but it feeds Business Finance (Driver payouts, Driver Balances, cash held).

#### Updated Oct 12–18 picture (everything corrected)

| Line | Amount |
|---|---|
| Revenue (Uber $53,693.27 + Roam $1,500.00) | $55,193.27 |
| Driver commission | −$15,770.42 *(+ the small share of the missing $52.50)* |
| Fuel (company share of the real $19,000) | −$17,191.88 |
| Tolls | $0.00 |
| Fixed costs (insurance spread; no GPS until renewed) | ≈ −$2,300 |
| **Operating profit** | **≈ +$19,900** |
| *Shown today* | *−$150,187.39* |

**Balance-sheet items, not profit:**
- Driver owes **$13,191.88** (X-13).
- Prepaid insurance remaining ≈ $119,000 at 18 Oct.

### 15.5 Questions this pass raised (answered in §15.6)

1. Does Uber's net fare already include promotions (X-03)? One Uber payments CSV for Oct 12–18 settles it.
2. The $67,384.03 `payout_bank` "so.payout" row on 12 Oct: is that the **previous** week's transfer landing on 12 Oct? If so, it belongs to the Oct 5 week in Bank Deposits.
3. The $2,500 of RideShare_Cash fuel fills (Oct 12–18) aren't in the closed fuel statement. Were they intentionally left out (e.g. split fills), or missed?
4. Have there been InDrive wallet loads since 6 Sep?
5. Driver paid $17,183.53 against net pay $13,962.30: what's the $3,221.23?

---

## 16. Coverage, limits and readiness (Rev 6)

### 16.1 What this document covers, honestly

| Section | Depth | What was checked | What was **not** checked |
|---|---|---|---|
| **BF Overview** | Full audit | All code paths, every number, prod data | — |
| **Expense Hub** | Full audit | UI, server routes, lifecycle, recognition, permissions, prod data | — |
| Bank Deposits | Sync check | "Expected bank" rule, how it feeds BF, Uber payout timing | Statement upload/matching flow, confirm/unconfirm actions |
| Week Reconciliation | Sync check | "P&L tie" definition, sealed statements for Oct 12–18 | Wizard steps (covered by `WEEK_RECONCILIATION_WIZARD_AUDIT.md`), close gates |
| Driver Settlements | Sync check + one root cause | Where payouts live, Oct 12–18 settlement, the X-13 overpayment | Pay/collect/write-off/reverse logic in general, approval thresholds, other drivers, other weeks' formulas |
| Courier Settlements | Sync check only | Confirmed BF never reads Rush/COD money | Everything inside (COD remittance has its own closed audit) |
| InDrive Wallet | Sync check only | Load calculation source; no loads since 6 Sep | Balance/short-driver logic, fee calculation |
| Ledgers | Sync check | Statement Summary overwrite bug (X-04/X-05) | Re-verify the earlier Ledgers audit fixes (X-12) |

**So:** Overview and Expense Hub are fully audited. The other six were checked **for how they connect to Business Finance**, not audited inside. Two of them need their own audit before their part of the build:
- **Driver Settlements:** X-13 shows real money leaving incorrectly.
- **Fuel ledger writers:** X-16 below.

### 16.2 All-weeks sweep (added Rev 6, June → October 2026)

**X-16 (High): the fuel ledger disagrees with fuel records in most weeks, not just Oct 12–18.**
- Since June, weekly ledger `fuel_expense` differs from `fleet.fuel_entries` in **15 of 21 weeks**.
- In three weeks the ledger is **higher than all fuel records combined**: Aug 3 **+$18,404.80**, Aug 10 **+$21,088.80**, Sep 14 **+$27,000.00**. Matched driver/card pairs can't cause that, so these are over-counts like the X-14 duplicate.
- Other weeks are lower (missing rows, like the $1,500 Buds fill).
- **Every Business Finance fuel figure before October is suspect.**
- **Fix:** same as X-14, plus a one-time rebuild of fuel ledger rows from the reconciled fuel records for every week, checked against closed fuel statements.

**X-17 (High): Uber earnings in the ledger don't match Uber's totals in 13 of 14 weeks.**
- Uber's real weekly total = org bank deposit + cash collected − toll refunds. This formula reproduces your two Uber screenshots to the cent.
- **Ledger vs Uber, by week:**

| Week | Ledger vs Uber |
|---|---|
| Jul 13 | −$3,340.09 |
| Jul 20 | −$2,220.82 |
| Jul 27 | −$1,172.21 |
| **Aug 3** | **−$34,956.66** |
| Aug 10 | +$1,500.00 |
| Aug 17 | −$52.50 |
| **Aug 24** | **+$6,447.50** |
| Aug 31 | −$178.50 |
| Sep 7 | −$437.68 |
| Sep 14 | −$163.42 |
| Sep 21 | −$262.50 |
| Sep 28 | −$1,139.19 |
| Oct 5 | −$500.43 |
| Oct 12 | −$52.50 |

- Small gaps are mostly cancellation fees (X-15). **Aug 3 and Aug 24 look like missing or duplicated trip imports.**
- Driver share is calculated on these figures, so **past settlements may be off too.**
- **Fix:** the X-15 import tie-out, plus a one-time re-import or adjustment for Aug 3 and Aug 24 after checking those Uber statements.

### 16.3 Will everything be in sync after implementation?

**Yes, for every mismatch found here,** provided all of these are built, not just Overview/Hub:

| Must be built | Why |
|---|---|
| Expense Hub v2 (§14) | fixed costs, renewals, bills |
| Fuel ledger fixes (X-14, X-16) + rebuild | fuel figures |
| Uber import fixes (X-15, X-17) + re-import | gross and driver share |
| Settlement fuel-credit fix (X-13) + recovery | payouts and driver balances |
| Shared bank rule (X-04/X-05) | bank expected everywhere |
| Read model taking each line from its owner (§14.6, §15.4) | one number on every screen |
| **Tie-out panel (Phase 1b + §15.4)** | proves sync every week |

**What I can't promise:** that there are no bugs inside the six linked sections I haven't fully audited. The tie-out panel is the safety net. If any section still disagrees with Business Finance after the build, the Overview shows the exact difference instead of hiding it. That's the real guarantee of "in sync": **disagreement becomes visible and blocks close, so it can't stay silent.**

### 16.4 Master implementation order (supersedes §9 and §14.8 ordering)

| # | Work | Findings | Prereq |
|---|---|---|---|
| **0** | Unlock Expense Hub; permission parity test | F-05, AR-8, UX-11 | — |
| **1** | **Stop money leaving wrongly:** fix settlement fuel credit; require pay = closed statement + approval; record $13,191.88 owed by driver | X-13 | quick Driver Settlements review of pay path |
| **2** | Fix fixed-expense end date; reverse GPS row; enter insurance renewal | F-01 | — |
| **3** | Tie-out panel ("Does this week agree?") | §15.4, Phase 1b | — |
| **4** | Fuel ledger: card-import dedupe, cash-fill writer, rebuild all weeks | X-14, X-16 | fuel writer review |
| **5** | Uber import: cancellations, promotions, per-week tie-out; fix Aug 3 / Aug 24 | X-15, X-17, X-03 | Uber statements for those weeks |
| **6** | Overview foots + safe states | F-03, F-06, F-12, F-13, UX-2/3/5/6/8/9 | — |
| **7** | Shared bank rule; Ledgers summary sums, not overwrites; payout dated to its own week | X-04, X-05 | — |
| **8** | Expense Hub v2 tables + posting functions + renewals UI | F-04, F-07–F-10, AR-4–AR-7, §14.2–14.5 | — |
| **9** | Amortisation + read model + driver payouts, Rush, toll top-ups into it | F-02, X-02, X-06, X-07, X-08, X-09, X-10, §14.3, §14.6 | steps 4, 5, 8 |
| **10** | Switch screens after 2-week shadow compare; tie-outs all green | §14.7–14.8 | step 9 |

### 16.5 Verdict

**Good to start implementation: yes, steps 0–3 immediately.** They're fully evidenced, small, and stop the worst damage (owner lockout, wrong overpayment path, phantom GPS charge), and step 3 gives you a live measure of everything else.

Before steps 4 and 5, do short focused reviews of the fuel ledger writers and the Uber import. This document found *that* they're wrong in many weeks and the Oct 12–18 causes, but not every cause in every week.

Treat step 1 as a Driver Settlements fix and give that section its own audit soon; it's the only place found where money actually left the business incorrectly.
