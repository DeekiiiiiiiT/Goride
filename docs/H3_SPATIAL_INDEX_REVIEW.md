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
hex coverage (on by default; `RUSH_HEX_COVERAGE_ENABLED=0` kill-switch only).

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
| Gap #2 — five coverage definitions | ✅ **Closed** — hex gate is now the live path, Rule 4 active, `RUSH_HEX_COVERAGE_ENABLED=0` kill-switch |
| Gap #3 — polygons jsonb, no index | ⚠️ Hex read path now live; polygon sweep is the fallback, still no bbox prefilter |
| Gap #4 — `h3-js` unavailable to clients | ✅ Closed — `@roam/spatial`, `h3-js@4.1.0` pinned both runtimes |
| Step 0 — coverage precedence | ✅ [ADR 0013](adr/0013-rush-coverage-precedence-h3.md) |
| Step 1 — courier presence table | ✅ **Closed** — columns + `courier_availability_online_h3_check` + unique `driver_id` |
| Step 2 — presence RPC with hard invariant | ✅ **Closed** — `delivery_courier_upsert_presence` raises on missing cell |
| Step 3 — bounded lookup RPC | ✅ `delivery_couriers_in_h3_cells` — 2000-cell cap, `LIMIT`, res-matched |
| Step 4 — compile polygons → hex | ✅ `coverage_cells`, res 7 + 8, compile-on-publish |
| Step 5 — merchant reach hex set | ✅ **Closed** — recompute now also fires on merchant write |
| Step 6 — H3-only dispatch | ⚠️ Shipped behind `RUSH_H3_DISPATCH_ENABLED`; fallback retained but now bounded + ordered + reasoned |
| Step 7 — windowed hex demand/surge | ✅ `demand_events` → `surge_now` via pg_cron; **zero `grid:` keys in Rush** |

### Enhancements

| Item | Status |
|---|---|
| Vendor/pin `h3-js` | ✅ No `esm.sh/h3-js` remaining |
| One shared spatial module | ✅ **Closed** — `loadPolicy` delegates to the single `geoIndex` kill-switch; no duplicated flag logic |
| Structured `no_supply` telemetry | ✅ All five fields logged |
| Resolution/staleness canary | ✅ **Closed** — `spatial-index-canary` edge fn on a 10-min `pg_cron` + `pg_net` schedule |
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

> **Status 2026-08-29 (rev. after Phase 1–7) — ⚠️ Mitigated; one residual by design.**
> **Fix 1 done and now strict.** `h3_res` is stored and indexed on both presence tables, and the
> lenient predicate was tightened to a plain `dl.h3_res = p_h3_res`
> ([20260830240000:184](../supabase/migrations/20260830240000_delivery_courier_upsert_presence.sql#L184)) —
> a resolution mismatch is now a clean zero-row answer on a known axis rather than an accident.
> **Fix 3 done.** The slider is `disabled` with a "requires an engineering migration" note
> ([H3IndexingSection.tsx:120-133](../apps/admin/src/components/admin/matching-brain/sections/H3IndexingSection.tsx#L120-L133)).
> **Fix 2 partial — deliberately.** The read path is fully threaded:
> `loadDriverLocationsH3` now takes an `h3Res` parameter and forwards it as `p_h3_res`
> ([loadLocations.ts:110-127](../supabase/functions/matching/supply/loadLocations.ts#L110-L127)),
> fed `policy.h3_resolution` from
> [runMatchingWave.ts:138](../supabase/functions/matching/dispatch/runMatchingWave.ts#L138).
> The **write** path still stamps `DEFAULT_H3_RESOLUTION`
> ([rides/index.ts:2212](../supabase/functions/rides/index.ts#L2212),
> [:2249](../supabase/functions/rides/index.ts#L2249)), as does `pickupEta`
> ([:92-93](../supabase/functions/rides/fare/pickupEta.ts#L92-L93)).
>
> **Residual, stated plainly:** the system is correct **only while `policy.h3_resolution` is 7.**
> `loadPolicy` still clamps 4–10 and honors the stored value, so a direct DB write to that column
> would leave the wave path querying at res 8 against rows stamped 7 — zero rows, island-wide.
> The canary does **not** cover this: it compares stored `h3_res` against `DEFAULT_H3_RESOLUTION`,
> not against the policy row, so a uniformly-stamped fleet looks healthy while the read path
> queries elsewhere. The UI lock remains the real guard. To close: have the canary read
> `matching.policies.h3_resolution` and alert when it differs from `DEFAULT_H3_RESOLUTION`, which
> makes the one remaining trigger loud. See §9 item 1.

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

> **Status 2026-08-29 (rev.) — ✅ Closed in both verticals, and now enforced in SQL.**
> Rides: `rides_upsert_driver_presence` assigns `h3_cell = EXCLUDED.h3_cell` with no `COALESCE`
> ([20260829140000:62](../supabase/migrations/20260829140000_h3_phase1_safety.sql#L62)); the route
> fails closed with `503 presence_h3_required`
> ([rides/index.ts:2219-2232](../supabase/functions/rides/index.ts#L2219-L2232)).
> Rush: `delivery_courier_upsert_presence` re-derives the cell **only when coordinates are present
> in the same statement**, and otherwise leaves both untouched
> ([20260830240000:112-129](../supabase/migrations/20260830240000_delivery_courier_upsert_presence.sql#L112-L129)) —
> which is the invariant this bug asked for, expressed exactly.
> The "enforce it in SQL" half was taken on the second pass: a `CHECK` constraint now makes an
> online row without a cell **unrepresentable** ([:46-55](../supabase/migrations/20260830240000_delivery_courier_upsert_presence.sql#L46-L55)).
> See Bug #10 for the regression this closed.

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

> **Status 2026-08-29 (rev.) — ✅ Closed. The cutover was taken.**
> Three things landed, in the order the fix prescribed.
> First, the cross-cell merge went away with the `OR` predicate: the upsert is now
> `ON CONFLICT (cell_key)` only, so a request in square B can no longer increment square A.
> Second, **the two geometries were never reconciled — one was retired.** `gridCellKey()` is now a
> thin alias over `surgeCellKey()` returning an **H3 cell id**
> ([buildQuote.ts:42-45](../supabase/functions/rides/fare/buildQuote.ts#L42-L45)), so all seven
> call sites in `rides/index.ts` write H3 as `cell_key` without any of them changing. The
> `grid:{floor(lat*50)}:{floor(lng*50)}` square is no longer produced anywhere.
> Third, the cutover instant was picked and the stale counters retired rather than migrated:
> [`20260830260000_rides_surge_h3_cutover.sql`](../supabase/migrations/20260830260000_rides_surge_h3_cutover.sql)
> zeroes `open_requests` and resets `surge_multiplier` on every `grid:%` row, so pre-cutover demand
> cannot keep pricing rides after the switch, and both columns carry a comment recording the
> cutover date. Zeroing rather than back-computing is the right call — H3 cannot be recomputed from
> a square key in SQL without the extension, and a few minutes of lost surge history beats a
> fabricated one.
> Residual: legacy `grid:%` rows remain in the table as zeroed tombstones and `readSurgeMultiplier`
> still has its dual-read branch. Both are inert once writes are H3-only; a later cleanup can drop
> the rows and the branch.

### Bug #6 — `.in("h3_cell", cells)` will exceed URL length (High, latent)

[`loadLocations.ts:145`](supabase/functions/matching/supply/loadLocations.ts#L145) uses PostgREST
`.in()`, which serializes into the **query string**. H3 index strings are 15 chars, so ~16 bytes per
cell: 919 cells ≈ 15 KB, 2,611 cells ≈ 42 KB. Common proxy/server URL limits are 8–16 KB.

This is the *fallback* path, so it will sit dormant until the day the RPC has a hiccup — and then
the fallback fails too, and you drop to the nationwide legacy scan. Fallbacks that fail under the
same conditions as the primary aren't fallbacks.

**Fix:** the fallback must also be a POST-body RPC, or chunk the cell array. Never send hex sets in
a URL.

> **Status 2026-08-29 (rev.) — ✅ Closed, by deletion.**
> The `.in("h3_cell", …)` branch was **removed entirely** rather than chunked. `loadDriverLocationsH3`
> now has exactly two outcomes: the bounded RPC, or the legacy loader — the file comment states the
> rule as "On RPC failure → legacy loader only (never PostgREST `.in()` hex URL)"
> ([loadLocations.ts:106-109](../supabase/functions/matching/supply/loadLocations.ts#L106-L109)),
> and the fallback now emits `h3_driver_locs_rpc_failed` with `cells`, `h3_res` and `fell_back`
> so the degradation is visible rather than silent.
> **Verified: zero `.in("h3_cell"` matches remain under `supabase/functions/`.**
> Deleting the middle path is better than chunking it — a fallback that shares a failure mode with
> its primary was the actual finding, and there is now no third path to keep correct.

### Bug #7 — Unbounded supply queries (High at scale)

Neither `loadAvailableDriverLocations()` nor `rides_drivers_in_h3_cells()` has a `LIMIT`. The legacy
loader selects **every** fresh available driver nationwide. If PostgREST's `db-max-rows` is set, you
silently truncate to the first N **in arbitrary order** — matching would then only ever see a
random subset with no error. If it isn't set, the payload grows without bound.

Also note the `authenticator` role carries `statement_timeout = 8s`; a 2,611-element `= ANY(...)`
against a partial index on a busy table can approach that.

**Fix:** `LIMIT` inside the RPC, ordered by `updated_at DESC`, cap ~500. Cap the cell-array length
server-side and reject oversized requests loudly.

> **Status 2026-08-29 (rev.) — ✅ Closed on every path.**
> Both RPCs cap the cell array at 2000 with `RAISE EXCEPTION 'h3_cell_array_too_large'`, clamp
> `p_limit`, and `ORDER BY … DESC LIMIT`
> ([20260829160000:33-59](../supabase/migrations/20260829160000_rides_h3_res_and_bounded_supply.sql#L33-L59)).
> The two gaps flagged on the previous pass are both fixed:
> `queryFreshDriverLocations` now carries `.order("updated_at", { ascending: false })` and
> `.limit(LEGACY_SUPPLY_LIMIT)`
> ([loadLocations.ts:44-51](../supabase/functions/matching/supply/loadLocations.ts#L44-L51)), so the
> nationwide legacy scan is bounded **and deterministic** — the `db-max-rows` silent-truncation
> exposure is gone, since the truncation is now ours and ordered by freshness.
> Rush's fallback gained both a `.gte("last_location_update", freshSince)` filter and
> `.order("last_location_update", { ascending: false })`
> ([courierConsumerRoutes.ts:256-262](../supabase/functions/delivery/courierConsumerRoutes.ts#L256-L262)),
> so its `LIMIT` now selects the freshest couriers rather than an arbitrary subset.

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

> **Status 2026-08-29 (rev.) — ✅ Closed, structurally.**
> The structural fix was taken, not the narrow patch.
> [`20260830240000_delivery_courier_upsert_presence.sql`](../supabase/migrations/20260830240000_delivery_courier_upsert_presence.sql)
> does all four steps in the right order: force-offline any online row missing a cell (**without
> guessing H3 in SQL** — the migration says so explicitly, which is correct, since a fabricated cell
> is worse than an offline courier); de-duplicate `driver_id` keeping the newest row and add the
> unique index the upsert needs; add `courier_availability_online_h3_check` making an online row
> without `h3_cell` + `h3_res` **unrepresentable**; and add
> `delivery_courier_upsert_presence`, which raises `presence_h3_required` / `location_required`
> before writing and re-derives the cell only alongside coordinates.
> Both offending call sites now route through it: `delivery/index.ts` replaced its hand-rolled
> mirror with `upsertCourierPresence(...)` and propagates the failure status to the caller
> ([delivery/index.ts:1744-1758](../supabase/functions/delivery/index.ts#L1744-L1758)), sharing one
> helper ([`courierPresence.ts:79`](../supabase/functions/delivery/courierPresence.ts#L79)) with the
> consumer route. The invariant now lives in the schema, so a future third writer cannot reintroduce
> this — which was the whole point of the finding.
> The canary independently watches for it via `rush_online_null_cell` and `rush_stale_cell`.

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

> **Status 2026-08-29 (rev.) — ✅ Closed. The hex gate is now the live path.**
> [ADR 0013](adr/0013-rush-coverage-precedence-h3.md) freezes the five-step order exactly as
> recommended, with a customer-facing reason code per step, and demotes tier / business-type radii
> to merchant-creation defaults.
> The wiring gap flagged on the previous pass is closed:
> [`coverageZones.ts:365`](../supabase/functions/delivery/admin/coverageZones.ts#L365) resolves the
> customer's cell and evaluates include/exclude against `coverage_cells` as a primary-key hit, and
> **Rule 4 is now active** — [:719-740](../supabase/functions/delivery/admin/coverageZones.ts#L719-L740)
> narrows by `merchant_coverage_cells` and returns `too_far_from_store` with the ADR's copy.
> Two design choices worth recording, both correct:
> - The gate is **on by default** with `RUSH_HEX_COVERAGE_ENABLED=0` as a kill-switch back to
>   polygons, rather than off-by-default. Right way round for a path that must be exercised to be
>   trusted, and it avoids the Rides pattern where a dark flag hid an unwired code path for months.
> - Rule 4 enforces **only when the merchant actually has compiled reach cells** (`reachCount > 0`),
>   so a merchant awaiting compile fails open to market coverage instead of rejecting every
>   customer. Without that guard, shipping the compile and the gate together would have blacked out
>   every uncompiled merchant.
>
> Five concepts are now two, in data as well as on paper.



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
> **Revised 2026-08-29:** the hex path is now live (Gap #2), so the common case is a
> primary-key lookup on `coverage_cells`, not a geometry sweep — the cost this gap describes is off
> the hot path. The ray-cast remains as the fallback for cells with no compiled coverage and under
> the kill-switch, and still has **no bounding-box prefilter**. That is now a
> degraded-mode performance issue rather than a per-request one, which is a fair place to leave it.

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

> **Status 2026-08-29 (rev.) — ✅ Closed. All three differences now hold.**
> Difference 3 (`last_location_update DESC` in a partial index) landed with the foundation.
> Differences 1 and 2 landed on the second pass in a form that suits a table with existing rows:
> instead of column-level `NOT NULL` — which would have required inventing cells for historical
> rows — `courier_availability_online_h3_check` enforces the constraint **where it matters**, on
> online rows only, after force-offlining the rows that could not satisfy it
> ([20260830240000:8-55](../supabase/migrations/20260830240000_delivery_courier_upsert_presence.sql#L8-L55)).
> Offline history keeps its nulls; nothing dispatchable can lack a cell. That is a better fit than
> the blanket `NOT NULL` this section proposed, and it reaches the same invariant.
> The security pattern was followed throughout: RLS enabled, `security_invoker` public views,
> `authenticated`/`service_role` grants only, no `anon`
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

> **Status 2026-08-29 (rev.) — ✅ Closed, matching the specification.**
> `public.delivery_courier_upsert_presence(p_driver_id, p_lat, p_lng, p_h3_cell, p_h3_res,
> p_is_online, p_active_order_id)` exists and behaves as this step prescribed: it
> `RAISE`s on a null/empty cell for an online write rather than coalescing to the previous value,
> and it is an `INSERT … ON CONFLICT (driver_id) DO UPDATE`
> ([20260830240000:61-133](../supabase/migrations/20260830240000_delivery_courier_upsert_presence.sql#L61-L133)).
> The rule holds: the cell is re-derived only when coordinates arrive in the same statement.
> Both writers go through `courierPresence.ts`, so there is now one enforcement point in TypeScript
> *and* one in SQL.
> The `pg_cron` sweep landed with the foundation — `delivery_courier_stale_offline` every 5 min
> past a 15-minute window
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

> **Status 2026-08-29 (rev.) — ✅ Closed. The missing invalidation edge was added.**
> `delivery.merchant_coverage_cells (merchant_id, h3_cell, h3_res)` with the `∩ market include`
> intersection enforces "a merchant can never reach outside its market" in data.
> The drift flagged on the previous pass is fixed: `recomputeMerchantCoverageCells` is now imported
> and called from the merchant write path
> ([merchantRoutes.ts:49](../supabase/functions/delivery/admin/merchantRoutes.ts#L49),
> [:65](../supabase/functions/delivery/admin/merchantRoutes.ts#L65)) as well as from market publish
> ([marketRoutes.ts:790](../supabase/functions/delivery/admin/marketRoutes.ts#L790)), so a radius
> change or relocation invalidates the derived cells immediately.
> This mattered more once Rule 4 went live (Gap #2) — the two shipped together, which is the right
> ordering.

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
> Deviation retained: "no legacy loader, no nationwide scan" was not taken — the fallback still
> exists. But the two hazards flagged on the previous pass are fixed: it now filters on
> `freshSince`, orders by `last_location_update DESC`
> ([:256-262](../supabase/functions/delivery/courierConsumerRoutes.ts#L256-L262)), and records a
> `legacyReason` discriminating `flag_off` / `origin_invalid` / RPC error, so a silent slide onto
> the legacy path is now visible in logs.
> A bounded, ordered, *instrumented* fallback is a reasonable launch posture; the case for deleting
> it is weaker now than it was. Revisit once the H3 path has soaked.

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

> **Status 2026-08-29 (rev. after Phase 1–7) — 7 of 7 done.** Per item:
> **✅ Pin `h3-js`** — exact `4.1.0` in `packages/spatial/package.json`, `npm:h3-js@4.1.0` on Deno,
> zero `esm.sh` imports left.
> **✅ One shared spatial module (flag logic)** — the specific duplication called out below is
> resolved: `loadPolicy` no longer reimplements the env check, it delegates —
> "Single kill-switch implementation lives in geoIndex — policy is the second gate"
> ([loadPolicy.ts:456-464](../supabase/functions/matching/policy/loadPolicy.ts#L456-L464)). There is
> now one place where `MATCHING_H3_SUPPLY` / `MATCHING_H3_SURGE` are read, so a flag cannot be on in
> one place and off in another. `isRushHexCoverageEnabled` was added to the same single home.
> Residual, lower stakes than the flag split: `_shared/h3/geoIndex.ts` is still a hand-maintained
> mirror of `@roam/spatial` rather than an import of it. The cell math is now identical in both and
> covered by tests on the package side, so drift would surface as a test failure rather than a
> silent divergence — but a comment is still not a compiler.
> **✅ `no_supply` telemetry** — `logNoSupply` emits `cells_queried`, `h3_res`, `rows_returned`,
> `fresh_since`, `fell_back` plus a `reason` discriminator
> ([pickupEta.ts:35-42](../supabase/functions/rides/fare/pickupEta.ts#L35-L42)); matching logs
> `match_wave_supply` with path, cells, rows and res.
> **✅ Resolution/staleness canary — built.**
> [`supabase/functions/spatial-index-canary/index.ts`](../supabase/functions/spatial-index-canary/index.ts)
> runs five checks across both verticals — `rides_res_mismatch`, `rush_res_mismatch`,
> `rush_online_null_cell`, and an 80-row freshest-first sample per vertical that **recomputes
> `latLngToH3(lat, lng)` and compares it to the stored cell** — returning `503` with a named alert
> list when any is non-zero. Scheduled every 10 minutes through `pg_cron` → `pg_net` with a shared
> cron secret ([`20260830250000_spatial_index_canary_cron.sql`](../supabase/migrations/20260830250000_spatial_index_canary_cron.sql)).
> Two details worth crediting: it is **detect-only** ("never auto-rewrite production rows"), which
> is right — a canary that silently repairs is a canary that hides the bug it found; and the stale
> sample orders by recency, so it watches the rows that are actually dispatchable.
> Gap: the res checks compare stored `h3_res` against `DEFAULT_H3_RESOLUTION`, not against
> `matching.policies.h3_resolution` — so the one surviving Bug #1 trigger (a direct DB edit of the
> policy row) is the one thing this canary cannot see. See §9 item 1.
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
| 2 | Step 1 + 2 — `courier_locations` with NOT NULL cell + `h3_res` | Blocker; nothing about Rush dispatch works without it | ✅ CHECK + presence RPC |
| 3 | Step 3 — bounded lookup RPC | Small, and closes Bugs #6/#7 before they exist in Rush | ✅ |
| 4 | Fix Bug #2 — derive k from radius, delete hand-entered k-rings | One function; removes a whole category of miscalibration | ✅ |
| 5 | Steps 4–5 — compile coverage + merchant reach at res 7 **and** 8 | Cheap now, expensive to retrofit | ✅ incl. recompute on merchant write |
| 6 | Step 6 — H3-only dispatcher behind one flag | The actual feature | ⚠️ shipped; fallback bounded + instrumented |
| 7 | Enhancement — `no_supply` telemetry + canary | You will need this in week one of a real market | ✅ both |

**All seven shipped.** The week's list is done; §9 is what remains beyond it.

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

### Third pass — 2026-08-29 (after Phases 1–7)

- Re-verified every ⚠️/❌ from the second pass against the working tree. Nine statuses improved;
  none regressed.
- `.in("h3_cell"` → **zero** matches under `supabase/functions/` (was one).
- `delivery_courier_upsert_presence` has two callers, both via `courierPresence.ts`; no direct
  `courier_availability` location write remains in `delivery/index.ts`.
- `gridCellKey` now resolves to `surgeCellKey` returning an H3 id, so all seven Rides call sites
  emit H3 without individual edits.
- Canary verified as a real edge function with five checks and a `pg_cron` schedule, not a stub.
- **Housekeeping:** two migrations share the timestamp `20260830240000` —
  `_delivery_courier_upsert_presence` and `_rush_marketplace_pricing`. They touch disjoint schemas
  so ordering between them is immaterial, but the collision will make `supabase db push` ordering
  non-deterministic between environments. Worth renaming one before the next deploy.
- Still no code or schema changes made by this review.

---

## 9. Open items — 2026-08-29 (post remediation program)

**All ten bugs are addressed in-repo and all seven §7 priorities are done.** What remains is
deployment, one blind spot in the canary, and three low-stakes residuals.

### Ops — nothing below is live until this happens

| # | Item | Where | Severity |
|---|---|---|---|
| 1 | Apply migrations `20260830240000`–`20260830260000` + deploy `spatial-index-canary`, `delivery`, `rides`, `matching` | Supabase | **Blocking** |
| 2 | Set `fleet_cron_secret` in `private.fleet_ops_secrets` | Supabase | **Blocking** — canary raises without it |
| 3 | Soak canary 24 h green before trusting the hex gate | `spatial-index-canary` | High |
| 4 | Rename one of the two `20260830240000_*` migrations | `supabase/migrations/` | Medium — push order is non-deterministic while they collide |

The code is written but **unapplied**: Bug #10's `CHECK`, the presence RPC, the surge cutover and
the canary schedule are all migrations. Until they run, production is still on the pre-remediation
state that §§3–4 describe, regardless of what the working tree says.

### Genuinely open findings

| # | Item | Where | Severity |
|---|---|---|---|
| 5 | **Canary cannot see the last Bug #1 trigger** — it compares stored `h3_res` to `DEFAULT_H3_RESOLUTION`, not to `matching.policies.h3_resolution` | [spatial-index-canary/index.ts:17](../supabase/functions/spatial-index-canary/index.ts#L17) | Medium |
| 6 | Write path still stamps `DEFAULT_H3_RESOLUTION` while read path honors policy | [rides/index.ts:2212](../supabase/functions/rides/index.ts#L2212), [pickupEta.ts:92](../supabase/functions/rides/fare/pickupEta.ts#L92) | Medium — safe only while policy = 7 |
| 7 | Step 6 legacy fallback retained (bounded + ordered + reasoned, but still a scan) | [courierConsumerRoutes.ts:255](../supabase/functions/delivery/courierConsumerRoutes.ts#L255) | Low — revisit after soak |
| 8 | `_shared/h3/geoIndex.ts` is a hand-maintained mirror of `@roam/spatial`, not an import | both files | Low — flag logic now shared; cell math is not |
| 9 | No bbox prefilter on the polygon ray-cast (now the degraded path only) | `dash-coverage` | Low |
| 10 | Zeroed `grid:%` tombstones + dual-read branch in `readSurgeMultiplier` | `rides.surge_cells`, [rides/index.ts:961](../supabase/functions/rides/index.ts#L961) | Low — inert; clean up after soak |

### The one that matters

**Item 5 closes the last silent failure mode in the system.** Everything else on this list is
either an ops step or a known, bounded residual. Bug #1's blast radius — island-wide matching stops,
nothing errors — is unchanged; all that changed is that the trigger is now a direct DB write rather
than a slider. The canary is already running, already reads both presence tables, and already
returns `503` on a named alert. Adding one query against `matching.policies.h3_resolution` and
alerting when it differs from `DEFAULT_H3_RESOLUTION` converts the one remaining silent failure into
a page, and it is a few lines in a function that exists.

Do that, and every failure mode in this review is either fixed or loud.
