# H3 Spatial Index — Engineering Review & Rush Implementation Plan

**Reviewed:** 2026-08-27
**Remediation verified:** 2026-08-29 (see §0)
**Against:** `Roam H3 Spatial Index — Current State & Rush Plan` (2026-08-27)
**Scope:** code + live schema review. **No changes made by this review.**
**Sources read:** `_shared/h3/geoIndex.ts`, `rides/index.ts`, `rides/fare/pickupEta.ts`,
`matching/supply/loadLocations.ts`, `matching/dispatch/runMatchingWave.ts`,
`matching/policy/loadPolicy.ts`, both H3 migrations, `@roam/dash-coverage`, plus live
`pg_available_extensions` / view + RLS state on `csfllzzastacofsvcdsc`.

> **Reading note (2026-08-29):** §§1–7 below are preserved as written on 2026-08-27 and
> describe the pre-remediation state. Each finding now carries a **Status** line. §0 is the
> current scorecard; §9 lists what is still open. Where §§1–7 and §0/§9 disagree, §0/§9 wins.

---

## 0. Remediation status — verified 2026-08-29

Second pass against the working tree after Track A (Rides safety) and the Rush H3 foundation
landed. **6 of 9 bugs fully closed, all 7 Rush steps shipped, ADR 0013 written and accepted.**

**Full remediation program (2026-08-29 evening):** Phases 1–7 of the H3 Audit Remediation Plan
implemented in-repo (presence RPC + CHECK, canary, bounded supply, resolution threading, hex
coverage flag, shared kill-switch, Rides surge H3 cutover). Apply migrations
`20260830240000`–`20260830260000` and deploy edge functions before enabling
`RUSH_HEX_COVERAGE_ENABLED=1`.

**Landed since the review:** `packages/spatial`, migrations
[`20260829140000_h3_phase1_safety.sql`](../supabase/migrations/20260829140000_h3_phase1_safety.sql),
[`20260829150000_rush_h3_foundation.sql`](../supabase/migrations/20260829150000_rush_h3_foundation.sql),
[`20260829160000_rides_h3_res_and_bounded_supply.sql`](../supabase/migrations/20260829160000_rides_h3_res_and_bounded_supply.sql),
[`20260830240000_delivery_courier_upsert_presence.sql`](../supabase/migrations/20260830240000_delivery_courier_upsert_presence.sql),
[`20260830250000_spatial_index_canary_cron.sql`](../supabase/migrations/20260830250000_spatial_index_canary_cron.sql),
[`20260830260000_rides_surge_h3_cutover.sql`](../supabase/migrations/20260830260000_rides_surge_h3_cutover.sql),
`delivery/coverageCompile.ts`, `dash-coverage/hexCoverage.ts`,
[ADR 0013](adr/0013-rush-coverage-precedence-h3.md).

### Bugs

| # | Finding | Status |
|---|---|---|
| 1 | `h3_resolution` live footgun | ⚠️ **Mitigated** — slider locked; RPC strict res; writers still use `DEFAULT_H3_RESOLUTION` (policy must stay 7) |
| 2 | k-ring off by √3 | ✅ **Closed** |
| 3 | Stale cell survives location update | ✅ **Closed** (Rides + Rush presence RPC) |
| 4 | Surge upsert race | ✅ **Closed** |
| 5 | Legacy/H3 key split-brain | ✅ **Closed** — Rides surge writes H3 as `cell_key`; legacy `grid:` counters zeroed |
| 6 | `.in()` exceeds URL length | ✅ **Closed** — fallback removed |
| 7 | Unbounded supply queries | ✅ **Closed** — LIMIT/ORDER BY on Rides + Rush legacy |
| 8 | `gridRingUnsafe` throws | ✅ **Closed** |
| 9 | Empty-result fallback storm | ✅ **Closed** |
| 10 | Rush presence writes drop the cell | ✅ **Closed** — `delivery_courier_upsert_presence` + online CHECK |

### Rush gaps & plan steps

| Item | Status |
|---|---|
| Gap #1 — no courier presence | ✅ Solved via `courier_availability` evolution (ADR deviation from Step 1) |
| Gap #2 — five coverage definitions | ⚠️ Precedence frozen in ADR 0013 and coded; **not yet the live gate** |
| Gap #3 — polygons jsonb, no index | ⚠️ Hex compile shipped; no bbox prefilter, hex read path not wired |
| Gap #4 — `h3-js` unavailable to clients | ✅ Closed — `@roam/spatial`, `h3-js@4.1.0` pinned both runtimes |
| Step 0 — coverage precedence | ✅ [ADR 0013](adr/0013-rush-coverage-precedence-h3.md) |
| Step 1 — courier presence table | ✅ Shipped as columns on `courier_availability`, **minus `NOT NULL`** |
| Step 2 — presence RPC with hard invariant | ❌ No `courier_upsert_presence`; writes go direct via PostgREST |
| Step 3 — bounded lookup RPC | ✅ `delivery_couriers_in_h3_cells` — 2000-cell cap, `LIMIT`, res-matched |
| Step 4 — compile polygons → hex | ✅ `coverage_cells`, res 7 + 8, compile-on-publish |
| Step 5 — merchant reach hex set | ✅ `merchant_coverage_cells`, disk ∩ market include |
| Step 6 — H3-only dispatch | ⚠️ Shipped behind `RUSH_H3_DISPATCH_ENABLED`; legacy fallback retained |
| Step 7 — windowed hex demand/surge | ✅ `demand_events` → `surge_now` via pg_cron; **zero `grid:` keys in Rush** |

### Enhancements

| Item | Status |
|---|---|
| Vendor/pin `h3-js` | ✅ No `esm.sh/h3-js` remaining |
| One shared spatial module | ⚠️ `@roam/spatial` exists; Deno file is a hand-maintained mirror, `isH3SupplyEnabled` still duplicated |
| Structured `no_supply` telemetry | ✅ All five fields logged |
| Resolution/staleness canary | ❌ **Not started** |
| Coverage-set diffing in admin | ✅ `previewCoverageDiff` |
| Hex overlay in admin | ✅ `HexCellsMapOverlay.tsx` |
| `supply_source` measured not asserted | ✅ Real path + cell count returned |

---

## 1. Verdict

**The strategy is right. The plan doc is describing a system that is more finished than it is,
and the gap between the two is where Rush will get hurt.**

The architectural calls are all correct and I would not change any of them: H3 as the single
logistics grid, hexes for candidate generation only, real distance/ETA on the shortlist, skip
Geohash, defer S2. Point 5 in your product summary — *keep final ranking after H3 fetch* — is the
one people usually get wrong, and you have it right.

What concerns me is different. The plan reads as "Rides is a working hybrid; copy the good half
into Rush." That is not what is in the repo. What is in the repo is:

- **H3 supply in matching is not a hybrid — it is dead code.** `runMatchingWave.ts` never imports
  `loadDriverLocationsH3`. Not behind a flag; the import does not exist. `supply_source` is a
  hardcoded string literal `"legacy"` on both return paths
  ([runMatchingWave.ts:229](supabase/functions/matching/dispatch/runMatchingWave.ts#L229),
  [:297](supabase/functions/matching/dispatch/runMatchingWave.ts#L297)). The
  `h3_supply_enabled` toggle in Matching Brain has **zero** effect on dispatch. That field isn't
  reporting a state, it's a constant.
- **H3 in the quote path is not flag-gated at all.** `pickupEta.ts` runs the H3 RPC
  unconditionally, ignoring `MATCHING_H3_SUPPLY` and `h3_supply_enabled`. So the one place H3 is
  genuinely load-bearing today is the one place with no kill switch.
- **Three different answers to "what k-ring covers 5/15/35 km" coexist in the codebase**, and none
  of them match each other.

So the honest current state is: **H3 is live in exactly one path (quotes), unflagged and
uncalibrated; everywhere else it is scaffolding.** That is a fine place to be — but you should
build Rush knowing it, rather than porting a hybrid that doesn't exist.

**My recommendation for Rush is stronger than the plan doc's.** Don't just make Rush "H3-first."
Rush has one advantage Rides doesn't: **no legacy spatial index to keep alive.** There is no
courier presence table at all today (see §4), so there is nothing to dual-write and nothing to
migrate. Build the presence layer once, correctly, with the invariants below — and then make Rides
adopt *Rush's* implementation later, not the reverse.

---

## 2. Corrections to the plan document

| Plan doc says | Actually true |
|---|---|
| "Matching Brain has H3 policy knobs … `loadDriverLocationsH3` exists — but the live wave path still uses legacy" | Correct, but understates it: the wave path has **no code path to H3 at all**, and `supply_source: "legacy"` is a hardcoded literal, not a measurement. |
| "Pickup ETA prefers an H3 disk … **Falls back** to loading all fresh available drivers if H3 fails" | Only falls back when the RPC **errors**. An RPC that succeeds and returns `[]` is returned as-is ([pickupEta.ts:59-61](supabase/functions/rides/fare/pickupEta.ts#L59-L61)) → quote reports `no_drivers`. A stale-cell or resolution mismatch produces a **silent "no drivers available"**, not a fallback. |
| "Roam's default size is resolution 7 … configurable in `matching.policies`" | `h3_resolution` is persisted and clamped 4–10, but **every writer and reader hardcodes 7**. The knob is live in the UI and honored nowhere. See Bug #1. |
| "Jamaica calibration target `[4, 13, 29]` for radii `[5, 15, 35]` km" | Off by ~1.7×. Those numbers are `radius ÷ edge_length`; the correct divisor is `edge × √3`. See Bug #2. |
| "H3 surge dual-write/lookup is prepared behind `MATCHING_H3_SURGE`" | Prepared, but the dual-key upsert has a split-brain merge and an upsert race. See Bugs #4 and #5. |
| Rush "uses drawn polygons … via `@roam/dash-coverage`" | True, but there is additionally `merchants.delivery_radius_km`, `business_types.max_delivery_radius_km`, `merchant_tiers.default_delivery_radius_km`, and a parish coverage mode. That's **five** overlapping coverage concepts, not two. |

---

## 3. Bugs found

Ordered by what will hurt most at launch.

### Bug #1 — `h3_resolution` is a live footgun (Critical)

The admin UI exposes it. `loadPolicy.ts:216` clamps and persists it. And then:

- [`rides/index.ts:2202`](supabase/functions/rides/index.ts#L2202) — `latLngToH3(lat, lng, 7)`,
  hardcoded, with a literal `// Default resolution 7` comment.
- [`pickupEta.ts:52-53`](supabase/functions/rides/fare/pickupEta.ts#L52-L53) — uses
  `DEFAULT_H3_RESOLUTION`, hardcoded.
- `getCellsForWave()` in `geoIndex.ts` accepts a resolution parameter and *would* use the policy
  value if the wave path ever called it.

**Failure mode:** an operator moves the resolution slider from 7 to 8 to "make matching tighter."
Stored cells are still res 7. Query cells are res 8. **H3 cell IDs encode their resolution, so
res-7 and res-8 strings never compare equal.** Every H3 lookup returns zero rows. Quotes say "no
drivers available" island-wide. Nothing errors, nothing alerts, no log line fires — the system
looks healthy and simply stops matching.

This is the single most dangerous thing in the current implementation, because the trigger is a UI
control that looks safe to touch, and the blast radius is total.

**Fix:** three parts, all of them needed.
1. Store the resolution with the data — `h3_res SMALLINT NOT NULL` beside `h3_cell` — and filter on
   it in the lookup RPC. A mismatch then returns nothing *loudly* rather than silently.
2. Thread `policy.h3_resolution` through every call site; delete the hardcoded `7`s.
3. Make resolution changes a **migration, not a toggle**. Changing it must trigger a re-stamp of
   live presence rows before the read path switches over. Realistically: make the admin control
   read-only with a "contact engineering" note until dual-resolution stamping exists.

> **Status 2026-08-29 — ⚠️ Mitigated, not closed.**
> Done: fix 1 (`h3_res SMALLINT` on `rides.driver_locations` and `delivery.courier_availability`,
> indexed first, filtered in both lookup RPCs) and fix 3 (the slider is `disabled` with a
> "requires an engineering migration" note —
> [H3IndexingSection.tsx:120-133](../apps/admin/src/components/admin/matching-brain/sections/H3IndexingSection.tsx#L120-L133)).
> **Not done: fix 2.** The hardcoded `7`s survive and now disagree with the read path:
> writes stamp `DEFAULT_H3_RESOLUTION` ([rides/index.ts:2202](../supabase/functions/rides/index.ts#L2202),
> [:2239](../supabase/functions/rides/index.ts#L2239),
> [courierConsumerRoutes.ts:449](../supabase/functions/delivery/courierConsumerRoutes.ts#L449)),
> reads use `policy.h3_resolution`
> ([runMatchingWave.ts:136](../supabase/functions/matching/dispatch/runMatchingWave.ts#L136)),
> and `loadDriverLocationsH3` hardcodes `p_h3_res: 7`
> ([loadLocations.ts:120](../supabase/functions/matching/supply/loadLocations.ts#L120)).
> `loadPolicy` still clamps 4–10 and honors the stored value, so the UI lock is the *only* thing
> holding this shut — a direct DB edit still produces the silent island-wide blackout. The rides
> RPC's res predicate is also lenient (`p_h3_res IS NULL OR dl.h3_res IS NULL OR dl.h3_res = p_h3_res`),
> so a mismatch returns nothing *quietly*, which was the failure mode fix 1 was meant to make loud.

### Bug #2 — k-ring calibration is wrong by a factor of √3 (Critical for Rush)

`kRingForRadiusKm()` uses `k = ceil(radius / (edge × √3))`, which is right — adjacent H3 cell
centers are `edge × √3` apart. But `JAMAICA_CALIBRATION.calibratedKRings = [4, 13, 29]` is
`radius / edge` — the √3 was dropped.

At res 7 (edge 1.220 km, center spacing 2.113 km), a k-disk's guaranteed-coverage radius is
`(2k+1) × 1.057 km`:

| Wave | Target | Doc's k | Actual coverage | Cells fetched | Correct k | Cells |
|------|--------|---------|-----------------|---------------|-----------|-------|
| 1 | 5 km | 4 | 9.5 km | 61 | **2** | 19 |
| 2 | 15 km | 13 | 28.5 km | 547 | **7** | 169 |
| 3 | 35 km | 29 | **62.3 km** | **2,611** | **17** | 919 |

k=29 at res 7 covers a 62 km radius — from Kingston that is most of the island. Wave 3 would fetch
2,611 cells to do what 919 does, i.e. you pay a full-island scan to avoid a full-island scan.

Meanwhile the **shipped default** is `wave_h3_k_rings: [0, 2, 6]`
([loadPolicy.ts:122](supabase/functions/matching/policy/loadPolicy.ts#L122)) against radii
`[5, 15, 35]`. k=0 is **one hexagon** — a 1.06 km radius for a 5 km wave. If anyone enables H3
supply with defaults, wave 1 sees roughly 1/20th of its intended catchment and the ride looks
unmatched.

So you have three values for the same question — `[0,2,6]` shipped, `[4,13,29]` documented,
`[3,8,17]` computed — and the shipped one is the worst.

**Fix:** delete `calibratedKRings` and `wave_h3_k_rings` as hand-entered numbers entirely. Derive k
from the wave radius at request time via `kRingForRadiusKm`, with an over-fetch margin of exactly
`+1` ring. Hexes are a *candidate filter*; you already do exact Haversine + drive-time afterwards,
so over-fetching by one ring is free correctness and hand-tuned k values are pure risk. Keep the
policy field only as an optional override, defaulted to null.

> **Status 2026-08-29 — ✅ Closed.** `kRingForRadiusKm` uses `edge × √3` and
> `kRingForRadiusKmWithMargin` adds the +1 ring
> ([geoIndex.ts:59-74](../supabase/functions/_shared/h3/geoIndex.ts#L59-L74)).
> `wave_h3_k_rings` now defaults to `[]` ([loadPolicy.ts:123](../supabase/functions/matching/policy/loadPolicy.ts#L123))
> and is honored only as a non-empty override; `getWaveKRings` derives otherwise.
> `JAMAICA_CALIBRATION.calibratedKRings` is `@deprecated` and corrected to `[4, 9, 18]`.
> The admin field is now a read-only derived preview. All three conflicting answers collapsed to one.

### Bug #3 — Stale H3 cell survives a fresh location update (Critical)

[`rides/index.ts:2200-2204`](supabase/functions/rides/index.ts#L2200-L2204) computes the cell in a
`try/catch` that swallows the error and leaves `h3Cell = null`. The RPC then does:

```sql
h3_cell = COALESCE(EXCLUDED.h3_cell, rides.driver_locations.h3_cell)
```

So on any H3 computation failure, **lat/lng update and `updated_at` refreshes, but `h3_cell` keeps
its old value.** A driver who drives Kingston → Portmore during one failed stamp is now indexed in
Kingston with a fresh timestamp: invisible to Portmore searches, and offered Kingston rides they
cannot reach. Every freshness check passes. Nothing looks wrong.

Because the cell is computed by a remote ESM import (§6), a transient failure here is not
hypothetical.

**Fix:** the cell is a **derived attribute of lat/lng and must never outlive them.** Either compute
it and write it, or write `NULL`. `COALESCE`-preserving a derived spatial key is the bug. Best
shape: make `p_h3_cell` non-nullable in the presence RPC and reject the write without it — a
presence row you cannot index is worse than no presence row, because it silently poisons matching
instead of just being absent.

> Note: the `h3` and `h3_postgis` Postgres extensions are **not available** on this project (checked
> `pg_available_extensions` — only `postgis` 3.3.7, uninstalled). So you cannot make `h3_cell` a
> `GENERATED` column and eliminate this class of bug at the database level. That means the
> write-path invariant above is the *only* defense. Enforce it in SQL, not in TypeScript.

> **Status 2026-08-29 — ⚠️ Closed in Rides, regressed in Rush.**
> Rides is fixed: `rides_upsert_driver_presence` now assigns `h3_cell = EXCLUDED.h3_cell` with no
> `COALESCE` ([20260829140000:62](../supabase/migrations/20260829140000_h3_phase1_safety.sql#L62)),
> and the presence route fails closed with `503 presence_h3_required` when a driver goes online
> without a computable cell ([rides/index.ts:2209-2222](../supabase/functions/rides/index.ts#L2209-L2222)).
> The derived key can no longer outlive its coordinates.
> **But the "enforce it in SQL, not in TypeScript" half was not taken**, and Rush now demonstrates
> exactly why — see **Bug #10**. `delivery.courier_availability.h3_cell` is nullable, there is no
> presence RPC, and two write sites bypass the TypeScript guard.

### Bug #4 — Surge upsert race (High — fires exactly when surge matters)

[`20260625130000_h3_surge_cells.sql`](supabase/migrations/20260625130000_h3_surge_cells.sql) does
`SELECT … FOR UPDATE` → `IF NOT FOUND` → `INSERT`. `FOR UPDATE` cannot lock a row that does not
exist, so two concurrent requests in a new cell both miss, both insert, and the second hits the
unique constraint and raises.

The moment this fires is the first burst of demand in a cell — which is precisely the demand spike
surge exists to price. Under load you get 500s on the surge path instead of surge.

**Fix:** `INSERT … ON CONFLICT (cell_key) DO UPDATE`. Standard, and removes the explicit lock.

> **Status 2026-08-29 — ✅ Closed.** `rides_upsert_surge_cell` is now
> `INSERT … ON CONFLICT (cell_key) DO UPDATE`
> ([20260829140000:117-141](../supabase/migrations/20260829140000_h3_phase1_safety.sql#L117-L141)).
> No `SELECT … FOR UPDATE`, no `IF NOT FOUND` insert. Negative deltas take a plain guarded `UPDATE`
> and no-op when the row is absent, which is correct.

### Bug #5 — Legacy grid and H3 keys don't nest, so surge merges across mismatched cells (High)

The legacy key is `grid:{floor(lat*50)}:{floor(lng*50)}` — a 0.02° square, ~2.22 km × 2.12 km at
Jamaica's latitude. An H3 res-7 hex is ~5.16 km², ~2.4 km across. **They tile the plane
differently and neither nests inside the other.** One hex straddles 2–4 squares and vice versa.

The upsert matches on `cell_key = p_cell_key OR h3_cell_key = p_h3_cell_key`, then updates
`WHERE cell_key = v_row.cell_key`. So a request in square B that shares a hex with square A finds
A's row and **increments A's counter**. Then, if reads pass only the legacy key — which the plan doc
says is the common case today ("callers mostly still pass legacy cell keys only") — square B reads
its own nonexistent row and gets `1.0`. Demand is counted in one place and priced in another.

Separately, that `OR` predicate can use neither index and degrades to a sequential scan under
`FOR UPDATE`.

**Fix:** don't reconcile two geometries — that problem has no correct answer. Pick a cutover
instant, stop writing legacy keys, and backfill `h3_cell_key` from the stored lat/lng of the demand
event rather than from the square. For **Rush, never introduce the square key at all** (§5).

> **Status 2026-08-29 — ⚠️ Partial (Rides deferred by plan; Rush clean).**
> The cross-cell merge is gone: the upsert no longer matches on
> `cell_key = p_cell_key OR h3_cell_key = p_h3_cell_key`, so a request in square B can no longer
> increment square A's counter, and the `OR`-predicate seq-scan under `FOR UPDATE` went with it.
> **Rush took the recommendation in full** — no `grid:` key exists anywhere in `delivery/`.
> Still open for Rides: `gridCellKey()` is called at seven sites in
> [rides/index.ts](../supabase/functions/rides/index.ts), so both keys are still written, and
> `readSurgeMultiplier` prefers `.eq("h3_cell_key", …)`
> ([rides/index.ts:961-966](../supabase/functions/rides/index.ts#L961-L966)) — a read can still land
> on a different row than the write. No cutover instant has been picked. §7 rated Rides fixes as
> deferrable, so this is open by plan rather than by oversight.

### Bug #6 — `.in("h3_cell", cells)` will exceed URL length (High, latent)

[`loadLocations.ts:145`](supabase/functions/matching/supply/loadLocations.ts#L145) uses PostgREST
`.in()`, which serializes into the **query string**. H3 index strings are 15 chars, so ~16 bytes per
cell: 919 cells ≈ 15 KB, 2,611 cells ≈ 42 KB. Common proxy/server URL limits are 8–16 KB.

This is the *fallback* path, so it will sit dormant until the day the RPC has a hiccup — and then
the fallback fails too, and you drop to the nationwide legacy scan. Fallbacks that fail under the
same conditions as the primary aren't fallbacks.

**Fix:** the fallback must also be a POST-body RPC, or chunk the cell array. Never send hex sets in
a URL.

> **Status 2026-08-29 — ❌ Not started.**
> [loadLocations.ts:148](../supabase/functions/matching/supply/loadLocations.ts#L148) is unchanged:
> `.in("h3_cell", h3Cells)` still serializes the full hex set into the query string. The primary
> path is now a bounded RPC, which *lowers* the odds of reaching this branch but does not change
> what happens when it is reached. This is the only review finding with no work against it at all.

### Bug #7 — Unbounded supply queries (High at scale)

Neither `loadAvailableDriverLocations()` nor `rides_drivers_in_h3_cells()` has a `LIMIT`. The legacy
loader selects **every** fresh available driver nationwide. If PostgREST's `db-max-rows` is set, you
silently truncate to the first N **in arbitrary order** — matching would then only ever see a
random subset with no error. If it isn't set, the payload grows without bound.

Also note the `authenticator` role carries `statement_timeout = 8s`; a 2,611-element `= ANY(...)`
against a partial index on a busy table can approach that.

**Fix:** `LIMIT` inside the RPC, ordered by `updated_at DESC`, cap ~500. Cap the cell-array length
server-side and reject oversized requests loudly.

> **Status 2026-08-29 — ⚠️ Partial.**
> Both RPCs took the fix in full: `rides_drivers_in_h3_cells` and `delivery_couriers_in_h3_cells`
> cap the cell array at 2000 with `RAISE EXCEPTION 'h3_cell_array_too_large'`, clamp `p_limit`,
> and `ORDER BY … DESC LIMIT`
> ([20260829160000:33-59](../supabase/migrations/20260829160000_rides_h3_res_and_bounded_supply.sql#L33-L59)).
> Still unbounded: `loadAvailableDriverLocations`
> ([loadLocations.ts:43-47](../supabase/functions/matching/supply/loadLocations.ts#L43-L47)) has no
> `.limit()` — it is still the nationwide scan with the `db-max-rows` silent-truncation exposure.
> `pickupEta`'s own legacy loader did get `.limit(500)`
> ([pickupEta.ts:63](../supabase/functions/rides/fare/pickupEta.ts#L63)); the matching copy was
> missed. Rush's legacy fallback uses `.limit(80)` with **no `ORDER BY`**
> ([courierConsumerRoutes.ts:246-251](../supabase/functions/delivery/courierConsumerRoutes.ts#L246-L251)),
> which is the arbitrary-subset failure this bug describes, just with a smaller N.

### Bug #8 — `gridRingUnsafe` throws near pentagons (Low for Jamaica)

`h3Ring()` uses `h3.gridRingUnsafe`, which **throws** rather than degrading when a pentagon is in
range. No pentagon is near Jamaica, so this is inert today — but it is a live trap for any market
expansion and the function name gives no warning at the call site. Use `gridDisk`/`gridRing` (safe
variants) and delete `h3Ring` if unused.

> **Status 2026-08-29 — ✅ Closed.** `h3Ring` is reimplemented as a hollow ring derived from two
> safe `gridDisk` calls and marked deprecated
> ([geoIndex.ts:46-57](../supabase/functions/_shared/h3/geoIndex.ts#L46-L57)). No `gridRingUnsafe`
> reference remains. The pentagon trap is gone ahead of any market expansion.

### Bug #9 — Empty-result fallback storm in the legacy loader (Low)

`loadAvailableDriverLocations()` only returns early on a **non-empty** result
([loadLocations.ts:81](supabase/functions/matching/supply/loadLocations.ts#L81)). A legitimate
"zero drivers online" answer falls through to the second source, then loops to the reduced `select`
and tries both again — 4 round trips to learn what the first one already knew. The no-supply case,
which is the common case in a new market at launch, is the slowest path in the system.

> **Status 2026-08-29 — ✅ Closed.** Both loaders now treat a successful empty result as an answer:
> `loadAvailableDriverLocations` returns on `rows.length === 0` with an explicit
> "Valid empty market — do not storm alternate sources" guard
> ([loadLocations.ts:82-85](../supabase/functions/matching/supply/loadLocations.ts#L82-L85)), and
> `loadLegacyDriverLocations` in `pickupEta` returns on any non-error result
> ([pickupEta.ts:64-75](../supabase/functions/rides/fare/pickupEta.ts#L64-L75)). Zero-driver now
> costs one round trip.
>
> Related improvement beyond the finding: `pickupEta` no longer returns a bare empty RPC result as
> `no_drivers`. An empty success falls back once to the legacy loader and emits structured
> `no_supply` telemetry distinguishing `empty_market_or_stale_index` from `h3_empty_legacy_hit`
> ([pickupEta.ts:99-124](../supabase/functions/rides/fare/pickupEta.ts#L99-L124)) — this closes the
> silent-blackout correction raised in §2, row 2.

### Bug #10 — Rush presence writes drop the H3 cell (Critical — found 2026-08-29)

*New finding from the remediation pass. This is Bug #3 reintroduced in the Rush code written to
avoid it.*

`delivery.courier_availability.h3_cell` is **nullable**, there is no presence RPC (Step 2 was not
built), and the cell is stamped in TypeScript at the call site. Two write sites skip that stamp:

- [`delivery/index.ts:1750-1770`](../supabase/functions/delivery/index.ts#L1750-L1770) — the
  courier-location mirror writes `current_lat`, `current_lng`, `last_location_update` **and forces
  `is_online: true`**, with no `h3_cell` / `h3_res`. A courier who moves through this path keeps a
  fresh timestamp and a stale cell, and `delivery_couriers_in_h3_cells` filters on
  `is_online = TRUE`, so dispatch will serve them. This is the Kingston → Portmore failure verbatim.
- [`courierConsumerRoutes.ts:440-457`](../supabase/functions/delivery/courierConsumerRoutes.ts#L440-L457)
  — `current_lat`/`current_lng` are assigned unconditionally, but the H3 stamp is inside
  `if (isOnline)`. An offline heartbeat carrying coordinates updates the position and leaves the
  cell behind. Lower severity (the lookup filters `is_online`), but the same shape.

The online path itself is correct and fails closed with `503 presence_h3_required`
([:451-456](../supabase/functions/delivery/courierConsumerRoutes.ts#L451-L456)) — the defect is that
the invariant lives in one call site instead of in the schema.

**Fix:** exactly what §5 Step 1/2 specified and what was skipped —
`h3_cell TEXT NOT NULL` plus `h3_res SMALLINT NOT NULL` on the presence row, reached only through
`delivery.courier_upsert_presence(...)` which raises on a null/empty cell. Then neither call site
can write a half-row, and `delivery/index.ts` is forced to stamp or fail. Backfill by clearing
`is_online` on rows with a null cell rather than guessing a value.

Until that lands, the narrow patch is to stamp the cell in `delivery/index.ts` alongside the
coordinates, and to move the `courierConsumerRoutes` stamp out of the `isOnline` branch.

---

## 4. The Rush-specific gaps

### Gap #1 — There is no courier presence table. At all. (Blocker)

This is the finding that changes the plan. Grepping the migrations for courier location storage
turns up only:

- `orders.courier_location_updated_at` (a timestamp on the order)
- `logistics.*.last_lat` / `last_lng` (on the job row)

There is **no `delivery.courier_locations`** — no table of where couriers *are*, only where they
were relative to a job they already have.

The consequence: **Rush cannot currently answer "which couriers are near this merchant?"** It can
only answer "where is the courier already assigned to this order?" Assignment today must therefore
be happening off some other signal (or manually).

Plan step 2 — "stamp courier presence with `h3_cell`, same pattern as driver presence" — presumes a
presence table exists to stamp. It doesn't. **This is the first thing to build, and it's the whole
foundation.** Good news: it also means no legacy index to dual-write, so you get to do it right the
first time.

> **Status 2026-08-29 — ✅ Solved, by a different route than Step 1 proposed.**
> Rather than a new `delivery.courier_locations`, ADR 0013 chose to evolve the existing
> `delivery.courier_availability` with `h3_cell` + `h3_res` and no second presence table
> ([20260829150000:62-73](../supabase/migrations/20260829150000_rush_h3_foundation.sql#L62-L73)),
> with a partial index on `(h3_res, h3_cell, last_location_update DESC) WHERE is_online`. The
> deviation is recorded and reasonable — Rush *does* now answer "which couriers are near this
> merchant?" The cost of the deviation is that the two `NOT NULL` invariants from Step 1 did not
> come along, which is Bug #10.

### Gap #2 — Five overlapping definitions of "do we deliver here?"

`service_zone_polygons` (include/exclude), `merchants.delivery_radius_km`,
`business_types.max_delivery_radius_km`, `merchant_tiers.default_delivery_radius_km`, and parish
coverage mode. Nothing in the schema establishes precedence.

Right now a customer can plausibly be inside a market polygon, outside the merchant's radius,
inside the tier default, and in a covered parish — and which answer wins depends on which code path
asked. At enterprise level this shows up as "the app said they deliver and then the order was
cancelled," which is a support-cost and trust problem, not a technical one.

**This must be resolved before the hex compile, not after** — otherwise you compile an ambiguity
into a cell set and make it harder to see.

> **Status 2026-08-29 — ⚠️ Decided and coded; not yet the live gate.**
> [ADR 0013](adr/0013-rush-coverage-precedence-h3.md) freezes the five-step order exactly as
> recommended, with a customer-facing reason code per step, and demotes tier / business-type radii
> to merchant-creation defaults. The codes and copy are implemented in
> [`dash-coverage/hexCoverage.ts`](../packages/dash-coverage/src/hexCoverage.ts) as
> `COVERAGE_CUSTOMER_COPY` + `evaluateHexCoverage`.
> **But `evaluateHexCoverage` has no runtime caller** — it is exported from the package index and
> nothing else. The precedence rule was settled before the compile, as required, so the ambiguity
> was not baked into the cell set; the remaining work is wiring the eligibility check to it.
> ADR 0013 line 30 scopes this deliberately ("Rule 4 activates only after merchant hex reach
> ships"), so it is open by plan.



### Gap #3 — Polygons are jsonb with no spatial index

`delivery.service_zone_polygons.polygon` is a `jsonb` array of `{lat,lng}`, and the only index is a
btree on `market_id`. Point-in-polygon runs in JavaScript via ray-cast
([dash-coverage/src/index.ts:19](packages/dash-coverage/src/index.ts#L19)) over every zone passed
in, with **no bounding-box prefilter** — O(zones × vertices) per check, per request.

The ray-cast itself is correct (the `yj - yi` division is properly short-circuited on horizontal
edges). It's the access pattern that doesn't scale: one national market list with detailed polygons
turns every "can I order?" into a full geometry sweep.

PostGIS 3.3.7 **is** available on the project (not installed). That's the natural home for polygon
editing and for the polygon→hex compile.

> **Status 2026-08-29 — ⚠️ Compile shipped; read path not switched.**
> `CREATE EXTENSION IF NOT EXISTS postgis` now runs in both new migrations, and the polygon→hex
> compile exists in [`delivery/coverageCompile.ts`](../supabase/functions/delivery/coverageCompile.ts),
> invoked on publish from
> [`marketRoutes.ts:769`](../supabase/functions/delivery/admin/marketRoutes.ts#L769) with merchant
> reach recomputed at [:790](../supabase/functions/delivery/admin/marketRoutes.ts#L790). Polygons
> remain source of truth; cells are deleted and rebuilt per market, so the recompile-all property holds.
> Still open: the JS ray-cast in `dash-coverage` has **no bounding-box prefilter**, and because
> `evaluateHexCoverage` is unwired (Gap #2), the per-request geometry sweep is still the live path.
> The O(zones × vertices) cost this gap describes is unchanged in production.

### Gap #4 — `h3-js` exists nowhere outside edge functions

No `package.json` in the repo depends on `h3-js`; it's only reachable via
`https://esm.sh/h3-js@4.1.0` inside Deno. So the courier app, the customer app, and dash-admin
**cannot compute or render a cell today.** Any client-side hex work — coverage previews, offline
"am I in zone", debug overlays — needs a dependency decision first, and it must be the same major
version as the edge runtime or the two will disagree about cell IDs.

> **Status 2026-08-29 — ✅ Closed.** [`packages/spatial`](../packages/spatial/src/index.ts) exists
> with `h3-js` pinned to an exact `4.1.0` in its `package.json`, and the Deno side moved from
> `https://esm.sh/h3-js@4.1.0` to `npm:h3-js@4.1.0` — no `esm.sh/h3-js` import remains anywhere.
> Both runtimes are on the same exact version, so cell IDs cannot diverge. The admin hex overlay
> ([`HexCellsMapOverlay.tsx`](../packages/dash-admin/src/pages/markets/HexCellsMapOverlay.tsx)) is
> the first client-side consumer.

---

## 5. Enterprise implementation plan for Rush

Ordered so each step is independently shippable and each one is safe to stop after.

### Step 0 — Settle the coverage precedence rule (before any code)

Write down, in one place, the single evaluation order. My recommendation:

```
1. Market active?           → no  → "not in a service area"
2. In an exclude polygon?   → yes → "not currently serving your area"
3. In an include polygon?   → no  → "outside delivery zone"
4. Within merchant radius?  → no  → "too far from this store"
5. Deliverable.
```

Radius becomes a **per-merchant narrowing inside** market coverage, never a widener. Tier and
business-type values become *defaults applied at merchant creation*, not runtime inputs. That
collapses five concepts to two: **market coverage (hex set)** and **merchant reach (hex set)**.

> **Status — ✅ Done.** Adopted verbatim in [ADR 0013](adr/0013-rush-coverage-precedence-h3.md),
> with a reason code and customer copy attached to each step. See Gap #2 for the wiring caveat.

### Step 1 — `delivery.courier_locations`, with the invariants baked in

Mirror `rides.driver_locations`, but fix the three things Rides got wrong:

```sql
CREATE TABLE delivery.courier_locations (
  courier_user_id  UUID PRIMARY KEY,
  lat              DOUBLE PRECISION NOT NULL,
  lng              DOUBLE PRECISION NOT NULL,
  h3_cell          TEXT    NOT NULL,          -- never nullable
  h3_res           SMALLINT NOT NULL,          -- travels with the cell
  available        BOOLEAN NOT NULL DEFAULT FALSE,
  heading_degrees  DOUBLE PRECISION,
  vehicle_class    TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courier_loc_h3_avail
  ON delivery.courier_locations (h3_res, h3_cell, updated_at DESC)
  WHERE available = TRUE;
```

Three deliberate differences from Rides:

1. **`h3_cell NOT NULL`** — kills Bug #3 structurally. A presence write without a cell is rejected,
   not silently half-applied. Since the `h3` extension isn't available, this constraint is your only
   enforcement point; put it in the schema where it cannot be bypassed.
2. **`h3_res` stored and indexed first** — kills Bug #1. A resolution change produces zero rows
   *for that resolution*, which is detectable, rather than an invisible island-wide match failure.
3. **`updated_at DESC` in the index** — makes the `LIMIT` in Step 3 an index-only walk.

Follow the post-remediation security pattern that's now established in this database: RLS on, public
view with `security_invoker = true`, no `anon` grant. Courier live location is stalking-grade PII —
`rides_driver_locations` is `authenticated`-only with RLS, and Rush must match that from day one,
not retrofit it.

> **Status — ⚠️ Shipped as columns on `courier_availability`, minus both `NOT NULL`s.**
> Difference 3 (`last_location_update DESC` in a partial index) landed. Differences 1 and 2 — the
> two constraints that were the entire point of building the table fresh — did not: `h3_cell` and
> `h3_res` are both nullable. That is **Bug #10**, and it is why the "you get to do it right the
> first time" advantage was partly spent. The security pattern *was* followed: RLS enabled,
> `security_invoker` public views, `authenticated`/`service_role` grants only, no `anon`
> ([20260829150000:239-253](../supabase/migrations/20260829150000_rush_h3_foundation.sql#L239-L253)).

### Step 2 — Presence RPC with a hard write invariant

```sql
CREATE FUNCTION delivery.courier_upsert_presence(
  p_courier UUID, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION,
  p_h3_cell TEXT, p_h3_res SMALLINT, p_available BOOLEAN
) ... 
-- RAISE EXCEPTION on NULL/empty p_h3_cell — do NOT COALESCE to the previous value
-- INSERT ... ON CONFLICT (courier_user_id) DO UPDATE
```

The rule to hold: **`h3_cell` and `lat/lng` are written in the same statement or neither is
written.** Never let a derived spatial key outlive the coordinates it was derived from.

Add a `pg_cron` sweep (pg_cron **is** installed) that marks presence rows stale past the freshness
window, so dead app sessions can't linger as phantom supply.

> **Status — ❌ RPC not built; ✅ sweep done.**
> There is no `delivery.courier_upsert_presence`. Presence is written by direct PostgREST
> `update`/`insert` from two different modules, with the cell stamped in TypeScript at one of them.
> The rule "`h3_cell` and `lat/lng` are written in the same statement or neither is written" has no
> enforcement point, which is precisely how Bug #10 arose.
> The `pg_cron` sweep did land — `delivery_courier_stale_offline` every 5 min, flipping
> `is_online = FALSE` past a 15-minute window
> ([20260829150000:207-233](../supabase/migrations/20260829150000_rush_h3_foundation.sql#L207-L233)),
> alongside a per-minute `delivery_refresh_surge_now`.

### Step 3 — Candidate lookup RPC, bounded

```sql
CREATE FUNCTION delivery.couriers_in_h3_cells(
  p_cells TEXT[], p_res SMALLINT, p_fresh_since TIMESTAMPTZ, p_limit INT DEFAULT 200
)
-- RAISE if array_length(p_cells,1) > 2000
-- WHERE h3_res = p_res AND h3_cell = ANY(p_cells) AND available AND updated_at >= p_fresh_since
-- ORDER BY updated_at DESC LIMIT p_limit
```

Bounded cell array (Bug #6), bounded rows (Bug #7), resolution-matched (Bug #1). Always call it via
RPC POST, never PostgREST `.in()`.

> **Status — ✅ Done as specified.** `public.delivery_couriers_in_h3_cells`
> ([20260829150000:79-128](../supabase/migrations/20260829150000_rush_h3_foundation.sql#L79-L128))
> raises `h3_cell_array_too_large` above 2000 cells, clamps `p_limit` to 500, filters
> `h3_res = p_res` strictly (no lenient `IS NULL` escape, unlike the Rides equivalent), and orders
> by `last_location_update DESC`. Called via `.rpc()` from
> [courierConsumerRoutes.ts:227](../supabase/functions/delivery/courierConsumerRoutes.ts#L227).
> The same shape was back-ported to Rides as `rides_drivers_in_h3_cells`.

### Step 4 — Compile polygons → hex sets

Keep polygon drawing as the admin UX; it's good and operators understand it. Compile it:

```sql
CREATE TABLE delivery.coverage_cells (
  market_id UUID NOT NULL,
  h3_cell   TEXT NOT NULL,
  h3_res    SMALLINT NOT NULL,
  kind      TEXT NOT NULL,           -- 'include' | 'exclude'
  PRIMARY KEY (market_id, h3_res, h3_cell, kind)
);
```

Compile on polygon save (`polygonToCells` + `cellToBoundary`), not on read. Then "is this customer
in a market?" is a single primary-key hit instead of a JS geometry sweep.

Three things to get right:

- **Compile at both res 7 and res 8 from the start.** Storage is trivial; it's the only cheap
  migration path if 7 proves too coarse for a dense corridor. Retrofitting a second resolution
  after launch means re-stamping live presence.
- **Boundary policy must be explicit.** Res 7 hexes are ~2.4 km across; a hex on a zone edge is
  partly in and partly out. Decide once: *include* a boundary hex for market coverage (generous —
  the merchant radius check in Step 0 narrows it anyway), and *exclude* it for exclusion zones
  (conservative — never promise delivery into a no-go area). Write this in the compiler, not per
  caller.
- **Keep the polygon as source of truth, cells as a derived cache**, with a recompile-all job. When
  they disagree, the polygon wins and the cells get rebuilt.

> **Status — ✅ Done, all three sub-points.** `delivery.coverage_cells` matches the proposed shape
> ([20260829150000:10-32](../supabase/migrations/20260829150000_rush_h3_foundation.sql#L10-L32)).
> `COMPILE_H3_RESOLUTIONS = [7, 8]` compiles both resolutions from the start; boundary policy lives
> in the compiler (`polygonToH3Cells` unions `polygonToCells` with vertex-stamped edge hexes, so
> boundary hexes are kept for include *and* exclude, matching ADR 0013); and compile is
> delete-then-rebuild per market on publish, so the polygon always wins.

### Step 5 — Merchant reach as a hex set

`merchant_coverage_cells (merchant_id, h3_cell, h3_res)`, computed as
`gridDisk(store_cell, kRingForRadiusKm(delivery_radius_km)) ∩ market_include_cells`. Recompute on
radius change or merchant relocation.

"Does this store deliver to me?" becomes one indexed lookup, and the intersection guarantees a
merchant can never reach outside its market — enforcing the Step 0 precedence in data rather than
in code.

> **Status — ⚠️ Table and compile done; recompute trigger incomplete.**
> `delivery.merchant_coverage_cells (merchant_id, h3_cell, h3_res)` exists with the
> `∩ market include` intersection in `recomputeMerchantCoverageCells`, and the intersection does
> enforce "a merchant can never reach outside its market" in data.
> **But the only caller is market publish** ([marketRoutes.ts:790](../supabase/functions/delivery/admin/marketRoutes.ts#L790)).
> "Recompute on radius change or merchant relocation" was not wired: `delivery_radius_km` is
> updated at [merchantRoutes.ts:465](../supabase/functions/delivery/admin/merchantRoutes.ts#L465)
> and [:620](../supabase/functions/delivery/admin/merchantRoutes.ts#L620) with no recompute call.
> A merchant's reach cells therefore drift from its stored radius until someone republishes the
> market — a derived cache with a missing invalidation edge, the same class of defect as Bug #3
> one level up. Harmless while Rule 4 is dormant (Gap #2); a correctness bug the day it activates.

### Step 6 — Wire dispatch, H3-only

Rush matching calls Step 3 with `gridDisk(pickup, kRingForRadiusKm(waveRadius) + 1)`, then does
exact Haversine and drive-time ranking on the shortlist. **No legacy loader, no nationwide scan,
no `supply_source` field to lie about.**

Ship it behind one flag, `RUSH_DISPATCH_ENABLED`, gating the whole dispatcher. Do **not** replicate
the Rides pattern of an env flag AND a policy flag gating a code path that doesn't exist — that
double gate is why nobody noticed the wave path was never wired.

> **Status — ⚠️ Wired and single-gated; legacy fallback retained.**
> `RUSH_H3_DISPATCH_ENABLED` is a single env flag with no second policy gate, and the H3 path is
> genuinely wired — `gridDisk` at `kRingForRadiusKmWithMargin(DISPATCH_RADIUS_KM)` into the Step 3
> RPC ([courierConsumerRoutes.ts:216-244](../supabase/functions/delivery/courierConsumerRoutes.ts#L216-L244)),
> with `supplyPath` and `cellsQueried` measured rather than asserted.
> Deviation: "no legacy loader, no nationwide scan" was not taken —
> [:246-257](../supabase/functions/delivery/courierConsumerRoutes.ts#L246-L257) falls back to a
> `courier_availability` scan with `.limit(80)` and **no `ORDER BY`**, which is the arbitrary-subset
> hazard of Bug #7. Defensible as launch insurance; it should be ordered by
> `last_location_update DESC` at minimum, and carry a log line so silent fallback is visible.

### Step 7 — Demand/surge on hexes, time-windowed

Do not port `rides.surge_cells`. Its counter is monotonic (`open_requests` only moves by explicit
delta), so one missed decrement — a crashed request, a failed cancel — ratchets surge upward
permanently with no decay. Its multiplier also drifts by *event count* rather than time.

For Rush, store **demand events** (`h3_cell`, `h3_res`, `occurred_at`) and compute surge as a
windowed aggregate over the last N minutes, via `pg_cron` into a small `surge_now` table. That is
self-healing: a missed event costs you a few minutes of accuracy instead of a permanently wrong
price. Single H3 key. No `grid:` string anywhere in Rush.

> **Status — ✅ Done as specified.** `delivery.demand_events (h3_cell, h3_res, occurred_at, …)` +
> `delivery.surge_now`, refreshed by `delivery_refresh_surge_now(15)` on a per-minute `pg_cron` job
> ([20260829150000:134-233](../supabase/migrations/20260829150000_rush_h3_foundation.sql#L134-L233)).
> The aggregate is a full `DELETE` + rebuild from a time window, so it is self-healing — no
> monotonic counter, no ratchet, no decrement to miss. Events are written from
> [courierConsumerRoutes.ts:346](../supabase/functions/delivery/courierConsumerRoutes.ts#L346).
> **Verified: no `grid:` string exists anywhere under `supabase/functions/delivery/`.**
> `rides.surge_cells` was not ported.

---

## 6. Enhancements worth doing

> **Status 2026-08-29 — 5 of 7 done.** Per item:
> **✅ Pin `h3-js`** — exact `4.1.0` in `packages/spatial/package.json`, `npm:h3-js@4.1.0` on Deno,
> zero `esm.sh` imports left.
> **⚠️ One shared spatial module** — `@roam/spatial` exists, but
> [`_shared/h3/geoIndex.ts`](../supabase/functions/_shared/h3/geoIndex.ts) is a hand-maintained
> *mirror* of it ("Keep in sync with packages/spatial/src/index.ts"), not an import. The specific
> duplication called out below is still present: `isH3SupplyEnabled` at
> [geoIndex.ts:143](../supabase/functions/_shared/h3/geoIndex.ts#L143) **and**
> [loadPolicy.ts:452](../supabase/functions/matching/policy/loadPolicy.ts#L452). A comment is not
> a compiler; the drift risk this item was raised about is unchanged.
> **✅ `no_supply` telemetry** — `logNoSupply` emits `cells_queried`, `h3_res`, `rows_returned`,
> `fresh_since`, `fell_back` plus a `reason` discriminator
> ([pickupEta.ts:35-42](../supabase/functions/rides/fare/pickupEta.ts#L35-L42)); matching logs
> `match_wave_supply` with path, cells, rows and res.
> **❌ Resolution/staleness canary — not started.** No cron job, function, or check anywhere
> compares `h3_res` against policy or `h3_cell` against `recompute(lat, lng)`. Bugs #1 and #3
> remain *silent* failures; this was the item that would have made them loud, and it is the one
> that would have caught Bug #10 in Rush before launch.
> **✅ Coverage-set diffing** — `previewCoverageDiff` +
> [marketRoutes.ts:846](../supabase/functions/delivery/admin/marketRoutes.ts#L846).
> **✅ Hex overlay** — [`HexCellsMapOverlay.tsx`](../packages/dash-admin/src/pages/markets/HexCellsMapOverlay.tsx).
> **✅ `supply_source` measured** — [runMatchingWave.ts:127-139](../supabase/functions/matching/dispatch/runMatchingWave.ts#L127-L139)
> assigns from `result.source`; the hardcoded literal is gone, and the wave path now actually
> imports `loadDriverLocationsH3`, so the field reports a real state.

**Launch-blocking:**

- **Vendor or pin `h3-js` properly.** `https://esm.sh/h3-js@4.1.0` is a remote import with no
  lockfile entry and no integrity check, and it's on the path that computes the cell whose failure
  causes Bug #3. Add it to a real dependency manifest shared by edge and clients so cell IDs cannot
  diverge across runtimes.
- **One shared spatial module.** `isH3SupplyEnabled` currently exists **twice** —
  `geoIndex.ts:159` and `loadPolicy.ts:445` — with the same logic. Two copies of a flag check is how
  you end up with a flag that's on in one place and off in another. Extract `@roam/spatial` with the
  cell math, k-ring derivation, resolution constant, and flag logic; have Rides and Rush both import
  it.
- **Structured `no_supply` telemetry.** Every zero-candidate result should log
  `{cells_queried, h3_res, rows_returned, fresh_since, fell_back}`. Today a stale-cell blackout and
  a genuinely empty market produce the identical log line, so you cannot tell "nobody was working"
  from "the index is broken" — and at launch you will need to tell those apart within minutes.
- **A resolution/staleness canary.** A cron check: `count(*) WHERE h3_res <> <policy>` and
  `count(*) WHERE h3_cell <> recompute(lat,lng)` on a sample. Either being non-zero is a page. This
  is what turns Bugs #1 and #3 from silent into loud.

**Shortly after:**

- **Coverage-set diffing in admin.** When an operator edits a polygon, show *"+14 hexes, −3 hexes,
  ~4,200 addresses affected"* before save. Polygon editing is a production dispatch change made by a
  non-engineer with no preview today.
- **Hex overlay in admin.** Render the compiled cells over the drawn polygon. Boundary behavior at
  res 7 is genuinely surprising the first time you see it, and operators will otherwise file bugs
  about it for months.
- **`supply_source` should be measured, not asserted.** Return the actual path taken plus cell count
  and fallback reason. The current hardcoded literal is worse than no field — it actively misled the
  plan document that started this review.

**Deliberately defer:**

- **S2 / viewport indexing.** Your call to defer is right; revisit only if map pin loading actually
  becomes slow.
- **Res 8/9 for dense corridors.** Compile the cells now (Step 4), switch later. Don't tune before
  you have real courier density data.
- **Predictive positioning / demand forecasting.** Needs months of hex-stamped history. Steps 1–7
  are what generate that history — which is a good reason to get the schema right now.

---

## 7. What I'd do this week for a Rush launch

| Priority | Item | Why now | Status |
|---|---|---|---|
| 1 | Step 0 — write down coverage precedence | Everything downstream compiles this rule into data | ✅ |
| 2 | Step 1 + 2 — `courier_locations` with NOT NULL cell + `h3_res` | Blocker; nothing about Rush dispatch works without it | ⚠️ columns yes, **NOT NULL + RPC no** |
| 3 | Step 3 — bounded lookup RPC | Small, and closes Bugs #6/#7 before they exist in Rush | ✅ |
| 4 | Fix Bug #2 — derive k from radius, delete hand-entered k-rings | One function; removes a whole category of miscalibration | ✅ |
| 5 | Steps 4–5 — compile coverage + merchant reach at res 7 **and** 8 | Cheap now, expensive to retrofit | ⚠️ compiled; merchant recompute trigger missing |
| 6 | Step 6 — H3-only dispatcher behind one flag | The actual feature | ⚠️ shipped with legacy fallback |
| 7 | Enhancement — `no_supply` telemetry + canary | You will need this in week one of a real market | ⚠️ telemetry ✅, **canary ❌** |

**Rides fixes can wait** — with one exception. **Bug #1 is live in production right now**, and its
trigger is a slider in an admin UI. Until resolution is threaded properly, disable or lock that
control. That is a ten-minute change and it removes the ability to accidentally halt island-wide
matching from a settings page.

Bug #3 (stale cell) is also live and affects the quote path today, but it degrades gracefully-ish —
it makes individual quotes wrong rather than taking the system down. Fix it in the same pass as
threading the resolution.

> **Status 2026-08-29:** the slider is locked and Rides' stale-cell path is fixed. The Rides
> resolution threading (fix 2 of Bug #1) was not done, so the lock is load-bearing — see §9.

---

## 8. Verification notes

- Live DB checks against `csfllzzastacofsvcdsc`: `h3` and `h3_postgis` extensions **not available**
  (`postgis` 3.3.7 available but uninstalled; `pg_cron` 1.6.4 installed).
- `public.rides_driver_locations` and `public.rides_surge_cells` both confirmed
  `security_invoker=true` with RLS enabled on the base tables — the pattern Rush should copy.
- k-ring geometry derived from H3 res-7 average edge length 1.2206 km; adjacent cell centers
  `edge × √3` = 2.113 km; k-disk inradius `(2k+1) × 1.057` km; cell count `3k² + 3k + 1`.
- Legacy grid cell size computed at Jamaica's latitude: `0.02°` lat = 2.22 km, `0.02°` lng = 2.12 km.
- No code or schema changes were made during this review.

### Second pass — 2026-08-29

- Verified against the working tree, not against a plan document: every ✅ above was confirmed by
  reading the shipped code or migration, and every ❌ by an exhaustive grep for the construct.
- `esm.sh/h3-js`, `gridRingUnsafe`, and `grid:` under `functions/delivery/` each return **zero**
  matches. `.in("h3_cell"` returns exactly one, at `loadLocations.ts:148`.
- `canary` returns zero matches across `supabase/migrations/` and `supabase/functions/`.
- `evaluateHexCoverage` has exactly one reference outside its own definition: the package re-export.
- No code or schema changes were made during this pass either. This document remains a review.

---

## 9. Open items — 2026-08-29 (post remediation program)

Ordered by what will hurt most at launch, same as §3.

| # | Item | Where | Severity |
|---|---|---|---|
| 1 | Apply migrations `20260830240000`–`20260830260000` + deploy `spatial-index-canary` | Supabase | **Ops** |
| 2 | Soak canary 24h green before expanding hex coverage | `spatial-index-canary` | High |
| 3 | Enable `RUSH_HEX_COVERAGE_ENABLED=1` per market after compile | env | Medium — deferred flip |
| 4 | Dual-stamp migration if live resolution ever leaves 7 | writers + policy | Low — slider locked |
| 5 | Delete remaining legacy `grid:` surge rows after soak | `rides.surge_cells` | Low |

### The two that matter this week

**Apply Phase 1 migration + deploy presence writers** so Bug #10 cannot recur in prod.

**Run the canary** — every remaining failure mode is silent without it.
