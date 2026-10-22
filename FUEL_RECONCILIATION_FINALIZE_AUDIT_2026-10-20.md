# Fuel Reconciliation — Finalize Path & Calculation Engine Audit

**Rev 9 · 2026-10-22** · Read-only check of the Rev 8 fixes against code, gates and production. No code, config or data changed.
**Gates:** fuel-core 31/31 ✔ · finance-core 44/44 ✔ · `deno check` (8 fuel files) ✔ · Deno tests 9/9 ✔ · fleet `tsc` 484 ✔

## Status

All Rev 8 items are fixed in code:

- the reference km/L is de-duplicated and full-to-full, with a 4–40 band (5179KZ now about 13.2 km/L, down from 51.92);
- `deno check` is green;
- trips load from the prior-fill day;
- date-only fills borrow the card time, or end of day;
- reposition is routed, with a labelled fallback;
- Personal Allowance uses the same km/L as the cost;
- the fixed leftover is capped once, and the override honours `appliesTo`;
- the `ambiguous` gap class is live.

What's left: three accuracy issues that shift a few percent of cost, two robustness items, and the deploy. **Nothing is committed or live yet.**

## Open items

### R9-1 · Medium · Excluded fills bias the reference km/L about 5% high

- **Where:** `referenceFills.ts` marks same-odometer and off-price fills `exclude`. `referenceEfficiency.ts` then drops their **litres** but keeps the **km** of the full-to-full span.
- **Production (5179KZ, 120 days before 10-05):** all fills → **13.22 km/L**; with the 5 same-odometer and 3 price-outlier fills excluded → **13.86 km/L**.
- **Effect:** expected fuel comes out about 5% low every week, which shows as a standing about +5% "variance". That's below the 10% gate, but it's **billable** under a percentage leftover split.
- **Fix:** exclude a fill from the reference only for **litre** errors (0 L, more than the tank). Price outliers and same-odometer fills still burned real fuel, so keep their litres. Or split the chain at an excluded fill instead of dropping it.
- **Acceptance:** the 5179KZ reference for 10-05 is within 1% of 13.22.

### R9-2 · Medium · Commute counts the first pickup drive twice

- **Where:** `shiftLegs.ts` `commuteLegs` routes home → first pickup with `alreadyCountedKm: 0`.
- **Effect:** if the driver goes online at home, that drive is the first trip's **enroute + open km, already in rideshare**. When claimed km exceed the span, the ladder then scales **all** categories down, so an over-counted commute also shrinks rideshare.
- **Fix:** subtract the first trip's enroute + open from the home → first-pickup leg, the same way `repositionGaps` does.
- **Acceptance:** a shift whose first trip's enroute equals the home → pickup distance adds 0 commute km.

### R9-3 · Medium · Commute is still effectively off

- **Where:** `pinDriverHome` reads only `driver.homeAddress`.
- **Data:** 0 of 3 drivers have `homeAddress`; 1 has `address`; 0 have a home pin. Commute is 0 for every driver, and those km stay in "unattributed".
- **Fix:** fall back to `address`, and make home address a required driver field. The wizard already says "Home not set"; link it to the driver profile.

### R9-4 · Medium · Compute overwrites the driver record

- **Where:** `pinDriverHome` calls `kv.set("driver:<id>", { ...driver, homeLat, homeLng })` inside the week compute.
- **Effect:** an edit to that driver made at the same time (by another admin, or the driver app) is lost. A preview compute also shouldn't write.
- **Fix:** geocode on **driver save** (or a one-off backfill), patch only `homeLat`/`homeLng`, and have compute read only.

### R9-5 · Low · Routing robustness and cost

- **Every `/compute` re-calls Google:** about 50 reposition gaps plus 2 legs per shift, with only an in-memory cache. Persist routed legs (keyed by rounded from/to) or store them on `vehicle_week_distance`.
- **One bad gap drops the whole week:** one unroutable gap returns `null` and the whole week's measured reposition falls back to the time-share estimate. Fall back per gap instead.
- **Coordinate labels aren't parsed:** Roam dropoffs stored as labels like `"Lat: 17.97911, Lon: -76.99786"` go to the address API as text. Parse them into coordinates.

### R9-6 · Deploy and cut-over

- **Not yet done:**
  - The changes are uncommitted, including the new files `referenceFills.ts`, `shiftLegs.ts` and `fuel_shift_km.ts`.
  - Migration `20261021233000_fuel_who_pays` is **not applied**: 201 trips are still on the UTC day, and there is no `leftover_split_override` column.
  - There are **0** `fuel-chain-v2` snapshots.
- **Order:**
  1. Fix R9-1 and R9-2.
  2. Commit.
  3. Run the migration's dry-run select, then apply it.
  4. Deploy.
  5. Run the shadow drift for the last 8 weeks and review driver deltas.
  6. Switch.
  7. Finalize 2026-10-05.

### Data (operator)

- **Open:** 2026-09-21, 2026-09-28 and 2026-10-05.
- **Unfinished reopen:** 2026-09-07 is still `reopened`.
- **Missing data:** add home addresses for all three drivers (R9-3).

## Checks after deploy

```sql
-- Migration applied: expect 0
select count(*) from fleet.trips where (payload_json->>'date') ~ 'Z$'
  and date is distinct from (((payload_json->>'date')::timestamptz at time zone 'America/Jamaica')::date);

-- v2 snapshot sanity: reference ~13.2, variance within ±10%
select period_id, r->'metadata'->>'referenceKmPerLiter' ref, r->>'miscellaneousCost' variance,
       r->>'totalGasCardCost' spend, r->>'commuteCost' commute, r->>'unattributedKmCost' unattributed
from public.fuel_week_snapshot, jsonb_array_elements(money->'reports') r
where provenance->>'engineVersion' = 'fuel-chain-v2' order by created_at desc limit 5;
```

## Do not change

- A negative variance is never billed; the leftover default is company.
- `processJobRow`'s `alreadyLocked` short-circuit, C-8 compensation, the atomic job claim, and the after-prepare snapshot hash.
- The Review Queue.
