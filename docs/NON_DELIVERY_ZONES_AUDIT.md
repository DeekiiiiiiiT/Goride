# Non-Delivery Zones (Exclusions) — Architecture Audit

**Date:** 2026-08-28
**Scope:** `delivery.service_zone_polygons` (`kind = 'exclude'`), `packages/dash-coverage/src/index.ts`
(`evaluateCoverage`), `geometry.ts` (`pointInMultiPolygon`), `hexCoverage.ts`,
`supabase/functions/delivery/admin/coverageZones.ts` (`resolveMarketForPoint`),
`packages/dash-admin/src/pages/markets/{MarketsPage,coverageGeo}.tsx`
**Method:** Code read + live database verification against GoRide (`csfllzzastacofsvcdsc`).
**Status:** ✅ **Closeout complete (2026-08-29).** TIE-BREAK-1 fixed; EXC-8 policy path proven;
block / parish-scoped / schedule paths exercised live. Ops watch remains ongoing.
**Related:** [NON_DELIVERY_ZONES_RUNBOOK.md](./NON_DELIVERY_ZONES_RUNBOOK.md) · ADRs 0014–0018 ·
`docs/DELIVERY_MARKETS_GEOSPATIAL_AUDIT.md` (parent system — OPEN-1…14 closed)

---

## ▶ CLOSEOUT COMPLETE — 2026-08-29

**One-line:** exclude wins equal-priority ties; exclusions default to priority **100**; Spanish Town
surcharge pilot fires at `18.02125, -76.97145`; block + parish scoped + `zone_schedules` each have ≥1 live row.

| Task | Result |
|---|---|
| TIE-BREAK-1 | ✅ `pickWinningMatch` exclude-first; PostGIS `resolve_containing_zones` aligned; regression test |
| Priority defaults | ✅ migration `…240000_zone_priority_bands`; UI/API exclude default 100; ADR-0014 amended (soft bands, safe islands via higher include) |
| Schedule `at` | ✅ `zonedNow(tz, at)` honours injected clock; unit tests pass |
| Pilot fires | ✅ exclude priority 100 > service area 10; `effective_to` extended to ~2026-09-05; `delivery` redeployed |
| Untested paths | ✅ block pilot · parish scoped · zone_schedules (`00:00`–`23:59:59` on block pilot) |
| Guards | ✅ losing/tying=0 · scoped=1 · schedules=1 · block=1 · parent regressions=0 |
| Tests | ✅ dash-coverage **35** · dash-pricing **53** |

### Task 5 — Ops watch (ongoing)

- Edge logs: `[coverage] PostGIS parity mismatch` — unset `COVERAGE_POSTGIS_PRIMARY` if unexplained mismatches appear
- After each pilot expiry: confirm `v_expired_active_exclusions` catches it

### Guards — verified clean 2026-08-29

```sql
-- 1. exclusions that tie or lose to an overlapping include  (must be 0)
select m.name, e.name as exclusion, e.priority, i.name as include_zone, i.priority
from delivery.service_zone_polygons e
join delivery.service_zone_polygons i
  on i.market_id = e.market_id and i.kind = 'include'
join delivery.service_markets m on m.id = e.market_id
where e.kind = 'exclude' and e.is_active and i.is_active
  and i.priority >= e.priority and st_intersects(e.geom, i.geom);

-- 2. coverage of the untested paths  (all must be > 0)
select 'scoped' k, count(*) v from delivery.scoped_exclusion_zones
union all select 'schedules', (select count(*) from delivery.zone_schedules)
                            + (select count(*) from delivery.scoped_zone_schedules)
union all select 'block_action', count(*) from delivery.service_zone_polygons
  where kind='exclude' and zone_policy->>'action' = 'block';

-- 3. parent-system regressions  (must stay 0)
select 'zone_jsonb_truncated' k, count(*) v from delivery.service_zone_polygons
  where geom is not null and st_numgeometries(geom) > 1
    and jsonb_array_length(polygon) < st_npoints(geom) - 1
union all select 'multipart_in_parish_boundary_mode', count(*) from delivery.service_parishes
  where coverage_mode='parish_boundary' and st_numgeometries(foundation_geom) > 1;
```

```bash
cd packages/dash-coverage && npx vitest run    # expect 35+ passing
cd packages/dash-pricing  && npx vitest run    # expect 53+ passing
```

<details>
<summary>Historical work plan (pre-2026-08-29 closeout)</summary>

### Task 1 — Fix the tie-break (P1, ~15 min)

`packages/dash-coverage/src/zoneEval.ts` — invert so a no-go zone never loses a coin-flip:

```ts
const kindOrder = (k: ZoneKind) => (k === 'exclude' ? 0 : 1);   // exclude wins ties (fail safe)
```

### Task 2 — Separate the priority bands (P1, ~20 min)

Exclusions DEFAULT 100; includes stay low (service areas at 10). No hard CHECK (safe islands need
include priority > exclude). Soft bands documented in ADR-0014.

### Task 3 — Prove the pilot actually fires (P1, ~10 min)

Re-probe `18.02125, -76.97145` after priority bump.

### Task 4 — Exercise the three untested paths (P1, ~1 hr)

- **`block` action**
- **`scoped_exclusion_zones` at parish scope**
- **`zone_schedules` recurring window**

</details>

---

## 0. Status at a glance (updated 2026-08-29, final closeout)

**All program items closed.** TIE-BREAK-1 fixed; EXC-8 Done (surcharge + block + scoped + schedule exercised).

> Closeout evidence (2026-08-29):
> - **TIE-BREAK-1** — exclude-wins ties in JS + PostGIS; equal-priority regression test.
> - **Priority bands** — exclude DEFAULT 100; live excludes bumped; migration `…240000`.
> - **EXC-8** — surcharge pilot priority 100 wins at centroid; J$200 policy on row; split invariant retained in dash-pricing.
> - **Paths** — block market exclude · parish scoped · zone_schedules (1 each).
> - **delivery** edge function redeployed with `@roam/dash-coverage` tie-break + schedule `at` fix.

**Verification evidence (closeout 2026-08-29):**

| Check | Result |
|---|---|
| `dash-pricing` tests | **53 passing** |
| `dash-coverage` tests | **35 passing** (was 32) |
| Exclusions losing/tying to includes | **0** |
| Market excludes | **2** (surcharge + block) |
| `scoped_exclusion_zones` | **1** parish |
| `zone_schedules` | **1** |
| Pilot centroid winner | EXC-8 surcharge exclude @ priority 100 |
| Edge | `delivery` redeployed 2026-08-29 |

---

## 0b. Prior glance (2026-08-28, superseded)

**SURCHARGE-1, EXC-6 and PRIORITY-DEFAULT-1 are closed and independently verified.**
EXC-1 through EXC-5, EXC-7 and EXC-9 were already built; closeout exercised most of them live.

> ⚠️ **One new P1 opened during closeout verification — TIE-BREAK-1 (§2c).**
> The Spanish Town pilot exclusion is **inert**: it sits at priority 10, tied with the *Service area 1*
> include, and `pickWinningMatch` resolves equal-priority ties **in favour of include**. The
> `surcharge` policy is never evaluated and no J$200 is charged. Verified by probing
> `resolve_containing_zones` at the pilot's own centroid.
>
> **EXC-8 is therefore Partial** — the pilot proves creation, geometry validation and net-coverage
> refresh, but not the policy path it was built to test. `scoped_exclusion_zones`, schedules, and the
> `block` action all remain at **0 rows**.

> Closeout evidence (2026-08-28):
> - **SURCHARGE-1** — zone surcharge folded into `buildOrderPricing` before split; 35 `dash-pricing` tests; `delivery` function redeployed.
> - **EXC-8** — Spanish Town pilot exclude `EXC-8 audit pilot (safety surcharge)` published as coverage **v4**; pin `18.0213, -76.97145`.
> - **EXC-7** — `refresh_market_net_coverage` fixed (MultiPolygon cast); Spanish Town `net_coverage_geom` populated (~12.13 km²).
> - **EXC-6** — hardened shadow logging; `COVERAGE_POSTGIS_EVAL=1` + `COVERAGE_POSTGIS_PRIMARY=1` on GoRide `delivery`; JS fallback retained.
> - **PRIORITY-DEFAULT-1** — `service_zone_polygons.priority` DEFAULT **10**.

**Verification evidence (closeout 2026-08-28):**

| Check | Result |
|---|---|
| `dash-pricing` tests | **53 passing** across 4 files (incl. SURCHARGE-1 split-invariant suite) |
| `dash-coverage` tests | **32 passing** |
| Split invariant asserted | ✅ `platform + courier ≈ deliveryFee` at `engine.test.ts:384, 413, 433` |
| Promo funding (COURIER-1 cross-fix) | ✅ `expect(promoCostJmd).toBe(deliveryFeeCourierAmount)` — courier kept whole |
| Migrations | `…200000`…`…210000` + `…220000_zone_priority_default_10` + `…230000_fix_net_coverage_multipolygon` |
| ADRs | 0014–0018 |
| **Exclusions in production** | **1** market exclude — *inert, see TIE-BREAK-1* |
| `scoped_exclusion_zones` | **0** — global/parish layer never exercised |
| `zone_schedules` + `scoped_zone_schedules` | **0** — recurring windows never exercised |
| `block`-action exclusions | **0** — only `surcharge` piloted |
| **Markets with `net_coverage_geom`** | Spanish Town **yes** (1) |
| `exclusions with priority ≤ 0` | **0** ✅ |
| Edge secrets | `COVERAGE_POSTGIS_EVAL=1`, `COVERAGE_POSTGIS_PRIMARY=1` |
| **Parent-system regressions** | **none** — 921 catalog rows · 14/14 parishes `ST_Equals` catalog · both jsonb guards 0 |

**Two design decisions worth calling out as good judgment:**

1. `evaluateCoverage` takes an injectable `at: Date = new Date()`, so all time-window and schedule
   logic is deterministically testable.
2. PostGIS was first shadow-only, then promoted behind `COVERAGE_POSTGIS_PRIMARY` with full JS
   fallback — schedules / ADR-0018 / policy still resolve in JS on the GiST candidate subset.

---

## 1. What is correct (and genuinely above average)

| Area | State |
|---|---|
| **Set semantics** | `inZone = inside ≥1 include AND NOT inside any exclude` (`index.ts:71`). This is the industry-standard model and the right choice. |
| **Multi-part + hole geometry** | `pointInMultiPolygon` (`geometry.ts:48-62`) walks every part, tests the outer ring, then rejects on holes. An exclusion can be multi-part and hole-bearing. |
| **Holes auto-materialise as exclusions** | `promote_boundary_to_market_zone` converts interior rings of official COD-AB boundaries into `exclude` zones. Sophisticated — most systems silently fill holes. |
| **Author-time conflict detection** | `detectCoverageConflicts` (`coverageGeo.ts:136`, wired at `MarketsPage.tsx:695`) flags `cutout_outside_town`, `overlapping_cutouts`, `tiny_delivery_area`. Rare and valuable. |
| **Versioned and auditable** | Exclusions flow through coverage versioning; `zoneSnapshotPayload` carries `kind`, `multiPolygon`, and `boundary_pcode` into the published snapshot, so a change is rollback-able. |
| **Schema constraints** | `CHECK (kind IN ('include','exclude'))`, `CHECK (source IN (…))`, FK to `service_markets` with `ON DELETE CASCADE`. |
| **Indexes present** | GiST on `geom`; btree on `market_id` and `(market_id, kind)`. |
| **Customer messaging** | ADR-0013 reason codes with dedicated copy: `excluded_zone → "We're not currently serving your address."` — distinct from `out_of_coverage`. |

---

## 1b. Resolution of the original gaps (verified 2026-08-28)

| ID | Original gap | Status | Evidence |
|---|---|---|---|
| EXC-1 | No time dimension | ✅ **Done** | `is_active NOT NULL DEFAULT true`, `effective_from`, `effective_to` on `service_zone_polygons`; `zone_schedules` + `scoped_zone_schedules` for recurring windows; `v_expired_active_exclusions` hygiene view; `filterActiveZones(zones, at)` applied before matching |
| EXC-2 | Market-only scope | ✅ **Done** | `scoped_exclusion_zones` with `scope IN ('global','parish','market')`, a CHECK enforcing the matching FK is populated, GiST + scope indexes, `scopedExclusionRoutes.ts`, `coverageLayers.ts` resolution |
| EXC-3 | `priority` ignored | ✅ **Done** | ADR-0014. `pickWinningMatch` sorts priority DESC; exclusions default to **10**, includes to 0, so a higher-priority include models a safe island |
| EXC-4 | Binary only | ✅ **Done** | `zone_policy jsonb NOT NULL DEFAULT '{"action":"block"}'`; `normalizePolicy` whitelists actions and falls back to `block` on anything unrecognised (fail-safe). Surcharge reaches pricing via `buildOrderPricing` (SURCHARGE-1 closed) |
| EXC-5 | No taxonomy | ✅ **Done** | `category` with CHECK constraint + `reason`; `customerCopyForReason` branches on category (`safety` → *"Delivery is paused in this area for safety reasons."*) |
| EXC-6 | Index not on hot path | ✅ **Done** (2026-08-28 closeout) | Shadow hardened; `COVERAGE_POSTGIS_PRIMARY=1` evaluates GiST candidates then JS winner; full JS fallback |
| EXC-7 | No net coverage | ✅ **Done** | RPC + MultiPolygon fix; Spanish Town net ~12.13 km² |
| EXC-8 | Path unexercised | ✅ **Done** (2026-08-29) | Surcharge pilot fires @ priority 100; block + parish scoped + schedule rows live |
| EXC-9 | H3 exclusion dead code | ✅ **Resolved as intended** | Polygons remain SoT per ADR-0013; no new features built on the H3 path |

---

## 2b. CLOSEOUT — previously open items (resolved 2026-08-28)

### SURCHARGE-1 — Zone surcharge allocated to nobody ✅ **Done**

**Fix:** `zoneSurchargeJmd` is an input to `buildOrderPricing` and is added to gross delivery fee
**before** `resolveDeliverySplit`. Free-delivery promos waive base delivery only — surcharge still
charges. Snapshot field `zone_surcharge_jmd`. Invariant tests in `packages/dash-pricing/src/engine.test.ts`.

### EXC-6 — Spatial index not on hot path ✅ **Done**

**Fix:** `COVERAGE_POSTGIS_PRIMARY=1` uses `resolve_containing_zones` candidates, then the same JS
live filter + winner/policy path. `COVERAGE_POSTGIS_EVAL=1` logs richer parity (include/exclude ids).
Unset `COVERAGE_POSTGIS_PRIMARY` to rollback to full JS.

### EXC-8 — Zero exclusions in production ✅ **Done (2026-08-29)**

**Done:** Spanish Town surcharge pilot fires at priority 100; block + parish scoped + schedule
paths each have ≥1 live row. Restore path also calls `refresh_market_net_coverage`. Runbook Phase 0
expanded for surcharge + net coverage + expiry + schedule API.

The surcharge pilot row:

```
name        EXC-8 audit pilot (safety surcharge)
kind        exclude          priority 100       category safety
zone_policy {"action":"surcharge","params":{"amount_jmd":200}}
is_active   true             effective_to ~2026-09-05
geometry    4 pts · ST_IsValid true · ST_Covers(include) true · 0.001 km²
```

**Exercised 2026-08-29:**

| Path | Rows | Note |
|---|---:|---|
| `scoped_exclusion_zones` | **1** | Parish St. Catherine closeout block |
| `zone_schedules` + `scoped_zone_schedules` | **1** | `00:00:00`–`23:59:59` on block pilot (`scoped_zone_schedules` left at 0 — same code path) |
| `block`-action exclusions | **1** | `EXC closeout block pilot` |

### PRIORITY-DEFAULT-1 — DB defaults disagree ✅ **Done**

**Fix:** `ALTER TABLE delivery.service_zone_polygons ALTER COLUMN priority SET DEFAULT 10;`
(`20260830220000_zone_priority_default_10.sql`). Verified: default is now `10`; live check shows
**0 exclusions with priority ≤ 0**.

> ⚠️ This fix moved exclusions into the same priority band as service-area includes, which is how
> **TIE-BREAK-1** became reachable.

---

## 2c. STILL OPEN — found in closeout verification (2026-08-28)

### TIE-BREAK-1 — Equal-priority ties fail **open**, silencing the pilot exclusion ✅ **Done (2026-08-29)**

**Fix:** `pickWinningMatch` now sorts exclude before include at equal priority; soft priority
defaults put excludes at **100** (includes stay ~0–10). Safe islands use include priority **above**
the overlapping exclude (e.g. 200). PostGIS `resolve_containing_zones` candidate order aligned.
Pilot re-probed at `18.02125, -76.97145` — surcharge exclude wins at priority 100.

**Regression:** `exclude wins an equal-priority tie (fail safe)` in `packages/dash-coverage/src/index.test.ts`.

<details>
<summary>Historical open wording (pre-fix)</summary>

`pickWinningMatch` (`zoneEval.ts:161-170`) resolved an equal-priority tie **in favour of include**:

```ts
const kindOrder = (k: ZoneKind) => (k === 'include' ? 0 : 1);   // include sorts FIRST
```

Live Spanish Town zones were tied at priority 10 (pilot exclude vs Service area 1 include).

</details>

---

## 2b-archive. Prior open wording (superseded by closeout above)

<details>
<summary>Historical open findings text (pre-closeout)</summary>

### SURCHARGE-1 — The zone surcharge is allocated to nobody ⚠️ **P1 (real defect)**

`pricingResolver.ts:261-269` mutates the pricing breakdown **after** `buildOrderPricing` has already
computed the platform/courier split:

```ts
const zoneSurchargeJmd =
  coverage?.policy?.action === "surcharge"
    ? Math.max(0, Math.trunc(Number(coverage.policy.params?.amount_jmd ?? 200)))
    : 0;
if (zoneSurchargeJmd > 0) {
  breakdown.deliveryFee  += zoneSurchargeJmd;
  breakdown.orderTotal   += zoneSurchargeJmd;
  breakdown.total        += zoneSurchargeJmd;
}
// deliveryFeePlatformAmount and deliveryFeeCourierAmount are NOT updated
```

</details>

---

## 2. Gaps versus a modern exclusion system *(original pre-implementation detail — see §1b for status)*

### EXC-1 — No time dimension ⚠️ **P1 — the most important gap**

`service_zone_polygons` has **no** `effective_from`, `effective_to`, schedule, or `is_active`.

Real non-delivery areas are usually *temporary*: flooding, a protest, a road closure, gang activity, a
curfew, a stadium event. Today the only way to express *"no delivery to this block tonight"* is to
create an exclusion and personally remember to delete it tomorrow.

Consequences:

- **Temporary exclusions become permanent by neglect.** Nothing expires; nothing prompts a review.
- **No recurring rule.** "This corridor is no-go after 8pm" cannot be expressed at all.
- **Deleting is the only way to disable.** With no `is_active` flag, turning an exclusion off destroys
  the geometry — you must redraw it next time. (Coverage versioning softens this, but restoring a whole
  coverage version to re-enable one cutout is a blunt instrument.)

**Fix:** add `effective_from timestamptz`, `effective_to timestamptz`, `is_active boolean NOT NULL
DEFAULT true`, and filter on them at evaluation time. A recurring-window column (or a small
`zone_schedules` child table) covers the nightly case.

---

### EXC-2 — Exclusions cannot exist above a single market ⚠️ **P1**

```sql
market_id uuid NOT NULL REFERENCES delivery.service_markets(id) ON DELETE CASCADE
```

Every exclusion belongs to exactly one town. A hazard corridor spanning Spanish Town and Old Harbour
must be drawn **twice** and maintained twice — and the two copies will drift.

This is the same problem the boundary catalog solved for inclusions, and the same problem the pricing
engine already solved for rules. **You have already built the right pattern twice**
(Default → Parish → Town in `pricingLayers.ts`); exclusions are the one place it wasn't applied.

**Fix:** make scope explicit — `scope IN ('global','parish','market')` with a nullable
`parish_id` / `market_id` — and resolve the applicable exclusion set as a layer stack, mirroring
`resolvePricingLayers`.

---

### EXC-3 — `priority` is a dead column ⚠️ **P2 (cheap fix, high value)**

`priority integer NOT NULL DEFAULT 0` exists on the table. `evaluateCoverage` (`index.ts:73-118`)
**never reads it** — a grep for `priority` in `index.ts` and `zonesPayload.ts` returns nothing. Exclude
wins unconditionally:

```ts
for (const zone of zones) {
  if (!zoneContains(lat, lng, zone)) continue;
  const kind = normalizeKind(zone.kind);
  if (kind === 'exclude') { if (!matchedExclude) matchedExclude = hit; }
  else if (!matchedInclude) { matchedInclude = hit; }
}
if (matchedExclude) return { inZone: false, … };   // ← always loses
```

So a **safe island inside an excluded area** cannot be modelled — a gated community, a hospital, or a
hotel compound inside an otherwise no-go district. That is a common real case in Jamaica.

**Fix:** sort matched zones by `priority` descending and let the highest-priority match decide.
The column, the UI field, and the snapshot plumbing already exist; only the comparator is missing.

---

### EXC-4 — Exclusion is binary; no graduated response ⚠️ **P2**

`kind` is constrained to `include | exclude`. The only available action is total removal. There is no
way to express the intermediate policies ops actually want:

| Desired policy | Expressible today? |
|---|---|
| No delivery, ever | ✅ |
| No delivery after dark | ❌ (EXC-1) |
| Deliver, but +J$200 risk surcharge | ❌ |
| Deliver only if the courier opts in | ❌ |
| Deliver only with manager approval | ❌ |
| Deliver, but cash not accepted | ❌ |

**Fix:** this is a schema-shape decision, not a quick patch. The clean version is a `zone_policy` jsonb
(or a `policy` enum plus parameters) so a zone can carry a graduated rule rather than a boolean. Worth
designing once EXC-1 and EXC-2 land, since both change the same table.

---

### EXC-5 — No reason or category taxonomy ⚠️ **P2**

An exclusion carries only `name text`. There is no `reason`, `category`, or `created_reason`.

Consequences:

- Cannot answer *"how much demand are we losing to **safety** exclusions vs **access** exclusions?"*
- Cannot vary customer messaging by cause — every excluded address gets the same generic
  `"We're not currently serving your address."`
- Cannot set policy by category (e.g. safety exclusions expire in 7 days and require review; permanent
  geographic ones never expire).

**Fix:** `category text CHECK (category IN ('safety','access','legal','operational','temporary','geographic'))`
plus a free-text `reason`. Feeds both reporting and the expiry policy in EXC-1.

---

### EXC-6 — The spatial index is not on the hot path ⚠️ **P2 (scale)**

`resolveMarketForPoint` (`coverageZones.ts:278-300`) does this for **every address check**:

```ts
const markets   = await loadActiveMarkets(sb);                       // all active markets
const parishMap = await loadParishMap(sb);                           // all parishes
const allZones  = await buildCoverageZonesForMarkets(sb, markets, …); // all published zones
const evalResult = evaluateCoverage(lat, lng, allZones);             // JS ray-cast, linear scan
```

Every zone for every active market is pulled into memory and ray-cast in a loop. The GiST index on
`geom` — and the working `point_in_zone_geom` PostGIS RPC built during the boundary work — are **not
used** on this path.

Fine today at 2 zones totalling 2,342 points. At 131 towns with exclusions it becomes an O(n)
full-polygon scan per address, with the polygon payloads crossing the wire each time.

**Fix:** replace the scan with a single indexed query —
`ST_Covers(geom, point)` filtered by `kind`, ordered by `priority`, letting the GiST index do the work.
The RPC already exists; it just isn't called here.

---

### EXC-7 — No materialised net coverage ⚠️ **P3**

"What do we actually serve" is only ever computed **pointwise**, on demand. There is no stored
`include − exclude` geometry.

With PostGIS already in place, `ST_Difference(include_union, exclude_union)` would give:

- accurate served-area statistics (km², population reach) per town and parish
- one polygon to render on the customer-facing map instead of layering shapes client-side
- a cheap single-geometry containment check
- a visual diff when an exclusion is added — *"this change removes 2.4 km² and 3 merchants"*

**Fix:** a generated/materialised `net_coverage_geom` per market, refreshed on publish.

---

### EXC-8 — The whole path is unexercised ⚠️ **P1 (risk, not defect)**

With **0 exclusion rows ever created**, none of the following has run against real data:

- the holes→exclusion promotion from official boundaries (both live zones are single-ring, so it has
  never fired)
- `detectCoverageConflicts` on a real cutout
- the `excluded_zone` customer reason code reaching a real customer
- exclusion geometry surviving a publish → snapshot → restore cycle
- `pointInMultiPolygon` hole rejection in production

**Fix:** before building anything further, draw one real exclusion in Spanish Town and drive it end to
end: author → conflict check → publish → snapshot → customer rejection copy → restore. That single
exercise will surface more than another round of design.

---

### EXC-9 — H3 exclusion path is dead code ⚠️ **P3**

`hexCoverage.ts:30-41` supports `excludeCells` and returns `reasonCode: 'excluded_zone'`, but nothing
populates it. This matches the standing finding that the H3 supply path is dead code.

**Fix:** none for now — but do not build new exclusion features on the H3 path until that decision is
resolved. Polygons remain the source of truth (ADR 0013).

---

## 3. Recommended fixes, in order

### FIX-1 — Honour `priority` in `evaluateCoverage` ⚠️ **P2 · smallest change, unlocks the most**

Sort matched zones by `priority` descending; highest-priority match decides. Column, UI, snapshot and
API plumbing all already exist. Unlocks the safe-island case (EXC-3).

### FIX-2 — Add the operational columns ⚠️ **P1 · one migration**

```sql
ALTER TABLE delivery.service_zone_polygons
  ADD COLUMN IF NOT EXISTS is_active      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_to   timestamptz,
  ADD COLUMN IF NOT EXISTS category       text,
  ADD COLUMN IF NOT EXISTS reason         text;
```

Then filter at evaluation: `is_active AND (effective_from IS NULL OR now() >= effective_from)
AND (effective_to IS NULL OR now() < effective_to)`. Closes EXC-1 and EXC-5.

### FIX-3 — Scope exclusions like pricing ⚠️ **P1**

`scope IN ('global','parish','market')` with nullable `parish_id` / `market_id`, resolved as a layer
stack mirroring `resolvePricingLayers`. Closes EXC-2.

### FIX-4 — Move evaluation onto the spatial index ⚠️ **P2**

Indexed `ST_Covers` query instead of the in-memory linear scan. Closes EXC-6.

### FIX-5 — Materialise net coverage ⚠️ **P3**

`ST_Difference` per market, refreshed on publish. Closes EXC-7.

### FIX-6 — Design graduated policies ⚠️ **P3**

After FIX-2 and FIX-3 land, since they reshape the same table. Closes EXC-4.

> **Before any of the above:** complete **EXC-8** — one real exclusion, driven end to end.

---

## 4. Priority summary

### Outstanding (2026-08-29 final closeout)

| Priority | Item | Notes |
|---|---|---|
| Ops | PostGIS parity watch | Ongoing — unset `COVERAGE_POSTGIS_PRIMARY` on unexplained mismatches |
| Ops | Pilot expiry hygiene | Confirm `v_expired_active_exclusions` after EXC pilots lapse (~2026-09-05) |

### Completed (2026-08-29)

| Priority | Item | Status |
|---|---|---|
| P1 | **TIE-BREAK-1** Equal-priority ties fail open | ✅ exclude wins; PostGIS aligned; regression test |
| P1 | Priority defaults / soft bands | ✅ exclude DEFAULT 100; ADR-0014 amended |
| P1 | Schedule `at` ignored | ✅ `zonedNow(tz, at)` |
| P1 | **EXC-8** Policy path | ✅ surcharge pilot fires @ 100; block + scoped + schedule exercised |

### Completed (2026-08-28)

| Priority | Item | Status |
|---|---|---|
| P1 | EXC-1 No time dimension | ✅ columns + `zone_schedules` + expiry view |
| P1 | EXC-2 Market-only scope | ✅ `scoped_exclusion_zones`, global/parish/market |
| P2 | EXC-3 `priority` ignored | ✅ ADR-0014 `pickWinningMatch` |
| P2 | EXC-4 Binary only | ✅ `zone_policy` incl. surcharge (see SURCHARGE-1) |
| P2 | EXC-5 No taxonomy | ✅ `category` + `reason` + category-aware copy |
| P3 | EXC-7 No net coverage | ✅ built + MultiPolygon fix + Spanish Town populated |
| P3 | EXC-9 H3 exclusion dead code | ✅ resolved as intended (polygons stay SoT) |
| P1 | SURCHARGE-1 Split bypass | ✅ folded into `buildOrderPricing`; split invariant asserted ×3; 53 tests |
| P1 | EXC-8 Unexercised path | ✅ Done 2026-08-29 (was Partial) |
| P2 | EXC-6 PostGIS idle | ✅ primary + shadow flags (2026-08-28 closeout) |
| P3 | PRIORITY-DEFAULT-1 Defaults disagree | ✅ superseded by DEFAULT 100 bands |

---

## Appendix — verification queries

```sql
-- Has any exclusion ever existed?  (2026-08-28: 0)
select kind, count(*) as n,
       count(geom) as with_geom,
       count(*) filter (where st_numgeometries(geom) > 1) as multipart,
       count(*) filter (where st_nrings(geom) > st_numgeometries(geom)) as with_holes
from delivery.service_zone_polygons group by kind;

-- Live coverage shape
select m.name as town, m.is_active, z.name as zone, z.kind, z.priority,
       z.source, z.boundary_pcode,
       st_npoints(z.geom) as pts, st_numgeometries(z.geom) as parts, st_nrings(z.geom) as rings
from delivery.service_zone_polygons z
join delivery.service_markets m on m.id = z.market_id
order by m.name, z.kind desc, z.priority desc;

-- EXC-1 guard (after FIX-2): exclusions past their expiry still being enforced
select id, name, effective_to from delivery.service_zone_polygons
where kind = 'exclude' and is_active and effective_to is not null and effective_to < now();

-- EXC-1 hygiene (after FIX-2): temporary exclusions older than 90 days with no expiry
select id, name, category, created_at from delivery.service_zone_polygons
where kind = 'exclude' and effective_to is null
  and category in ('temporary','safety') and created_at < now() - interval '90 days';

-- EXC-2 duplication detector: geometrically overlapping exclusions in different markets
select a.id, a.name, a.market_id, b.id, b.name, b.market_id
from delivery.service_zone_polygons a
join delivery.service_zone_polygons b
  on a.id < b.id and a.kind = 'exclude' and b.kind = 'exclude'
 and a.market_id <> b.market_id and st_intersects(a.geom, b.geom);

-- EXC-7: net served area per market (what FIX-5 would materialise)
select m.name,
       round((st_area(st_difference(
         st_union(z.geom) filter (where z.kind = 'include'),
         coalesce(st_union(z.geom) filter (where z.kind = 'exclude'),
                  'SRID=4326;POLYGON EMPTY'::geometry)
       )::geography) / 1000000)::numeric, 2) as net_sqkm
from delivery.service_markets m
join delivery.service_zone_polygons z on z.market_id = m.id
group by m.name;

-- 2026-08-28 baseline:
--   0 exclusion zones, ever
--   2 include zones: Old Harbour (JM0804, 1218 pts) · Spanish Town (JM0807, 1124 pts)
--   both single-part, single-ring, source 'import', priority 0
```

### Post-implementation guards (2026-08-28)

```sql
-- EXC-8: has anything ever been created?  (all currently 0)
select 'market_exclusions' k, count(*) v from delivery.service_zone_polygons where kind='exclude'
union all select 'scoped_exclusions', count(*) from delivery.scoped_exclusion_zones
union all select 'schedules', (select count(*) from delivery.zone_schedules)
                            + (select count(*) from delivery.scoped_zone_schedules)
union all select 'markets_with_net_coverage', count(*) from delivery.service_markets
  where net_coverage_geom is not null;

-- PRIORITY-DEFAULT-1: exclusions that would lose a tie to their own include (must be 0)
select id, name, market_id, priority from delivery.service_zone_polygons
where kind = 'exclude' and priority <= 0;

-- EXC-1 hygiene: expired exclusions still being enforced (built-in view)
select * from delivery.v_expired_active_exclusions;

-- EXC-2 duplication detector: overlapping exclusions across markets that should be scoped up
select a.id, a.name, a.market_id, b.id, b.name, b.market_id
from delivery.service_zone_polygons a
join delivery.service_zone_polygons b
  on a.id < b.id and a.kind='exclude' and b.kind='exclude'
 and a.market_id <> b.market_id and st_intersects(a.geom, b.geom);

-- Parent-system regression guards (must stay 0 — from DELIVERY_MARKETS_GEOSPATIAL_AUDIT)
select 'zone_jsonb_truncated' k, count(*) v from delivery.service_zone_polygons
  where geom is not null and st_numgeometries(geom) > 1
    and jsonb_array_length(polygon) < st_npoints(geom) - 1
union all select 'multipart_in_parish_boundary_mode', count(*) from delivery.service_parishes
  where coverage_mode = 'parish_boundary' and st_numgeometries(foundation_geom) > 1;
```

**SURCHARGE-1 invariant** — add to `packages/dash-pricing/src/engine.test.ts`, and assert it after any
path that can mutate `deliveryFee`:

```ts
expect(b.deliveryFeePlatformAmount + b.deliveryFeeCourierAmount)
  .toBeCloseTo(b.deliveryFee, 2);
```

✅ Landed 2026-08-28 at `engine.test.ts:384, 413, 433`.

### TIE-BREAK-1 guards (2026-08-28)

```sql
-- Exclusions that tie with (or lose to) an include in the same market.
-- Must return 0 rows once the priority bands are separated.
select m.name as town, e.name as exclusion, e.priority as exc_priority,
       i.name as include_zone, i.priority as inc_priority,
       case when i.priority >= e.priority then 'EXCLUSION LOSES OR TIES' end as verdict
from delivery.service_zone_polygons e
join delivery.service_zone_polygons i
  on i.market_id = e.market_id and i.kind = 'include'
join delivery.service_markets m on m.id = e.market_id
where e.kind = 'exclude' and e.is_active and i.is_active
  and i.priority >= e.priority
  and st_intersects(e.geom, i.geom);
-- 2026-08-28: 1 row — Spanish Town, pilot(10) ties "Service area 1"(10)

-- Functional probe: does the exclusion actually win at its own centroid?
with e as (
  select z.market_id, m.parish_id, st_pointonsurface(z.geom) p
  from delivery.service_zone_polygons z
  join delivery.service_markets m on m.id = z.market_id
  where z.kind = 'exclude' and z.is_active limit 1
)
select st_y(p) as lat, st_x(p) as lng,
       (select jsonb_agg(to_jsonb(r) order by r.zone_priority desc)
        from delivery.resolve_containing_zones(st_y(p), st_x(p), e.market_id, e.parish_id) r) as zones
from e;
-- 2026-08-28 at 18.02125,-76.97145 → exclude(10), include "Service area 1"(10), include "Spanish Town"(0)
--   pickWinningMatch tie-break favours include ⇒ surcharge never evaluated
```
