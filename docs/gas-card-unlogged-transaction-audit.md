# Gas Card — Unlogged Transaction Audit

**Status:** Rev 9 — V9–V12 closed (§0.13–§0.15). Cash remediation **$9,884.82 reversed, net $0**. August week statements restated to ops-only `driver_share` / `postedDriverShare`. Aug 24 left locked (ops-only already matched). **Sep 14–20 not closed yet** — Fuel Week Reconciliation still has open wizard gates (not operationally ready); adopted ops row `2f809b08-…` present; flag remains pilot-only.
**Date:** 2026-09-25 (Rev 1–8 as before · **Rev 9 V12 week restate**)

> **Two Rev 6 header claims did not hold** and are corrected in §0.10: "V8 allowlist cleared" (it was not — the flag was turned globally ON instead), and "Sep 14 $4,000 Accept after deploy + re-arm" (it was already adopted before this was written).
**Question:** A charge happens on a Roam Fuels (JAA) gas card. The driver never logs the fill. The charge arrives in the Dominion CSV. How does the system handle it today, and what should it do?

> **§0 is the implementation record** — §0.1–0.5 Rev 2 review, §0.6 Rev 3 close-out, §0.7 Rev 4 sealed-week finding, §0.8 Rev 5 verification, §0.10 Rev 6 product close-out, §0.11 Rev 7 verification, §0.13 Rev 8 verification, **§0.15 Rev 9 V12 week restate (read this for current state)**.
> **§1–§9 are the original Rev 1 audit**, kept as the reference for *why* the design is what it is. Findings F1–F8 there are now closed unless §0 says otherwise — **except the F2 note in §5, which was wrong and is corrected in place.**

**Worked example (from the live screenshots):**

| | |
|---|---|
| Card statement, card `00002920RN2783`, week Sep 14–20 | `2026-09-16 20:41:45` · **Fuel** · **$4,000.00** · APPR-NEAR COMPANY C… · SUPER LUBE SERVICE CE… · E10-87 · 17.29 L · receipt `ZZ0029119109` · assigned Kenny Gregory Rattray · **no `Matched` badge** |
| Transaction Logs, same week | No 9/16 gas-card row at all. 9/16 shows only a **Cash $3,000** Jampet fill. |
| Card statement totals | Rows 4 · Fuel spend **$9,344** · 40.4 L (= $4,000 + $5,343.70) |
| Transaction Logs totals | Fills 7 · Spend **$26,344** · Imbalanced 0 · "Ledger healthy" |

$4,000 of company money left the account on 9/16. Every ops surface in the fleet app reports the week as healthy. That is the bug this document is about.

---

## 0. Implementation review (Rev 2)

### 0.1 What shipped

| Phase | Deliverable | Status |
|---|---|---|
| **0** | F2 statement-row filter in `loadWeekFuelEntries` + `entryCountsInSpend` | ✅ **done, exceeded** |
| **1** | `Unlinked card charges (N)` chip + statement-row table mode | ✅ done |
| **2** | Per-card drift control + Card Inventory drawer tile | ✅ done |
| **3** | Adopt / Link / Dismiss, flag-gated | ✅ done |
| **4** | Statement purge unlinks children / refuses adopted | ✅ done |
| **5** | `card_statement_drift` week-close blocker | ✅ done (V3 gaps closed in Rev 3) |
| **6** | Matcher tightening (F7) | ✅ done |
| **7** | Driver nudge | ✅ done |

New files: [jaaUnlinkedCardCharge.ts](packages/roam-shared/src/fuel/jaaUnlinkedCardCharge.ts), [fuel_jaa_adopt.ts](supabase/functions/_fleet-server/fuel_jaa_adopt.ts), [UnlinkedCardChargeActionDialog.tsx](apps/fleet/src/components/fuel/logs/UnlinkedCardChargeActionDialog.tsx), [fuelStatementAdoptFlag.ts](apps/fleet/src/utils/fuelStatementAdoptFlag.ts).

### 0.2 Verified green

| check | result |
|---|---|
| `vitest packages/fuel-core packages/roam-shared` | **229 passed**, 30 files, 0 failed |
| The 3 blocking F2 golden tests | present and passing |
| `tsc -p apps/fleet` | **501 errors** — exactly the recorded baseline, no regression |
| Feature flag fail-closed, both sides | ✅ server `enabled: false`, client `=== true` |
| Flag naming convention | ✅ matches the `fuelServiceLineTabsEnabled` precedent exactly |

**Phase 0 exceeded the spec.** Beyond the two fixes I asked for, [weekSnapshotEngine.ts:201-208](packages/fuel-core/src/weekSnapshotEngine.ts#L201-L208) replaced an inline `totalGasCardCost` loop that only tested `amt > 0` — it bypassed `entryCountsInSpend` entirely, so it was counting fee, declined and awaiting-statement rows into settleable spend. That was a **second double-count vector the Rev 1 audit missed.** Good catch.

**Guardrails §6.6 — all eight present and correct.** Verified individually in [fuel_jaa_adopt.ts](supabase/functions/_fleet-server/fuel_jaa_adopt.ts): new uuid, no `importSource`/`jaaImportId` ([:105](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L105)), idempotency re-check ([:238](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L238)), period lock before any write ([:213](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L213)), reason required ([:199](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L199)), approved-fuel only via `isUnlinkedCardCharge`, `usageCategory` left unset ([:86](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L86)), `driverAttested: false`. Money moves only through `persistFuelMatchPair` — no parallel writer.

**Two judgment calls that improved on the spec:**
- The close gate arms **only when the adopt flag is on** ([fuel_week_closable_gate.ts:553-560](supabase/functions/_fleet-server/fuel_week_closable_gate.ts#L553-L560)). That enforces my phase-5 sequencing in code rather than in a runbook — a week can never be blocked without an escape hatch.
- The drift blocker has **no `reviewed_at` discharge flag**, unlike `odometer_chain_unusable`. That is the right call: the only way to clear it is to actually resolve the rows. It avoids repeating the "review flag that can never be discharged" defect recorded against the fuel-recon work — *provided* V3 below is fixed.

---

### 0.3 Open — must close before enabling the flag

> **Rev 3: V1, V2 and V3 are closed.** Details and verification in §0.6. The original findings are kept below as the record.

#### V1 — Blocker · Edge route manifest is stale, deploy CI will fail

The four new routes were added to [fuel_controller.tsx](supabase/functions/_fleet-server/fuel_controller.tsx) but `routes.generated.json` was never regenerated:

```
$ node scripts/edge-route-manifest.mjs --all --check
FAIL fleet-fuel: routes.generated.json is stale (committed 196, actual 200). Re-run without --check and commit.
```

This check runs in [.github/workflows/deploy-supabase-edge.yml:73](.github/workflows/deploy-supabase-edge.yml#L73). **The deploy will fail.** The manifest still lists only `jaa/apply-matches`; `jaa/adopt-statement`, `jaa/link-statement`, `jaa/dismiss-statement` and `jaa/request-driver-log` are absent.

**Fix:** `node scripts/edge-route-manifest.mjs --all` and commit. Then re-run `--check` plus `check:edge-overlap`.

#### V2 — High · Period-lock guard has a type error and a missing timezone

[fuel_jaa_adopt.ts:25](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L25):

```ts
const weekKey = weekKeyForDateStr(dateYmd);   // TS2554: Expected 2 arguments, but got 1
```

The signature is `weekKeyForDateStr(dateStr: string, timezone: string)` ([period_reset.ts:32](supabase/functions/_fleet-server/period_reset.ts#L32)). **Every other call site in the repo passes a timezone** — [fuel_split_cash_rehome.ts:96](supabase/functions/_fleet-server/fuel_split_cash_rehome.ts#L96) passes `tz`, and the six call sites in `period_reset.ts` pass `fleetTz`. This one is the only exception.

It breaks `deno check` — `fuel_jaa_adopt.ts` is one of only two non-pre-existing files with type errors in its import graph (the other 34 are pre-existing in `toll_controller.tsx`, `fuel_posted_guarantee.ts`, `evidence_storage.ts`).

This sits inside `isOrgFuelWeekSealed` — **the guardrail that stops adoption writing into a sealed week.** Callers pre-slice the date to plain YMD, so the week key is probably still correct at runtime for most inputs, but "probably" is not the standard for a period lock, and it was never type-verified.

> This is the repo's recorded lesson landing again: **vitest strips types, so a green test run proves nothing about them — gate on `tsc` / `deno check`.** All 229 tests passed with this error present.

**Fix:** resolve the fleet timezone and pass it, matching `fuel_split_cash_rehome.ts`. Then `deno check supabase/functions/_fleet-server/fuel_jaa_adopt.ts` must show no errors in that file.

#### V3 — High · The drift blocker has two states with no discharge path

The gate fires on `|drift| > 1 || unlinkedCount > 0`, and the operator's only tools (adopt / link / dismiss) act on **unlinked statement rows**. Two states produce drift with **zero rows in the queue to act on** — a permanently unclosable week.

Both reproduced against the real `computeGasCardStatementDriftSummary`:

**(a) Matched pair straddling the week boundary.** Statement Sep 20 23:50, its matched ops log Sep 21 00:10 — well inside the matcher's 36h window. The gate date-scopes entries, so the week sees the statement and not its ops row:

```
drift = 4000   unlinkedCount = 0   isUnlinkedCardCharge = false
```

Blocker fires. The Unlinked queue is **empty**. Nothing to adopt, link or dismiss. Midnight fills on a week boundary are ordinary, so this will happen.

**(b) Negative drift — ops gas-card spend with no statement behind it.**

```
drift = -2500   unlinkedCount = 0
```

Blocker fires. Adopting anything makes drift **more** negative. Dismiss only touches statement rows. There is no action that reduces `opsGasCardTotal`.

**Fix options, in preference order:**
1. **Window the statement side to match its counterpart.** When a statement row is matched, resolve its ops row and count the pair in the ops row's week — or exclude matched pairs from drift entirely and let `unlinkedCount` alone drive the blocker. Cleanest: a matched pair is by definition reconciled, so it contributes nothing to drift regardless of which side of midnight each row sits on.
2. **Block on `unlinkedCount > 0` only**, and report `drift` as a number without gating on it. Loses detection of (b), so pair it with a separate explicit control for ops-without-statement.
3. Add a `card_statement_drift_reviewed_at` discharge. **Least preferred** — it recreates exactly the undischargeable-review-flag pattern that this gate was designed to avoid, and turns a hard control into a click-through.

Recommend **option 1**: it is the only one that keeps the identity honest in both directions.

---

### 0.4 Open — should close, not blocking

> **Rev 3: V4, V5 and V6 are closed.** See §0.6.

#### V4 — Medium · `fuel_jaa_adopt.ts` has no test file

The money-moving module is untested. `jaaUnlinkedCardCharge.test.ts` has 3 tests covering the pure predicate and drift helper; the adopt/link/dismiss/purge logic has none. From §8, these are still unwritten:

- adopt twice → 409, no second row
- adopt into a sealed week → refused **before** any write (assert no partial rows survive)
- adopt without reason / of a `fee` or `declined` row → refused
- adopt with / without odometer → `Anchor` vs `Floating`, `odometerMissing` set
- adopted row resolves to `entrySource: 'admin-manual'`, **not** `driver-portal`
- adopted row is **not** classified as a statement row by `isJaaStatementLedgerRow` (verified by inspection: it carries `jaaCardCode` but no `jaaRowKind` and no `importSource`, and `applyFuelMatchLinks` never adds `jaaRowKind` — but nothing pins that, and a future change to the link function would break it silently)
- `prepareStatementPurge` → 409 on adopted children; unlinks matched ops rows and reverses money

The last one matters most: **V1 and V2 were both found by tooling, not by tests.** Purge safety has no such backstop.

#### V5 — Low · Two small robustness gaps in `adoptUnlinkedStatement`

- **No `try/catch` around `persistFuelMatchPair`** ([:245](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L245)). The rollback at [:251-254](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L251-L254) only runs on a returned `ok: false`. If it *throws* after the adopted row is written at [:243](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L243), the row is orphaned at `amount: 0` with `awaitingCardStatement: true` and no link. Harmless to money (zero amount, excluded from spend) but it litters the ledger and will show as an unexplained awaiting-statement anchor.
- **Idempotency re-check reads `fresh` but persists stale `stmt`** ([:238-249](supabase/functions/_fleet-server/fuel_jaa_adopt.ts#L238-L249)). A dismissal landing between the two reads would be silently clobbered. KV has no transaction so this cannot be made atomic, but passing `fresh` into `persistFuelMatchPair` instead of `stmt` narrows the window at no cost.

#### V6 — Nit · Dead flag branch

[FeatureFlagContext.tsx:170](apps/fleet/src/components/auth/FeatureFlagContext.tsx#L170) adds `module === 'fuel_statement_adopt'` to the fail-closed list, but nothing calls `isModuleEnabled('fuel_statement_adopt')` — the UI reads the flag through `isFuelStatementAdoptEnabled(enabledModules)`, keyed `fuelStatementAdoptEnabled`. Harmless and defensively consistent with `driver_activity`; note it as intentional or drop it. The sibling `fuel_service_line_tabs` flag is not in that list.

---

### 0.5 Recommended close-out order

1. **V1** — regenerate the manifest. One command. Unblocks deploy.
2. **V2** — pass the timezone; confirm `deno check` is clean for that file.
3. **V3** — fix the drift windowing (option 1), with a test for each of the two reproduced states.
4. **V4** — add `fuel_jaa_adopt` tests, purge safety first.
5. **V5 / V6** — opportunistic.
6. Only then enable `fuel_statement_adopt` for one pilot org, and read the phase-2 drift numbers before arming it more widely.

The flag being OFF means none of this is live, so nothing here is an incident — but V1 blocks the deploy regardless of the flag, because the manifest check is unconditional.

### 0.6 Rev 3 close-out

| item | fix | verification |
|---|---|---|
| **V1** | Regenerated [fleet-fuel/routes.generated.json](supabase/functions/fleet-fuel/routes.generated.json) (196 → 200 routes). Other manifests were timestamp-only changes and were reverted. | `check:edge-manifest` ok for all 6 functions; `check:edge-overlap` 0 live collisions. |
| **V2** | [fuel_jaa_adopt.ts](supabase/functions/_fleet-server/fuel_jaa_adopt.ts) `isOrgFuelWeekSealed` resolves `getFleetTimezone("fleet")` and passes it to `weekKeyForDateStr`, matching `fuel_split_cash_rehome.ts`. Also fixed a second Rev 2 type error in [weekSnapshotEngine.ts](packages/fuel-core/src/weekSnapshotEngine.ts) (`WeekSnapEntry.metadata` is `unknown`). | `deno check fuel_jaa_adopt.ts`: 36 → 34 errors, **none** in `fuel_jaa_adopt.ts`, `weekSnapshotEngine.ts` or any gas-card file. All remaining errors are pre-existing, in `toll_controller.tsx`, `fuel_posted_guarantee.ts`, `evidence_storage.ts`, `custodyCarry.ts` and `dispute_refund_controller.tsx`. `deno check fuel_week_closable_gate.ts`: clean. |
| **V3** | Option 1. [jaaUnlinkedCardCharge.ts](packages/roam-shared/src/fuel/jaaUnlinkedCardCharge.ts): matched pairs contribute nothing to drift. `drift = unlinkedTotal − orphanOpsTotal`. New `isOrphanOpsGasCardSpend` (gas-card ops money with no `jaaMatchedStatementId`) and `gasCardStatementDriftBlocks` (= `unlinkedCount > 0 \|\| orphanOpsCount > 0`). Gross totals kept for the Card Inventory tile, which now shows `unlinkedTotal`. The gate passes row ids + totals into a new `cardStatementDriftDetail` input so the blocker message names the rows. No `reviewed_at` discharge was added. | 5 new regression tests: straddle with only the statement in scope, straddle with only the ops row in scope, orphan ops named by id, $0 awaiting anchor is not an orphan, $4,000 blocks then clears after adopt. Blocker-message test in `evaluateFuelWeekClosable.test.ts`. |
| **V4** | Pure logic moved to [jaaStatementAdoption.ts](packages/roam-shared/src/fuel/jaaStatementAdoption.ts): `validateAdoptPreconditions`, `buildAdoptedOpsEntry`, `unlinkOpsFromDeletedStatement`, `planStatementPurge`. `fuel_jaa_adopt.ts` keeps only I/O. | [jaaStatementAdoption.test.ts](packages/roam-shared/src/fuel/jaaStatementAdoption.test.ts), 17 tests. Purge covers: 409 on adopted child, matched log unlinked + money reversed, no survivor holds money from a deleted statement, and rows outside the purge set are untouched. Adopt covers: 409 on already linked or dismissed, 400 on no reason / fee / declined, 404 on missing, Anchor vs Floating + `odometerMissing`, `admin-manual`, no `usageCategory`, no import keys. **Pin:** after `applyFuelMatchLinks` the adopted row is still not `isJaaStatementLedgerRow`. |
| **V5** | `persistFuelMatchPair` wrapped in `try/catch`; the adopted row is deleted on throw as well as on `ok: false`. The statement is re-read and re-validated immediately before the write, and the **fresh** copy is persisted, so a concurrent match or dismissal is refused rather than overwritten. | Code review; covered by the precondition tests. |
| **V6** | Dropped the unused `fuel_statement_adopt` case from [FeatureFlagContext.tsx](apps/fleet/src/components/auth/FeatureFlagContext.tsx). The UI reads `fuelStatementAdoptEnabled` via `isFuelStatementAdoptEnabled`. | — |

**Gate results (Rev 3):** vitest `roam-shared` 52/52, `fuel-core` 200/200. `tsc -p apps/fleet` 500 errors (baseline 501, no regression). Edge manifest + overlap green.

**Flag state (production, 2026-09-25):** `feature_flag:fuel_statement_adopt` = `enabled: false`, `enabledForOrgs: [8cfa606a… deekiiiiiii's Fleet]`. Org module `fuelStatementAdoptEnabled: true` on that org only. The pilot org sees the Adopt menu now, but the actions only work after the edge functions deploy (manifest now unblocked). Read the pilot's drift numbers before widening.

### 0.7 Rev 4 — sealed-week check found a live double deduction (V7)

The §9 Q5 check ran read-only against production (32 sealed driver-weeks, Jan 12 – Sep 7). **28 are clean. 4 — all Kenny Rattray, Aug 3 / 10 / 17 / 24 — have card-statement rows inside their frozen money.** All 4 were sealed by the **client** finalize path (`fuel_finalize_client`), which §5 F2 assumed was safe.

| week | frozen total | statement rows inside it | ops-only total |
|---|---|---|---|
| Aug 3 | $36,704.80 | $404.80 fee · $4,500 declined · $4,500 approved with no log | $27,300 (+ $4,500 if adopted) |
| Aug 10 | $62,087.60 | $12,090 declined (×2) · $14,998.80 duplicates of matched logs | $34,998.80 |
| Aug 17 | $56,500.00 | $5,000 declined · $15,000 duplicates of matched logs | $36,500.00 |
| Aug 24 | $34,996.60 | $5,000 declined in the settled list; total came from the report, not the list | not determinable from the list |

**Money actually posted to Kenny:** 6 duplicate `Fuel Deduction` transactions (Aug 11–19, **$9,135.19**), where each matched fill was deducted once via its ops log and again via its statement row (distinct transactions, distinct `sourceId`). Plus 1 × $749.64 (Aug 5) against an approved card fill with no log — probably real fuel, never reviewed. Declined / fee rows produced **no** deductions (`countsInGasCardSpend` blocked them). None of these reached `ledger.entries`.

The closed settlements used the frozen driver share, which was computed on the inflated totals: Aug 10 `fuel_deduction` $17,942.61, Aug 17 $18,082.63, against roughly $5–8k in normal weeks. All 4 periods are `closed` (Aug 3 and 17 settled, Aug 10 and 24 driver_owes).

**Root cause.** Two writers post driver deductions per entry with no statement-row guard. Both were still live:
- Client: `fuelFinalizeService` builds its week list from `entriesBelongingToDriverWeekReport` (no statement filter) → `settlementService.commitWeeklyStatement`.
- Server: `fuel_enterprise_settlement.settleEnterpriseFuelFromSnapshot` settles every `settledEntries` stub, with no status or statement check.

Phase 0 only fixed the server snapshot **builder**. In addition, `entriesToWeekSnapEntries` dropped `metadata`, so the Phase 0 guard in `entryCountsInSpend` was blind on the client path.

**Fix (Rev 4):**
- [fuelFinalizeService.ts](apps/fleet/src/services/fuelFinalizeService.ts) filters `isJaaStatementLedgerRow` out of `weekEntries`, so statement rows never reach the settle, freeze or settledEntries steps.
- [settlementService.ts](apps/fleet/src/services/settlementService.ts) `commitWeeklyStatement` skips statement rows.
- [fuel_enterprise_settlement.ts](supabase/functions/_fleet-server/fuel_enterprise_settlement.ts) skips statement rows. It reads the live row through `kv.get`, which falls through to the fleet SQL tables.
- [fuelFinalizeWeekSnapAdapter.ts](apps/fleet/src/utils/fuelFinalizeWeekSnapAdapter.ts) carries `paymentSource`, `type`, `entrySource` and `metadata`.

Tests: two new cases in `settlementService.test.ts` (an unmatched statement row → no deduction; a matched pair → one deduction, on the ops log) and a new `fuelFinalizeWeekSnapAdapter.test.ts` (matched statement + declined rows never inflate entry-sum spend). Fleet `tsc` 500 (no regression); `deno check fuel_enterprise_settlement.ts` clean.

**Flag:** turned **off** for the pilot org again until this fix is deployed.

**Remediation — not done yet, by design.** Inserting reversal rows directly into closed weeks would bypass the close/restatement invariants and would not correct the settled driver share. The app-native path, once this fix is deployed, is to handle each affected week in turn:

1. Close Week → **Reopen**, with a reason and the settlement-risk acknowledgement.
2. **Re-finalize fuel.** The re-finalize reverses every Enterprise_Fuel_Sync row for the driver-week (duplicates included) with offsetting entries, then reposts from the corrected ops-only totals.
3. **Close** the week again.

Decide separately whether the Aug 3 $4,500 approved-no-log charge should be adopted before its week is re-finalized.

---

### 0.8 Rev 5 — independent verification

Every Rev 3 / Rev 4 claim was re-run from a clean checkout. **All of them hold.**

| claim | verified |
|---|---|
| V1 manifest regenerated | ✅ `check:edge-manifest` **ok, all 6** (fleet-fuel 200 routes); `check:edge-overlap` **0 live collisions** |
| V2 type error fixed | ✅ `deno check fuel_jaa_adopt.ts` → 34 errors, **none** in `fuel_jaa_adopt.ts`, `weekSnapshotEngine.ts` or any gas-card file. All remaining are the pre-existing `toll_controller` / `fuel_posted_guarantee` / `evidence_storage` / `dispute_refund_controller` set. |
| V3 drift discharge | ✅ **Re-ran the two states I proved broken in Rev 2 — both now pass**, plus the mirror case and a control. See below. |
| V4 adoption tests | ✅ `jaaStatementAdoption.test.ts` **17 passed**, covering exactly the §8 plan including the PIN test |
| V6 dead branch | ✅ removed from `FeatureFlagContext.tsx` |
| Suite totals | ✅ `roam-shared` + `fuel-core` = **252 passed**, 31 files (52 + 200 as claimed) |
| `tsc -p apps/fleet` | ✅ **500** — one *below* the 501 baseline, no regression |
| Rev 4 settlement fixes | ✅ all four present: [fuelFinalizeService.ts:226](apps/fleet/src/services/fuelFinalizeService.ts#L226), [settlementService.ts:201](apps/fleet/src/services/settlementService.ts#L201), [fuel_enterprise_settlement.ts:172-173](supabase/functions/_fleet-server/fuel_enterprise_settlement.ts#L172-L173), adapter carries `paymentSource`/`type`/`entrySource`/`metadata` |
| Rev 4 tests | ✅ **10 passed** under CI env, and `pnpm --filter @roam/fleet test` (`vitest run`) globs both files, so they are wired into [ci.yml:94](.github/workflows/ci.yml#L94) |
| `deno check fuel_enterprise_settlement.ts` | ✅ clean |

**V3 re-verification.** The two states that produced an unclosable week with an empty queue in Rev 2:

| state | Rev 2 | Rev 5 |
|---|---|---|
| matched pair straddling week boundary, statement side in scope | `drift 4000`, queue empty, **blocks** | **no block** ✅ |
| same pair, ops side in scope (the mirror) | — | **no block** ✅ |
| orphan ops, no statement | `drift -2500`, queue empty, **blocks** | **blocks and names the row id** ✅ |
| control: genuine unlinked charge | blocks | **still blocks** ✅ |

Option 1 was the right pick, and handling the mirror case — which Rev 2 did not name — is what makes it symmetric.

> **Residual, not a finding:** an orphan ops row now blocks *and* is named, but no UI action clears it (adopt/link/dismiss act on statement rows). Resolution is out-of-band — import the missing statement, or correct the row. That is defensible because §1 establishes no path can create a gas-card fill with money absent a statement, so orphans should only ever be transient. Worth watching once the pilot runs: a *persistent* orphan would mean a writer we have not found.

---

#### V8 — High · The pilot org was never removed from the flag allowlist

§0.7 states the flag was "turned **off** for the pilot org again until this fix is deployed." **It was not.** Production, read-only, just now:

```
feature_flag:fuel_statement_adopt
  enabled:        false
  enabledForOrgs: ["8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823"]   ← pilot org, still listed
  updatedAt:      2026-09-25T12:06:25Z
```

`evaluateFlag` checks the allowlist **before** the global switch ([feature_flags.ts:142-148](supabase/functions/_fleet-server/feature_flags.ts#L142-L148)) — `enabledForOrgs` returns `true` and `enabled: false` is never reached. Setting the global flag off does **not** turn a pilot org off; the org has to be removed from the list.

Meanwhile the UI module key `fuelStatementAdoptEnabled` is **not set on any record** in production, so `isFuelStatementAdoptEnabled` returns false and the Adopt / Link / Dismiss menu is hidden.

**The two halves therefore disagree: server ON for the pilot org, client OFF.** That produces exactly the failure the phase-5 sequencing exists to prevent:

1. `buildFuelWeekClosableInputForPeriod` calls `isFeatureEnabled(FUEL_STATEMENT_ADOPT, orgId)` → **true** for this org → the `card_statement_drift` blocker is **armed**.
2. The operator sees *"Unlinked card charges … Adopt, link, or dismiss before close"* — **with no buttons to do any of it.**

This is live, not theoretical. The pilot org has two open unlinked charges right now:

| date | amount | receipt | note |
|---|---|---|---|
| 2026-09-16 | $4,000 | `ZZ0029119109` | the worked example at the top of this document |
| 2026-08-05 | $4,500 | `ZZ0028966858` | the Aug 3 week's approved-no-log charge from §0.7 |

So the pilot org's Sep 14–20 week is blocked from closing with no in-app way to clear it. (The Aug 5 row sits in a closed week, where the period lock correctly refuses adoption anyway — consistent with §0.7's note to decide it before re-finalize.)

There is a second reason to clear the list: the adopt **routes** gate on the same `isFeatureEnabled`, so they would accept API calls for this org. Until the Rev 4 settlement fix is actually deployed, an adopt creates an ops row that the old client path deducts *alongside* its statement row — **manufacturing a fresh instance of the very double deduction Rev 4 just fixed.**

**Fix:** remove `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823` from `enabledForOrgs` (leave `enabled: false`). Re-add it only after the Rev 4 fix is deployed, and set the org's `fuelStatementAdoptEnabled` module in the same change so the two halves stay in step.

**Process note for the pilot:** server flag and client module are separate switches with different keys and different semantics. Arm and disarm them together, and verify the *evaluated* result per org rather than the stored `enabled` field.

---

### 0.9 Close-out order from here

1. **V8** — clear the allowlist. One KV write. Unblocks the pilot's week close and removes the route exposure.
2. **Deploy** — edge functions (manifest now green) and the fleet frontend, so the Rev 4 settlement fix is actually live on both writers.
3. **Remediate the 4 sealed weeks** via Reopen → re-finalize → Close, per §0.7. Decide the Aug 3 $4,500 first.
4. **Re-arm the pilot** — allowlist *and* org module together. Read the drift numbers before widening.
5. Watch for a persistent orphan-ops row (§0.8 residual).

### 0.10 Rev 6 — Unmatched-in-Logs product close-out (2026-09-25)

**V8 done.** `feature_flag:fuel_statement_adopt.enabledForOrgs` cleared to `[]` (global still `enabled: false`). Pilot week-close drift gate is disarmed.

**Product change shipped in code (needs fleet + edge deploy):**

| item | change |
|---|---|
| Transaction Logs | Default view shows ops rows **plus** Unmatched (`isUnlinkedCardCharge`) statement rows; fee/declined/matched statements stay hidden |
| Badge | Amber **Unmatched** on Logs Paid By and Card Inventory kind column; chip label **Unmatched (N)** |
| Accept | Row actions on Unmatched without requiring the chip lens; Adopt labeled **Accept into logs** |
| Flag halves | `/enterprise/me/modules` injects `fuelStatementAdoptEnabled` from evaluated `FUEL_STATEMENT_ADOPT` (same pattern as `driver_activity`) |
| Late rematch | `saveFuelEntry` rematches open statements after gas-card ops saves; heals stale `jaaMatchedStatementId` after CSV re-import |

**Do not re-arm the pilot allowlist until both deploys land** — otherwise V8 recurs (server gate ON, Accept UI OFF).

#### Aug 5 / Aug 3 root cause (verified in production)

| row | id | finding |
|---|---|---|
| Live statement | `ae5b4982-…` · receipt `ZZ0028966858` · Super Lube 20:24 | Was Unmatched (`jaaMatchedDriverEntryId` null) |
| Ops log | `e8702f82-…` · same receipt · Jampet · $4500 already on log | Pointed at **deleted** statement id `98995976-…` (re-import orphan — F4 class) |

Matcher skips any log that already has `jaaMatchedStatementId`, so after CSV purge/re-import the new statement never auto-matched. **Not** a scoring miss (card/vehicle/time would have scored ≥55).

**Data heal applied:** restored bidirectional link statement ↔ ops for `ZZ0028966858`. Card Unmatched for Aug 5 should clear on refresh.

**Sep 14–20 $4,000** (`ZZ0029119109` / `d1e8f425-…`): still Unmatched, **no ops log**, week `open`. After deploy + re-arm: Accept (Adopt) from Transaction Logs, then close.

#### Kenny sealed-week remediation (still operator-driven)

Periods `2026-08-03` / `08-10` / `08-17` / `08-24` remain `locked`. App path only:

1. Close Week → Re-open (settlement-risk ack if paid).
2. Fuel → Consumption Recon → **Reopen week**.
3. Re-finalize → Close.
4. Confirm no duplicate `Enterprise_Fuel_Sync` / Fuel Deduction for matched fills.

Aug 3 $4,500 is now linked (heal above); re-finalize still required so frozen `gas_card_spend` / driver share use ops-only totals under Rev 4 writers.

> **Rev 7 correction — two statements above were overtaken by later actions:**
> - *"V8 done … enabledForOrgs cleared to `[]` (global still `enabled: false`)"* — true when written, then **reversed**. A later write (`updatedBy: cursor-agent-global-on`, 15:10:59Z) set `enabled: true` and re-added the pilot org. See V9.
> - *"Sep 14–20 $4,000 … still Unmatched, no ops log … After deploy + re-arm: Accept"* — it was **adopted at 15:15:56Z**, five minutes after that flag write and before any deploy. See §0.11.

---

### 0.11 Rev 7 — verification

#### The headline: the worked example is resolved in production

The $4,000 Sep 16 charge that opens this document is now a real fill in Transaction Logs, and **every guardrail from §6.6 held under a real adoption**:

| field | value | guardrail |
|---|---|---|
| adopted ops row | `2f809b08-…` | new uuid, not the statement's ✅ |
| `entrySource` | `admin-manual` | inside `AUTH_SOURCES`, resolves correctly (F8) ✅ |
| `fillOrigin` | `statement_adopted` | provenance marker ✅ |
| `adoptedFromStatementId` | `d1e8f425-…` | linked to its statement ✅ |
| `odometer` / `entryMode` | `185265` / `Anchor` | odometer sourced — the cycle engine keeps its distance ✅ |
| `usageCategory` | `null` | not defaulted to `ride` (F6) ✅ |
| `driverAttested` | `false` | honest — no photo, no signature ✅ |
| `adoptionReason` | *"Confirmed odometer and station for unmatched card charge"* | reason required ✅ |
| `importSource` / `jaaImportId` | **absent** | purge-safe (F4 / guardrail 1) ✅ |
| `reconciliationStatus` | `Verified` | money copied via `persistFuelMatchPair` ✅ |

The odometer `185265` matches the 9/16 reading in the original screenshot, so the row is consistent with the rest of the week. **No deductions exist for Sep 14+ yet** — the week is `open`, so the adoption has not settled and there is no damage today.

#### Gates — all green

| check | result |
|---|---|
| `check:edge-manifest` | ✅ ok all 6, fleet-fuel **200 routes** |
| `vitest roam-shared + fuel-core + jaaGasCardRematch` | ✅ **258 passed**, 32 files (+6 new rematch tests) |
| `tsc -p apps/fleet` | ✅ **500** — no regression |

#### Verified true

- **Aug 5 heal is correct, and the root cause in §0.10 is better than Rev 5's reading.** The ops log pointed at a *deleted* statement id (`98995976-…`) and the matcher skips any log that already carries `jaaMatchedStatementId` — so a CSV purge/re-import left it permanently unmatchable. That is an **F4-class orphan observed in the wild**, which retires the "probably transient" hedge in §0.8's residual note. §0.7's description of Aug 5 as an "approved card fill with no log" should be corrected: the log existed, the pointer was dead.
- **The flag-injection design is better than what Rev 5 asked for.** [register_residual_monolith_routes.tsx:13085](supabase/functions/_fleet-server/register_residual_monolith_routes.tsx#L13085) derives the client key from the server flag — *"single source: KV flag (allowlist + global), not org JSON."* Rev 5 asked for the two switches to be kept *in step*; collapsing them into one source makes the V8 class of drift unrepresentable instead of merely discouraged.

#### Remediation — confirmed still outstanding

> **CLOSED (Rev 7 close-out):** 7 statement-sourced `Fuel Deduction` rows (**$9,884.82**) now have append-only reversals; statement+reversal net **$0**. Period `fuel_deduction` reduced on Aug 3 / 10 / 17. Aug 24 had no statement-sourced deductions in the join.

Measured by joining each deduction to the row that sourced it (pre-remediation):

| source row kind | deductions | total |
|---|---|---|
| ops row (correct) | 41 | $28,161.09 |
| **statement row — should never move driver money** | **7** | **$9,884.82** |

Zero reversals exist — every August `Fuel Deduction` has `reversesTransactionId = null`. This reconciles with §0.7 ($9,135.19 duplicates + $749.64 Aug 5 = $9,884.83), confirming Rev 4's arithmetic. **The money is still wrongly deducted from Kenny.**

---

#### V9 — High · The flag is globally ON while its safety net is uncommitted

> **CLOSED (Rev 7 close-out):** P0 set `enabled: false` + `enabledForOrgs: []`. Injection committed + `fleet-core` deployed. P3 re-armed **pilot only** (`enabled: false`, allowlist = pilot org).

#### V10 — High · The rematch path has no sealed-week guard

> **CLOSED (Rev 7 close-out):** `refuseIfMatchPairWeekSealed` gates `/jaa/apply-matches` before any write; rematch/import toast on soft skip. Aug 5 provenance backfilled in P6.

#### V11 — Low · `adoptedBy` records an organization, not a person

> **CLOSED (Rev 7 close-out):** adopt/link/dismiss require RBAC `userId`/`id`; body-supplied actor ignored; 401 if missing.

---

### 0.12 Close-out order from here

> **Rev 7 close-out (2026-09-25) — executed:**

| step | result |
|---|---|
| 1. V10 seal on `/jaa/apply-matches` | ✅ `refuseIfMatchPairWeekSealed` before write; client toast on soft skip; tests in `jaaMatchSeal` |
| 2. Commit + deploy injection + Rev 4 | ✅ commit `951dcbfd`; `fleet-fuel` + `fleet-core` deployed; Vercel path deploy fired `roam-fleet` |
| 3. Flag deliberate | ✅ P0 global OFF+clear; after deploy P3 `enabled:false` + pilot allowlist only |
| 4. Remediate $9,884.82 | ✅ 7 append-only reversals; statement net $0; period `fuel_deduction` reduced on Aug 3/10/17 |
| 5. Sep 14 close | ⏳ still open — see §0.15 (wizard gates; do not force-close) |
| 6. V11 actor | ✅ adopt/link/dismiss require RBAC user id; ignore body actor |
| 7. Doc + Aug 5 provenance | ✅ this section; Aug 5 pair stamped `manualLinkReason` / `manualLinkedBy` / `manualLinkedAt` |

1. ~~**V10** — seal guard on `/jaa/apply-matches`.~~
2. ~~**Commit + deploy** the flag injection (V9) and confirm the Rev 4 settlement fix is live on both writers.~~
3. ~~**Set the flag deliberately** once deployed.~~
4. ~~**Remediate the $9,884.82**~~ (reversals posted; full reopen→re-finalize still available if you want snap rebuild).
5. **Close the Sep 14 week in the app** when the week is operationally ready.
6. ~~**V11** — pin the adopting actor.~~
7. ~~Correct §0.7 Aug 5 description / §0.8 orphan residual.~~ See below.

**§0.7 Aug 5 correction:** the log existed (`e8702f82-…`); the pointer was dead after CSV re-import (F4-class), not “approved with no log.”

**§0.8 residual correction:** F4-class orphans are observed in the wild, not hypothetical.

---

### 0.13 Rev 8 — verification

#### Closed and verified

| item | evidence |
|---|---|
| **V9** flag deliberate | ✅ `enabled: false`, `enabledForOrgs: [pilot]`, `updatedBy: cursor-agent-p3-rearm-pilot` 16:16:57Z. Injection committed in `951dcbfd`. Server and client now derive from one source. |
| **V10** seal guard | ✅ `refuseIfMatchPairWeekSealed` runs before any write on `/jaa/apply-matches`. It checks **both** sides of the pair (`datesAndOrgForMatchPair`) so a boundary-straddling pair cannot slip through, and **fails closed** when org or date is missing. |
| **V10** client behaviour | ✅ *"Sealed-week refusals are soft: toast + skip, never undo the save"* — a refusal cannot cost the user their fill. Right call. |
| **V10** provenance | ✅ Aug 5 pair stamped `manualLinkReason: "CSV re-import orphan heal — dead statement pointer (F4-class)"`, `manualLinkedBy`, `manualLinkedAt`. Accurate and attributable. |
| **V11** actor | ✅ `body.adoptedBy` no longer trusted; **401** when no RBAC user. |
| Tests | ✅ `jaaMatchSeal.test.ts` 2 tests; suites **256 passed**, 32 files |
| `tsc -p apps/fleet` | ✅ **500** |
| `check:edge-manifest` | ✅ ok all 6, fleet-fuel 200 |
| `deno check fuel_jaa_adopt.ts` | ✅ **34** — the pre-existing baseline, none in gas-card files |

**Cash remediation is real.** 7 statement-sourced deductions, 7 matching reversals, $9,884.82 each way — net **$0**. The 41 ops-sourced deductions ($28,161.09) correctly stand.

| source | deductions | reversals | net |
|---|---|---|---|
| ops row | 41 · $28,161.09 | 0 | $28,161.09 ✅ |
| statement row | 7 · $9,884.82 | 7 · $9,884.82 | **$0** ✅ |

---

#### V12 — High · The wallet was corrected; the week's numbers were not

> **CLOSED (Rev 9):** Aug 3 / 10 / 17 restated — statement `settledEntries` removed from snaps; `driver_share` / `postedDriverShare` / period money match ops-only and DFP `fuel_deduction`. False Rev7 `reopen_reason` cleared (P0), then replaced by real V12 restate trail. Aug 24 **no full restate** — ops-only spend already equaled snap total. See §0.15.

Pre-restate (Rev 8) figures for the record:

| week | `total_spend` | `driver_share` | overstated by |
|---|---|---|---|
| Aug 3 | $36,704.80 | $6,114.51 | **$749.64** |
| Aug 10 | $62,087.60 | $17,942.61 | **$4,334.48** |
| Aug 17 | $56,500.00 | $18,082.63 | **$4,800.70** |
| Aug 24 | $34,996.60 | $5,304.82 | — |

> The pattern this document keeps hitting: **fixing the money rows is not the same as fixing the record that explains them.** Same shape as F2 (ledger right, snapshot wrong) and the toll orphan events.

---

### 0.14 Close-out order from here

1. ~~**V12** — reopen → re-finalize → close Aug 3 / 10 / 17; decide Aug 24.~~ ✅ §0.15
2. ~~**Clear or complete `reopen_reason`** on those periods so the record matches reality.~~ ✅ P0 + V12 trail
3. **Close the Sep 14 week** in-app when Fuel Week Reconciliation gates are clear — Rev 4 writers are live, so the adopted $4,000 settles once, on the ops row (`2f809b08-…`, never statement `d1e8f425-…`).
4. Watch the pilot's drift numbers before widening the flag beyond `enabledForOrgs` — **flag still pilot-only** (`enabled: false`, `enabledForOrgs: [8cfa606a-…]`).

---

### 0.15 Rev 9 — V12 week restate (2026-09-25)

#### After (locked periods + snaps)

| week | `driver_share` / `postedDriverShare` | `total_spend` | statement rows in `settledEntries` | notes |
|---|---|---|---|---|
| Aug 3 | **$5,364.87** | **$32,204.80** | 0 of 13 remaining | −$749.64 vs pre-restate; DFP `fuel_deduction` $5,364.87 |
| Aug 10 | **$13,608.12** | **$47,088.80** | 0 of 12 (removed 5) | −$4,334.48; DFP $13,608.13 |
| Aug 17 | **$13,281.93** | **$41,500.00** | 0 of 10 (removed 4) | −$4,800.70; DFP $13,281.93 |
| Aug 24 | **$5,304.82** | **$34,996.60** | 0 (unchanged) | **No full path** — ops-only spend $34,996.60 already matched snap; no statement-sourced wallet deductions; DFP re-closed after calendar cascade |

Wallet: statement+reversal net still **$0**; ops deductions intact.

#### Aug 24 disposition

Read-only compare: period/snap `total_spend` = ops-ish week spend **$34,996.60**; `driver_share` = DFP `fuel_deduction` **$5,304.82**. Left **locked**. Did not reuse `scripts/rev4-stage0-heal-2026-08-24.ts`.

#### Sep 14–20 — not closed (operator)

Preconditions held: Rev 4 live; adopt flag **pilot-only**; adopted ops `2f809b08-c27b-4c40-b8da-c8e28e8e1553` ($4,000, `fillOrigin: statement_adopted` ← `d1e8f425-…`); period `open`; **no Sep Fuel Deduction txs yet**.

**Why Close Week was not forced:** Week Reconciliation (roamfleet.co) shows Sep 14 outstanding with **data quality 8 flagged fills**, **fuel gaps 1 to review**, **unexplained ≈ $30,343.70**, **1 exception**, and older **Sep 7** still open ahead of it. Emergency `buildFuelPeriodSnapshots` returns `missing_category_costs` — wizard path required. Plan rule: no surgical money close.

**When ready:** Fuel → walk Sep 14 (and earlier open weeks as needed) → Finalize/lock → Close Week. Verify **exactly one** Fuel Deduction for the $4,000 sourced from ops `2f809b08-…`, never statement `d1e8f425-…`.

---

## 1. How a gas card fill is logged today

There are exactly **two** ways a gas-card fill enters the system, and neither of them carries money.

### 1a. Driver portal claim

The driver photographs the odometer at the pump and picks Gas Card as the payment method. Gates, shared by driver and admin ([gasCardCreateGates.ts:16-38](apps/fleet/src/utils/gasCardCreateGates.ts#L16-L38)):

1. an **Active** card assigned to the vehicle/driver in Card Inventory,
2. odometer reading `> 0`,
3. an odometer **photo**,
4. a **verified station** selected from the Dominion list.

The row it writes ([buildGasCardOdometerAnchor.ts:28-78](apps/fleet/src/utils/buildGasCardOdometerAnchor.ts#L28-L78)):

```
amount:               0                  ← no money
liters:               (absent)           ← no volume
odometer:             <real reading>
entryMode:            'Anchor'
paymentSource:        'Gas_Card'
entrySource:          'driver-portal'
reconciliationStatus: 'Pending'
metadata.awaitingCardStatement: true
metadata.countsInFuelSpend:     false
metadata.countsInFuelVolume:    false
```

This row is an **odometer anchor**, not a fill. It contributes distance to the cycle engine and nothing to spend.

### 1b. Admin "Add fuel" modal

Same builder, `entrySource: 'admin-manual'` ([FuelLogModal.tsx:458](apps/fleet/src/components/fuel/FuelLogModal.tsx#L458), [:596](apps/fleet/src/components/fuel/FuelLogModal.tsx#L596)).

**There is no admin path that types in a gas-card amount.** By design — the CSV is the money source of truth. This is the single most important constraint on any fix: *nothing in the system can currently create a gas-card fill that carries money without a statement row behind it.*

Split card+cash fills follow the same rule — the cash half is derived as `pump − card` once the statement lands ([fuel_split_fill.ts](supabase/functions/_fleet-server/fuel_split_fill.ts), and see `docs/fuel-split-statement-derived-audit.md`).

---

## 2. How the Dominion CSV works

### 2a. Parse and classify

[jaaRawFuelCsvParser.ts](apps/fleet/src/utils/jaaRawFuelCsvParser.ts) (mirrored in `apps/admin`). Header sniff is `CARD_CODE` + `TRANS_DATE` + `AMOUNT|DISPLAY_FUEL_AMOUNT` ([:136-140](apps/fleet/src/utils/jaaRawFuelCsvParser.ts#L136-L140)).

Every row is classified into one of three kinds ([classifyJaaRawRow :97-134](apps/fleet/src/utils/jaaRawFuelCsvParser.ts#L97-L134)):

| kind | rule | counts in spend |
|---|---|---|
| `declined` | RESPONSE contains INVALID / DECLIN / DENIED / REJECT / LIMIT EXCEEDED; or a real merchant with an amount but zero fuel | **no** |
| `fee` | issuer fee vendors, or `(None)` fuel type with zero fuel | **no** |
| `approved_fuel` | quantity > 0 or fuel amount > 0 (includes `APPR-NEAR COMPANY CREDIT LIMIT`) | **yes** |

The two `$7,001.70 · INVALID DRIVER ID` / `GAS BUDGET EXCEEDED` rows at 20:36 and 20:37 in the screenshot classify as `declined` and are correctly excluded. The `$4,000` at 20:41 classifies as `approved_fuel`. The classifier is working.

### 2b. Trust boundary

Explicit and well-drawn. From JAA: card code, money, station, response, receipt. **Ignored as noise:** `DRIVER_NAME`, `LICENSE_NUMBER`, `MILEAGE`, `DRIVER_REFERENCE_NUMBER` ([:248-251](apps/fleet/src/utils/jaaRawFuelCsvParser.ts#L248-L251), [:270-273](apps/fleet/src/utils/jaaRawFuelCsvParser.ts#L270-L273)).

Roam identity is resolved from **Roam's own** card inventory:
- `vehicleId` ← `matchedCard.assignedVehicleId`
- `driverId` ← `driverIdAtCardTime(card, transactionTime)` — the holder **at statement time**, not the live assignee, so a mid-week handoff attributes correctly ([:275-282](apps/fleet/src/utils/jaaRawFuelCsvParser.ts#L275-L282)).
- `odometer: null` — JAA `MILEAGE` is never trusted.

### 2c. The statement ledger row

Each parsed row becomes a `fuel_entry` ([:257-312](apps/fleet/src/utils/jaaRawFuelCsvParser.ts#L257-L312)):

```
type:                 'Card_Transaction'
entryMode:            'Floating'          ← no odometer
paymentSource:        'Gas_Card'
entrySource:          'fuel-card'
usageCategory:        'ride'              ← HARDCODED
reconciliationStatus: approved_fuel ? 'Pending' : 'Archived'
metadata.importSource:      'jaa_raw'
metadata.jaaRowKind:        approved_fuel | fee | declined
metadata.jaaReceiptNumber:  ZZ0029119109  ← dedupe key
metadata.jaaImportId:       <batch id>    ← rollback key
metadata.countsInFuelSpend: isApprovedFuel
```

`isJaaStatementLedgerRow()` ([jaaStatementLedger.ts:18-24](packages/roam-shared/src/fuel/jaaStatementLedger.ts#L18-L24)) identifies these by `importSource ∈ {jaa_raw, jaa_statement_details, fuel_statement}`, or any `jaaRowKind` on a non-portal row.

Dedupe on re-import is by `RECEIPT_NUMBER`, collected **from statement rows only** so a matched driver log carrying the receipt doesn't block re-import ([:80-92](packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts#L80-L92)).

### 2d. The matcher

[matchJaaStatementToDriverLogs :170-286](packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts#L170-L286). Scores each statement row against each unlinked driver gas-card log:

| signal | score |
|---|---|
| same `cardId` | +50 |
| different `cardId` | −40 |
| statement has card, log doesn't, but vehicle owns that card | +45 |
| vehicle match | +35 |
| vehicle mismatch | −25 |
| within 15 min | +45 |
| within 2 h | +35 |
| within 36 h | +15 |
| beyond 36 h | −35 |
| log flagged `awaitingCardStatement` | +5 |

Accept threshold **≥ 55**. Top two within 10 points → `ambiguous`, not applied. Outcomes: `matched`, `ambiguous`, `unmatched_statement`, `unmatched_driver`.

### 2e. Applying a match

[applyFuelMatchLinks :292-428](packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts#L292-L428), server mirror [fuel_jaa_match.ts:29-165](supabase/functions/_fleet-server/fuel_jaa_match.ts#L29-L165). Money flows **statement → log**, identity flows **log → statement**:

- statement gains: `driverId`, `vehicleId`, `odometer`, odometer photo, `entryMode: 'Anchor'`, `jaaMatchedDriverEntryId`
- log gains: `amount`, `liters`, `pricePerLiter`, `jaaReceiptNumber`, `jaaResponse`, `jaaFuelType`, `jaaMatchedStatementId`
- log flips `awaitingCardStatement: false`, `countsInFuelSpend: true`
- both become `reconciliationStatus: 'Verified'`
- `persistFuelMatchPair` then re-stamps cycle metadata and auto-attaches the verified station when the merchant is unique ([fuel_jaa_match.ts:205-368](supabase/functions/_fleet-server/fuel_jaa_match.ts#L205-L368))

That is what produced the `Matched` badge on the 9/15 `$5,343.70` row.

---

## 3. The dual-ledger rule

This is the spine of the whole design, and it is the reason the $4,000 is invisible:

> **Card Inventory owns statement rows. Transaction Logs owns driver/admin fills. A statement row is never an ops row.**

Enforced in every engine:

| surface | enforcement |
|---|---|
| Transaction Logs table | [FuelLogTable.tsx:377](apps/fleet/src/components/fuel/FuelLogTable.tsx#L377) — `if (isJaaStatementLedgerRow(entry)) return false` |
| Logs KPI tiles | [fuelLogSummaryCore.ts:195](apps/fleet/src/utils/fuelLogSummaryCore.ts#L195) + edge mirror [fuel_log_summary.ts:185](supabase/functions/_fleet-server/fuel_log_summary.ts#L185) |
| ops eligibility | [fuelOpsEligibility.ts:55-57](packages/fuel-core/src/fuelOpsEligibility.ts#L55-L57) — `isFuelOpsLogEntry = !isJaaStatementLedgerRow` |
| cycle / tank engine | [fuelCycleEngine.ts:29](packages/fuel-core/src/fuelCycleEngine.ts#L29) |
| cycle snapshots | [fuel_cycle_snapshot.ts:103](supabase/functions/_fleet-server/fuel_cycle_snapshot.ts#L103) |
| odometer deltas | [fuelLogSummaryCore.ts:152](apps/fleet/src/utils/fuelLogSummaryCore.ts#L152) |
| Card Inventory sheet | [FuelCardTransactionsSheet.tsx:176](apps/fleet/src/components/fuel/FuelCardTransactionsSheet.tsx#L176) — inverse filter, statement rows **only** |

The rule is correct and should be preserved. Money is counted once, on the ops row, after a match copies it there.

**The gap:** when no driver log exists, the copy never happens, and there is nothing downstream of the statement row. The dual ledger has no third state for "statement row with no counterpart."

---

## 4. What actually happens to the $4,000

| system | result |
|---|---|
| Card Inventory drawer | Visible. `Fuel` badge, no `Matched` badge. Counted in the card's $9,344 fuel spend. |
| Transaction Logs list | **Invisible** — filtered at `FuelLogTable.tsx:377`. |
| Logs KPIs (Fills / Spend / Imbalanced) | **Excluded** — `summarizeFuelLogEntries` drops it. Week reads "Ledger healthy". |
| Fuel Analytics, JMD/L | **Excluded** — `isFuelOpsLogEntry` false. |
| Cycle / tank / odometer chain | **Excluded**. 17.29 L of fuel physically entered the tank and no engine knows. |
| Fuel Review Queue | **Absent** — queue works on `transaction:*` rows; this is a `fuel_entry` statement row. |
| Driver accountability / fuel share | **Not applied** via the ops path. |
| Week close gates | **Nothing blocks.** No gate counts unmatched statement rows. |
| Server week seal / settlement snapshot | **Included — see F2 below.** |
| Operator notification | One transient line in the import toast: `unmatched fuel 1`. Nowhere persistent. |

Net: the money is spent, the tank is filled, and every control that would catch it either filters it out or was never told to look.

---

## 5. Findings

### F1 — Critical (design gap) · Unmatched approved statement rows have no home

There is no persistent surface, queue, count, or gate anywhere in the fleet app for `unmatched_statement`. The only place the count ever appears is a toast string ([AdminJaaGasCardsPage.tsx:425](apps/admin/src/components/admin/fuel/AdminJaaGasCardsPage.tsx#L425), [:489](apps/admin/src/components/admin/fuel/AdminJaaGasCardsPage.tsx#L489)) and a transient panel rendered only immediately after an import ([JaaFuelMatchReview.tsx](apps/fleet/src/components/fuel/JaaFuelMatchReview.tsx), mounted only at [ImportsPage.tsx:2962](apps/fleet/src/components/imports/ImportsPage.tsx#L2962), [:3025](apps/fleet/src/components/imports/ImportsPage.tsx#L3025)). Refresh the page and the finding is gone forever.

Compare Card Inventory, which has a real queue (`jaa_unmatched:*`, [fuel_controller.tsx:447-519](supabase/functions/_fleet-server/fuel_controller.tsx#L447-L519)) — but that queue is for a **different** problem: a `CARD_CODE` that matches no Roam card. A known card with an unlogged fill never reaches it.

### F2 — Critical (money) · Statement rows reach the server settlement snapshot unfiltered

[`loadWeekFuelEntries`](supabase/functions/_fleet-server/fuel_period_build_snapshots.ts#L46-L59) selects **all** `fuel_entry:*` rows in the week with status `Pending` or `Verified`. It does **not** filter statement rows.

[`entryCountsInSpend`](packages/fuel-core/src/weekSnapshotEngine.ts#L16-L23) checks `jaaRowKind ∈ {fee, declined}`, `awaitingCardStatement`, `countsInFuelSpend`, `amount > 0` — but **not** `isJaaStatementLedgerRow`.

An `approved_fuel` statement row satisfies every condition: `countsInFuelSpend: true`, `jaaRowKind: 'approved_fuel'`, no `awaitingCardStatement`, `amount > 0`, `paymentSource: 'Gas_Card'`, `driverId` hydrated from assignment history. It lands in `gasCardSpend` via [partitionWeekSnapSpend :32-38](packages/fuel-core/src/weekSnapshotEngine.ts#L32-L38).

Two consequences:

**(a) Double count on every matched pair.** After a match, the statement row *and* the driver log both hold the same `amount`, both are `Verified`, both have `countsInFuelSpend: true`. `loadWeekFuelEntries` returns both. The 9/15 `$5,343.70` fill can be counted as $10,687.40 of gas-card spend in the server-built snapshot.

**(b) Silent settlement of unmatched rows.** The $4,000 settles against Kenny with no odometer, no station verification, no review, and no UI trace.

Reached by `buildFuelPeriodSnapshotsFull` ([fuel_week_engine.ts:199](supabase/functions/_fleet-server/fuel_week_engine.ts#L199)), whose engine mode defaults to `"full"` ([:33-36](supabase/functions/_fleet-server/fuel_week_engine.ts#L33-L36)), called from [fuel_week_seal.ts:54](supabase/functions/_fleet-server/fuel_week_seal.ts#L54) and [fuel_period_routes.ts:2439](supabase/functions/_fleet-server/fuel_period_routes.ts#L2439), [:2552](supabase/functions/_fleet-server/fuel_period_routes.ts#L2552).

> ~~This is a **code-path reading, not a runtime reproduction.** Confirm against a real sealed week before treating the double-count as live. The client finalize path ([fuelFinalizeWeekSnapAdapter.ts](apps/fleet/src/utils/fuelFinalizeWeekSnapAdapter.ts)) is fed from a report whose `settledEntries` come from ops-filtered data and is not affected.~~
>
> **CORRECTION (Rev 4).** The struck sentence was wrong, and the error mattered. The client finalize path was **not** ops-filtered: `fuelFinalizeService` built its week list from `entriesBelongingToDriverWeekReport`, which has no statement filter, and `entriesToWeekSnapEntries` dropped `metadata` so the Phase 0 guard was blind there anyway. Clearing that path in Rev 1 is why phase 0 only fixed the server builder and left both real writers live. The sealed-week check (§9 Q5) then found **$9,135.19 of duplicate deductions already posted to a real driver**, every one of them through the client path this note declared safe. Full account in §0.7.
>
> Lesson: "fed from ops-filtered data" was an inference from a call-site name, not a traced one. Money paths get traced to the writer.
>
> **This must be fixed before any adoption feature ships.** Adoption creates a second row holding the same amount; if both are counted, adopting doubles the week.

**Fix:** add `if (isJaaStatementLedgerRow(e)) return false` to `loadWeekFuelEntries`, and add the same guard to `entryCountsInSpend` as belt-and-braces (the engine should be safe regardless of what a caller hands it).

### F3 — High · No statement-vs-logs money control exists

Nothing anywhere compares "approved fuel on the card statement for card C in week W" against "gas-card spend booked in Transaction Logs for card C in week W." The screenshots show $9,344 on one side and no cross-check on the other. The identity that *should* hold:

```
Σ statement.amount where jaaRowKind = 'approved_fuel'
  ≡
Σ ops_fill.amount where paymentSource = 'Gas_Card' and countsInFuelSpend
```

per card, per week. Any drift is, by definition, either an unlogged fill or a double count. This is the control that would have caught the $4,000 on the day the CSV landed.

The Settlement and Fuel Reconciliation audits already established the pattern — persist the drift, block close on it. The same treatment applies here.

### F4 — High · Deleting a CSV import orphans its matched driver logs

[`purgeFuelEntriesWhere`](supabase/functions/_fleet-server/fuel_controller.tsx#L669-L697) deletes every `fuel_entry` with `metadata.jaaImportId === id`. That deletes statement rows. It does **not** touch driver logs that were matched to them.

After a rollback those logs keep `jaaMatchedStatementId` pointing at a deleted row, keep `jaaReceiptNumber`, and keep the `amount` copied from a statement that no longer exists — a fill with money and no money-source. Re-importing the same CSV then recreates the statement row, and `collectJaaStatementReceiptNumbers` (which reads statement rows only) sees no duplicate, so the matcher runs again against a log that already holds the money.

Structurally the same class of defect as the toll `toll_usage` orphan events. Any adoption feature makes it worse, because adopted rows exist *only* because of a statement row.

### F5 — Medium · A statement row can have no resolvable driver

`driverIdAtCardTime` returns `undefined` if the card was unassigned at the transaction moment ([jaaRawFuelCsvParser.ts:275-282](apps/fleet/src/utils/jaaRawFuelCsvParser.ts#L275-L282)). The row then has money, a card, possibly a vehicle — and nobody to attribute it to. It cannot be matched (`unmatched_statement`) and cannot be adopted without an operator decision. The `jaa_unmatched` queue does not cover this case.

### F6 — Medium · `usageCategory: 'ride'` is hardcoded on every statement row

[jaaRawFuelCsvParser.ts:289](apps/fleet/src/utils/jaaRawFuelCsvParser.ts#L289): `usageCategory: 'ride'` with the comment "N-18: JAA gas-card fills default to ride-share usage (overrideable later)."

With the Rideshare/Delivery service-line split now live, any adopted row inherits this and silently books a delivery fill as Rideshare. Adoption must not carry the default through.

### F7 — Medium · The matcher's loose signals can mis-link, and ambiguity is invisible

- `vehicleIdsMatch` accepts `endsWith` in either direction ([:159-164](packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts#L159-L164)) — `5179KZ` matches `179KZ`.
- Card match (+50) alone clears the 55 threshold when combined with any in-window date (+15), so a statement row can link to a driver log **35 hours away** with no vehicle agreement.
- `ambiguous` pairs are computed and then discarded — same fate as `unmatched_statement` (F1). Nobody ever sees them.

A wrong link is worse than no link: money lands on the wrong fill, the wrong odometer, and the wrong driver's settlement.

### F8 — Low · Adopted rows and the `entrySource` closed set

`AUTH_SOURCES` is a closed set of five values, mirrored in two files ([fuelLogSummaryCore.ts:39-45](apps/fleet/src/utils/fuelLogSummaryCore.ts#L39-L45) and [fuel_log_summary.ts](supabase/functions/_fleet-server/fuel_log_summary.ts)). An unrecognised `entrySource` falls through to `'driver-portal'` ([:139](apps/fleet/src/utils/fuelLogSummaryCore.ts#L139)) — the KPI would credit an admin-adopted fill to the driver. Constrains the design in §6.

---

## 6. Recommended solution

### 6.1 The options

**A. Chase the driver.** Notify the driver to backfill the log, then let the matcher run. Correct when it works, but the money is already gone and the week has to close regardless. Needed as a *nudge*, insufficient as a *resolution*.

**B. Count statement rows in ops.** Flip `isFuelOpsLogEntry` to include them. **Reject.** It breaks the dual-ledger invariant, double-counts every matched pair on every surface (not just the one in F2), and feeds odometer-less Floating rows into the cycle engine.

**C. Adopt the statement row into Transaction Logs.** ✅ **Recommended.**

### 6.2 Why C — the system already has the right shape

A matched fill is a **pair**: `(statement row, ops row)`. An unlogged fill is that same pair **with the ops side missing**.

So don't invent a new row type. **Synthesize the missing ops side and run it through `applyFuelMatchLinks`** — the same function that handles every normal match. Every downstream consumer (spend, KPIs, cycle engine, settlement, review queue, service line, station heal, audit column) already knows how to handle the output, because the output is indistinguishable in shape from a normal matched pair.

The dual ledger stays intact. The statement row stays a statement row, still owned by Card Inventory, still the money truth. The adopted row is an ops row that happens to have been created by an operator instead of a driver — and says so in its provenance.

This is a deliberate "make the invariant unrepresentable" move, and it matches the lesson recorded in the settlement-close audit: don't add a parallel engine, close the missing state in the existing one.

### 6.3 The adopted row

Build it with `buildGasCardOdometerAnchor`-shaped fields, then immediately link:

```ts
// conceptual — build then link through the existing path
const adopted = {
  id:                   crypto.randomUUID(),   // NEVER reuse the statement id
  date:                 stmt.date,
  time:                 stmt.time,
  cardId:               stmt.cardId,
  vehicleId:            stmt.vehicleId,
  driverId:             resolvedDriverId,      // from statement, or operator-picked (F5)
  amount:               0,                     // applyFuelMatchLinks copies the money
  liters:               undefined,             // ditto
  odometer:             odometerIfSupplied ?? null,
  entryMode:            odometerIfSupplied ? 'Anchor' : 'Floating',
  type:                 'Manual_Entry',
  paymentSource:        'Gas_Card',
  entrySource:          'admin-manual',        // stays inside AUTH_SOURCES — see F8
  usageCategory:        undefined,             // do NOT inherit 'ride' — see F6
  reconciliationStatus: 'Pending',
  metadata: {
    awaitingCardStatement: true,               // flipped false by the link
    countsInFuelSpend:     false,              // flipped true by the link
    paymentSource:         'company_card',
    fillOrigin:            'statement_adopted',      // ← the provenance marker
    adoptedFromStatementId: stmt.id,
    adoptedBy:             userId,
    adoptedAt:             nowIso,
    adoptionReason:        operatorReason,
    odometerMissing:       odometerIfSupplied == null,
    driverAttested:        false,                    // no photo, no signature, no GPS
    // NOTE: no importSource, no jaaImportId — see 6.6
  },
};
```

Then call the existing server path:

```ts
await persistFuelMatchPair({
  status: 'matched',
  statementEntry: stmt,
  driverEntry: adopted,
});
```

This gives you, for free: money and liters copied, `pricePerLiter` computed, `jaaReceiptNumber` / `jaaResponse` / `jaaFuelType` carried over, both rows `Verified`, cycle metadata stamped, and verified-station auto-attach when the merchant is unique.

`applyFuelMatchLinks` sets `entryMode: drv.odometer != null ? 'Anchor' : stmt.entryMode` — with no odometer supplied the adopted row stays `Floating`, which is truthful: it is a fill that contributed fuel but no distance reading.

### 6.4 The odometer question — be honest about the cost

An unlogged fill means **the odometer reading at that pump is gone forever**. No adoption scheme recovers it. What adoption can do is make the gap explicit instead of silent:

- **Odometer optional at adoption.** If the operator can source it (a later trip, telematics, asking the driver), supply it → `entryMode: 'Anchor'`, and the cycle engine gets its distance back.
- **Without it** → `Floating` + `metadata.odometerMissing: true`. The week snapshot already has the right mechanism: `unattributedFillCost` — *"N-2: no-odometer fill spend carved before residual"* ([weekSnapshotEngine.ts:88](packages/fuel-core/src/weekSnapshotEngine.ts#L88)). Route adopted odometer-less spend there so it lands in a named bucket rather than distorting the leakage residual.
- Do **not** infer the odometer from JAA `MILEAGE`. The trust boundary in §2b is correct; don't erode it for convenience.

Expect the odometer chain to degrade. That is the real, unavoidable cost of an unlogged fill, and the UI should say so on the adopted row rather than hiding it.

### 6.5 Where it surfaces — the missing queue

Add a persistent **"Unlinked Card Charges"** surface. Name it that way in the UI for consistency with the toll system's "Unlinked Refunds" (backend keeps `unmatched_statement`; the UI/backend naming split there is deliberate and established).

**Detection predicate** — no new table needed, this is a query over existing rows:

```
isJaaStatementLedgerRow(e)
  && e.metadata.jaaRowKind === 'approved_fuel'
  && !e.metadata.jaaMatchedDriverEntryId
  && !e.metadata.adoptionDismissedAt
  && Number(e.amount) > 0
  && org-scoped, week-scoped
```

**Placement:** a chip on Transaction Logs beside `Unattributed (0)` — `Unlinked card charges (1)` — that swaps the table into statement-row mode. Same pattern the `Unattributed` chip already uses ([FuelLogToolbar.tsx:127-139](apps/fleet/src/components/fuel/logs/FuelLogToolbar.tsx#L127-L139)). This puts the finding where an operator already looks, instead of in Imports where they look once.

**Row actions:**

| action | effect |
|---|---|
| **Adopt into logs** | §6.3. Requires reason + service line. Odometer optional. |
| **Link to existing log** | Manual override when the matcher scored < 55 or called it `ambiguous`. Runs `persistFuelMatchPair` on the operator's chosen pair. Also resolves F7. |
| **Dismiss** | Non-fuel, wrong card, disputed with the issuer. Sets `adoptionDismissedAt` + `adoptionDismissedReason` + `countsInFuelSpend: false`. Never deletes — the row stays as audit trail. |
| **Request driver log** | The F1a nudge. Notify the driver; leaves the row open. |

Surface the `ambiguous` pairs in the same queue (F7) — they are the same class of unresolved statement row.

### 6.6 Guardrails

1. **Never reuse the statement row's id**, and **never** stamp `importSource: 'jaa_raw'` or `jaaImportId` on the adopted row. `purgeFuelEntriesWhere` deletes by those keys (F4) — an adopted row carrying them would be silently destroyed by a CSV rollback.
2. **Fix F4 first, or at minimum extend it:** when a statement row is purged, the rows that reference it via `jaaMatchedStatementId` / `adoptedFromStatementId` must be unlinked and have their copied money reversed. An adopted row whose statement parent is deleted is a fill with no money-source at all. Consider refusing to delete an import batch that has adopted children, and requiring explicit un-adoption first.
3. **Idempotent.** A statement row is adoptable exactly once. Guard on `jaaMatchedDriverEntryId` already being present — reject with 409, don't create a second row.
4. **Period lock.** Refuse adoption into a sealed/closed week. Evaluate the refusal **before** any write. The Stop-to-Stop audit left "no period-lock check on the charge path" open; don't repeat it here. If the week must be corrected, that goes through the existing re-finalize path.
5. **Permission + reason.** Adoption creates driver settlement exposure — it is a money action. Gate on `fuel.edit_entry` at minimum; a dedicated `fuel.adopt_statement` is better because it can be granted separately from ordinary log edits. Require a free-text reason, persisted.
6. **Approved fuel only.** Never adopt a `fee` or `declined` row. The classifier is reliable (§2a); trust it and hard-block the others.
7. **Service line must be chosen, not defaulted** (F6). Either ask at adoption, or leave `usageCategory` unset so the existing `Unattributed` chip and Review Queue pick it up. Prefer leaving it unset — it reuses a control that already exists rather than adding a second place to get it wrong.
8. **Mark it visibly.** An adopted row has no GPS, no signature, no odometer photo. The `Audit` column (`GPS · Sig · Odo`) should render that honestly, and the row should carry a distinguishable badge — e.g. `Statement adopted` alongside the existing `Admin Edit` badge. An operator scanning the table must be able to tell at a glance which fills a human actually attested.

### 6.7 The reconciliation control (F3)

Ship this **with** adoption, not after. Adoption without it just moves money around; the control is what proves the books balance afterwards.

Per card, per week:

```
statementFuelTotal = Σ amount  where isJaaStatementLedgerRow
                                 && jaaRowKind === 'approved_fuel'

opsGasCardTotal    = Σ amount  where !isJaaStatementLedgerRow
                                 && isGasCardFuelEntry
                                 && countsInFuelLogSpend

drift = statementFuelTotal − opsGasCardTotal
```

- `drift === 0` → the card reconciles.
- `drift > 0` → unlogged/unadopted fills of exactly that value. Enumerable, because the unlinked rows are exactly the ones in the §6.5 queue.
- `drift < 0` → a double count or a manual gas-card row with no statement behind it. Also worth catching.

Persist the drift on the week record and **block close** on `|drift| > ε`, with the open rows listed as the blocker detail. This is the same shape the settlement and fuel-reconciliation work already uses, and the lesson from the settlement audit applies directly: *an SQL check is only as good as the writers that maintain its input* — so the drift must be recomputed at close time from live rows, never read from a cached field.

Render it in the Card Inventory drawer next to the existing `FUEL SPEND $9344` tile: `$9,344 statement · $5,344 in logs · $4,000 unlinked`. In the screenshots that tile currently shows $9,344 with no indication that $4,000 of it is unaccounted for.

---

## 7. Implementation order

Each phase is independently shippable and each one leaves the system better than it found it.

> **Rev 2: all 7 phases are implemented.** See §0.1 for what landed and §0.3 for what is still open. The table below is kept as the original rationale for the sequencing.

| # | Phase | Why here |
|---|---|---|
| **0** | **Fix F2.** Filter statement rows out of `loadWeekFuelEntries`; add the `isJaaStatementLedgerRow` guard to `entryCountsInSpend`. Golden test: a matched pair contributes its amount exactly **once** to `gasCardSpend`. | Blocking. Adoption doubles the week until this is done. |
| **1** | **Visibility, no writes.** Detection predicate + `Unlinked card charges (N)` chip + statement-row table mode. Read-only. | Immediate value — the $4,000 becomes visible today. Zero money risk. |
| **2** | **The drift control (F3).** Compute per card/week, persist, show in the Card Inventory drawer. Report only, do not block close yet. | Quantifies the problem across all history before anyone acts on it. Tells you how big the backlog is. |
| **3** | **Adopt + Link + Dismiss actions.** §6.3 + §6.6 guardrails. Feature-flagged off. | The actual fix. Flag off until phase 2 data says the drift is understood. |
| **4** | **Fix F4** — statement purge must unlink/reverse its children; refuse purging batches with adopted children. | Must land before adoption is enabled for real, or a rollback corrupts money. |
| **5** | **Arm the close gate.** `|drift| > ε` blocks week close, listing the open rows. | Only once adoption exists as the escape hatch — otherwise you gate a week with no way to clear it. |
| **6** | **Tighten the matcher (F7).** Drop the `endsWith` vehicle fuzz, require vehicle *or* tight-time agreement alongside the card match, surface `ambiguous` in the same queue. | Lower urgency once the queue exists, because a mis-link is now visible and reversible. |
| **7** | **Driver nudge.** Notify on an unlinked charge against the driver's card. | Reduces inflow. Optional. |

---

## 8. Test plan

> **Rev 2 status:** the Phase 0 block is **written and passing**. The detection block is covered by `jaaUnlinkedCardCharge.test.ts` (3 tests). The **Adoption**, **Rollback safety** and **Drift control** blocks are **not yet written** — see V4. The two Drift-control states proven broken in V3 belong in that block as regression tests.

**Phase 0 (must pass before anything else):** ✅ done — [weekSnapshotEngine.test.ts](packages/fuel-core/src/weekSnapshotEngine.test.ts)
- Matched pair (statement + driver log, same amount) → `gasCardSpend` counts it once, not twice.
- Unmatched approved statement row → contributes **zero** to the week snapshot.
- `fee` and `declined` rows → zero, unchanged.

**Detection:**
- Approved, unmatched, unadopted, >$0 → appears in the queue.
- Matched → absent.
- Fee / declined → absent.
- Dismissed → absent.
- Org scoping: another org's rows never appear.

**Adoption:**
- Adopt → exactly one new `fuel_entry`; `Fills` +1; `Spend` +$4,000; card drift → $0.
- Adopt twice → second call 409s, no second row.
- Adopt into a sealed week → refused **before** any write (assert no partial rows exist after the refusal).
- Adopt without a reason → refused.
- Adopt a `fee` or `declined` row → refused.
- Adopt without permission → 403.
- Adopt with odometer → `entryMode: 'Anchor'`, cycle engine picks up the distance.
- Adopt without odometer → `Floating`, `odometerMissing: true`, spend lands in `unattributedFillCost`.
- Adopted row resolves to `entrySource: 'admin-manual'` in `resolveFuelEntrySourceCore` — **not** `driver-portal` (F8).
- Adopted row has no `usageCategory` → appears under the `Unattributed` chip (F6).

**Rollback safety (F4):**
- Delete the CSV import that owns an adopted row's statement parent → the adopted row is unlinked and its money reversed (or the delete is refused). Assert no fill survives holding money from a deleted statement.
- Re-import the same CSV afterwards → no duplicate statement row, no double link.

**Drift control:**
- Card with one unlogged fill → drift = that amount exactly.
- After adopting it → drift = 0.
- Drift is recomputed from live rows at close time, not read from cache.
- `|drift| > ε` blocks close and names the open rows.

**Regression — the dual ledger must survive:**
- Statement rows still absent from Transaction Logs, KPIs, Analytics, cycle engine.
- Card Inventory drawer still shows statement rows only.
- Normal driver-log → CSV → match flow unchanged end to end.

---

## 9. Open questions for the owner

1. **Backlog size.** How many unmatched `approved_fuel` rows exist across all history? Phase 2 answers this. It decides whether adoption needs a bulk path or stays one-at-a-time.
2. **Does an adopted fill hit the driver's fuel share?** Argument for: the fuel went into the vehicle, the share rule should apply. Argument against: the driver never attested it and can dispute it. Recommendation — apply the normal share, but mark `driverAttested: false` so a dispute has grounds. This is a policy call, not a technical one.
3. **Who adopts?** Fleet operator, or platform staff only? The CSV is uploaded by Roam (per the Card Inventory copy: *"Statement CSV for Roam Fuels cards is uploaded by Roam"*), which argues for platform staff. But the fleet operator is the one who knows whether the fill was real.
4. **Retroactive adoption into closed weeks.** Refuse outright, or route through re-finalize? Guardrail 4 assumes refuse. Confirm that matches how you want historical corrections handled.
5. **F2 severity.** Confirm against a real sealed week whether the double count is live in production before deciding how urgently phase 0 ships.
   → **Rev 2:** phase 0 has shipped, so new closes are safe. The question that remains is **remediation of weeks already sealed** under the old code — those snapshots were frozen with the double count baked in and phase 0 does not retroactively correct them. Worth a one-off query: for each sealed week, recompute `gasCardSpend` with the fix and compare to the frozen `totalGasCardCost`.

---

## Appendix — file map

| concern | file |
|---|---|
| CSV parse + classify | [apps/fleet/src/utils/jaaRawFuelCsvParser.ts](apps/fleet/src/utils/jaaRawFuelCsvParser.ts) (mirror: `apps/admin/src/utils/`) |
| statement-row identity | [packages/roam-shared/src/fuel/jaaStatementLedger.ts](packages/roam-shared/src/fuel/jaaStatementLedger.ts) |
| matcher + link application | [packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts](packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts) |
| server link persist | [supabase/functions/_fleet-server/fuel_jaa_match.ts](supabase/functions/_fleet-server/fuel_jaa_match.ts) |
| gas-card claim shape | [apps/fleet/src/utils/buildGasCardOdometerAnchor.ts](apps/fleet/src/utils/buildGasCardOdometerAnchor.ts) |
| gas-card create gates | [apps/fleet/src/utils/gasCardCreateGates.ts](apps/fleet/src/utils/gasCardCreateGates.ts) |
| ops eligibility (dual ledger) | [packages/fuel-core/src/fuelOpsEligibility.ts](packages/fuel-core/src/fuelOpsEligibility.ts) |
| Logs KPIs | [apps/fleet/src/utils/fuelLogSummaryCore.ts](apps/fleet/src/utils/fuelLogSummaryCore.ts) + edge mirror [fuel_log_summary.ts](supabase/functions/_fleet-server/fuel_log_summary.ts) |
| Logs table filter | [apps/fleet/src/components/fuel/FuelLogTable.tsx](apps/fleet/src/components/fuel/FuelLogTable.tsx) |
| Card Inventory drawer | [apps/fleet/src/components/fuel/FuelCardTransactionsSheet.tsx](apps/fleet/src/components/fuel/FuelCardTransactionsSheet.tsx) |
| week snapshot money | [packages/fuel-core/src/weekSnapshotEngine.ts](packages/fuel-core/src/weekSnapshotEngine.ts) |
| server snapshot build | [supabase/functions/_fleet-server/fuel_period_build_snapshots.ts](supabase/functions/_fleet-server/fuel_period_build_snapshots.ts), [fuel_week_engine.ts](supabase/functions/_fleet-server/fuel_week_engine.ts) |
| week close gates | [supabase/functions/_fleet-server/fuel_week_closable_gate.ts](supabase/functions/_fleet-server/fuel_week_closable_gate.ts) |
| CSV import / rollback routes | [supabase/functions/_fleet-server/fuel_controller.tsx](supabase/functions/_fleet-server/fuel_controller.tsx) L378–L780 |
| admin JAA import UI | [apps/admin/src/components/admin/fuel/AdminJaaGasCardsPage.tsx](apps/admin/src/components/admin/fuel/AdminJaaGasCardsPage.tsx) |
| fleet self-serve import UI | [apps/fleet/src/components/imports/ImportsPage.tsx](apps/fleet/src/components/imports/ImportsPage.tsx) |
