# Driver Settlements — Full Section Audit

**Scope**: Business Finance → Driver Settlements (Collect / Pay / Log cash / Reconciled), its API layer, its server projection queue, and the money-write path behind every button on the page.

**First audit**: 2026-09-05
**Re-verification pass**: 2026-09-05 (after implementation) — §0 below
**Mode**: **Audit only — no code changed in either pass.**

**Related prior audits**:
- [SETTLEMENT_CALCULATION_AUDIT.md](SETTLEMENT_CALCULATION_AUDIT.md) — the settlement *formula* and the period rebuild engine
- [docs/FINANCIAL_INTEGRITY_AUDIT.md](docs/FINANCIAL_INTEGRITY_AUDIT.md) — the seven money engines and the four week rules
- [docs/adr/0010-collect-kpi-basis.md](docs/adr/0010-collect-kpi-basis.md) — why "Driver owes" and "Cash held" are separate KPIs

---

# 0. Re-verification — status after implementation

Every finding was re-checked against the current tree. **The infrastructure is built and it is good work.** New migrations, an append-only `settlement_movements` table, five server commands with real caps and permission gates, an aging/rollup queue table, safe CSV export, RLS policies, and 28 passing tests.

**But the desk does not actually use most of it**, and one pattern turns the new safety layer into a bypass.

## 0.1 The blocking issue — read this first

🔴 **`catch {}` fallbacks convert every new control into an opt-out.**

All three single-row write paths call the new command API, then swallow **any** error and re-post through the old client-authored path:

```ts
// DriverSettlementsPage.tsx:1078-1100  (same shape at :1102-1183 and :1185-1210)
try {
  await settlementCommandsApi.pay({ ..., idempotencyKey, expectedOutstanding });
} catch {
  // Cutover fallback until migration is applied everywhere.
  const newTx = buildDriverPayoutTx(payload, {...});
  await api.saveTransaction(newTx);          // ← legacy path, none of the new controls
}
refreshAll();
```

The `catch` does not discriminate. Every server rejection therefore becomes a successful payment:

| Server response | Intended behaviour | Actual behaviour |
|---|---|---|
| `409 STALE_RESIDUAL` (concurrent pay) | reject, re-read | **falls back → pays anyway** |
| `403` on `settlements.pay` | reject | **falls back → posts via `transactions.edit`** |
| `PAY_CAP_EXCEEDED` (over-entitlement) | reject | **falls back → pays anyway** |
| `PERIOD_FROZEN` | reject | **falls back → pays anyway** |
| `COLLECT_CAP_EXCEEDED` | require reason | **falls back → posts, no reason** |
| idempotency replay | dedupe | fallback discards the key |

Net effect: `assertExpectedOutstanding`, `enforcePayCap`, `enforceCollectCap`, `assertPeriodNotFrozen`, `requireSettlementPerm`, and the idempotency unique index are all **advisory**. The code now *looks* protected, which is more dangerous than the original state — a reviewer reading `settlementCommandsApi.pay(...)` reasonably concludes the invariant holds.

**Fix**: the fallback must fire only when the endpoint is genuinely absent (network error, 404, 501). Any 4xx business rejection must surface to the user. Concretely — classify the error, re-throw on `4xx` other than 404, and delete the fallback entirely once the migration is deployed everywhere.

## 0.2 Verified fixed ✅

| ID | Finding | Evidence |
|---|---|---|
| S1-1 | Money-write endpoint had no role check | `isSettlementDeskCategory()` gate + `requireAuth({requireOrg:true})` — [index.tsx:3438](supabase/functions/_fleet-server/index.tsx#L3438), [settlement_desk_security.ts](supabase/functions/_fleet-server/settlement_desk_security.ts) |
| S1-2b | DELETE had no org check (IDOR) | `mayMutateTransactionOrg()` on both toll and tx paths — [index.tsx:4021-4049](supabase/functions/_fleet-server/index.tsx#L4021-L4049) |
| S1-3 | Reconciled tab not org-scoped | all five routes now spread `...opts` incl. `organizationId` — [controller:230-347](supabase/functions/_fleet-server/driver_financial_period_controller.tsx#L230-L347) |
| S1-5 | Log Cash had no over-collection cap | soft-warn + reason-gated hard block — [LogCashPaymentModal.tsx:204-216](apps/fleet/src/components/drivers/LogCashPaymentModal.tsx#L204-L216) |
| S1-6 | Service-line scope a no-op on 4 of 5 reads | `serviceLine` accepted **and applied** on all list fns; `txsQuery` now sends it too |
| S1-7 | `findFreshCollectRow` key mismatch | `scope` added — [:714-729](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L714-L729); command also returns the server's `period` |
| S1-8 | Reconciled query key omitted `scope` | fixed — [:411](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L411) |
| S1-9 | Cash-held select omitted `metadata` | added with a comment naming the finding — [:2141-2143](supabase/functions/_fleet-server/driver_financial_periods.ts#L2141-L2143) |
| S1-10 | Done tab filtered tx date vs settlement week | server filters `metadata->>workPeriodStart` for `desk=settlements` — [index.tsx:3154-3192](supabase/functions/_fleet-server/index.tsx#L3154-L3192) |
| S1-11 | KPIs on mixed bases | all three debt KPIs now read raw rows; `SettlementKpiBar` shows `—` not `$0.00` on error |
| S1-12 | CSV formula injection | [csvSafeExport.ts](apps/fleet/src/utils/csvSafeExport.ts) + BOM + 5 tests |
| S3-1 | No driver rollup | `buildDriverRollups` + `groupByDriver` in `SettlementQueueTable` |
| S3-2 | No aging | [settlementAging.ts](apps/fleet/src/utils/settlementAging.ts) + buckets + tone coding |
| S3-3 | No on-screen total | `<TableFooter>` + "showing N of M · $X of $Y" |
| S3-5 | Failed fetches rendered as zeros | `error` prop → `—` + "Failed to load" |
| S3-8 | No notes | `SettlementPeriodNotes` mounted in `ReconciledPeriodOverlay:307` |
| S3-9 | Undo captured no reason | `reverseReason` now required before submit |
| S3-10 | Export only on Outstanding | export on three tabs |
| S3-11 | a11y — keyboard, indeterminate | `tabIndex`, `onKeyDown`, `checked="indeterminate"`, `aria-live` |
| H-1/H-2 | Dead identical branches | removed from `driverCashPayment.ts` |
| H-8 | DonePay/DoneCollect duplication | merged into `MovementHistoryTable` |
| H-17 | Hardcoded `0.005` | `MONEY_EPS` imported from finance-core |
| H-20 | `transactions.approve` declared, unused | replaced by `settlements.collect/pay/write_off/reverse/approve`, enforced by `requireSettlementPerm` |

**Also built (infrastructure, correct and unused-in-part):**
`settlement_movements` / `settlement_runs` / `settlement_run_rows` tables with `UNIQUE (organization_id, idempotency_key)` and RLS · `driver_financial_periods.row_version` · DFP org backfill + RLS · five command routes with permission gates, caps, freeze checks · `settlement_period_freeze.ts` · 15 Vitest + 13 Deno tests, all passing.

## 0.3 Still open — ranked

| # | Item | Why it matters |
|---|---|---|
| **R-1** 🔴 | `catch {}` fallback bypasses every command-layer control (§0.1) | All Phase-3 guarantees are advisory |
| **R-2** 🔴 | **Reverse still hard-deletes.** `confirmReverseTx` collects the reason then calls `api.deleteTransaction(id)` — [:1212-1234](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1212-L1234). `POST /settlements/reverse` is fully implemented (voids + posts a reversal, never deletes) and **never called**. The comment says "reverse API will consume it when wired." | S1-2a open — the audit trail is still destroyed, and the captured reason is discarded |
| **R-3** 🔴 | **Batch still the legacy client loop.** `runBatch` posts N raw transactions — [:1236-1303](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1236-L1303). `POST /settlements/runs` + both run tables exist and are unused. | S2-6/S3-6 open — no locking, no idempotency, no per-row outcomes, `catch { fail++ }` still swallows errors |
| **R-4** 🔴 | **Optimistic lock is not load-bearing.** `bumpPeriodRowVersion` runs *after* the movement insert, and a failed compare-and-set is only `console.warn`ed — [controller:160-176](supabase/functions/_fleet-server/settlement_commands_controller.tsx#L160-L176). Two concurrent pays both read the same residual, both pass `assertExpectedOutstanding`, both insert. | S1-4 concurrency half-open: duplicate is now caught by the idempotency key, **over-payment by two operators is not** |
| **R-5** 🟠 | **Maker-checker is inert.** Server hardcodes `approvalState: "none"` with `// ...when threshold flag set later` — [controller:~503](supabase/functions/_fleet-server/settlement_commands_controller.tsx). Client `requiresApproval()` computes a flag and pays regardless. Nothing ever creates a `pending` movement. | `ApprovalQueue.tsx`, `settlements.approve`, and `POST /:movementId/approve` can never trigger |
| **R-6** 🟠 | **Dead new code.** `useSettlementQueue`, `useSettlementCommands`, and `ApprovalQueue` have **zero consumers** (grep-verified). The page calls `settlementCommandsApi` directly, bypassing the shared invalidation and the approval flag. | Phase 4 + the approval half of Phase 6 are written but unreachable |
| **R-7** 🟠 | **`settlement_movements` is written but never read.** `MovementHistoryTable` is fed by `txToMovementRow(t, direction)` — legacy transactions. So no row in the UI carries a `movementId`. | This is the hard dependency blocking R-2: `/settlements/reverse` requires `movementId` |
| **R-8** 🟠 | **S2-3 open** — the `while (offset < 50000)` client pagination loop is unchanged ([:455-476](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L455-L476)); no virtualization anywhere in `settlements/` | Ten sequential 5k round trips on mount |
| **R-9** 🟠 | **S2-1 open** — five legacy queries + `txsQuery` still drive the page; `GET /settlements/queue` unused | Two sources of truth remain |
| **R-10** 🟠 | **Verify posts a raw transaction** (`saveTransaction({...tx, status:'Verified'})` — [:1305](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1305)) | No movement, no actor, no audit row for a state change that clears money |
| **R-11** 🟡 | **S2-7 open** — 10+ edge files still import from `apps/fleet/src/**` | The exact coupling that hid S1-1 |
| **R-12** 🟡 | Legacy `OutstandingTable` / `PendingTable` / `ReconciledTable` still rendered alongside the new `SettlementQueueTable` (page is 2,204 lines, down only 138) | S2-8 decomposition incomplete; four table implementations to keep in sync |
| **R-13** 🟡 | `DriverPayoutsPage.tsx` + the alias export still present | H-3 / H-4 |
| **R-14** 🟡 | **Test depth.** 28 tests, all pure-function unit tests. No integration test hits a route, no e2e touches the desk, no test exercises authz on a live handler, no concurrency test | The §9 plan called for these explicitly; the safety net is thinner than the architecture it now guards |

## 0.4 New findings from this pass

**N-1** 🟠 **The org guard fails open on unstamped rows.**
```ts
// settlement_desk_security.ts
if (recordOrgId == null || String(recordOrgId).trim() === "") return true;
if (isLegacyOrg(recordOrgId)) return true;
```
A transaction with no `organizationId` — or the literal `roam-default-org` — is mutable by **any** tenant. [FINANCIAL_INTEGRITY_AUDIT §2.4](docs/FINANCIAL_INTEGRITY_AUDIT.md) documents that this column is inconsistently written, so the guard is permissive on exactly the population most likely to be unprotected. The new `20260906020000` migration backfills `driver_financial_periods` but **not** `transaction:*` KV rows. Recommend: backfill/stamp transactions, then flip the default to deny and log every legacy hit for a burn-down period.

**N-2** 🟠 **RLS claim resolution is inconsistent between the two new policies.**
`settlement_movements_org_select` accepts platform users, org owners, and four claim paths (`app_metadata.organizationId`, `app_metadata.organization_id`, `user_metadata.*`). `dfp_org_select` accepts only `auth.jwt() ->> 'organization_id'` and `app_metadata.organization_id` — no camelCase, no owner path, no platform path. A team-seat user whose claim is camelCase will read `settlement_movements` fine and get **zero rows** from `driver_financial_periods` on any direct PostgREST call. Today the edge uses `service_role` (RLS-bypassing) so this is latent, not live — but it will surface the moment anything reads DFP with a user token. Extract one shared `public.jwt_org_id()` helper and use it in both.

**N-3** 🟡 **RLS is not the control on the edge path.** Both new policies are correct, but every fleet read goes through `getServiceClient()`, which bypasses RLS. The actual tenant control is still hand-threaded `organizationId` in ~10 call sites. RLS is good defence-in-depth for direct client access; it does **not** make a dropped parameter fail closed on the path the app actually uses. Worth stating explicitly so nobody relies on it.

**N-4** 🟡 `enforceCollectCap` accepts an override reason server-side, and `LogCashPaymentModal` collects one — but the reason travels in the `notes` string (`[Over-collection] ...`) rather than a first-class column. `settlement_movements.reason` exists and is the right home.

---

## 0.5 What to do next — recommended order

1. **R-1 · Fix the fallback (hours, not days).** Classify errors: fall back only on network failure / 404 / 501; re-throw and surface everything else. This is a small diff that reactivates six controls at once. **Nothing else on this list matters until it's done.**
2. **R-4 · Make the lock load-bearing.** Move `bumpPeriodRowVersion` *before* the insert, in the same guarded step, and fail the command when the CAS returns zero rows. Add the two-concurrent-pays test.
3. **R-7 → R-2 · Read movements, then wire reverse.** Point `MovementHistoryTable` at `GET /settlements/movements` so rows carry `movementId`, then replace `api.deleteTransaction` with `settlementCommandsApi.reverse`. Keep a legacy branch for pre-migration transactions that have no movement row.
4. **R-3 · Wire the batch** to `POST /settlements/runs`; render per-row outcomes from `settlement_run_rows`.
5. **R-5/R-6 · Turn on maker-checker.** Set `approval_state: 'pending'` server-side above the threshold, mount `ApprovalQueue`, and switch the page to `useSettlementCommands`.
6. **R-10 · Verify becomes a movement.**
7. **R-14 · Integration + concurrency + authz tests** on live handlers, then e2e for collect/pay/write-off/reverse/batch.
8. **R-8/R-9 · Adopt `GET /settlements/queue`**, delete the 50k loop, virtualize.
9. **R-12/R-13/R-11 · Delete the legacy tables, the alias file, and the `apps/**` imports.**

**Estimate for R-1 through R-7: about a week.** R-1 alone is a few hours and closes the largest exposure.

---
---

# The original audit (2026-09-05)

Retained below for the evidence and reasoning behind each finding. **Status markers have been updated**; the analysis is unchanged.

## 1. What the section actually is today

### 1.1 Surface map

```
Business Finance → Driver Settlements          apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx
│
├── 5 KPI cards ─────── Driver owes (settled) · Cash held (not finalized) · Fleet owes
│                       Awaiting bank clear · Cleared this week
│
├── 4 mode buttons ──── Collect │ Pay │ Log cash │ Reconciled       (DeskMode)
│
├── Filter bar ──────── Week from · Week to · Min amount · Search
│
└── 3 tabs (Collect/Pay only) ── Outstanding │ Awaiting clear │ Done
```

### 1.2 Data flow — and the seam that runs through it

```
                     ┌──────────────────────────────────────────────┐
                     │  driver_financial_periods  (SQL read model)  │
                     └──────────────────────────────────────────────┘
                             │             │            │
      GET /company-owes ─────┘             │            └───── GET /reconciled
      GET /driver-owes ────────────────────┘                   GET /cash-held
                             ▼
                  Outstanding tab · all 3 debt KPIs           ← SOURCE OF TRUTH A
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                  Awaiting clear tab · Done tab               ← SOURCE OF TRUTH B
                             ▲
      GET /transactions?desk=settlements&startDate&endDate
                             │
                     ┌──────────────────────────────────────────────┐
                     │  kv_store  transaction:*  (raw ledger rows)  │
                     └──────────────────────────────────────────────┘
```

**Every write goes to B. Every balance is read from A.** *(Status: still true — R-9. `settlement_movements` was added as the intended third leg but is not yet read.)*

### 1.3 Write paths — original vs now

| Action | Original | Now |
|---|---|---|
| Log Cash | client builder → `POST /transactions`, no role check | command API **with legacy `catch` fallback** (R-1) |
| Pay | same | command API **with legacy `catch` fallback** (R-1) |
| Write Off | same | command API **with legacy `catch` fallback** (R-1) |
| Verify | `saveTransaction({status:'Verified'})` | unchanged (R-10) |
| Undo | `DELETE` hard delete, no org check | org check added ✅; **still a hard delete** (R-2) |
| Batch | N sequential client POSTs | unchanged (R-3) |

---

## 2. Severity 1 — Security, control, and wrong numbers

### S1-1 ✅ FIXED — Money-write endpoint enforced no role permission

`POST /transactions` was `requireAuth()` only. The single `transactions.edit` gate fired only when `classifyPostedBusinessTransaction()` matched a category — and `Driver Payouts`, `Cash Collection`, `Cash Write Off` were in neither the expense nor income set, so the gate was skipped entirely. Any valid JWT could discharge a fleet liability.

**Fixed** by an explicit `SETTLEMENT_DESK_CATEGORIES` gate plus `requireOrg`. ⚠️ Partially re-opened by R-1: the fallback path posts through this endpoint, so a user denied `settlements.pay` still succeeds if they hold `transactions.edit`.

### S1-2 ◐ PARTIAL — "Undo" hard-deletes a financial record

- **(a) Destroyed audit trail** — **still open (R-2)**. `kv.del` remains the UI's reversal mechanism. The correct endpoint exists and is not called.
- **(b) No organization check** — ✅ **fixed** via `mayMutateTransactionOrg`, with the fail-open caveat in N-1.
- **(c) Over-broad permission** — ✅ `settlements.reverse` now exists (unused by the UI).

### S1-3 ✅ FIXED — Reconciled tab served without organization scoping

`queueListQuery()` computed `organizationId`; the `/reconciled` route dropped it two lines later, returning every tenant's settled weeks to anyone with `transactions.view`. All five routes now spread `...opts`, and RLS was added as a second layer (see N-3 on its limits).

### S1-4 ◐ PARTIAL — No server-side validation, no idempotency

- Idempotency ✅ — `UNIQUE (organization_id, idempotency_key)` plus replay handling.
- Caps ✅ — `enforcePayCap` / `enforceCollectCap` server-side.
- Freeze ✅ — `assertPeriodNotFrozen`.
- **Concurrency ✗** — R-4: the CAS is post-hoc and non-fatal, so two operators paying the same week both succeed.
- **All of the above ✗ in practice** until R-1 is fixed.

### S1-5 ✅ FIXED — Log Cash had no over-collection cap
Soft warning above owed, hard block unless a reason is supplied (see N-4 on where the reason is stored).

### S1-6 ✅ FIXED — Service-line scope was a no-op on 4 of 5 queues
All five reads now accept and apply `serviceLine`. Note the two implementations differ: `listDriverOwesPeriods` filters by index alignment, `listCashHeldPeriods` by key lookup (correct, since it filters nulls first). Worth unifying.

### S1-7 ✅ FIXED — Post-collection toast reported a fabricated number
`scope` added to the lookup key, **and** the collect command now returns the server's `period`, which the toast prefers over local arithmetic. Better than what was recommended.

### S1-8 ✅ FIXED — Reconciled query key omitted `scope`

### S1-9 ✅ FIXED — Cash-held rows could never show mismatch/overpaid
`metadata` added to the select; both `cashSourceMismatch` and `overpaidAmount` now populate.

### S1-10 ✅ FIXED — Done tab lost payments recorded outside the window
Server now filters `metadata->>workPeriodStart` on both the table and KV paths for `desk=settlements`.

### S1-11 ✅ FIXED — KPI row mixed bases and filter behaviour
All three debt KPIs read raw rows; error state renders `—`; `aria-live="polite"` added.

### S1-12 ✅ FIXED — CSV formula injection
`csvSafeCell` neutralises `=+-@\t\r`, quotes every field, adds a UTF-8 BOM. Five tests.

---

## 3. Severity 2 — Structural

| ID | Finding | Status |
|---|---|---|
| S2-1 | Two sources of truth in one tab strip | **open** (R-9) — third leg built, not read |
| S2-2 | Money transactions authored client-side | **partial** — commands exist; builders still live and reachable via R-1 |
| S2-3 | 50k-row client pagination, no virtualization | **open** (R-8) |
| S2-4 | Floats in UI over a minor-unit core | **partial** — `MONEY_EPS` adopted, queue types carry minor units, page still computes in floats |
| S2-5 | No optimistic concurrency | **partial** — column added, not load-bearing (R-4) |
| S2-6 | No locking during a pay run | **open** (R-3) — freeze module + run tables built, batch unwired |
| S2-7 | Edge functions import from `apps/fleet/src` | **open** (R-11) |
| S2-8 | Zero tests | **partial** — 28 unit tests; no integration/e2e/concurrency (R-14) |
| S2-9 | Selection not reconciled against server truth | **open** |

---

## 4. Severity 3 — UX

| ID | Finding | Status |
|---|---|---|
| S3-1 | No driver-level rollup | ✅ `buildDriverRollups` |
| S3-2 | No aging | ✅ `settlementAging.ts` + buckets |
| S3-3 | No on-screen total | ✅ footer + "showing N of M" |
| S3-4 | `Min amount` defaults to 1, hides balances | **open** |
| S3-5 | Failed fetches render as zeros | ✅ in `SettlementKpiBar`; verify the legacy tables do the same |
| S3-6 | Batch reports counts, not outcomes | **open** (R-3) |
| S3-7 | Reconciled table 13 columns, no controls | **partial** — new table is better; legacy `ReconciledTable` still rendered (R-12) |
| S3-8 | No history, notes, attachments | **partial** — notes ✅; timeline and attachments open |
| S3-9 | Undo captures no reason | ✅ collected — ⚠️ then discarded (R-2) |
| S3-10 | Export only on Outstanding | ✅ three tabs |
| S3-11 | Accessibility | ✅ in the new table; legacy tables unchanged |
| S3-12 | Mode/tab model confusing | **open** |

---

## 5. Severity 4 — Redundancy and hygiene

**Fixed**: H-1, H-2 (dead branches), H-8 (table duplication), H-17 (`MONEY_EPS`), H-20 (`settlements.*` permissions now real and enforced).

**Still open**: H-3, H-4 (alias file + export), H-5/H-6/H-7 (duplicated filter bar, comparators, search predicates — partly superseded by `SettlementFilters`, but the legacy copies remain), H-9 through H-16, H-18, H-19.

**New**: legacy `OutstandingTable` / `PendingTable` / `ReconciledTable` now coexist with `SettlementQueueTable` and `MovementHistoryTable` — four table implementations where the plan called for two (R-12).

---

## 6. Enterprise capability matrix — updated

| Capability | Before | Now |
|---|---|---|
| Segregation of duties | ✗ | ◐ `settlements.*` permissions exist and gate the routes |
| Maker–checker on payouts | ✗ | ◐ built end-to-end, **inert** (R-5/R-6) |
| Approval thresholds | ✗ | ◐ constant + helper, not enforced |
| Immutable audit trail | ✗ | ◐ table exists; UI still deletes (R-2) |
| Reason capture on reversal | ✗ | ◐ collected, discarded (R-2) |
| Idempotency | ✗ | ◐ enforced server-side, bypassed by R-1 |
| Server-side invariants | ✗ | ◐ implemented, bypassed by R-1 |
| Concurrency control | ✗ | ◐ column added, not load-bearing (R-4) |
| Aging | ✗ | ✓ |
| Driver-level rollup | ✗ | ✓ |
| Payment run as an entity | ✗ | ◐ tables + route built, unwired (R-3) |
| Bank file export | ✗ | ◐ `settlementEnterprise.ts` builds it; reachable only from the overlay |
| Remittance advice | ✗ | ✓ `buildRemittanceAdvice` in `ReconciledPeriodOverlay` |
| Period close / freeze | ◐ | ◐ `settlement_period_freeze.ts` enforced in commands, bypassed by R-1 |
| Notes per settlement | ✗ | ✓ |
| Status timeline | ✗ | ✗ |
| Dispute workflow | ✗ | ✗ |
| Multi-currency | ✗ | ✗ (JMD hardcoded) |
| Tenant isolation | ◐ broken | ✓ with the N-1 fail-open caveat |
| Service-line scoping | ◐ 1 of 5 | ✓ 5 of 5 |
| Error visibility | ✗ | ◐ new components only |
| Tests | ✗ | ◐ 28 unit, no integration/e2e (R-14) |
| Settlement math | ✓ | ✓ unchanged — still correct |

---

## 7. Target architecture

Unchanged from the first pass, and **the implementation matches it well** — commands, movements, runs, queue endpoint, decomposed components, aging, rollup. The gap is adoption, not design. See §0.5 for the order of work.

---

## 8. Test plan — what still fails

Tests the original plan called for that do **not** exist yet:

- a `transactions.view`-only token cannot post a payout — *needs a live-handler test; the pure predicate is covered, the route is not*
- an org-A token cannot reverse an org-B movement — *route-level, uncovered*
- two simultaneous pays on one week → exactly one succeeds — **currently would fail** (R-4)
- a 409 from the command API does not result in a posted payment — **currently would fail** (R-1)
- a movement and its reversal net to zero on the projection — *uncovered; UI never posts a reversal*
- a batch run holds its week locks — *uncovered; batch is unwired*
- every list query selects every column its mapper reads — *the S1-9 class of bug; still unguarded*
- every React Query key contains every input that changes the response — *the S1-7/S1-8 class; still unguarded*
- e2e for collect / pay / write-off / verify / reverse / batch — *none exist*

The last two are cheap lint-style tests that would have caught three of the twelve S1 findings. Worth adding before the next round of changes.

---

## 9. Summary

| ID | Sev | Finding | Status |
|---|---|---|---|
| R-1 | 🔴 | `catch {}` fallback bypasses every command control | **open — do first** |
| R-2 | 🔴 | Reverse still hard-deletes; reason discarded | open |
| R-3 | 🔴 | Batch unwired from `/settlements/runs` | open |
| R-4 | 🔴 | Optimistic lock is post-hoc and non-fatal | open |
| R-5 | 🟠 | Maker-checker inert (`approvalState` hardcoded) | open |
| R-6 | 🟠 | `useSettlementQueue` / `useSettlementCommands` / `ApprovalQueue` unused | open |
| R-7 | 🟠 | `settlement_movements` written, never read | open |
| R-8 | 🟠 | 50k client loop; no virtualization | open |
| R-9 | 🟠 | Two sources of truth remain | open |
| R-10 | 🟠 | Verify posts a raw tx, no movement | open |
| R-11 | 🟡 | Edge imports from `apps/**` | open |
| R-12 | 🟡 | Four coexisting table implementations | open |
| R-13 | 🟡 | Alias page + export remain | open |
| R-14 | 🟡 | No integration / e2e / concurrency tests | open |
| N-1 | 🟠 | Org guard fails open on unstamped rows | new |
| N-2 | 🟠 | Inconsistent JWT claim resolution between RLS policies | new |
| N-3 | 🟡 | RLS does not protect the service-role edge path | new |
| N-4 | 🟡 | Over-collection reason stored in `notes`, not `reason` | new |
| S1-1,3,5,6,7,8,9,10,11,12 | ✅ | Ten of twelve Severity-1 findings | **fixed** |
| S3-1,2,3,5,8,10,11 | ✅ | Seven UX findings | **fixed** |
| H-1,2,8,17,20 | ✅ | Five hygiene findings | **fixed** |

**Overall**: roughly 60% complete by finding count, and the hardest parts — the schema, the command semantics, the aging/rollup UX — are done and done well. What remains is mostly *adoption*: pointing the page at machinery that already exists. The exception is R-1, which is a small change with an outsized effect, and should be treated as a live exposure rather than a cleanup item.

---

*Audit only. No source files were modified in either pass.*
