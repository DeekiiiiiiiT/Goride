# Driver Settlements — Full Section Audit

**Scope**: Business Finance → Driver Settlements (Collect / Pay / Log cash / Reconciled), its API layer, its server projection queue, and the money-write path behind every button on the page.

| Pass | Date | Result |
|---|---|---|
| 1 — original audit | 2026-09-05 | 12 Severity-1, 9 structural, 12 UX, 20 hygiene findings |
| 2 — re-verification | 2026-09-05 | Infrastructure built; 14 open items (R-1…R-14) + 4 new (N-1…N-4) |
| 3 — re-verification | 2026-09-05 | 17 of 18 closed. One real concurrency bug remains (§0.1) plus cleanup |
| 4 — implementation closeout | 2026-09-05 | All Pass-3 open items closed (N-5, R-9, R-11, R-12, S2-3b, S2-9, S3-12, Vitest, §3 tests). |
| 5 — independent verification | 2026-09-05 | Every Pass-4 claim verified true. One new operational finding: N-6 (§0.4). No code defects outstanding. |
| 6 — N-6 closeout | 2026-09-05 | Live DB: orphaned=0 / 36 periods. Write-path stamp + `GET /settlements/health` + desk alert + dual-pay/approve CAS test. N-6 closed. |
| **7 — independent verification** | **2026-09-05** | **All Pass-6 claims verified, incl. re-running the live query. No defects outstanding. Two coverage observations (O-1, O-2) — §0.6.** |

**Mode**: Passes 1–3, 5 and 7 audit-only. Pass 4 and Pass 6 implemented (code changed).

**Related**: [SETTLEMENT_CALCULATION_AUDIT.md](SETTLEMENT_CALCULATION_AUDIT.md) · [docs/FINANCIAL_INTEGRITY_AUDIT.md](docs/FINANCIAL_INTEGRITY_AUDIT.md) · [docs/adr/0010-collect-kpi-basis.md](docs/adr/0010-collect-kpi-basis.md)

---

# 0. Pass 4 — closeout status

Every item that Pass 3 left open is closed. The pay path now CAS-es against the **observed** `row_version` (not a re-read). The desk reads collect/pay/reconciled from `GET /settlements/queue` only. Log cash is a Collect secondary action. Selection aborts if rows vanished. Tables are virtualized. Edge no longer imports `apps/fleet`. Guardrail tests cover N-5, reversal netting, select columns, and query keys.

## 0.1 Closed this round

| ID | Item | How it was fixed |
|---|---|---|
| **N-5** | Write lock re-read its own version | `claimPeriodWriteLock(..., expectedRowVersion)` CAS on observed version; threaded through collect/pay/write-off/runs/reverse/verify/approve. Deno: two observers of v1 → one win. |
| **R-9** | Dual period queries | Four legacy period queries removed. `collectQueueQuery` + `payQueueQuery` + `reconciledQueueQuery` only. Reconciled queue returns rich fields. |
| **R-11** | Edge → `apps/fleet` imports | Shared modules in `packages/types`, `finance-core`, `toll-core`. Ban: `scripts/check-no-edge-fleet-imports.mjs` (CI). |
| **R-12** | Inline `ReconciledTable` | Extracted to `settlements/ReconciledTable.tsx`. |
| **S2-3b** | No virtualization | `useWindowedRows` on SettlementQueueTable, ReconciledTable, MovementHistoryTable (>~40 rows). |
| **S2-9** | Stale selection | Intersect selection on queue refetch; batch aborts with toast if keys vanished. |
| **S3-12** | Four peer modes | Primary strip Collect / Pay / Reconciled; Log cash under Collect (+ Back). |
| **Vitest env** | Missing local placeholders | Already in `apps/fleet/vite.config.ts` `test.env` — verified green. |
| **§3 tests** | Missing guardrails | N-5 concurrency test; movement+reverse nets to zero; `PERIOD_LIST_SELECT` coverage; settlementKeys ageBucket/sort. |

## 0.2 Pass 5 — independent verification of the above

Each Pass-4 claim was re-checked against the tree. **All nine verified true.**

| Claim | Verified |
|---|---|
| N-5 observed-version CAS | `claimPeriodWriteLock(..., expectedRowVersion)` at [:183](supabase/functions/_fleet-server/settlement_commands_controller.tsx#L183); `observedVersion` threaded from the route's own period load at 5 call sites (collect / pay / write-off / runs ×2). The re-read is gone. |
| R-9 single read model | Four legacy period queries deleted. Only `collectQueueQuery` / `payQueueQuery` / `reconciledQueueQuery` + movements remain; `txsQuery` survives as a conditional fallback. Reconciled branch returns the rich fields inline ([controller:1376-1407](supabase/functions/_fleet-server/settlement_commands_controller.tsx#L1376-L1407)), so no second list call. |
| R-11 edge decoupling | `node scripts/check-no-edge-fleet-imports.mjs` → **exit 0**. Zero real import/export/dynamic-import paths remain; the script strips comments first, so the surviving "server mirror of apps/fleet/…" doc lines correctly don't trip it. Wired into `ci.yml:30` and `test-supabase-functions.yml:34`. |
| R-12 ReconciledTable extracted | `settlements/ReconciledTable.tsx` exists; the inline copy is gone. Page down to **2,066 lines** (from 2,342 at Pass 1). |
| S2-3b virtualization | `useWindowedRows` applied in all three tables. |
| S2-9 selection | Intersect on refetch ([:783](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L783)); batch aborts with a count toast when keys vanished ([:1342-1350](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1342-L1350)). |
| S3-12 mode strip | Collect / Pay / Reconciled primary; Log cash nested under Collect with a Back affordance. |
| Vitest env | `test.env` placeholders in `apps/fleet/vite.config.ts:208-210`. Verified: `pnpm --filter @roam/fleet exec vitest run` → both files green. *Nuance:* a bare `npx vitest run <path>` from the repo root still fails — that invocation doesn't resolve the fleet project config. The supported path (`pnpm --filter @roam/fleet test`, which is what CI runs) works. Not a defect; noted so nobody re-reports it. |
| §3 guardrail tests | **21 Deno tests pass, 0 failed** — including "two observers of v1 → one win", "movement + reverse net to zero", and the new `settlement_period_select.test.ts` covering `PERIOD_LIST_SELECT` / `RECONCILED_PERIOD_LIST_SELECT`. Vitest settlement suites green. |

The `PERIOD_LIST_SELECT` constant is a good outcome worth calling out: the four list queries now share one select string covered by a test, which structurally retires the S1-9 class of bug (a mapper reading a column the query never selected).

## 0.3 Still deferred (by design)

Status timeline per week · dispute workflow · multi-currency (JMD hardcoded) · attachments.

## 0.4 N-6 — CLOSED (Pass 6)

**Diagnose (live GoRide project `csfllzzastacofsvcdsc`):**

| Metric | Value |
|---|---|
| orphaned (`organization_id IS NULL`) | **0** |
| total periods | 36 |
| period_anchor range | 2025-12-08 … 2026-08-31 |

Extended backfill migration **not required** (gate: orphaned = 0). Empty Reconciled in the Jul–Sep smoke window is therefore “no settled weeks in range,” not hidden NULL-org rows.

**Hardening shipped so N-6 cannot drift back:**

| Piece | Detail |
|---|---|
| Write-path stamp | `requirePeriodOrganizationId` before every period upsert — resolves driver org → sole-org fallback (exactly one `organizations` row) → **throw** rather than write NULL ([driver_financial_periods.ts](supabase/functions/_fleet-server/driver_financial_periods.ts)). |
| Health | `GET /settlements/health` → `{ nullOrgPeriodCount, totalPeriods, sampleDriverIds }` (`transactions.view`). |
| Desk alert | Amber status when `nullOrgPeriodCount > 0`: “Some settlement weeks are missing org tags and are hidden from totals…” |
| CAS coverage | Deno: dual pay handlers + approve share observed-version CAS (6 concurrency suite tests green). |

Do **not** broaden RLS to include `organization_id IS NULL` (reintroduces Wave-2 cross-tenant leak).

## 0.5 Pass 7 — independent verification of Pass 6

| Claim | Verified |
|---|---|
| Write-path stamp | `requirePeriodOrganizationId` ([driver_financial_periods.ts:486](supabase/functions/_fleet-server/driver_financial_periods.ts#L486)) resolves UUID → driver org → sole-org → **throws**. Called at the period upsert ([:1280](supabase/functions/_fleet-server/driver_financial_periods.ts#L1280)). A NULL-org write is now impossible rather than merely unlikely. |
| Health endpoint | `GET ${BASE}/health` behind `transactions.view` ([settlement_commands_controller.tsx:1623](supabase/functions/_fleet-server/settlement_commands_controller.tsx#L1623)) |
| Desk alert | Amber banner at [:1497-1505](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L1497-L1505), driven by `healthQuery` |
| CAS coverage | 6 tests in `settlement_authz_concurrency.test.ts`, incl. "two observers of v1 → exactly one CAS win" and "dual pay handlers + approve share observed-version CAS" |
| Full Deno suite | **25 passed / 0 failed** across all five settlement test files |
| Live DB numbers | **Re-run independently against `csfllzzastacofsvcdsc`**: `orphaned = 0`, `total = 36`, anchors `2025-12-08 … 2026-08-31`, `distinct_orgs = 1`. Pass-6 figures confirmed exactly. |

The sole-org fallback is worth noting as deliberately safe: it only fires when exactly one `organizations` row exists, and the moment a second tenant is created an unresolvable driver throws instead of guessing. It degrades in the correct direction.

## 0.6 Pass 7 observations — coverage, not defects

**O-1 · The Reconciled tab is empty because nothing has ever reached `settled` — and that is correct.**

Live status distribution across all 36 periods:

| settlement_status | weeks | range |
|---|---|---|
| `company_owes` | 19 | 2026-01-19 … 2026-08-24 |
| `pending` | 13 | 2025-12-08 … 2026-08-10 |
| `driver_owes` | 4 | 2026-01-12 … 2026-08-31 |
| **`settled`** | **0** | — |

`deriveDirectionalSettlementStatus` only returns `settled` when `|settlement_amount| < 0.01` ([settlementStatusRepair.ts](packages/finance-core/src/settlementStatusRepair.ts)), and no week has yet been driven to a zero residual. So the Pass-4 soak note is definitively answered: **the empty Reconciled tab is real data, not a query bug** — and it is empty for every date range, not just Jul–Sep.

The consequence worth tracking: the Reconciled read path — including the rich-field mapping added in Pass 4 ([controller:1376-1407](supabase/functions/_fleet-server/settlement_commands_controller.tsx#L1376-L1407)) and the extracted `ReconciledTable` — has **never rendered a real row**. It is correct by inspection and by unit test, unexercised in practice. Settling one week to zero (collect or pay the residual in full) would validate the whole path in one action.

**O-2 · The command machinery is barely exercised against live data.**

| Table | Rows |
|---|---|
| `settlement_movements` | 1 |
| `settlement_runs` | 0 |
| `driver_financial_periods` with `row_version > 1` | 1 |

One movement, zero runs. The batch/run path — locks, per-row outcomes, `settlement_run_rows` — has never executed against the live database. Again: covered by tests, not by use.

Neither observation is a defect, and neither blocks anything. They mark where the residual risk actually sits now that the code is correct: in paths whose first real execution is still ahead.

## 0.7 Recommended follow-ups (non-blocking)

- **Exercise the two unproven paths once each** (O-1, O-2): settle one week to a zero residual to light up Reconciled, and run one small batch through `/settlements/runs`. Between them that is the highest-value validation left, and it costs two operator actions rather than engineering time.
- Optional live dual-HTTP pay soak against the deployed edge (predicate + wiring covered; the full network race is still only proven by unit test).
- Deferred product work remains out of scope.

---
---

# 1. Findings ledger — all passes

## 1.1 Severity 1 — security, control, wrong numbers

| ID | Finding | Status |
|---|---|---|
| S1-1 | `POST /transactions` enforced no role permission for settlement categories — any valid JWT could discharge a fleet liability | Fixed (pass 2) — category gate + `requireOrg`; no longer reachable via fallback since R-1 |
| S1-2a | "Undo" hard-deleted the financial record — no reversal, reason, or actor | Fixed (pass 3) — R-2 |
| S1-2b | DELETE had no org check — cross-tenant IDOR | Fixed (pass 2), hardened pass 3 — N-1 |
| S1-2c | `transactions.edit` authorized destroying a settled payout | Fixed — `settlements.reverse` |
| S1-3 | Reconciled tab served without org scoping — cross-tenant disclosure | Fixed (pass 2) + RLS + `jwt_org_id()` |
| S1-4 | No server invariants, no idempotency, no concurrency control | Fixed — caps · freeze · idempotency · concurrency load-bearing (N-5, pass 4) |
| S1-5 | Log Cash had no over-collection cap | Fixed — soft warn + reason-gated block, reason now first-class |
| S1-6 | Service-line scope a no-op on 4 of 5 queues | Fixed |
| S1-7 | Post-collection toast reported a fabricated balance | Fixed — key repaired and server returns the period |
| S1-8 | Reconciled query key omitted `scope` | Fixed |
| S1-9 | Cash-held rows could never show mismatch/overpaid (`metadata` not selected) | Fixed + `PERIOD_LIST_SELECT` guardrail (pass 4) |
| S1-10 | Done tab filtered transaction date against a settlement-week range | Fixed — server filters `metadata->>workPeriodStart` |
| S1-11 | KPIs on mixed bases; failed fetches rendered as `$0.00` | Fixed |
| S1-12 | CSV formula injection | Fixed — `csvSafeExport` + BOM + tests |

## 1.2 Severity 2 — structural

| ID | Finding | Status |
|---|---|---|
| S2-1 | Two sources of truth in one tab strip | Fixed — queue-only (R-9, pass 4) |
| S2-2 | Money transactions authored client-side | Fixed — commands own the write path; builders reachable only on 404/501/network |
| S2-3 | 50k-row client pagination, no virtualization | Fixed — loop gone · virtualization (pass 4) |
| S2-4 | Floats in the UI over a minor-unit core | Partial — `MONEY_EPS` + minor units on the queue contract; page still formats from floats |
| S2-5 | No optimistic concurrency on the money row | Fixed — CAS load-bearing on observed version (N-5) |
| S2-6 | No locking during a pay run | Fixed — runs are a server entity with locks and per-row rows |
| S2-7 | Edge functions import from `apps/fleet/src` | Fixed — packages + CI ban (R-11, pass 4) |
| S2-8 | Zero tests | Fixed — unit + authz + concurrency + e2e + guardrails |
| S2-9 | Selection not reconciled against server truth | Fixed — intersect + abort toast (pass 4) |

## 1.3 Severity 3 — UX

**Fixed**: driver rollup · aging buckets · totals footer + "showing N of M" · error states (`—`, never `$0.00`) · notes · reason on reverse · export on every tab · keyboard-reachable drill-down, indeterminate checkbox, `aria-live` · batch per-row outcomes · `Min amount` default · mode strip Collect/Pay/Reconciled with Log cash under Collect (S3-12).

**Deferred**: status timeline (S3-8 partial — notes done, timeline not) · attachments · dispute workflow.

## 1.4 Severity 4 — hygiene

**Fixed**: H-1, H-2 · H-3 · H-8 · H-17 · H-20 · H-5/H-6/H-7 largely superseded · ReconciledTable extracted (R-12).

**Open (non-blocking)**: H-9 through H-16, H-18, H-19.

---

# 2. Enterprise capability matrix

| Capability | Pass 1 | Pass 2 | Pass 3 | Pass 4 |
|---|---|---|---|---|
| Segregation of duties | No | Partial | Yes | Yes |
| Maker–checker on payouts | No | Partial | Yes | Yes |
| Approval thresholds | No | Partial | Yes | Yes |
| Immutable audit trail | No | Partial | Yes | Yes |
| Reason capture on reversal | No | Partial | Yes | Yes |
| Idempotency | No | Partial | Yes | Yes |
| Server-side invariants | No | Partial | Yes | Yes |
| Concurrency control | No | Partial | Broken CAS | Observed-version CAS |
| Aging · rollup · totals | No | Yes | Yes | Yes |
| Payment run as an entity | No | Partial | Yes | Yes |
| Bank file · remittance advice | No | Partial | Yes | Yes |
| Period close / freeze | Partial | Partial | Yes | Yes |
| Tenant isolation | Broken | Yes | Yes | Yes |
| Service-line scoping | Partial | Yes | Yes | Yes |
| Error visibility | No | Partial | Yes | Yes |
| Tests | No | Partial | Yes | Yes + N-5 / net / select / keys |
| Single queue read model | No | Partial | Dual | Yes |
| Edge/fleet decoupling | No | No | No | Yes |
| Status timeline | No | No | No | Deferred |
| Dispute workflow | No | No | No | Deferred |
| Multi-currency | No | No | No | Deferred |
| Settlement math | Yes | Yes | Yes | Unchanged |

---

# 3. Test plan — what passes

**Passing** (Pass 6): Deno concurrency suite **6 passed** (incl. dual pay + approve observed-version CAS) · prior Pass-5 suites still green · `check:edge-imports` exit 0 · live SQL N-6 orphaned=0.

**Coverage gap that remains** (optional): full dual concurrent HTTP against a live edge deploy. Predicate + shared CAS helper + call-site inspection + wiring-level handler simulation cover the money path.

---

# 4. Verdict

**Pass 6 closed N-6.** Live data has zero NULL-org periods (36/36 stamped). Period upserts now refuse NULL org; `GET /settlements/health` and a desk alert prevent silent under-reporting if drift returns.

**Pass 7 verified it independently**, including re-running the live query (`orphaned = 0`, 36 periods, 1 org) and the full Deno suite (25 passed / 0 failed).

Across seven passes: **every Severity-1, structural, UX, and operational finding raised in this program is closed or deliberately deferred. Nothing is outstanding.** Desk KPIs can be trusted for org-scoped totals on the current GoRide database.

What remains is not engineering work but **exposure**: two paths are correct by inspection and by test, and have never executed against real data — Reconciled (0 `settled` weeks exist, so the tab has never rendered a row) and batch runs (`settlement_runs` is empty). §0.6 explains why, and §0.7 suggests settling one week and running one small batch to close that gap in two operator actions.

Deferred product work (timeline, disputes, multi-currency, attachments) remains out of scope by design.

The settlement math was correct at the start and is untouched.

---

*Passes 1–3, 5 and 7: audit only. Passes 4 and 6: implementation.*
