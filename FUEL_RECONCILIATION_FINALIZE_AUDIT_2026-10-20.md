# Fuel Reconciliation — Finalize Path & Calculation Engine Audit

**Rev 8 · 2026-10-22** · Read-only check of the Rev 7 engine work against code, gates and production. No code, config or data changed.
**Gates:** fuel-core 28/28 ✔ · Deno tests 9/9 ✔ · fleet fuel goldens 3/3 ✔ · fleet `tsc` **484** ✔ (new baseline) · `deno check` **✖ 1 error** (N-2)

## Status

The new engine (`fuel-chain-v2`) is built, and most of Rev 7 is closed in code:

- one continuous fill chain;
- reference-efficiency variance;
- Jamaica-time week bucketing and peak hours;
- both 35% floors removed; personal = evidence only; unattributed km instead of a remainder;
- per-fill plausibility gate;
- one efficiency for integrity flags;
- the U-1 leftover split + override in the hash;
- the engine version in the snapshot + a shadow drift helper.

**It is not safe to switch on yet.** The reference efficiency comes out at **51.92 km/L** for 5179KZ (N-1). That would turn about **73%** of a normal week into "unexplained fuel". Nothing is deployed or committed.

## Open items

### N-1 · Critical · Reference efficiency is about 4× too high

- **Where:** `referenceEfficiency.ts:52-56` + `fuel_week_prepare.ts` (`historyRows` → `referenceEfficiencyFromFills`).
- **Bug 1:** when ≥ 2 fills are flagged full-tank, it keeps **only** those fills and sums **their** litres. A full-to-full measurement needs **every** litre added between the two full fills.
- **Bug 2:** history rows aren't de-duplicated, so card + manual twins count twice. The `exclude` flag (plausibility) is never set either.
- **Production, 5179KZ, 120 days before 2026-10-05:**

| Method | Km | Litres | km/L |
|---|---|---|---|
| As coded (42 full-tank fills only) | 28,291 | 544.91 | **51.92** |
| All rows incl. twins | 28,754 | 2,624.20 | 10.96 |
| Twins removed, all litres | 28,754 | 2,171.29 | **13.24** |

- **Effect on 10-05 as coded:** expected 1,708 km ÷ 51.92 = 32.9 L against 123.9 L bought. That's about **+20,800 JMD of "variance"**, which trips the leakage gate and is billable under any U-1 split.
- **Fix:**
  1. Pass history through `fuelEntriesForWeekEngine` (pairs once) and set `exclude` from `fillPlausibility`.
  2. Full-tank mode: span = odometer(last full) − odometer(first full); litres = **all** fills after the first full fill, up to and including the last.
  3. Add a sanity band of 4–40 km/L. Outside it → `degraded`, so driver share is blocked.
- **Acceptance:** 5179KZ reference for 2026-10-05 is between 13.0 and 13.6 km/L, and 10-05's variance is within ±10%.

### N-2 · High · `deno check` fails

- `driver_financial_periods.ts:1404` passes `fuelLeftoverDriverShare`, which isn't in `FinanceCoreMetaInput` (`packages/finance-core/src/periodPersistBody.ts:15`). Add the field.

### N-3 · High · Trips between the prior fill and the week start are dropped

- **Where:** `fuel_week_prepare.ts:199` loads trips from `weekStart − 1 day`, but the chain starts at the prior fill (searched up to 120 days back).
- **Effect:** the previous week stops counting trips at its last fill (`tripBelongsToFillSpan`). Trips between that fill and the load window fall into **neither** week. Their km become unattributed, which is billable under U-1.
- **Evidence:** in 4 of the last 12 weeks the prior fill was **2 days** before the week (07-13, 08-17, 08-24, and the coming **10-19**: prior fill 10-17).
- **Fix:** load trips from `fleetCalendarDay(prior.at) − 1 day`.
- **Acceptance:** for consecutive weeks, every trip appears in exactly one week's span.

### N-4 · Medium · Date-only fills turn off time matching

- **What happens:** `tripBelongsToFillSpan` matches by time only when both chain fills have a clock. Gas-card manual entries are date-only (`2026-10-06`), so those weeks fall back to calendar trips while km come from the chain.
- **Fix:** take the time from the linked card row (it carries `time`, e.g. `19:06:55`). For a date-only fill with no linked card, treat it as end of day and flag it.

### N-5 · Medium · Commute is not implemented

- **Where:** `fuel_week_prepare.ts` passes `commuteKm: 0`.
- **Data:** 0 of 3 drivers have home coordinates (1 has a text address).
- **Effect:** commute km land in "unattributed", which is honest but not evidence.
- **Fix:** geocode driver home addresses (an onboarding field plus a one-time backfill). Then build ladder step 2: per shift, home → first pickup and last dropoff → home via the Maps key. Until then, show "Home not set" on the Fuel gaps step.

### N-6 · Medium · Reposition is still a time share, not a route

- **What happens:** reposition = Method C's off-app km spread over short gaps by minutes (`classifyTripGaps`).
- **Fix:** ladder step 3. Use routed dropoff → next pickup for gaps under 30 min in a shift, minus P1/P2 already counted. Keep Method C as the fallback, labelled *estimated*.

### N-7 · Medium · Personal Allowance uses a different km/L than the personal cost

- **Where:** `fuelCalculationService.ts:549` passes `observedEfficiency` to `computePersonalAllowanceSplit`, while personal cost uses the reference (`effForPrice`, L494).
- **Effect:** with a logged Personal trip, earned + overage ≠ personal cost, so company + driver ≠ total.
- **Fix:** pass `effForPrice`. Add a test with a Personal adjustment on the chain path.

### N-8 · Medium · Leftover split details

- `leftoverSplit.ts` `driverOnBucket` caps the **fixed** amount **per bucket**, so a 300 JMD fixed policy over three buckets can bill 900. Cap it once across buckets.
- The `leftover-override` route hardcodes `appliesTo` to all three buckets and ignores the operator's choice (`fuel_period_routes.ts:1739`).

### N-9 · Deploy and cut-over

- **Nothing is live:**
  - all of this is uncommitted;
  - migration `20261021233000_fuel_who_pays` is not applied: **201 trips** are still on the UTC day, and `leftover_split_override` doesn't exist;
  - no snapshot has been built on `fuel-chain-v2`.
- **Order:**
  1. Fix N-1, N-2 and N-3.
  2. Commit.
  3. Apply the migration (run its dry-run select first).
  4. Deploy.
  5. Run the shadow drift (`fuel_week_compute.ts:397`) on the last 8 weeks and review driver deltas.
  6. Switch, then finalize 2026-10-05.
- **Expect:** driver charges change once timing is gone. Locked weeks stay on the old engine.

### N-10 · Low

- The `ambiguous` gap class is still never assigned, so `ambiguous_deadhead_split_pct` does nothing.
- New policies still save a hidden `miscCoverage: 50` (`ScenarioEditor.tsx:78`). It's ignored, but delete it.

### Data (operator)

- **Open:** 2026-09-21, 2026-09-28 and 2026-10-05.
- **Unfinished reopen:** 2026-09-07 is still `reopened`.

## Checks

```sql
-- N-1: reference sanity after the fix (expect ~13.0–13.6 for 5179KZ)
select period_id, r->'metadata'->>'referenceKmPerLiter' ref, r->>'miscellaneousCost' variance, r->>'totalGasCardCost' spend
from public.fuel_week_snapshot, jsonb_array_elements(money->'reports') r
where provenance->>'engineVersion' = 'fuel-chain-v2' order by created_at desc limit 5;

-- N-9: trips still on the UTC day (expect 0 after the migration)
select count(*) from fleet.trips where (payload_json->>'date') ~ 'Z$'
  and date is distinct from (((payload_json->>'date')::timestamptz at time zone 'America/Jamaica')::date);
```

## Do not change

- A negative variance is never billed (`floorMiscForSplit`, `splitLeftoverFuel`).
- The leftover default is company.
- `processJobRow`'s `alreadyLocked` short-circuit, C-8 compensation, the atomic job claim, and the after-prepare snapshot hash.
- The Review Queue.
