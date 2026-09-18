# Fuel Split Payment (Gas Card + Cash) — Implementation Audit

**Status:** Built and verified in the working tree — **not yet deployed.** See §9 for the post-implementation review.
**Date:** 2026-09-18 (audit), 2026-09-18 (implementation review)
**Scope:** Adding a third fuel payment option where one fill is paid partly by company gas card and partly by driver cash.

> **Two items block production:** the `fleet-fuel` edge bundle is stale, so `/fuel/split-fill` is not deployed (§9.3-A); and the endpoint enforces RBAC but not the `fuelSplitPayment` module flag (§9.3-B). Detail in §9.

---

## 1. Executive summary

**Do not add a third payment source enum value.** Add a *split fill* that writes **two rows through the two flows that already exist**, linked by a shared `fillGroupId`.

The headline finding: the backend was already written with this case in mind. `supabase/functions/_fleet-server/fuel_soft_dedup.ts` contains, verbatim:

> ```
> // Dual payment at the same pump (cash + card) must stay as two ledger rows.
> ```
> — `fuel_soft_dedup.ts:114`

and in its header:

> ```
> // Treating paymentSource === Gas_Card as "CSV" caused Known fills to silently collapse
> // onto a nearby RideShare Cash fill at the same odometer (same pump stop, two payment methods).
> ```
> — `fuel_soft_dedup.ts:6-8`

The de-duplication guard that keeps two same-odometer, same-minute rows alive when their payment keys differ (`fuel_soft_dedup.ts:117`) is *already* the load-bearing piece for this feature. The recommended design is the one the codebase was bent toward.

The consequence is that the driver's workflow barely changes (one extra button, one extra number), and **the entire money layer — settlement, reimbursement, driver-share deduction, week reports — needs zero changes.**

---

## 2. How fuel logging works today

### 2.1 The two paths diverge immediately

Both start identically: odometer scan → GPS lock → `method_select`. They split at `handleMethodSelect` (`apps/driver/src/components/fleet/DriverExpenses.tsx:1294`).

| | **Gas Card** | **Cash** |
|---|---|---|
| View state | `gas_card_details` | `entry_details` |
| Pump photo | **Not required** | **Required** |
| Amount at log time | **None — always `0`** | Pump "This Sale" total |
| Liters at log time | **None** | Typed/OCR'd from pump |
| Writes | a `fuel_entry` | a `FinancialTransaction` |
| Amount known when? | **Later, via Dominion CSV** | **Immediately** |

The UI states this outright: *"Company fuel card — odometer only (no pump photo)"* (`PaymentMethodSelector.tsx:33`).

### 2.2 Gas Card path — the "anchor"

`DriverExpenses.tsx:804-829` writes a `fuel_entry` that is deliberately a **placeholder with no money in it**:

```ts
amount: 0,
odometer: fuelEntry.odometerReading,
type: 'Manual_Entry',
entryMode: 'Anchor',
paymentSource: 'Gas_Card',
entrySource: 'driver-portal',
reconciliationStatus: 'Pending',
metadata: {
  awaitingCardStatement: true,
  countsInFuelSpend: false,
  countsInFuelVolume: false,
}
```

The anchor's job is to capture **odometer + time + card + vehicle** — the identity of the fill — so the Dominion statement row can later be attached to a real, GPS-stamped, photo-backed event.

> ⚠️ **Naming collision to be aware of.** `entryMode: 'Anchor'` (awaiting statement) is an entirely different concept from `classifyAnchor()` in `packages/fuel-core/src/fuelAnchorLogic.ts`, which means *tank-capacity cycle close*. They are unrelated. Do not let them touch during implementation.

### 2.3 Cash path — the transaction

`DriverExpenses.tsx:590-651` (`constructTransactionPayload`) builds a `FinancialTransaction` with a **negative** amount, `paymentMethod: 'RideShare Cash'`, `metadata.paymentSource: 'rideshare_cash'`, plus liters and a derived `$/L` (`total ÷ liters`, never typed from the station board — `FuelCashInputs.tsx:21-27`).

The cash transaction does **not** stay alone. On approval, `supabase/functions/_fleet-server/fuel_posted_guarantee.ts` enforces:

> *"Posted = Approved fuel transaction + linked fuel_entry (inseparable)."*

So a cash fill ends up as a transaction **and** a linked `fuel_entry`, kept in step by `syncLinkedExpenseTransaction`. **This is important:** both payment types already converge on `fuel_entries`. A two-row split is therefore two `fuel_entries` rows, which is exactly what every downstream money consumer reads.

### 2.4 The Dominion/JAA statement match

`packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts` scores candidate anchors on **card (50) + vehicle (35) + time proximity (15–45)**, requiring ≥ 55 to match (`:245`).

**Amount is not part of the score.** This is the single most important fact enabling this feature: *a partial card amount will not break statement matching.* The matcher then overwrites the anchor (`:328-329`):

```ts
amount: stmt.amount,
liters: stmt.liters ?? drv.liters,
```

The statement is authoritative for the card amount. Always.

### 2.5 The money layer reads whole rows

This is the constraint that kills the "one row" designs:

```ts
// apps/fleet/src/utils/fuelPaidByDriver.ts:104-106
.filter(isOutOfPocketFuelEntry)
.filter(countsInFuelLogSpend)
.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
```

`sumPaidByDriverForReport` and `sumGasCardSpendForReport` both sum **`e.amount` for the whole row**. There is no concept anywhere of "part of this row's amount". And `packages/fuel-core/src/fuelPaymentSource.ts:140-152` enforces a strict XOR:

```ts
if (gas && !oop) return 'gas_card';
if (oop && !gas) return 'out_of_pocket';
return 'unclassified';   // ← a split row lands here and silently falls out of every total
```

### 2.6 Settlement branches per row

`apps/fleet/src/services/settlementService.ts:226-250` — the two payment types produce **structurally different money moves**:

- **Gas card** → deduct driver's share only (company already paid the merchant).
- **Cash** → reimburse the driver in full, *then* deduct the driver's share.

A single row cannot express both. Two rows express both perfectly, **using code that already exists and is already correct.**

---

## 3. Options considered

### ❌ Option A — third enum value (`Gas_Card_And_Cash`)

Add a fourth/fifth value to `FuelPaymentSourceEnum`.

**Rejected.** It breaks the XOR partition at `fuelPaymentSource.ts:140`, so every split row classifies as `'unclassified'` and **silently vanishes from both spend tiles**. It forces edits to ~10 consumers (`settlementService`, `fuelLedgerIntegrity`, `fuelLogSummaryCore`, `fuelOpsEligibility`, `buildFuelWizardRows`, week snapshot engine, …), and `settlementService` still cannot emit two different money moves from one row. Highest blast radius, on the code the business trusts most.

### ❌ Option B — one row, sub-amounts in metadata

Keep one row; store `{cardAmount, cashAmount}` in `metadata`.

**Rejected.** Every money consumer reads top-level `amount` (§2.5). Amounts hidden in `metadata` are invisible to all of them, so the fill is counted **entirely** in one bucket or the other — guaranteed silent under- or over-count, with no error raised. This is the most dangerous option precisely because it looks cheap and fails quietly.

### ✅ Option C — two linked rows, one logical fill *(recommended)*

The split is **not a new payment type — it is a composition of the two flows that already exist.** Run both, once each, linked by a shared id.

Benefits: zero changes to `settlementService`, `fuelPaymentSource`, `fuelPaidByDriver`, or the week snapshot engine. Each row is cleanly one kind, so the XOR partition holds. The soft-dedup guard already protects the pair. The statement matcher already ignores amount.

---

## 4. Recommended design

### 4.1 Driver workflow (the ask: "don't change much")

1. Odometer scan — **unchanged**
2. GPS lock — **unchanged**
3. Method select — **one new button: "Gas Card + Cash"**
4. New `split_details` view: pump photo + **This Sale total** + **Liters** (identical to today's cash screen) **plus one new field**
5. Submit

**Net change for the driver: one button tap and one number.**

### 4.2 Which number to type — type the cash, derive the card

> **Capture CASH as the typed input. Derive card = total − cash.**

The rationale is an asymmetry worth stating explicitly, because it drives the whole control design:

- The **cash** figure has **no other source, ever.** If the driver doesn't record it at the pump, it is gone. It also drives a reimbursement that is owed immediately.
- The **card** figure has an authoritative source arriving later — the Dominion statement, which overwrites it anyway (`jaaFuelStatementMatcher.ts:328`).

So: **type the number that will never be corrected; derive the number that will be.** The derived card amount is a *claim*, not a fact, and §4.5 turns it into a reconciliation control rather than a liability.

Show the derived card amount on screen as confirmation ("Gas card covered: $X") so the driver can catch a typo immediately.

### 4.3 What gets written

Both rows share a `fillGroupId` (a UUID minted on the device) and carry `splitPumpTotal` so either row can self-check without loading its sibling.

**Row A — cash portion** (existing cash flow):
```ts
paymentSource: 'RideShare_Cash',
amount: <cash typed by driver>,
liters: <FULL pump liters>,      // see §4.4
metadata: {
  fillGroupId,
  splitRole: 'cash',
  splitPumpTotal: <pump total>,
  splitVolumeOwner: true,
}
```

**Row B — card anchor** (existing gas-card flow):
```ts
paymentSource: 'Gas_Card',
amount: 0,
entryMode: 'Anchor',
liters: 0,
metadata: {
  awaitingCardStatement: true,
  countsInFuelSpend: false,
  countsInFuelVolume: false,
  fillGroupId,
  splitRole: 'card',
  splitPumpTotal: <pump total>,
  splitExpectedCardAmount: <total − cash>,
  splitVolumeOwner: false,
}
```

No migration needed — `fleet.fuel_entries.payload_json` is `jsonb` (`supabase/migrations/20260811200000_fleet_schema_foundation.sql:280`).

### 4.4 Volume must have exactly one owner ⚠️

**This is the one place where the two-row model introduces a genuine new bug if not handled.**

A split tender is **one physical sale**: the pump dispensed one quantity of fuel. But it can produce liters in **two** places — the driver's pump reading (full liters) and the Dominion statement row for the card portion.

`fuelOpsLiters` (`fuelOpsEligibility.ts:72-75`) sums liters from every spend-eligible row. The matcher sets `countsInFuelVolume: Number(stmt.liters) > 0` (`jaaFuelStatementMatcher.ts:339`). So once the statement lands, **both rows would report liters and the tank-cycle engine would see more fuel than physically entered the vehicle.**

**Fix:** the cash row is the sole volume owner (`splitVolumeOwner: true`), because it carries pump truth and is never overwritten. The card anchor must hold `liters: 0` **permanently**, including after the statement match.

This requires the audit's **one required change to shared code**: guard `applyMatch` in `jaaFuelStatementMatcher.ts:328-339` so that when the driver entry has `metadata.splitVolumeOwner === false`, it forces `liters: 0` and `countsInFuelVolume: false` instead of taking `stmt.liters`. Keep the statement's liters in metadata (e.g. `splitStatementLiters`) for audit, but do not let them enter any total.

> Rejected alternative: pro-rating liters across the two rows. Fragile — stations allocate split-tender volume inconsistently — and it breaks the "pump display is truth" principle that `FuelCashInputs.tsx:21` deliberately enforces.

### 4.5 The reconciliation control

The invariant, checkable on either row alone:

```
cashRow.amount + cardRow.amount ≈ splitPumpTotal   (± tolerance)
```

Before the statement lands, `cardRow.amount` is `0` and the fill legitimately shows only the cash portion — **this is correct**, the company has not yet been charged.

When the statement lands, compare `stmt.amount` against `splitExpectedCardAmount`:

- **Within tolerance** → resolved; stamp `splitReconciled: true`.
- **Outside tolerance** → the driver's cash figure and the card's actual charge disagree. Raise to the **Fuel Review Queue** — it is the sole fuel approval gate and the right home for this. Do **not** auto-correct the cash row: it has already driven a reimbursement, and silently editing settled money is how reconciliation systems rot.

Suggested tolerance: the greater of $50 JMD or 1% of the pump total. Confirm against the rounding behaviour of real Dominion statement rows before shipping.

### 4.6 Offline — write both rows or neither ⚠️

`OfflineActionType` is currently `'SUBMIT_TRIP' | 'SUBMIT_FUEL_EXPENSE' | 'SUBMIT_GAS_CARD_ANCHOR'` (`apps/driver/src/types/offline.ts:3`). Drivers log fuel at the pump, where signal is unreliable — this path *will* be exercised.

**Do not queue the split as two independent actions.** If one syncs and the other fails, the invariant in §4.5 is permanently broken and the fill is silently half-recorded.

**Add a single `SUBMIT_SPLIT_FUEL_FILL` action** whose payload carries both rows and both photos, and which the server writes as one unit — so partial sync is impossible by construction. Make it idempotent on `fillGroupId` to survive retries.

---

## 5. What does *not* need to change

Worth stating plainly, because it is the payoff of Option C:

| Component | Change |
|---|---|
| `settlementService.ts` | **None** — each row already hits the correct branch (`:226` / `:241`) |
| `fuelPaymentSource.ts` (XOR partition) | **None** — each row is cleanly one kind |
| `fuelPaidByDriver.ts` totals | **None** — each row sums into the right tile |
| `fuel_soft_dedup.ts` | **None** — `:117` already keeps the pair apart |
| Statement matching score | **None** — amount is not scored (`:203-246`) |
| `gas_card_anchor_guard.ts` | **None** — only inspects `Gas_Card` rows; the cash row can't trip it |
| DB schema | **None** — `payload_json` is `jsonb` |

---

## 6. Risks and verification checklist

| # | Risk | Severity | Handling |
|---|---|---|---|
| # | Risk | Severity | Handling | Outcome |
|---|---|---|---|---|
| 1 | **Volume double-count** once the statement lands | **High** | §4.4 — single volume owner + `applyMatch` guard. **Must-fix.** | ✅ Closed — guard in both matcher copies (§9.1) |
| 2 | **Partial offline sync** breaks the invariant | **High** | §4.6 — one atomic queue action. **Must-fix.** | ✅ Closed — single action + compensating write (§9.2) |
| 3 | Odometer cycle engine sees two rows at the same odometer | **Medium** | Card row has 0 liters so should contribute nothing — **verify against `odometerBucketEngine` before shipping**, don't assume | ⚠️ **Still open** — see §9.3-C |
| 4 | Week straddle: cash settles week N, statement lands week N+1 | **Medium** | Arithmetically correct, but may trip the statement-vs-engine drift control that blocks week close. **Verify against the reconciliation close path.** | ✅ Closed by design — the card row is shape-identical to today's gas-card anchor, which already straddles weeks. No new behaviour for week close to handle. |
| 5 | Driver mistypes cash | Medium | §4.5 review-queue variance; on-screen derived card amount gives immediate feedback | ✅ Closed — `validateSplitCashAmounts` + `splitVariance` in the queue |
| 6 | Independent drivers see the option | Low | Gate on the existing `showGasCard` prop (`PaymentMethodSelector.tsx:12`) — no gas card, no split | ✅ Closed — `showGasCard && showSplitPayment`, passed as `isFleetDriver && fuelSplitEnabled` |
| 7 | `resolveReportGasCardSpend` residual inference (`total − driverCash`, `fuelPaidByDriver.ts:147-162`) | Low | Still holds arithmetically with split rows — confirm with a test | ✅ Holds — cash row carries all liters and the two amounts sum to the pump total (§9.1) |

**Recommendation: ship behind a feature flag** (the `fuelManagement` flag family in `apps/fleet/src/components/auth/FeatureFlagContext.tsx` is the existing convention), default **off**, and enable per-org after a week of real fills reconcile clean.

*Implemented as the `fuelSplitPayment` opt-in module — see §9.4.*

---

## 7. Suggested implementation order

1. **`fillGroupId` + split metadata plumbing** — types only, nothing user-visible.
2. **`applyMatch` volume guard** (§4.4) — land this *before* any split row can exist, so the first split fill can never double-count. Cover with a unit test.
3. **`SUBMIT_SPLIT_FUEL_FILL`** offline action + atomic server write (§4.6).
4. **Driver UI** — third button + `split_details` view + derived-card display.
5. **Reconciliation control** (§4.5) + Fuel Review Queue variance surfacing.
6. **Fleet-side display** — show the two rows as one grouped fill in Transaction Logs / recon, keyed on `fillGroupId`, so ops sees one pump stop rather than a confusing pair.

Step 6 is cosmetic but matters for adoption: if ops can't see that the two rows are one fill, they will file bug reports about duplicates.

---

## 8. Key file reference

| Concern | File |
|---|---|
| Payment source vocabulary + XOR partition | `packages/fuel-core/src/fuelPaymentSource.ts` |
| Spend/volume eligibility | `packages/fuel-core/src/fuelOpsEligibility.ts` |
| Driver logging flow (both paths) | `apps/driver/src/components/fleet/DriverExpenses.tsx` |
| Method selector UI | `apps/driver/src/components/fleet/expenses/PaymentMethodSelector.tsx` |
| Pump inputs + `$/L` derivation | `apps/driver/src/components/fleet/expenses/FuelCashInputs.tsx` |
| Statement matching (**volume guard goes here**) | `packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts` |
| Dual-payment dedup guard | `supabase/functions/_fleet-server/fuel_soft_dedup.ts` |
| Transaction ↔ fuel_entry inseparability | `supabase/functions/_fleet-server/fuel_posted_guarantee.ts` |
| Duplicate anchor guard | `supabase/functions/_fleet-server/gas_card_anchor_guard.ts` |
| Money moves per payment type | `apps/fleet/src/services/settlementService.ts` |
| Week report totals | `apps/fleet/src/utils/fuelPaidByDriver.ts` |
| Offline queue types | `apps/driver/src/types/offline.ts` |
| `fuel_entries` schema | `supabase/migrations/20260811200000_fleet_schema_foundation.sql:267` |

---

## 9. Post-implementation review (2026-09-18)

Reviewed against the working tree. **All six implementation steps in §7 are present, and both High-severity must-fixes are correctly closed.** Two deployment/gating gaps and one unverified risk remain.

### 9.1 Volume guard — correct, in both copies ✅

`applyFuelMatchLinks` now computes `isSplitNonVolumeOwner` and forces `liters: 0` + `countsInFuelVolume: false`, retaining statement liters as `splitStatementLiters` for audit. Critically, this landed in **both** copies required by the edge mirror pattern:

- `packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts`
- `supabase/functions/_fleet-server/fuel_jaa_match.ts`

Had only the shared copy been patched, the server-side reconciliation — the one that actually runs — would still have double-counted. The server copy also goes further than the audit asked, mirroring the recon flags onto the cash sibling transaction so the variance surfaces in the Review Queue.

**The aggregate arithmetic is exact.** The cash row holds *all* pump liters (not just a cash-proportional share) and the two amounts sum to the pump total, so ops JMD/L = `pumpTotal ÷ pumpLiters`. Both spend tiles and the volume total are individually correct, which also settles risk #7.

### 9.2 Atomicity — correct, with real compensation ✅

One `SUBMIT_SPLIT_FUEL_FILL` action carrying both rows and both photos, resolving to a single `POST /fuel/split-fill`. Server side (`fuel_split_fill.ts`):

- **Validation and both duplicate guards run before any write** — `findConflictingGasCardAnchor` and `findSoftDuplicateFuelEntry` reject with 409 before the cash row is persisted. This is the right order; validating after a partial write would be the classic mistake.
- Cash written first, card second, with a **compensating delete of the cash row** if the card write fails.
- Idempotent on `fillGroupId` via a `fuel_split:{id}` marker, re-reading both rows before returning `idempotent: true`.
- IDs are minted client-side in `buildSplitPayloads`, so an offline retry re-writes the *same* keys rather than creating a second pair. Idempotency therefore holds even in the window before the marker is written.

Non-fatal post-write steps (odometer projection, transaction sync) are caught and logged rather than failing the request — correct, since the two ledger rows are already durable at that point.

### 9.3 Open items

**A. The `fleet-fuel` edge bundle is stale — the route is not deployed.** 🚩

`supabase/functions/fleet-fuel/index.ts` is a generated artifact (`// GENERATED by scripts/build-edge-bundle.mjs — do not edit`) last built at 08:03, while `fuel_controller.tsx` and `fuel_split_fill.ts` were changed at 18:10. `grep "split-fill"` against the bundle returns **0 matches**, and the driver client points at it (`API_ENDPOINTS.fuel` → `${BASE_URL}/fleet-fuel`).

As it stands, a driver submitting a split fill gets a **404**, and — because the offline queue retries on network-shaped failures — the fill would sit in the queue rather than surface a clear error.

Fix: `npm run deploy:fleet-fuel` (runs `build-edge-bundle.mjs fleet-fuel`, deploys, then smoke-tests). Nothing in the source needs to change.

**B. The endpoint is RBAC-gated but not module-gated.** 🚩

`assertSplitFillAllowed` checks `fuel.create_entry` or the `driver` role, and nothing else. The `fuelSplitPayment` module flag gates only the **UI** (`showGasCard && showSplitPayment`, fed by `isFleetDriver && fuelSplitEnabled`). So an org that has not opted in can still have split rows created by any authenticated driver posting directly to `/fuel/split-fill`.

This matters more than usual here because the whole rollout plan is "default off, enable per-org after a clean week" — a flag that only hides a button does not deliver that. Note there is currently **no route-level module-gate helper anywhere in `_fleet-server`**, so closing this means introducing the pattern, not just calling an existing helper. That is likely why it was missed.

Suggested: read the org's effective modules in `assertSplitFillAllowed` and return 403 `MODULE_DISABLED` when `fuelSplitPayment` is not enabled.

**C. Odometer double-projection is unverified (risk #3 remains open).** ⚠️

Both split rows carry the same vehicle, odometer, date and time, and both eventually project into the odometer ledger — the card row via `projectFromFuelEntry` inside `persistSplitFill`, the cash row later via `fuel_posted_guarantee` on approval.

The ledger read path does soft-collapse exact `recordedAt`+`value` duplicates (`odometer_ledger.ts:237-247`), which likely hides the duplicate from display. **But `deltaKm` is computed at `:232-235`, before that collapse** — so the kept row's delta may be computed against its own twin and come out `0`, losing the true distance to the prior reading.

I did not confirm whether both rows actually land with byte-identical `recordedAt`, so this may be harmless in practice. It is the one audit risk that closed without evidence, and it deserves an explicit test before enabling the flag for any org — a split fill followed by a normal fill, asserting `deltaKm` on the later reading.

### 9.4 Feature flag — correctly fail-closed ✅

`fuelSplitPayment` is registered in `OPT_IN_MODULE_KEYS` in **both** `packages/platform-settings/src/modules.ts` and `supabase/functions/_fleet-server/enterprise_modules.ts`, and both `resolveEffectiveModules` implementations use `lineOn && org[key] === true`. A missing org override stays **off**, which is exactly the rollout posture §6 asked for. The `fuelSplitPayment: true` in `defaults.ts` is the product-line allowance, not an org default — it does not turn the feature on.

### 9.5 Tests and typecheck

- **41/41 split-specific tests pass** across `fuelSplitPayment.test.ts` (13), `fuelReviewQueue.test.ts` (13), `jaaFuelStatementMatcher.test.ts` (13), `groupFuelEntriesByFillGroup.test.ts` (2).
- **157/157 pass** across the wider fuel suites. One file, `fuelPaidByDriver.n1.test.ts`, fails to load on missing `VITE_SUPABASE_URL` — an environment config issue at import time, unrelated to this work.
- **No type errors introduced.** The driver app reports 417 and fleet 502, but every one is pre-existing: the only hits matching split-ish terms are two unrelated files that merely have "Split" in their names (`statementWeekSplit.ts`, `fuelCoverageSplit.ts`), a `Cannot find name 'Split'` in the **unmodified** `ExpenseApprovals.tsx` (a different, older "Fuel Split" cost-share feature missing a lucide import), and a `platform-settings/defaults.ts` error about missing `warehouse_*` keys that is present at HEAD. The `fuelSplitPayment` additions to `types.ts` and `defaults.ts` are symmetric and clean.

### 9.6 Deviations from the audit — all sound

- **Tolerance is inlined** in both matcher copies (`Math.max(50, pumpTotal * 0.01)`) rather than imported from `splitReconTolerance()` in fuel-core. This is forced, not sloppy: fuel-core already imports *from* roam-shared, so the reverse import would be circular. Worth a "keep in sync with `fuelSplitPayment.ts`" comment on both copies — there are now three places encoding the same tolerance rule, and no drift test binds them.
- **Review Queue counts `splitVariance` in `total`** alongside `logReview` and `pendingReady`, so variances are visible rather than a silent side channel. Good call.
- **Ops grouping** (`groupFuelEntriesByFillGroup.ts` + detail-sheet and table badges) was built as §7 step 6 suggested, so ops sees one pump stop rather than a suspicious-looking pair.

### 9.7 Before enabling for any org

1. `npm run deploy:fleet-fuel` — rebuild and deploy the bundle (§9.3-A). **Without this the feature is inert.**
2. Close the module gate on `/fuel/split-fill` (§9.3-B).
3. Add the odometer `deltaKm` test (§9.3-C).
4. Add keep-in-sync comments on the three copies of the tolerance rule (§9.6).
5. Then enable for one org and let a week of real fills reconcile before widening.
