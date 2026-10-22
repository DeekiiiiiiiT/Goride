# Fuel Reconciliation — Finalize Path & Calculation Engine Audit

**Rev 10 · 2026-10-22** · Read-only check of the Rev 9 fixes against code, gates and production. No code, config or data changed.
**Gates:** fuel-core 31/31 ✔ · Deno tests 12/12 ✔ · `deno check` on all 6 fuel files ✔ · fleet `tsc` 484 ✔

## Status

All Rev 9 items are fixed in code, and the engine is now running in production:

- migrations `fuel_who_pays` and `fuel_route_cache` are applied, and 0 trips remain on the UTC day;
- Kenny (5179KZ) has a home pin, stamped on driver save; compute no longer writes driver records;
- impossible-litre fills are the only exclusions from the reference;
- commute subtracts the first trip's positioning;
- routes are cached, fail per gap, and "Lat:/Lon:" labels are parsed.

**First real `fuel-chain-v2` results (5179KZ):**

| Week | Chain (odometer) | Spend | Rideshare | Unattributed km | Variance | Driver | Company |
|---|---|---|---|---|---|---|---|
| 09-21 | 186,284 → 188,047 | 31,000 | 30,491.00 | 4,309.94 | −3,848.77 | 3,065.84 | 27,934.16 |
| 09-28 | 188,047 → 189,478 | 28,000 | 27,017.34 | 0.00 | +982.66 | 2,701.73 | 25,298.27 |
| 10-05 | 189,478 → 191,186 | 28,350 | 25,391.56 | 7,301.35 (381 km) | −4,342.91 | 2,539.16 | 25,810.84 |

- **Chain:** continuous across weeks.
- **Tank timing:** gone.
- **Identity:** company + driver = spend in every week.
- **10-05 driver share:** 2,539.16 (old engine 2,342.15).

## Open items

### R10-1 · High · Google routing returns nothing in production

- **Evidence:**
  - `fuel_route_cache` has **0 rows**; it stores only successful routes.
  - All three snapshots show commute **0** and reposition **"Estimated from time between trips"**, even though Kenny's pin was set at 13:41 and the snapshots ran at 14:07 with `homeMissing: false`.
  - On 10-05, **381 km** sit in unattributed that commute and reposition should explain.
- **Why it's invisible:** every failure path returns `null` without logging: missing key, HTTP error, or a non-`OK` Google status (`_shared/directionsRoute.ts:98-117`; `fuel_shift_km.ts` geocode and address routing).
- **Likely cause (unverified):**
  - `GOOGLE_MAPS_API_KEY_RIDES` / `GOOGLE_MAPS_SERVER_KEY_RIDES` isn't set for the fleet functions, **or**
  - the key's project doesn't have the Directions and Geocoding APIs enabled. Google no longer lets the *legacy* Directions API be enabled on new projects; those need the Routes API (`computeRoutes`).
- **Fix:**
  - Log the Google `status` and `error_message` on every failure.
  - Add a one-call health check (route Kingston → Spanish Town) that runs before compute and shows on the Fuel gaps step.
  - Move to the Routes API if the legacy one is blocked.
- **Acceptance:** recompute 10-05 → `fuel_route_cache` has rows, commute > 0, and reposition is labelled "Measured route".

### R10-2 · Medium · Failed routing is shown as "measured 0 km"

- **Where:** `evidenceLadder.ts` labels commute `measured` whenever a home exists, even if every leg failed.
- **Fix:** carry a `routed / estimated / none` status out of `measureOffAppKm`. When nothing routed, label commute **none** and show "Routing unavailable — km left unattributed".

### R10-3 · Medium · Reference km/L rests on 7 full-tank flags

- **What happens:** after de-duplication only 7 of 210 history fills are flagged full-tank, so the reference is the 08-18 → 10-02 full-to-full chain: **11.95 km/L**.
- **Other measures disagree:**
  - all fills over 120 days: **13.24**;
  - the last three weeks actually realised: 4,902 km / 379.8 L = **12.9**.
- **Reason to distrust the flags:** fills flagged full-tank also show tank use above 100% (e.g. `tankUtilizationPercentage` 162% on 10-13).
- **Effect:** a reference about 7% low makes normal weeks look over-explained: 10-05 is −15% and 09-21 is −12%.
- **Fix:** default to a trailing **8-week all-fills chain** (twins removed). Use full-to-full only when there are ≥ 4 full-tank fills in the window and their tank use is between 80% and 110%.
- **Acceptance:** the 5179KZ reference for 10-05 is about 12.9–13.2, and the three weeks' variances sit within ±10%.

### R10-4 · Medium · Weekly variance is tank-level noise, but only the positive side is billable

- **Why weekly variance is noisy:** fills are partial. The tank level at each week's last fill differs, and one fill is about 22 L, roughly 15% of a week. So weekly variance swings ±15% without any leakage.
- **The asymmetry:** `splitLeftoverFuel` bills positive variance and never credits negative. Over these three weeks the net is **−7,209** (more than fully explained), yet a 30% split would bill 295 JMD on 09-28.
- **Fix:** bill variance on a **rolling net** (e.g. 4 weeks), carrying negative variance forward as credit. Or bill only when the cumulative variance over that window is positive and beyond materiality. Show the running balance on Fuel gaps.
- **Gate headroom:** 10-05's −4,343 passes, but it is close to the ±5,000 JMD gate (`FUEL_MISC_MAX_ABS_JMD`), which is about 17% of a normal week. Revisit the gate after R10-3.

### R10-5 · Low

- **Straight-line fallback:** a gap valued in a straight line has no road factor, so it understates by about 20–40%. Multiply by about 1.3 and keep it labelled estimated.
- **Monolith file:** `register_residual_monolith_routes.tsx` (which now carries the home-pin stamp) isn't in CI's `deno check` and has a pre-existing strictness backlog. Add it once the backlog is cleared.

### Deploy

- **Commit:** the fuel changes are uncommitted, including `fuel_shift_km.ts`, `fuel_week_prepare.ts`, `fuel_week_compute.ts`, `fuel_period_routes.ts` and the new `trip_week_guard.ts`.
- **Then:**
  1. Fix R10-1 and confirm routes in the cache.
  2. Fix R10-3 and R10-4.
  3. Recompute the open weeks.
  4. Run the shadow drift on the last 8 locked weeks.
  5. Finalize 2026-10-05.

### Data (operator)

- **Open:** 2026-09-21, 2026-09-28 and 2026-10-05.
- **Unfinished reopen:** 2026-09-07 is still `reopened`.
- **Missing home pins:** driver `5ec79f6c` (1505LM) has none.

## Checks

```sql
-- R10-1: routing works
select count(*) from public.fuel_route_cache;

-- R10-3/4: reference and variance per week
select period_id, r->'metadata'->>'referenceKmPerLiter' ref, r->>'miscellaneousCost' variance,
       r->>'totalGasCardCost' spend, r->>'commuteCost' commute, r->>'unattributedKmCost' unattributed
from public.fuel_week_snapshot, jsonb_array_elements(money->'reports') r
where provenance->>'engineVersion' is not null order by created_at desc limit 6;
```

## Do not change

- The continuous fill chain, Jamaica-time weeks, and the evidence ladder without a floor.
- A negative variance is never billed; the leftover default is company.
- `processJobRow`'s `alreadyLocked` short-circuit, C-8 compensation, the atomic job claim, and the after-prepare snapshot hash.
- The Review Queue.
