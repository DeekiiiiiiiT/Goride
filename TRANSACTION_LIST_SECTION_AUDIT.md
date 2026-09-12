# Ledgers (formerly "Transaction List") — Enterprise Readiness Audit

**Section:** Business Finance → **Ledgers** (`page id: transaction-list`, permission `nav.transaction_list`)
**App:** RoamFleet (`apps/fleet`)
**Rev 1:** 2026-09-11 — original audit, 34 findings (F-01…F-34)
**Rev 2:** verified commit `87846173` — 13 regressions (N-01…N-13)
**Rev 3:** verified the N-series remediation — 8 findings (R-01…R-08)
**Rev 4:** verified the R-series remediation — **1 new S1 (V-01)** + **first deep review of Statement Summary (S-01…S-03)**
**Type:** Audit only. No code modified in any pass.

---

## 0. Verification pass — Rev 4 summary

### Scoreboard

| | Rev 2 | Rev 3 | **Rev 4** |
|---|---|---|---|
| Rev 1 findings closed | 17 | 24 | **30** |
| Rev 1 findings partial | 10 | 8 | **3** |
| Rev 1 findings not started | 8 | 2 | **1** |
| Prior-round regressions fixed | — | 12/13 (N) | **7/8 (R)** |
| New defects found | 13 | 8 | **4 (V-01, S-01…S-03)** |
| **S1 open** | 2 | 0 | **2** (V-01, S-01) |

### Verification evidence
- `npx vitest run` ledger suites: **13/13 pass**.
- `node scripts/assert-ledger-sort-whitelist.mjs` → **OK** (TRIP/FUEL/TOLL maps, no bare JSON paths for numeric keys).
- `node scripts/assert-fleet-view-invoker.mjs` → **OK** (482 migrations, 8 views).
- `node scripts/check-ledger-amount-drift.mjs` → prints instructions, **exits 0 without `DATABASE_URL`** (so it cannot fail CI — see §0.4).
- `npx tsc --noEmit` filtered to ledger + fuel-consumer files: **no new errors**. The three that remain (`isFullTank` ×2, `KmLTracking` recharts formatter, `fuelService:262`) are all pre-existing at `HEAD`.
- Migration regexes byte-verified: `20260911210000` uses **1 backslash** — correct.

### 0.1 R-series: 7 of 8 closed

| ID | Status | Verification |
|---|---|---|
| **R-01** | ✅ **Fixed — thoroughly** | Both tabs rebuilt. `GET /fuel-entries` now applies `search`, `paymentSource`, `entryMode`, `type`, `auditStatus`, `driverId`, `vehicleId` in SQL; `GET /toll-reconciliation/ledger` applies `search`, `reconciliationStatus`, `type`, `vehiclePlate`, `driverName`, `driverId`, `vehicleId`, `status`. Both return a filtered `total` and a `date, id DESC` sort. Client-side `applyFilters`/`getSortValue`/`compareValues` were **deleted**, not left dormant — the right call. Both pages moved to `useLedgerQuery`. The piece I expected to be wrong and wasn't: `reconciliationStatusFilters` translates the *derived* Matched/Dismissed/Approved/Unmatched status into null-safe SQL (`is_reconciled.is.null,is_reconciled.eq.false`, `trip_id=not.is.null`) rather than guessing. |
| **R-02** | ✅ **Fixed** | `trip_search_filters.ts` with `applyTripFilters`, imported at all three call sites (`index.tsx:1902` search, `:2014` export, `:2112` stats) — verified, not assumed. Plus `trip_search_filters.test.ts`. The Status = Processing divergence is gone because there is now one implementation. |
| **R-03** | ✅ **Fixed** | `visited` Set seeded from the URL tab; `visited.has(tab.id) && <Component/>`. Mount on first visit, then stay mounted. |
| **R-04** | ✅ **Fixed — at the class level** | `20260911210000` adds typed `numeric` `distance`/`duration` with a correct backfill; `TRIP_SORT_MAP` points at the typed columns. And `scripts/assert-ledger-sort-whitelist.mjs` now **fails the build** if any sort map routes a numeric-looking key through `value->>`/`payload_json->>`. This is the guard I asked for, and it generalizes to all three maps. |
| **R-05** | ⛔ **Open** | `period_key` is still `to_char(date_trunc('week', …), 'IYYY-"W"IW')` — ISO Monday weeks. Was flagged as a question; still needs the org-anchor answer before Block E. |
| **R-06** | ✅ **Fixed** | `localPeriodKeyRef` compares a `start|end` key so a locally-originated period write skips the effect. Preset chips stay highlighted. |
| **R-07** | ✅ **Fixed** | Harness now sweeps pages and compares the unique union against the API's own `total` — an independent expected set, so **skips are detectable**, not just duplicates. |
| **R-08** | ✅ **N/A** | Behavior change; no code needed. |
| **N-13** | ✅ **Largely closed** | `applyTripFilters` is production code and is now directly tested, so the trip filter chain is genuinely covered. The bridge's own `executeMapped` remains tested only through the parallel rules module — a smaller residual than before. |

### 0.2 🔴 V-01 (S1) — `/fuel-entries` response shape changed; only one of nine consumers migrated

R-01's server work changed the endpoint's response from a **bare array** to an **object**:

```ts
// fuel_controller.tsx — GET /fuel-entries
return c.json({ data: narrowed, total, limit, offset, sortKey, sortDir, request_id });
```

`apps/fleet/src/services/fuelService.getFuelEntries` was updated to handle both shapes. **Nothing else was.** Every other consumer still assumes an array:

| Consumer | Code | Result |
|---|---|---|
| `apps/fleet/src/services/api.ts:4322` `getFuelEntriesByVehicle` | `const combined = [...dataUnderscore, ...dataHyphen]` | Spreading a plain object into an array literal **throws `TypeError: object is not iterable`** |
| ↳ `apps/fleet/src/hooks/useDriverFuelEntries.ts:27` | `.catch(() => [] as FuelEntry[])` | **Silently returns empty** — driver fuel entries vanish with no error |
| ↳ `apps/admin/src/services/odometerService.ts:19` | unguarded | Throws |
| `apps/fleet/src/services/api.ts:4429` `getAllFuelEntries` | `return response.json()` | Returns the object; `.map`/`.filter` downstream break |
| ↳ `apps/driver/.../DriverExpenses.tsx:233` | `.catch(() => [])` | **Silently empty** |
| `apps/fleet/.../vehicles/KmLTracking.tsx:272` | `setEntries(data \|\| [])` | Object into array state → renders nothing or throws on `.map` |
| `apps/admin/src/services/api.ts:2199, 2202, 2309` · `apps/admin/src/services/fuelService.ts:216` | array assumptions | Admin app fuel views |
| `apps/driver/src/services/api.ts:2299, 2302, 2409` · `apps/driver/src/services/fuelService.ts:81` | array assumptions | Driver app fuel views |

**Why this is S1 and why it slipped through:** `response.json()` returns `any`, so TypeScript cannot catch it — the typecheck is clean. And the two highest-traffic fleet call sites wrap the failure in `.catch(() => [])`, so the symptom is **silently missing fuel data**, not an error. That is the worst possible failure mode for a finance app, and it reaches three apps and several sections outside Ledgers.

**Fix:** keep the endpoint backward-compatible for one release — return the array with `X-Total-Count` unless the caller opts in (`?shape=envelope`, or a version header) — *or* migrate all nine consumers in the same change. The `.catch(() => [])` swallows should be removed regardless; they are what turned a crash into silent data loss.

### 0.3 🔴 Statement Summary — the Roam card is wrong (S-01…S-03)

You were right about the Roam card. The arithmetic on screen is internally consistent, so the bug is in the inputs — specifically **a sign error on toll refunds**.

#### S-01 (S1) — refunds are added to expenses instead of netted against them

```ts
// ledger_query_summary_routes.ts — the accumulation
case "toll_charge":              tolls += mag;              // mag = Math.abs(netAmount)
case "toll_refund":              tollAdjustments += mag;
case "toll_support_adjustment":  tollAdjustments += mag;
case "statement_line":           if (lineCode === "REFUNDS_TOLL" && plat !== "Uber") tollAdjustments += mag;
...
totalRefundsExpenses: Number((tolls + tollAdjustments).toFixed(2)),   // ← charges + refunds
```

and the card computes `Net Period Earnings = Total Earnings − Total Refunds & Expenses + Period Adjustments` (`StatementSummaryCard.tsx:51`).

A refund is a **credit**. Adding it to charges and then subtracting the sum penalizes the fleet twice: once for the toll, once for getting the money back. The tooltip at `StatementSummaryCard.tsx:35` even documents it — *"ADDED to Tolls for Total Refunds & Expenses"* — so this is deliberate in code, not a typo.

**This contradicts the canonical toll engine.** `packages/toll-core/src/tollWeekNetting.ts` puts `toll_refund` into `refundsAndInflowOffsets` (line 88) and **subtracts** it when computing net toll (line 116). Two engines, opposite signs, on the same event type — the "money engines with no shared accounting layer" problem, made visible.

**Proof that Roam's $6,210 is entirely refunds, from the screenshot alone:**

Roam has no `payout_cash`/`payout_bank` events, so `hasPayoutEvents` is false and the fallback runs:

```ts
if (!hasPayoutEvents) bankTransfer = Math.max(0, totalEarnings - tolls - cashCollected);
// totalPayout = cashCollected + bankTransfer
```

Substituting: `totalPayout = cashCollected + (totalEarnings − tolls − cashCollected) = totalEarnings − tolls`.
The card shows **Payout $10,000.00 = Period Net Earnings $10,000.00**, therefore **`tolls = 0`**.

With `tolls = 0`, `totalRefundsExpenses = 0 + tollAdjustments = $6,210.00` — **100% refunds/adjustments, zero actual toll expense.**

| Roam, as shown | Roam, corrected |
|---|---|
| Period Net Earnings $10,000.00 | $10,000.00 |
| Refunds & Expenses **$6,210.00** | Net toll expense **$0.00** (charges $0 − refunds $6,210, floored) |
| **Net Period Earnings $3,790.00** | **$10,000.00** |

Roam's bottom line is **understated by $6,210 on 4 trips**. That was the tell you spotted — $1,552 of tolls per trip is not plausible, and it isn't tolls at all.

The error also propagates upward: **Combined Totals → TOTAL EXPENSES $10,185.00** = 3,975 + 6,210 + 0, so the fleet rollup carries it too. Uber's $3,975 is likely a mix of real charges and refunds (Uber has real payout events, so the `tolls = 0` derivation doesn't apply there) — it needs the same fix but I can't decompose it from the screenshot.

**Fix:** `totalRefundsExpenses = tolls − tollAdjustments` (net toll expense), matching `tollWeekNetting`. Better: stop collapsing two opposite-signed quantities into one field — expose `tollCharges` and `tollRefunds` separately and let the card show `Tolls $X − Refunds $Y = Net $Z`. Import the netting from `packages/toll-core` rather than reimplementing it here; that is the whole point of having a finance-core package.

#### S-02 (S2) — `toll_reimbursement` is fetched and silently dropped

`"toll_reimbursement"` is in `statementTypes` (line 327), so the rows are queried and returned — but there is **no `case "toll_reimbursement"`** in the switch. The events fall through and are discarded. Reimbursements that should offset toll expense never reach any total. `tollWeekNetting.ts:84` handles them explicitly, so again the two engines disagree.

#### S-03 (S2) — "Payout" is a derived plug for platforms without payout events, and isn't labelled as one

For Roam (and any platform lacking `payout_cash`/`payout_bank`), Payout is not observed — it is `max(0, totalEarnings − tolls − cashCollected)`, an accounting identity rearranged. Two consequences:

1. **The `max(0, …)` clamp hides the case you most need to see.** If expenses exceed earnings, Payout silently reads $0.00 instead of going negative.
2. **The card doesn't distinguish derived from observed.** Roam's "Payout $10,000.00" and Uber's "Payout $83,189.03" render identically, but one is a plug and the other is imported from the platform's own statement. The "Computed" badge is on the whole card, not on the field.

Related, visible in your screenshot: **InDrive shows Payout $11,570.00 against Period Net Earnings $10,158.90** and Net Period Earnings $10,158.90 — a payout $1,411.10 larger than earnings, with no reconciliation line explaining the difference. (InDrive's Refunds & Expenses is $0.00, which means `tolls = 0` there too; since Payout ≠ Total Earnings, InDrive *does* have real payout events.) A statement view whose payout and earnings disagree by $1,411 without comment is not finished.

**Note on scope:** Statement Summary was a tab I had reviewed only structurally in Revs 1–3 — the audit focused on the three record-level ledgers. This is its first arithmetic review, so S-01…S-03 are new findings, not regressions.

### 0.4 Smaller observations from this pass

- **`check-ledger-amount-drift.mjs` cannot fail CI.** Without `DATABASE_URL`/`SUPABASE_DB_URL` it prints instructions and **exits 0**. As wired, it documents the check rather than enforcing it (contrast `assert-fleet-view-invoker`, which genuinely fails). Give it a non-zero exit when it can't run in CI, or run it in an environment where the URL is set.
- **Toll `reconciliationStatus` can disagree with SQL on mirror drift.** The SQL filter uses typed `is_reconciled`/`trip_id`; the row mapper derives the label from `payload_json` (via `rowToKvValue`, which only mirrors a column when the payload key is absent). A stale payload key produces a row that the filter includes but the label contradicts. Same class as F-26; the new drift script should cover these two columns too.
- **Empty-string `trip_id`** passes the `Matched` SQL filter (`not.is.null`) but fails the JS truthiness check in the mapper, so such a row would be filtered as Matched and displayed as Dismissed. Narrow, but it's the kind of thing that surfaces during a dispute.
- **`total` vs `filterByOrg`.** `/fuel-entries` sets `total = res.count ?? narrowed.length`, where `res.count` is the pre-`filterByOrg` count. If `filterByOrg` drops rows, the count over-reports. Likely a no-op given the SQL org predicate already applied, but the two should not be able to disagree.

### 0.5 The honest headline

**The three record-level ledgers are now enterprise-grade. Statement Summary is not, and it is the tab that reports money to the fleet owner.**

Trip, Fuel and Toll all now do server-side filtering, sorting and paging with stable tiebreakers, filter-scoped totals, shared sort whitelists guarded by CI, one shared filter builder per domain, and a data bridge that throws rather than silently dropping predicates. R-01 was fixed properly — the client-side filter code was deleted rather than left to rot, which is what makes the fix durable.

What this pass surfaced is that **the remaining risk moved rather than shrank**:

- **V-01** is the fourth consecutive instance of the same pattern — producer changed, consumers didn't. It is the most severe version yet because `response.json(): any` defeats the typechecker and `.catch(() => [])` converts the crash into silent data loss across three apps.
- **S-01** is a different and older class: not a half-migration, but a **second implementation of money logic that disagrees with the canonical one**. `tollWeekNetting.ts` nets refunds against charges; Statement Summary adds them. Both are "right" in their own file. The Roam card is where that disagreement becomes a number a fleet owner reads.

The structural lesson is now consistent across four passes: **this codebase's failures come from two copies of one truth**, whether that's a producer and its consumers, a client mirror and a server map, or a netting engine and a summary endpoint. The fixes that have held are the ones that removed a copy (`applyTripFilters`, deleting the client filter code) or made divergence unshippable (`assert-ledger-sort-whitelist`, `assert-fleet-view-invoker`). The fixes that keep generating new findings are the ones that added a mirror and a comment asking someone to keep it in sync.

**Remaining effort: S-01…S-03 is 1–2 days. V-01 is half a day. Everything else is polish.**

---

## 1. Findings table — open items

Severity: **S1** wrong money / data loss / security · **S2** materially misleading · **S3** friction, scale, debt · **S4** polish.
Effort: **S** < 1d · **M** 1–3d · **L** 1–2wk.

| ID | Sev | Category | Impact | Recommendation | Effort |
|---|---|---|---|---|---|
| **V-01** | **S1** | Breaking change | `/fuel-entries` envelope change with 8 unmigrated consumers across 3 apps; two swallow it into silently-empty fuel data | Keep the array shape for one release behind an opt-in envelope, or migrate all consumers together. Remove the `.catch(() => [])` swallows. | S |
| **S-01** | **S1** | Correctness / money | Toll **refunds added to** toll charges, then subtracted from earnings. Roam's Net Period Earnings understated by $6,210; Combined Totals carries it. Contradicts `tollWeekNetting.ts` | `tolls − tollAdjustments`; better, surface charges and refunds as separate fields and import the netting from `packages/toll-core` | M |
| **S-02** | S2 | Correctness / money | `toll_reimbursement` queried then silently dropped — no `case` in the switch | Handle it as an offset, matching `tollWeekNetting.ts:84` | S |
| **S-03** | S2 | Correctness / UX | "Payout" is a derived plug for platforms without payout events; `max(0,…)` hides negative payouts; InDrive shows Payout $1,411.10 > earnings with no reconciliation | Label derived vs observed per field; drop the clamp; add a reconciliation line | M |
| R-05 | S3 | Data model | `period_key` uses ISO Monday weeks; may not join to the org's financial period | Derive from the org anchor; blocks Block E | S |
| F-21 | S3 | Accessibility | Row expansion still not keyboard-operable — last AA gap | `role`/`tabIndex`/Enter-Space on rows | S |
| F-26 | S3 | Data model | Drift check exists but **exits 0 without a DB URL**, so it can't fail CI; doesn't cover toll mirror columns | Non-zero exit when unrunnable; extend to `is_reconciled`/`trip_id` | S |
| F-25 | S3 | Tenancy | `orOrg` still includes `IS NULL` + `roam-default-org` | Execute the documented cutover | M |
| F-20 | S3 | Performance | Column projection still not done | Select only needed fields | M |
| F-23 | S3 | Performance | No virtualization past 50 rows | Virtualize | M |
| — | S3 | Correctness | Toll `reconciliationStatus` SQL filter vs payload-derived label can disagree on mirror drift; empty-string `trip_id` edge case | Derive the label from the same typed columns the filter uses | S |
| F-32 | S4 | Debt | Unreachable `mode === 'analytics'`; column reorder ignored | Delete; honor saved order | S |
| F-33 | S4 | Consistency | Fleet view ignores Super-Admin column labels | Pass `columnConfig` through | S |
| F-34 | S4 | i18n | USD/km hardcoded in the UI | Org config | M |

### Closed (30 of 34 Rev 1 findings, 12/13 N-series, 7/8 R-series)
F-01, F-02, F-03, F-04\*, F-06, F-07, F-08, F-09, F-10, F-11, F-12, F-13, F-14, F-15, F-16, F-17, F-18, F-19, F-22, F-24, F-27, F-28, F-29, F-30, F-31 · N-01…N-12 · N-13 (largely) · R-01, R-02, R-03, R-04, R-06, R-07, R-08.
\*Tiebreaker and multi-order are correct; the keyset branch in `/trips/search` is still unreachable because no client sends cursors.

---

## 2. Prioritized implementation order

### Block A — the two S1s (1 day)
1. **V-01** — restore array compatibility on `/fuel-entries` for one release, or migrate all nine consumers in one change. Remove `.catch(() => [])` from `useDriverFuelEntries.ts:27` and `DriverExpenses.tsx:233-234` so the next shape change fails loudly.
2. **S-01** — net refunds against charges; pull the netting from `packages/toll-core` rather than reimplementing. Re-check the Roam card reads $10,000.00.

### Block B — finish Statement Summary (1 day)
`S-02` handle `toll_reimbursement` → `S-03` label derived vs observed payout, drop the `max(0,…)` clamp, add a reconciliation line for the InDrive-style gap.

### Block C — the tail (under a day)
`R-05` period-key anchor → `F-21` row keyboard interaction → `F-26` make the drift check fail CI and extend it to the toll mirror columns → toll label/filter parity → `F-32`.

### Block D — scale
`F-20` projection · `F-23` virtualization · `F-04` wire the keyset cursor the server already accepts · `F-25` strict-org cutover · `F-33` · `F-34`.

### Block E — read model
R-05 first, then `/ledger/stats` + `/ledger/export`, `ledger-dual-read-compare.mjs` in CI, promote tabs one at a time.

---

## 3. Open questions

Carried: Rev 1 Q1–Q5 (strict-org flag state, row counts, `netToDriver` null-rate by platform, null-org bucket contents, `amount` vs `payload_json` drift — `ledger-amount-drift-check.sql` answers the last one; run it).

New this pass:

1. **Are toll refunds genuinely inflows to the fleet, or pass-throughs to the driver?** S-01's fix is `tolls − tollAdjustments` if they offset fleet expense. If a refund is instead credited to the driver, the correct treatment is different again — and that decision belongs to you, not to me.
2. **Why does Roam have $6,210 of toll refunds and $0 of toll charges in one week on 4 trips?** Even with the sign fixed, refunds without matching charges in the same period is worth explaining — prior-period refunds landing in this window, or refunds recorded without their originating charge.
3. **Why does InDrive's payout exceed its computed earnings by $1,411.10?** Prior-period settlement, or an earnings computation that's missing a component.
4. **Should Statement Summary import `packages/toll-core` netting,** or is there a reason it computes independently? If the two are meant to differ, that needs to be documented; right now it reads as an accident.
5. **Does the org's financial week start Monday?** (R-05)
6. **Have any of the four new migrations been applied?** Order matters: `140000` → `190000` → `200000` → `210000`.

---

### Closing note (Rev 4)

The Ledgers desk itself is done, or near enough that what's left is scheduling rather than risk. Four passes turned a section that 500'd on search and printed gross as net into one where every record-level tab filters, sorts and totals server-side against guarded contracts. R-01 in particular was fixed the right way — by deleting the client-side code path rather than leaving it as a fallback.

The two findings that matter now are both about **duplicate truth**. V-01 is a producer that moved without its consumers. S-01 is a summary endpoint that reimplemented toll netting and got the sign backwards relative to the engine that owns it. Your instinct on the Roam card was right, and it was right for a reason worth generalizing: **$1,552 of tolls per trip on 4 trips was not plausible**, and the number survived because nothing reconciles Statement Summary against the toll engine.

That's the check worth building next. `assert-ledger-sort-whitelist.mjs` and `assert-fleet-view-invoker.mjs` both prevent a class rather than fix an instance — the same treatment applied to "Statement Summary totals must equal `tollWeekNetting` for the same period" would have caught S-01 before it reached a card.

---

## Rev 5 — Remediation implementation (2026-09-11)

Program shipped in-repo (Gates 1–4 code/docs; production flag flips still gated):

| ID | Status |
|----|--------|
| **V-01** | Fixed — array default + `?shape=envelope`; `unwrapFuelEntriesPayload` across fleet/admin/driver; silent `.catch([])` removed; `assert-fuel-entries-unwrap` |
| **S-01 / S-02** | Fixed — `packages/finance-core` `statementTollNetting`; net expense = charges − offsets; reimbursements handled; card + tooltips updated |
| **S-03** | Fixed — `payoutObserved`, derived bank plug without `max(0)`, reconciliation gap line; `assert-statement-toll-netting` |
| **R-05** | Closed — Monday-confirmed in promote / strict-org docs |
| **F-21** | Fixed — fuel + toll keyboard row expand |
| **F-26** | Fixed — drift check fail-closed; toll mirror columns in SQL |
| **Toll label parity** | Fixed — typed `is_reconciled` / `trip_id` (empty string ≠ Matched) |
| **F-32** | Fixed — drag reorder in LedgerColumnSettings; fuel/toll honor config order |
| **F-20** | Fixed — whitelist `projectTripListValue` on `/trips/search` |
| **F-23** | Fixed — Trip ledger virtualizes ≥50 rows |
| **F-25** | Ready for pilot — counts clear; flag stays default off |
| **F-33 / F-34** | Fixed — fuel/toll `columnConfig`; currency via platform config (JMD default) |
| **Block E** | Dual-read fail-closed; migration order documented; desks not promoted (flag off) |
