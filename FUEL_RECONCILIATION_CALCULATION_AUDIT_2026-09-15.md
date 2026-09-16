# Fuel Reconciliation — Calculation Audit

**Date:** 2026-09-15
**Rev 2:** 2026-09-15, verified against commit `b7fd7b1a` *"Fix fuel recon money math and
harden close gates"* (tree at `3d29df75`).
**Scope:** The money math behind Business Finance → Week Reconciliation → Fuel.
Specifically the two identities on the week money strip ("Where the money came from"
and "Who ends up paying"), the derivation of *Unexplained fuel*, and the close gates
that let those numbers post.
**Type:** Read-only audit. No code was changed by the auditor.
**Reference week in screenshots:** Sep 7 – Sep 13 2026, vehicle 5179KZ, status OPEN.

---

## 0. Rev 2 — verification of the remediation

**10 of 11 findings closed at the root. The core fix is correct.** F-11 was always a
policy question, not a defect, and remains deliberately unchanged.

Gates: **fuel-core 102/102** (was 71/71) + `deno check` green on the server gate.
*(`apps/fleet/src/utils/fuelFinalizeGating.test.ts` fails locally on missing
`VITE_SUPABASE_URL`; I confirmed it fails identically at `b7fd7b1a~1`, so it is a
pre-existing environment issue, not a regression.)*

| # | Finding | Status | Evidence |
|---|---|---|---|
| F-1 | First-fill residual floor | ✅ **closed** | `windowTimingCost` carved before residual; perfect week now yields misc **0.00** (re-simulated) |
| F-2 | No-odo fills inflate unexplained | ⚠️ **over-corrected** → see **N-2** | carved out, but as company-absorbed *timing* |
| F-3 | Price numerator/denominator filters | ✅ **closed** | `fuelOpsLiters` now applies `countsInFuelLogSpend`; `entriesWithOdo` aligned to bucket engine |
| F-4 | Server gate netted residuals | ✅ **closed** | `residualFlagsFromSpendRows` ORed into both over/under at `fuel_week_closable_gate.ts:332,374-376` |
| F-5 | `degradedInputs` hardcoded false | ✅ **closed** | now `period.degradedInputs \|\| meta.degradedInputs \|\| missingCategoryCosts` (:349-352) |
| F-6 | Payment partition holes | ✅ **closed** | normalize-then-partition XOR in `fuelPaymentSource.ts:106-129`; cash sum gained `countsInFuelLogSpend` |
| F-7 | Unexplained shown as third payer | ✅ **closed** | payer grid is now 2-up; timing + unexplained demoted to an "Of which…" breakdown |
| F-8 | Unexplained billable to driver | ✅ **closed** | misc → company 100% under Percentage; Fixed_Amount allowance applies to rideShare only (crowd-out gone) |
| F-9 | Ratio gate had no absolute cap | ✅ **closed** | `FUEL_MISC_MAX_ABS_JMD = 5000`, both conditions required |
| F-10 | Snapshot `driverSpend: 0` | ✅ **closed** | `partitionWeekSnapSpend`; `netPay = driverSpend − driverShare` |
| F-11 | Unavailable km as rideshare | ⏸ **deferred** | unchanged — was flagged as policy to confirm, not a defect |

**Proof F-1 is genuinely fixed.** Re-running the original synthetic — 6 fills, 25 L each
@ $180/L, every km an evidenced trip:

```
spend=27000.00   rideShare=22500.00   windowTiming=4500.00
misc=0.00  (0.0% of spend)  -> ok
```

Previously this reported $4,500 of unexplained fuel on flawless data. It now reports zero,
with the $4,500 correctly named as tank-window timing and held by the company. That is the
right answer and the right shape.

### Still to be done

Four items, all arising from the fix itself. **N-1 and N-2 are the ones that matter** —
both are consequences of one design choice: `windowTimingCost` conflates two different
things and is applied without checking that it is meaningful.

- **N-1 (High, regression)** — degraded-odometer weeks now hard-block. [§3.12](#n-1--high-regression--the-window-timing-carve-is-unguarded-by-efficiency-source)
- **N-2 (High, blind spot)** — fills without odometers are silently absorbed, so leakage in them is undetectable. [§3.13](#n-2--high-blind-spot--no-odometer-fills-are-not-timing-and-carving-them-out-hides-real-leakage)
- **N-3 (Medium)** — the server never derives `windowTimingCost`; it trusts the client's stamp. [§3.14](#n-3--medium--the-server-cannot-verify-windowtimingcost)
- **N-4 (Low)** — "charged to driver from unexplained" is a hardcoded `0`. [§3.15](#n-4--low--the-driver-charged-from-unexplained-figure-is-a-literal-zero)

---

## 1. Verdict (Rev 1 — retained for the evidence trail)

> Rev 2 note: everything in §1–§5 below describes the **pre-fix** code and is kept as the
> evidence trail. Read §0 above and §3.12–§3.15 for current state.

**The two green ✓ identities are real — the engine does conserve money. But the
*composition* of the split is not trustworthy, because "Unexplained fuel" is a
plug that absorbs a known, structural modelling error before anyone looks at it.**

On the reference week the arithmetic ties exactly:

| Identity | Check | Result |
|---|---|---|
| Gas card + Cash = Total | 6,500.00 + 23,800.00 = 30,300.00 | ✓ ties |
| Company + Driver = Total | 19,591.28 + 10,708.72 = 30,300.00 | ✓ ties |

That is the *only* thing those ticks prove. They prove nothing about whether
$4,045.61 of fuel is genuinely unexplained, and nothing about whether the
$10,708.72 charged to the driver is correctly owed.

The headline problem: **on a week with perfect data and zero real leakage, this
engine still reports unexplained fuel roughly equal to the value of the first
fill-up of the week.** Reproduced below. The reference week's 13.35% unexplained
ratio is consistent with exactly that artefact (≈ 1 fill out of ~7.5).

**Bottom line for an accountant:** the week's *spend* and the week's *burn* are
different quantities, separated by the change in fuel sitting in the tank. This
system has no tank-inventory account. The entire opening/closing tank movement
lands in a line item called "Unexplained fuel," which is then, under a Percentage
or Fixed_Amount policy, **partly billed to the driver**. That is a timing
difference being charged to a person as a loss.

---

## 2. How the numbers are actually built

Per vehicle-week, in [`fuelCalculationService.ts`](packages/fuel-core/src/fuelCalculationService.ts):

```
totalGasCardCost  = Σ eligible ops fill $                       (L281)
totalLiters       = Σ ops fill litres                           (L282)
pricePerLiter     = totalGasCardCost / totalLiters              (L316)
observedEfficiency= odoDistance / litres of fills #2..#n        (L291-300)

rideShareCost     = tripKm      / eff × price                   (L369)
companyUsageCost  = companyKm   / eff × price                   (L372)
deadheadCost      = deadheadKm  / eff × price                   (L375)
personalUsageCost = personalKm  / eff × price                   (L378)

miscellaneousCost = totalGasCardCost − (the four above)         (L383)   ← "Unexplained fuel"
```

Then [`fuelCoverageSplit.ts`](packages/fuel-core/src/fuelCoverageSplit.ts) splits all
**five** categories — misc included — between company and driver by the fuel rule,
and `companyShare + driverShare` is the sum of both sides.

Two structural consequences follow immediately, and both matter:

1. **`miscellaneousCost` is a residual, not a measurement.** It is not "fuel we
   detected as missing." It is *spend minus a model*. Every error in the price
   input, the efficiency input, or the km classification lands in it at 100 cents
   on the dollar, with the same label and the same colour as genuine theft.

2. **"Unexplained fuel" is not a third payer.** It is already inside Company keeps
   and Driver's fuel share. Which brings us to the tile the screenshot circles.

---

## 3. Findings

Ranked by money impact. Each cites the line that produces it.

---

### F-1 · CRITICAL — Unexplained fuel has a structural floor ≈ the first fill of the week

**Confirmed and reproduced.**

The efficiency denominator drops the first fill's litres (correct fill-to-fill
method, [`fuelCalculationService.ts:291-292`](packages/fuel-core/src/fuelCalculationService.ts#L291-L292)),
but the price is struck over **all** litres including the first
([L281-282, L316](packages/fuel-core/src/fuelCalculationService.ts#L281-L316)).
The two are then multiplied together to value distance. The algebra:

```
cost(D) = D / eff × price
        = D × (efficiencyFuel / odoDistance) × price

if every km is categorised (D = odoDistance):
cost    = efficiencyFuel × price
spend   = totalLiters    × price
misc    = (totalLiters − efficiencyFuel) × price
        = litres of fill #1 × price          ← never zero
```

Reproduction on a synthetic **perfect** week — 6 fills, 25 L each @ $180/L,
250 km between every fill, every single km logged as an evidenced rideshare trip,
no personal use, no gaps, efficiency recovered exactly as 10.0000 km/L:

```
total spend           27000.00
rideShareCost         22500.00
UNEXPLAINED (misc)     4500.00      ← 16.67% of spend, on flawless data
  value of fill #1     4500.00      ← identical
  1/N of spend           16.67%
```

There is no leakage in that week. The engine reports $4,500 of it.

**Tie to the live week:** $4,045.61 / $30,300 = **13.35%**, which is 1/7.49 — i.e.
exactly the signature of a vehicle with ~7–8 odometered fills in the week. That
does not prove the reference week's residual is *entirely* artefact, but the
artefact is present in it, and it is the single largest component you should
expect to find.

**Impact**
- Leakage is systematically overstated by one fill per vehicle per week.
- Under a `Percentage` policy the driver is charged their misc share of an
  accounting artefact (see F-8).
- It eats the review budget: the 25% gate (F-9) is ~1/N consumed before real
  leakage is measured, so on this week only ~11.7pp of the 25pp tolerance is
  actually available to detect theft.

**Root cause in accounting terms:** the week's fuel *purchases* are being compared
against the week's modelled *consumption* with no opening/closing tank inventory.
Fill #1 paid for fuel burned **before** the window; fuel burned after the last
fill has not been purchased yet. That difference is inventory movement, and it is
being presented as an unexplained loss.

---

### F-2 · CRITICAL — Every fill without an odometer reading adds 100% of its value to Unexplained

Same algebra as F-1. `totalLiters` (L282) counts **all** ops fills;
`efficiencyFuel` (L291) counts only fills that carry an odometer *and* litres
(L286). So the residual floor is really:

```
misc_floor = (litres of fill #1 + litres of every floating/no-odometer fill) × price
```

A cash fill logged without an odometer — which `FuelEntry.entryMode: 'Floating'`
explicitly anticipates — contributes its entire dollar value to "Unexplained fuel."
Given $23,800 of the reference week's $30,300 is **Cash from earnings**, and cash
fills are the ones most likely to be logged without an odometer, this is likely
material on this week specifically.

The banner *"5179KZ · Unexplained — 85 trip(s) missing odometer"* is about trips,
not fills, so it is not the same defect — but it tells you the odometer chain on
this vehicle is thin, which is precisely the condition that maximises F-1 and F-2.

---

### F-3 · HIGH — Price per litre uses different eligibility filters for its numerator and its denominator

[`fuelCalculationService.ts:281-282`](packages/fuel-core/src/fuelCalculationService.ts#L281-L282):

```ts
const totalGasCardCost = vehicleEntries.reduce((s,e) => s + fuelOpsSpendAmount(e), 0);
const totalLiters      = vehicleEntries.reduce((s,e) => s + fuelOpsLiters(e), 0);
```

- `fuelOpsSpendAmount` applies `countsInFuelLogSpend` — it drops fee rows, declined
  rows, `awaitingCardStatement` anchors, and anything flagged `countsInFuelSpend:false`
  ([`fuelOpsEligibility.ts:53-56`](packages/fuel-core/src/fuelOpsEligibility.ts#L53-L56)).
- `fuelOpsLiters` applies **no such filter** — only the JAA statement-row exclusion
  ([L59-62](packages/fuel-core/src/fuelOpsEligibility.ts#L59-L62)).

Any row whose **amount** is excluded but whose **litres** are not dilutes JMD/L
downward. A lower price understates all four category costs, and every dollar of
that understatement reappears in Unexplained fuel. A $0 `awaitingCardStatement`
anchor carrying litres is the clearest example, and it is a shape this system
creates deliberately.

**Same asymmetry, second instance:** `entriesWithOdo` (L286) filters on
`liters > 0` only, while the bucket engine's equivalent
([`odometerBucketEngine.ts:147-155`](packages/fuel-core/src/odometerBucketEngine.ts#L147-L155))
additionally requires `countsInFuelLogSpend(e)`. The two engines can therefore
compute **different efficiency for the same vehicle-week**, so the stop-to-stop
variance view and the money view are not guaranteed to agree.

---

### F-4 · HIGH — The server close gate and the client close gate are not equivalent

[`fuel_week_closable_gate.ts`](supabase/functions/_fleet-server/fuel_week_closable_gate.ts)
opens with *"HTTP finalize + auto-close share one gate."* They share the
*predicate* (`evaluateFuelWeekClosable`). They do **not** share the inputs.

**Client** ([`fuelFinalizeGating.ts:85-90, 278-284`](apps/fleet/src/utils/fuelFinalizeGating.ts#L85-L90))
classifies the residual **per driver-week report**:

```ts
reports.filter(r => isOverExplainedResidual(r.totalGasCardCost, r.miscellaneousCost))
```

**Server** ([`fuel_week_closable_gate.ts:325-327, 360-361`](supabase/functions/_fleet-server/fuel_week_closable_gate.ts#L325-L327))
classifies it on the **week aggregate only**:

```ts
const signedUnexplained = Number(period.unexplained) || 0;
const totalSpend        = Number(period.total_spend) || 0;
const residualKind      = classifyFuelMiscResidual(totalSpend, signedUnexplained);
```

There is no per-snapshot over/under check anywhere in `_fleet-server` — I grepped
the whole directory for `isOverExplainedResidual` / `isUnderExplainedResidual` and
found none.

**Failure case (concrete):**

| Driver | Spend | Misc | Per-driver verdict |
|---|---|---|---|
| A | 20,000 | **+10,000** (+50%) | under-explained — should block |
| B | 20,000 | **−10,000** (−50%) | over-explained — **hard** block |
| Week | 40,000 | **0** (0%) | **`ok` — server permits close** |

Auto-close and HTTP finalize will post that week. Driver B's negative residual
means modelled costs exceeded actual spend — the fleet owes them — and it closes
silently because Driver A's opposite error cancels it in the aggregate.

Because the server gate is the authoritative one for auto-close, the client's
correct per-report check is not a mitigation for the unattended path.

---

### F-5 · MEDIUM — `degradedInputs` is hardcoded `false` on the server

[`fuel_week_closable_gate.ts:367`](supabase/functions/_fleet-server/fuel_week_closable_gate.ts#L367):

```ts
degradedInputs: false,
```

The blocker exists in the shared predicate, has a message
(*"Money-bearing inputs timed out or missing"*), and is wired live on the client.
On the server path it can never fire. A week whose money-bearing inputs timed out
can auto-close.

---

### F-6 · HIGH — "Gas card + Cash = Total" compares three different populations

This is the identity on the top row of the screenshot. Its three inputs are not
built from the same set of rows.

`totalSpend` comes from `r.totalGasCardCost`, assembled by **vehicle** membership
(`e.vehicleId === vehicle.id`, [L261](packages/fuel-core/src/fuelCalculationService.ts#L261)).
`gasCard` and `cashFromEarnings` come from `sumGasCardSpendForReport` /
`sumPaidByDriverForReport`, assembled by **driver** attribution via
`resolveFuelFillDriver` ([`fuelPaidByDriver.ts:84-90`](apps/fleet/src/utils/fuelPaidByDriver.ts#L84-L90)).
For a shared car or a mid-week vehicle swap those sets differ.

Worse, the two tiles are **not a partition** of the total. Three concrete holes:

**(a) Counted in Total, in neither tile.** `isGasCardFuelEntry` tests
`entry.paymentSource === 'Gas_Card'` by **strict string equality**
([`fuelPaidByDriver.ts:43-54`](apps/fleet/src/utils/fuelPaidByDriver.ts#L43-L54)),
while `isOutOfPocketFuelEntry` runs the raw value through
`resolveFuelPaymentSource` **normalisation** ([L30-39](apps/fleet/src/utils/fuelPaidByDriver.ts#L30-L39)).
`company_card`, `Gas Card` and `Fuel Card` all normalise to `Gas_Card`
([`fuelPaymentSource.ts:19-22`](apps/fleet/src/utils/fuelPaymentSource.ts#L19-L22)) —
and `company_card` is this system's own metadata dropdown key. An entry with
`paymentSource: 'company_card'` and `type: 'Manual_Entry'` is:
- not gas card (strict equality fails, type isn't `Card_Transaction`), **and**
- not out of pocket (normalises to `Gas_Card`, so the function returns `false`),
- but **is** counted in `totalSpend`.

Gas card + Cash < Total, and the strip goes red with the generic message
*"check attribution."*

**(b) Driver cash booked as company money.** The mirror case: `paymentSource: 'Cash'`
with `type: 'Card_Transaction'`. `'Cash'` is not one of the three literals in the
cash guard, so the function falls through to `type === 'Card_Transaction'` and
returns **gas card**. The driver's own money is recorded as company-paid, and they
lose the credit. This one does *not* break the identity — it ties perfectly while
being wrong. That is the dangerous kind.

**(c) Counted in Cash, not in Total.** `sumPaidByDriverForReport`
([L140-142](apps/fleet/src/utils/fuelPaidByDriver.ts#L140-L142)) sums `e.amount`
with no `countsInFuelLogSpend` guard, unlike both `totalSpend` and the gas-card
side (which does apply it, L158). A cash row flagged `countsInFuelSpend: false` or
`awaitingCardStatement` inflates the Cash tile above the total.

Given the reference week is 79% cash ($23,800 of $30,300), (b) and (c) are the
ones to check against your data first.

---

### F-7 · MEDIUM — The "Unexplained fuel" tile is presented as a third payer, and the caption silently changes meaning

This is the region circled in the screenshot, and the reading is correct: it is
misleading.

The section is headed **"Who ends up paying."** It renders a 3-up grid: Company
keeps · Driver's fuel share · **Unexplained fuel**
([`FuelWeekMoneyStrip.tsx:119-127`](apps/fleet/src/components/fuel/reconciliation/FuelWeekMoneyStrip.tsx#L119-L127)).
Underneath it prints **"Company + Driver = Total ✓"** — a two-term equation under
three tiles, in the same visual register as the top section where all three tiles
*are* the equation.

Unexplained fuel is **not** a third payer. It is already inside the other two.
`misc` is an ordinary category in `splitAllCategoryCosts` and is apportioned to
company and driver like any other.

And the caption is conditional
([L64-70](apps/fleet/src/components/fuel/reconciliation/FuelWeekMoneyStrip.tsx#L64-L70)):

```ts
const overExplainedResidual = leakage < -FUEL_SPEND_EPS;
const splitLabel = overExplainedResidual ? 'Company + Driver + Unexplained' : 'Company + Driver';
```

So the same three tiles mean "A + B = Total" on one week and "A + B + C = Total"
on the next, with nothing but a changed caption to say so. A reader who learned
the layout on a positive-residual week will misread a negative-residual week.

The logic underneath is defensible — I verified the tie is conservative, i.e. the
positive branch goes green **only** when no individual vehicle is over-explained,
so it does not paper over a mixed week. The defect is entirely in the presentation,
and it is the presentation that gets used to sign off the week.

*Suggested framing (not applied):* move the tile out of the payer row and label it
**"of which unexplained"** as a subordinate figure under Company keeps, with the
driver-charged portion stated separately.

---

### F-8 · MEDIUM — Unexplained fuel is billable to the driver, and under Fixed_Amount it crowds out legitimate coverage

`misc` is a first-class category in the coverage rule
([`fuelCoverageSplit.ts:55`](packages/fuel-core/src/fuelCoverageSplit.ts#L55)). Consequences by policy type:

| coverageType | What happens to unexplained fuel |
|---|---|
| `Full` | company absorbs 100% — **safe** |
| `Percentage` | driver is charged `misc × (1 − miscCoverage%)` — **charged with no evidence of driver responsibility** |
| `Fixed_Amount` | worse, see below |

Under `Fixed_Amount` ([L138-146](packages/fuel-core/src/fuelCoverageSplit.ts#L138-L146))
misc and rideShare share one allowance pro-rata:

```ts
const variable = costs.rideShare + costs.misc;
const ratio    = Math.min(allowance, variable) / variable;
company.rideShare = costs.rideShare * ratio;
```

So a larger unexplained residual **shrinks the company's share of legitimate
rideshare fuel**. Unexplained fuel doesn't just get billed to the driver — it
pushes *rideshare* cost onto them too. Combined with F-1 and F-2, a driver can be
charged more for revenue-earning fuel because the engine's own first-fill artefact
grew.

Whether unexplained variance should be driver-billable at all is a policy call,
not a code defect. But it should be a deliberate, documented decision, and today
it is an emergent property of `misc` being in the same `Record` as the four
evidenced categories.

---

### F-9 · MEDIUM — The 25% residual tolerance is a bare ratio with no absolute cap

`FUEL_MISC_MAX_RATIO = 0.25`
([`fuelFinalizeGate.ts:13`](packages/fuel-core/src/fuelFinalizeGate.ts#L13)).

On the reference week that is **$7,575** of unexplained fuel that classifies as
`ok` and never raises a blocker. There is no absolute JMD ceiling, so the
higher-spending the vehicle, the larger the free pass. Net of F-1's structural
floor, the tolerance genuinely available for detecting real leakage on this week
is only about 11.7pp.

The reference week sits at 13.35%, i.e. **below the gate**. The "Review unexplained
fuel" step you see in the screenshot is a workflow step, not a blocker — at this
ratio the week is already closable.

---

### F-10 · MEDIUM — Finalized snapshots record `driverSpend: 0`

[`weekSnapshotEngine.ts:227-228`](packages/fuel-core/src/weekSnapshotEngine.ts#L227-L228):

```ts
gasCardSpend: totalGasCardCost,
driverSpend: 0,
```

The source split is discarded at snapshot time — everything is booked as gas card.
`aggregateFinalizedForWeek`
([`fuel_period_routes.ts:245-258`](supabase/functions/_fleet-server/fuel_period_routes.ts#L245-L258))
then reads those fields back, with a fallback that plugs
`gasCardSpend = totalSpend` when both are zero.

On the reference week that means "Where the money came from" could read
**Gas card $6,500 / Cash $23,800** while open and **Gas card $30,300 / Cash $0**
once locked. I did not trace every finalize path to confirm which builder writes
the production snapshot, so treat this as **needs confirmation** — but if the
snapshot engine is on the live path, $23,800 of driver credit is being erased at
lock.

---

### F-11 · LOW — `normalizedUnavailableDistance` is counted as rideshare km

[`tripRideshareKm.ts:13-19`](packages/fuel-core/src/tripRideshareKm.ts#L13-L19) sums
On Trip + Enroute + Open + **Unavailable**. "Unavailable" is by definition
non-revenue time, so its fuel is absorbed at the rideshare coverage rate rather
than treated as personal or deadhead. The file marks this a "locked rule," so
flagging it as **policy to re-confirm**, not a defect.

---

---

## 3b. Rev 2 findings — introduced by the remediation

All four trace to one design choice: `computeWindowTimingCost(totalLiters, efficiencyFuel,
price)` ([`fuelCoverageSplit.ts:161-168`](packages/fuel-core/src/fuelCoverageSplit.ts#L161-L168))
is called unconditionally at
[`fuelCalculationService.ts:401-403`](packages/fuel-core/src/fuelCalculationService.ts#L401-L403),
and the quantity it produces mixes two things that are not alike.

### N-1 · HIGH (regression) — the window-timing carve is unguarded by efficiency source

`efficiencyFuel` is only meaningful when `observedEfficiency` was actually derived from it —
which requires **≥ 3** odometered fills
([`fuelCalculationService.ts:308`](packages/fuel-core/src/fuelCalculationService.ts#L308)).
Below that threshold, efficiency falls back to `vehicle.fuelSettings.efficiencyCity` or
the 10 km/L default, and `efficiencyFuel` becomes **0** when there are fewer than 2
([L302-304](packages/fuel-core/src/fuelCalculationService.ts#L302-L304)). The carve runs
anyway, so `windowTimingCost` becomes the **entire week's spend**, and the residual goes
sharply negative.

Reproduced — one odometered fill plus one floating cash fill, 300 km of logged trips:

```
odometered fills=1   effSource=fallback   eff=10.00 km/L
spend=9000.00   rideShare=5400.00   windowTiming=9000.00
misc=-5400.00  (60.0% of spend)  ->  OVER_EXPLAINED (hard block)
```

Before the fix that week produced `misc = +3,600` — under-explained, reviewable, closable
by accepting the leakage. It is now a **hard block with no remediation path**:
`over_explained` is unconditional in `evaluateFuelWeekClosable`, and the operator is told
*"modelled costs exceed spend"*, which is not what happened.

`degradedInputs` does not catch it either — that flag covers **fetch timeouts only**
(`trips · deadhead · personalAllowance · brain · fuelCards`,
[`buildFuelWeekReportsForFinalize.ts:99-111`](apps/fleet/src/utils/buildFuelWeekReportsForFinalize.ts#L99-L111)).
An unusable odometer chain is not in that list, and neither is `priceUnavailable`.

**Fix:** only carve timing when `efficiencySource === 'odometer'`. When efficiency fell
back, the fill-to-fill relationship does not hold and the carve has no basis — the week
should be flagged as degraded (a new `odometerChainUnusable` input), not booked as
over-explained.

**Why the tests missed it:** the only F-1 test
([`fuelFinalizeGate.test.ts:94-108`](packages/fuel-core/src/fuelFinalizeGate.test.ts#L94-L108))
asserts the healthy 6-fill synthetic straight out of this audit. There is no test for a
week with fewer than 3 odometered fills. This is the "control shipped without the input
that makes it fail" pattern that the prior fuel audit closed out on — it recurred here.

---

### N-2 · HIGH (blind spot) — no-odometer fills are not "timing", and carving them out hides real leakage

`computeWindowTimingLiters` returns `totalLiters − efficiencyFuel`, which is **first-fill
litres + every floating-fill litre**. Those two are not the same kind of thing:

- **First fill** — bought this week, burned *before* the window opened. Genuinely a timing
  difference. Company-held is correct.
- **Floating fill (no odometer)** — bought *and burned inside* the window. This is real
  consumption that simply was not measured. It is unattributed, not untimed.

Treating the second as timing moves it out of leakage detection entirely and hands it to
the company with no gate. Reproduced — 3 odometered fills plus 3 floating cash fills:

```
odometered fills=3   effSource=odometer
spend=27000.00   rideShare=9000.00   windowTiming=18000.00
misc=0.00  (0.0% of spend)  ->  ok
```

**Two-thirds of the week's spend is written off as "timing" and the week reads perfectly
clean.** A driver who logs cash fills without odometer readings now produces a zero-leakage
week by construction. Pre-fix this same week showed a large unexplained figure — noisy and
overstated, but at least *visible*.

This matters most on exactly the data shape in the screenshots: **79% of the reference week
($23,800 of $30,300) is Cash from earnings**, and cash fills are the ones most likely to
lack an odometer.

I confirmed there is **no gate of any kind on `windowTimingCost`** — grepping
`evaluateFuelWeekClosable.ts`, `fuelFinalizeGate.ts` and `fuelWeekClosableGate.ts` for
`windowTiming` returns nothing. It is uncapped as a ratio and uncapped in absolute JMD,
unlike `miscellaneousCost` which now has both (F-9).

**Fix:** split the quantity in two.
`windowTimingCost` = first-fill litres × price → company-held, as now.
`unattributedFillCost` = no-odometer litres × price → its own named line, surfaced in the
wizard and **gated** (ratio + absolute cap, same treatment as misc). It should not be
leakage, but it must not be invisible either.

---

### N-3 · MEDIUM — the server cannot verify `windowTimingCost`

`grep -rn "windowTiming" supabase/functions/` returns **nothing**. The server never derives
the value. `computeFuelWeek` accepts it as an input
([`computeFuelWeek.ts:17-18, 66`](packages/fuel-core/src/computeFuelWeek.ts#L17-L18)) and
the only thing that supplies it is the client's own stamp, carried on
`snapshot.metadata.windowTimingCost`
([`weekSnapshotEngine.ts:308`](packages/fuel-core/src/weekSnapshotEngine.ts#L308)).

So under `FUEL_SERVER_ENGINE=shadow` — and more importantly under `enforce` — the recompute
compares the client's `windowTimingCost` against itself. A wrong value cannot produce a
diff. This now guards the **single largest company-absorbed line on the week** (67% of spend
in the N-2 case above).

This is the same self-referential-check pattern the previous audit logged as N-15, relocated
onto a new field. Worth closing before the shadow soak concludes, or the soak will report
clean on the one number it cannot see.

---

### N-4 · LOW — the "charged to driver from unexplained" figure is a literal zero

[`FuelWeekMoneyStrip.tsx:146-151`](apps/fleet/src/components/fuel/reconciliation/FuelWeekMoneyStrip.tsx#L146-L151):

```tsx
Of which charged to driver from unexplained:{' '}
<span …>{formatFuelMoney(0)}</span>
```

The displayed value is correct *today* — F-8 makes misc structurally 100% company under
every coverage type. But it is a hardcoded constant, not a derived one, so it will keep
printing `$0.00` if the misc policy is ever relaxed. Derive it from `split.driver.misc`
so the number is load-bearing rather than decorative.

---

## 4. What I verified, and what I did not

**Verified by reading the code path end to end:**
- The residual formula and both money-strip identities (F-1, F-7).
- The `fuelOpsSpendAmount` / `fuelOpsLiters` filter asymmetry (F-3).
- Client per-report vs. server aggregate gate divergence, by grepping all of
  `_fleet-server` for the per-report helpers (F-4, F-5).
- The payment-source classification holes, against the actual `RAW_TO_ENUM`
  vocabulary and the `FuelEntry['type']` union (F-6).
- That the Personal Allowance path preserves the identity —
  `earnedCost + overageCost === personalUsageCost` exactly
  ([`personalAllowance.ts:139-150`](packages/fuel-core/src/personalAllowance.ts#L139-L150)),
  so the PA branch does not leak money. **This part is correct.**
- That `floorMiscForSplit` correctly refuses to pass a negative residual through
  to a driver's balance ([`fuelFinalizeGate.ts:96-102`](packages/fuel-core/src/fuelFinalizeGate.ts#L96-L102)).
  **Also correct.**
- That the money-strip tie is conservative in both sign branches: it goes green
  only when no individual vehicle is over-explained (positive branch) or none is
  under-explained (negative branch). **Correct.**
- The bucket engine's unit handling: `avgEfficiency = 100 / kmPerL` is L/100km and
  is used as such at [L310](packages/fuel-core/src/odometerBucketEngine.ts#L310).
  **No unit bug.**

**Reproduced numerically:** F-1, via a standalone replication of the formulas at
lines 281–388 on a synthetic perfect week. The engine itself was not executed.

**Not verified — would need your data or a run against the live week:**
- The actual decomposition of the reference week's $4,045.61 into artefact vs.
  genuine leakage. The 13.35% ≈ 1/7.49 signature is strong circumstantial
  evidence for F-1 dominating, not proof.
- Which finalize path writes the production snapshot (F-10).
- The active fuel rule's `coverageType` and `miscCoverage` for this driver-week,
  which determines whether F-8 is live money or dormant.
- One loose thread worth a look: `driverOperationalMetrics.ts:832` hardcodes
  `misc: 0` in a reconstructed fuel-metrics block, which would make the driver-facing
  view disagree with recon. Not traced.

---

## 5. Rev 2 — remaining order of work

1. **N-1 — guard the carve.** Only compute `windowTimingCost` when
   `efficiencySource === 'odometer'`. Add an `odometerChainUnusable` gate input so a thin
   odometer chain blocks as what it is, instead of masquerading as over-explained.
   Ship it with the failing input: a fixture week with 1 and with 2 odometered fills.
2. **N-2 — split the carve in two.** `windowTimingCost` (first fill, company-held) and
   `unattributedFillCost` (no-odometer fills, gated with ratio + absolute cap and surfaced
   in the wizard). Until this lands, a week can read 0% unexplained while two-thirds of its
   spend is unmeasured.
3. **N-3 — derive `windowTimingCost` server-side** before the shadow soak concludes, so
   `enforce` is not comparing a client value against itself.
4. **N-4 — derive the driver-charged figure** from `split.driver.misc`.
5. **F-11 — confirm the policy** on `normalizedUnavailableDistance` counting as rideshare km,
   or record the decision in the rule so it stops reading as an open question.

### Rev 1 order of work (completed — retained for reference)

Nothing in the list below was applied by the auditor; items 1–7 were implemented by the
owner in `b7fd7b1a` and verified in §0.

1. **F-1 / F-2 — fix the residual's structural floor.** The correct fix is not to
   change the fill-to-fill efficiency method, which is right. It is to stop
   comparing purchases against modelled burn with no inventory account. Either
   value distance at cost using the *same* litre basis the efficiency was struck
   on, or introduce an explicit opening/closing tank-inventory line so the timing
   difference is named as what it is instead of falling into "Unexplained."
   Until this is fixed, every unexplained-fuel number in the product is overstated
   by roughly one fill per vehicle per week.
2. **F-4 / F-5 — make the server gate per-report.** Port
   `listOverExplainedBlockers` / `listUnderExplainedBlockers` into the server gate
   and wire a real `degradedInputs`. Offsetting residuals must never net to `ok`.
3. **F-6 — one classification function.** `isGasCardFuelEntry` and
   `isOutOfPocketFuelEntry` must agree by construction: normalise once, then
   partition. Add an assertion that `gasCard + cash === totalSpend` over the same
   row set, so a mismatch is a blocker rather than a red caption.
4. **F-3 — one eligibility filter for price.** Numerator and denominator must
   filter identically; likewise `entriesWithOdo` and the bucket engine's
   `odoEntries`.
5. **F-8 — decide the policy explicitly.** State in the rule whether unexplained
   variance is driver-billable. If it is, it should require the stop-to-stop
   charge path with evidence, not a percentage sweep. Fix the `Fixed_Amount`
   crowd-out regardless — that one is a defect under any policy.
6. **F-7 — re-present the tile.** Move it out of the payer row; make the caption
   unconditional.
7. **F-9 — add an absolute cap** alongside the 25% ratio, and re-baseline the
   ratio after F-1 lands.

---

## 6. One-line answer to the question asked

**Rev 2 — close, and correct on the healthy path.** The residual plug is gone: a clean
week now reports **0.00** unexplained where it used to report a full fill-up, drivers are
no longer billed for the residual under any coverage type, the payment tiles are a true
partition, and the server close gate can no longer net one driver's error against another's.
That is the substance of the original audit, closed at the root.

What is left is the **degraded path**, and it is the path your reference week is on. The
window-timing carve is applied whether or not the odometer chain can support it, which
turns a thin-chain week into an unactionable hard block (**N-1**) and lets a cash-heavy
week write off most of its spend as "timing" and read as zero leakage (**N-2**). Both are
narrow fixes to one function. Land them — with the degraded fixtures that make them fail —
and the arithmetic is sound end to end.

> **Rev 1 answer (superseded):** *No — not yet flawless. The money conserves and the
> identities tie, and the Personal Allowance and negative-residual handling are genuinely
> correct. But "Unexplained fuel" is a residual plug carrying a known artefact worth about
> one fill-up per vehicle per week, and under a Percentage or Fixed_Amount policy a share
> of that artefact is being charged to drivers.*
