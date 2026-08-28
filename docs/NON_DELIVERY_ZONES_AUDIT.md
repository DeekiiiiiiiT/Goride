# Non-Delivery Zones (Exclusions) — Architecture Audit

**Date:** 2026-08-28
**Scope:** `delivery.service_zone_polygons` (`kind = 'exclude'`), `packages/dash-coverage/src/index.ts`
(`evaluateCoverage`), `geometry.ts` (`pointInMultiPolygon`), `hexCoverage.ts`,
`supabase/functions/delivery/admin/coverageZones.ts` (`resolveMarketForPoint`),
`packages/dash-admin/src/pages/markets/{MarketsPage,coverageGeo}.tsx`
**Method:** Code read + live database verification against GoRide (`csfllzzastacofsvcdsc`).
**Status:** Implementation complete (2026-08-28) — see [NON_DELIVERY_ZONES_RUNBOOK.md](./NON_DELIVERY_ZONES_RUNBOOK.md) and ADRs 0014–0017.
**Related:** `docs/DELIVERY_MARKETS_GEOSPATIAL_AUDIT.md` (parent system — OPEN-1…14 closed)

---

## 0. Executive verdict

**The foundation is modern and correct. The exclusion model on top of it is the thinnest part of the
geospatial stack — and it has never been used once in production.**

```
service_zone_polygons where kind = 'exclude'  →  0 rows
```

Live coverage is two include-only zones, both promoted from the official catalog, both single-part
and single-ring:

| Town | Zone | Kind | pcode | Points | Parts | Rings |
|---|---|---|---|---:|---:|---:|
| Old Harbour | Old Harbour | include | `JM0804` | 1,218 | 1 | 1 |
| Spanish Town | Spanish Town | include | `JM0807` | 1,124 | 1 | 1 |

The set semantics, the geometry engine, and the authoring safeguards are all genuinely good — better
than most commercial delivery platforms. What's missing is everything that makes exclusions an
**operational** tool rather than a permanent-only one: no time dimension, no scope above a single
market, no severity beyond total removal, and a `priority` column that is silently ignored.

Because no exclusion has ever existed, none of this — including the holes→exclusion path built during
the boundary work — has ever been exercised against real data.

**Verdict:** the design is sound and worth building on. Two cheap changes (§3 FIX-1, FIX-2) close most
of the gap. Do not build more surface area until one real exclusion has been driven end to end.

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

## 2. Gaps versus a modern exclusion system

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

| Priority | Item | Notes |
|---|---|---|
| **P1** | EXC-8 Exercise the path with one real exclusion | Do first — validates everything else |
| **P1** | EXC-1 No time dimension (FIX-2) | Biggest functional gap; temporary zones are the common case |
| **P1** | EXC-2 Market-only scope (FIX-3) | Duplication that will drift |
| **P2** | EXC-3 `priority` ignored (FIX-1) | Cheapest fix in the list |
| **P2** | EXC-4 Binary only (FIX-6) | Schema-shape decision |
| **P2** | EXC-5 No taxonomy (FIX-2) | Ships with FIX-2 |
| **P2** | EXC-6 Index unused on hot path (FIX-4) | Scale, not correctness |
| **P3** | EXC-7 No net coverage (FIX-5) | Reporting + UX win |
| **P3** | EXC-9 H3 exclusion dead code | Leave until H3 decision resolves |

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
