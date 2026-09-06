# Driver Settlements — Full Section Audit

**Scope**: Business Finance → Driver Settlements (Collect / Pay / Log cash / Reconciled), its API layer, its server projection queue, and the money-write path behind every button on the page.

| Pass | Date | Result |
|---|---|---|
| 1 — original audit | 2026-09-05 | 12 Severity-1, 9 structural, 12 UX, 20 hygiene findings |
| 2 — re-verification | 2026-09-05 | Infrastructure built; 14 open items (R-1…R-14) + 4 new (N-1…N-4) |
| 3 — re-verification | 2026-09-05 | 17 of 18 closed. One real concurrency bug remains (§0.1) plus cleanup |
| **4 — implementation closeout** | **2026-09-05** | **All Pass-3 open items closed (N-5, R-9, R-11, R-12, S2-3b, S2-9, S3-12, Vitest, §3 tests).** |

**Mode**: Passes 1–3 were audit-only. Pass 4 implemented the closeout program (code changed).

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

## 0.2 Still deferred (by design)

Status timeline per week · dispute workflow · multi-currency (JMD hardcoded) · attachments.

## 0.3 Recommended follow-ups (non-blocking)

- Soak: confirm Reconciled queue returns rows when settled weeks exist in range (smoke saw empty Jul–Sep for current org data).
- Optional: approve-path load tests under concurrent pay.

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

**Passing** (Pass 4): Deno — commands (incl. reverse net-zero), period select guardrails, desk security, period freeze, authz + N-5 two-observers · Vitest — aging, enterprise, CSV, desk safety, settlementKeys (ageBucket/sort), commands API · `e2e/driver-settlements-desk.spec.ts` · Playwright smoke Collect → Log cash → Pay selected dialog (cancelled) → Reconciled · `check:edge-imports` exit 0.

---

# 4. Verdict

**Pass 4 closed the remaining money-risk and desk debt from Pass 3.** Concurrent pays that both observed the same residual can no longer both insert. The desk has one queue read model, safer selection, virtualized tables, and a CI ban on edge→fleet imports.

Deferred product work (timeline, disputes, multi-currency, attachments) remains out of scope by design.

The settlement math was correct at the start and is untouched.

---

*Passes 1–3: audit only. Pass 4: implementation closeout.*
