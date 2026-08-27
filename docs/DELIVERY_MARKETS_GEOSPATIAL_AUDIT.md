# Delivery Markets — Geospatial Audit & Enterprise Enhancement Plan

**Date:** 2026-08-27
**Scope:** `packages/dash-admin/src/pages/markets/*` (5,436 LOC), `delivery.service_parishes` / `service_zone_polygons`, `supabase/functions/delivery/admin/coverageZones.ts`
**Trigger:** Adopting the official COD-AB Jamaica boundary set (admin0–admin3) at `Roam/Mapping/Jamaica`
**Status:** Audit only — no code changed.

---

## 0. Executive summary

The Delivery Markets section was built for **hand-drawn, single-ring town outlines**. The new dataset is
**official, multi-level, multi-part, hole-bearing administrative geometry**. These are not the same shape of
problem, and the gap is structural rather than cosmetic.

The headline finding is not a missing feature — it is a **silent data-loss bug that is already live**:

> The GeoJSON import path keeps only the **first polygon of the first feature's outer ring**.
> Every admin0/admin1 file is a `MultiPolygon`. Importing `admin1-parishes/kingston.json` today
> would **silently discard 23.7% of Kingston parish**, and in `parish_boundary` coverage mode that
> truncated shape becomes the **live customer delivery boundary**.

Three more findings of similar severity follow from the same root cause: the storage model is a flat
`{lat,lng}[]` ring, which is structurally incapable of representing what the data contains.

**Verdict:** the import path needs a data-model change before the new files can be adopted safely.
Uploading them into the current system would quietly corrupt coverage rather than fail loudly.

---

## 1. What the data actually contains

| Level | Files | Features | Coord points | Size | Meaning |
|---|---:|---:|---:|---:|---|
| `admin0-country` | 1 | 1 | 30,608 | 1.15 MB | Jamaica national outline |
| `admin1-parishes` | 14 | 14 | 42,816 | 3.97 MB | Official parish borders |
| `admin2-towns-by-parish` | 14 | 131 | 79,240 | 7.39 MB | Town / district boundaries |
| `admin3-communities-by-parish` | 14 | 775 | 149,302 | 14.41 MB | Community boundaries |
| **Total** | **43** | **921** | **301,966** | **26.93 MB** | |

**Geometry characteristics the current code does not handle:**

| Characteristic | Where it appears | Current handling |
|---|---|---|
| `MultiPolygon` | Every admin0 + admin1 file (2 parts each) | Only part `[0]` kept |
| Interior rings (holes) | `admin2/st-catherine.json` | Silently dropped |
| Multi-feature collections | admin2 (7–15 each), admin3 (36–79 each) | Only feature `[0]` kept |
| High vertex counts | 1,330–4,033/parish; 30,608 for admin0 | No cap, no simplification |

**Per-feature properties available (all currently discarded):**

```
adm1_name, adm1_pcode, adm2_name, adm2_pcode, adm3_name, adm3_pcode,
adm0_name, adm0_pcode, area_sqkm, center_lat, center_lon,
valid_on, valid_to, version, lang, adm3_ref
```

Only geometry survives import today — and only partially. Every attribute above is thrown away.

---

## 2. Critical bugs

### BUG-1 — MultiPolygon truncation causes live coverage loss ⚠️ **SEVERITY: CRITICAL**

`coverageIo.ts:62-65` reads only the first polygon of a `MultiPolygon`:

```ts
} else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
  const firstPoly = (geometry.coordinates as unknown[])[0];
  ring = Array.isArray(firstPoly) ? firstPoly[0] : null;
}
```

Measured impact of dropping parts `[1..n]`:

| File | Part 1 | Part 2 | Loss |
|---|---:|---:|---:|
| `admin1-parishes/kingston.json` | 76.30% | 23.70% | **23.70%** |
| `admin1-parishes/st-catherine.json` | 99.89% | 0.11% | 0.11% |
| `admin0-country/jamaica.json` | 99.99% | 0.01% | 0.01% |

Kingston is the severe case. **Kingston is already live** (`border set · 1 town` in the current UI), and
`coverageZones.ts:139-158` promotes `foundation_polygon` to a synthetic customer-facing zone whenever
`coverage_mode = 'parish_boundary'`. A truncated Kingston polygon means real customers in ~24% of the
parish are told they are outside the delivery area, with no error surfaced to ops.

**Fix:** store and evaluate all polygon parts.

---

### BUG-2 — Interior rings (holes) silently dropped ⚠️ **SEVERITY: HIGH**

`coverageIo.ts:60-61` takes `coordinates[0]` — the outer ring — and discards every subsequent ring:

```ts
if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
  ring = (geometry.coordinates as unknown[])[0];
}
```

`admin2-towns-by-parish/st-catherine.json` contains a feature with 2 rings. A hole is a **genuine
interior exclusion** — dropping it converts a donut into a solid disc, silently adding coverage that
the source data explicitly excludes. This is the same class of failure as BUG-1 but inverted: it
*over*-covers instead of under-covering.

**Fix:** preserve rings `[1..n]` as holes, or materialise them as `exclude` zones.

---

### BUG-3 — Only the first feature of a FeatureCollection is imported ⚠️ **SEVERITY: HIGH**

`coverageIo.ts:38-50` loops features but `break`s on the first polygonal one:

```ts
for (const f of g.features) {
  ...
  if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
    geometry = geom;
    break;      // <-- everything after this is discarded, silently
  }
}
```

Uploading `admin2-towns-by-parish/st-andrew.json` (15 towns) imports **1 town**. Uploading
`admin3-communities-by-parish/clarendon.json` (79 communities) imports **1 community**. No warning,
no count, no indication that 14 / 78 shapes were dropped. The toast still reads *"Town border imported"*.

**Fix:** treat a multi-feature collection as a batch, not a single shape (see §5, ENH-1).

---

### BUG-4 — Storage model cannot represent the data ⚠️ **SEVERITY: CRITICAL (root cause)**

```sql
-- 20260816190000_rush_parish_foundation.sql
ADD COLUMN IF NOT EXISTS foundation_polygon jsonb   -- '>=3 {lat,lng}'
-- 20260816123000_rush_ops_markets_zones.sql
polygon jsonb NOT NULL DEFAULT '[]'::jsonb          -- 'jsonb array of {lat,lng} vertices'
```

```ts
// dashAdminService.ts:716
foundation_polygon?: DashZoneVertex[] | null;   // DashZoneVertex = { lat, lng }
```

A flat vertex array is a **single ring**. It cannot express multi-part geometry or holes, so BUG-1 and
BUG-2 are not parser oversights that can be patched in isolation — the destination type has nowhere to
put the information. `sanitizeVertices` (`packages/dash-coverage/src/sanitizeVertices.ts:4-14`) reinforces
this by flattening any input to `{lat,lng}[]` with no structural validation and **no vertex cap**.

**Fix:** this is the schema change everything else depends on. See §6, Phase 1.

---

### BUG-5 — Name collisions make name-based matching unsafe ⚠️ **SEVERITY: HIGH**

Measured duplicate names in the source data:

| Level | Distinct names | Names duplicated across parishes |
|---|---:|---:|
| admin2 | 83 | **29** |
| admin3 | 729 | **42** |

Worked examples:

- **"May Pen"** appears in **5 parishes**: Clarendon, Hanover, St. Andrew, St. Catherine, Westmoreland
- **"Lucea"** appears in 4: Hanover, Portland, St. Andrew, St. Ann
- **"Frankfield"**, **"Kellits"**, **"Yallahs"**, **"Williamsfield"** each in 3

The app currently identifies towns **by typed name only** (`MarketsPage.tsx:1808-1812`, `newTownName`).
Any auto-matching, dedupe, or re-import keyed on name will cross-link the wrong parish's town. `pcode`
(`adm2_pcode`, e.g. `JM0101`) is the only safe key — and the schema has no column for it.

**Fix:** add `pcode` as the import identity/upsert key. Never match on name.

---

### BUG-6 — Parish naming mismatch (with a lucky escape)

| Source | Kingston | St. Catherine |
|---|---|---|
| App display name (`20260816150000_rush_service_parishes.sql:31-33`) | `Kingston` | `St. Catherine` |
| App slug | `kingston` | `st-catherine` |
| GeoJSON `adm1_name` | `Kingston` | `Saint Catherine` |
| Export filename | `kingston.json` | `st-catherine.json` |

Display names differ (`St.` vs `Saint`) so name matching fails. **The slugs happen to align exactly with
the exported filenames** — this is the natural join key and should be made explicit rather than relied on
by luck.

---

### BUG-7 — Pcode scheme collision with legacy data

The earlier simplemaps file used `JM01 = Kingston`. The official COD-AB set uses `JM01 = Clarendon`.
If any parish pcode was persisted from the old file, adopting the new set will mis-map parishes. Audit
for stored simplemaps pcodes before import and treat `adm1_pcode` as authoritative going forward.

---

## 3. Performance & scale findings

### PERF-1 — Editor will freeze on official geometry ⚠️ **SEVERITY: HIGH**

`ZoneMapEditor.tsx` builds a Google Maps polygon with `editable: true` and mirrors every vertex into
React state (`editVertices`, line 242). Google Maps renders **one drag handle per vertex plus one midpoint
handle per edge** — so importing a real parish outline yields:

| Import | Vertices | Interactive handles |
|---|---:|---:|
| St. Catherine parish | 4,033 | ~8,066 |
| Kingston parish | 4,370 | ~8,740 |
| Jamaica outline | 30,608 | ~61,216 |

This will lock the browser tab. `CoordinateEntryOverlay.tsx` compounds it by rendering a per-vertex row
list — a 4,033-row table.

**Fix:** cap editable vertices; simplify on import (Douglas–Peucker); make official boundaries
**read-only reference layers** rather than editable geometry (see ENH-4).

---

### PERF-2 — No simplification tier, full precision shipped to clients

There is no vertex budget anywhere in the stack. `listMarkets` returns every parish and zone polygon in
full precision on every page load. Adopting admin2 alone (79,240 points) would balloon the admin payload;
admin3 (149,302 points) is far beyond what a browser list view should carry.

**Fix:** store full precision, serve **tiered simplifications** (display ~1–2 % of vertices, coverage
math at full precision server-side).

---

### PERF-3 — PostGIS is installed but unused for coverage

```sql
-- 20260829140000_h3_phase1_safety.sql:4
CREATE EXTENSION IF NOT EXISTS postgis;
```

PostGIS is available (pulled in by the H3 work) yet all coverage geometry lives in `jsonb` and all
point-in-polygon runs as **JS ray-casting** (`coverageGeo.ts:5-18`). Consequences: no spatial index, no
`ST_Contains`, no `ST_Area`, no topology validation, no `ST_Union`, and every PIP check scans full
vertex arrays linearly.

> Cross-reference: the H3 review already flags the H3 supply path as dead code with a live resolution
> footgun. Coverage geometry and H3 indexing should be reconciled in one plan rather than growing a
> third parallel spatial representation.

**Fix:** `geometry(MultiPolygon, 4326)` column + GiST index; PIP via `ST_Contains`.

---

### PERF-4 — Overview map does not scale

`JamaicaOverviewMap.tsx:98-179` instantiates one `google.maps.Polygon` per shape and one
`google.maps.Marker` per pin, with no clustering, viewport culling, or level-of-detail. It is fine for
today's handful of shapes and will not survive 921. It also uses `google.maps.Marker`, deprecated since
Feb 2024 in favour of `AdvancedMarkerElement`.

**Fix:** render via a data layer / vector tiles; cull by viewport; switch to `AdvancedMarkerElement`.

---

## 4. Gaps — what the model cannot express

| # | Gap | Consequence |
|---|---|---|
| GAP-1 | **No `admin_level` concept** | admin0/1/2/3 cannot be distinguished, stored side by side, or toggled as layers |
| GAP-2 | **No `pcode` field** | No stable identity; re-import duplicates; forced into unsafe name matching (BUG-5) |
| GAP-3 | **No provenance** (`source`, `valid_on`, `version`) | Cannot tell an official border from a hand-drawn one, or detect a stale vintage |
| GAP-4 | **admin3 has no home** | 775 community boundaries have no tier in the model at all |
| GAP-5 | **`area_sqkm` / `center_lat` / `center_lon` discarded** | Free area + centroid data recomputed badly or not at all |
| GAP-6 | **No parent-child integrity** | Nothing validates a town polygon lies inside its parish |
| GAP-7 | **No idempotent upsert** | Re-importing creates duplicates rather than updating in place |
| GAP-8 | **No bulk import** | 921 features via a one-shape-at-a-time modal ≈ **900+ manual uploads** |
| GAP-9 | **Towns created by typing a name** (`MarketsPage.tsx:1808`) | Typos create orphans that never reconcile with official data |
| GAP-10 | **No parish outline version history** | Town coverage is versioned (`listCoverageVersions`); parish border replace is destructive |
| GAP-11 | **No import preview / dry run** | Ops paste JSON blind and discover the result only after it is saved |
| GAP-12 | **No topology validation** | Self-intersections, unclosed rings, wrong winding order all pass through |

---

## 5. Redundancies

| # | Redundancy | Detail |
|---|---|---|
| RED-1 | **Two near-identical import overlays** | `ImportTownBorderOverlay.tsx` and `ImportParishTownPinsOverlay.tsx` duplicate the same file-picker + FileReader + paste-textarea logic (~140 lines each) with cosmetic differences |
| RED-2 | **Duplicated FeatureCollection traversal** | `polygonFromGeoJson` (`coverageIo.ts:33`) and `pinsFromGeoJson` (`coverageIo.ts:106`) each re-implement the same walk |
| RED-3 | **Dual source of truth for parish outlines** | `service_parishes.foundation_polygon` **and** `parish_outline_templates.polygon` both hold parish geometry, kept in sync manually via `promote_template` |
| RED-4 | **`town_pins` largely obsoleted** | admin2 supplies real polygons **and** `center_lat`/`center_lon`. The pin path is explicitly "reference only — not delivery borders" and is now a dead-end duplicate of better data |
| RED-5 | **Two coverage-mode concepts overlap** | `parish_boundary` mode synthesises a zone from the parish outline (`coverageZones.ts:150-158`) while `town_zones` uses the same outline as an outer gate — one polygon serving two semantics, distinguished only by a flag |

---

## 6. Landmines (not currently bugs — do not extend to imported data)

**LM-1 — `orderRingClockwise` would destroy real boundaries.**
`coverageGeo.ts:52-62` sorts vertices by angle around the centroid. That is valid **only for star-shaped
polygons**. Real parish outlines are not star-shaped — angular sorting would scramble them into a
self-intersecting mess.

Currently contained: it is only reached from `CoordinateEntryOverlay.tsx:170`, the manual N/S/E/W corner-entry
path with a handful of typed points. **It must never be applied to imported geometry.** Worth an explicit
guard or a comment, since it is exported from a shared module and reads like a general-purpose helper.

**LM-2 — `polygonCentroid` is a vertex average, not an area centroid.**
`coverageGeo.ts:40-49` averages vertices, which biases toward densely-sampled edges. Official data supplies
a correct `center_lat`/`center_lon` — prefer it over recomputation.

---

## 7. UI/UX findings

| # | Finding | Recommendation |
|---|---|---|
| UX-1 | Import is blind — paste JSON, save, hope | **Preview on map + summary before commit** (feature count, vertex count, area, bbox, warnings) |
| UX-2 | Failures are a one-line toast (`'Need a Polygon…'`) | Structured validation report: per-feature pass/fail with reasons |
| UX-3 | Silent partial success (BUG-1/2/3) reports full success | Never silently discard; if 15 features arrive and 1 is used, say so loudly |
| UX-4 | "Import parish border…" buried two levels into a dropdown | Surface a primary **Import boundaries** action |
| UX-5 | 14 near-identical rows with repeated mode dropdowns | Group/collapse; move mode into a detail view; add search/filter |
| UX-6 | No search across parishes/towns | Needed immediately at 131 towns; mandatory at 775 communities |
| UX-7 | No provenance shown on a border | Badge: `Official · COD-AB · valid 2024-08-02` vs `Hand-drawn` |
| UX-8 | No bulk activate/deactivate | Multi-select with bulk actions |
| UX-9 | Destructive parish border replace, no undo | Version + restore, mirroring town coverage versioning |
| UX-10 | "Parishes without towns" section will invert | Once admin2 is imported every parish has towns — rework the empty-state grouping |
| UX-11 | Import modal is per-town | Folder / multi-file drop, one job with a progress list |
| UX-12 | Deprecated `google.maps.Marker` | Migrate to `AdvancedMarkerElement` |
| UX-13 | No admin-level layer toggles on maps | Parish / town / community layer switches with independent styling |
| UX-14 | `await onSaveOutline(...)` on a `void` return (`MarketsPage.tsx:1555-1557`) | Return the promise so saving state and errors propagate |

---

## 8. Enterprise enhancement plan

### Phase 1 — Data model (**blocking; everything else depends on it**)

1. **Add a geometry column.** `geometry(MultiPolygon, 4326)` alongside the legacy `jsonb`, with a GiST
   index. Dual-write during migration, then cut over.
2. **Add boundary metadata** to parishes/markets/zones:
   ```
   admin_level    smallint     -- 0 | 1 | 2 | 3
   pcode          text         -- JM01 / JM0101 / JM010101   (unique per level)
   parent_pcode   text         -- hierarchy link
   source         text         -- 'cod-ab' | 'manual' | 'import'
   source_version text         -- 'v01'
   valid_on       date         -- 2024-08-02
   area_sqkm      numeric
   center_lat     numeric
   center_lng     numeric
   ```
3. **Introduce an `admin_boundaries` reference table** — the official set imported once, immutable,
   *separate* from operational delivery zones. Delivery zones then **reference** a boundary by pcode
   instead of copying its vertices. This cleanly separates "what Jamaica looks like" from "where we deliver".
4. **Simplification tiers.** Store full precision; generate `ST_SimplifyPreserveTopology` variants for
   display (target ≤ 500 vertices/shape).
5. **Vertex cap + validation** in `sanitizeVertices`: max vertices, ring closure, winding order,
   `ST_IsValid` / `ST_MakeValid`.

### Phase 2 — Import pipeline

6. **Bulk importer** accepting a folder or multi-file selection; auto-detect admin level from
   `adm{N}_pcode` presence; route each feature to the right tier.
7. **Idempotent upsert keyed on `pcode`** — re-import updates in place, never duplicates. Report
   created / updated / unchanged / skipped counts.
8. **Full-fidelity parser** replacing `polygonFromGeoJson`: all features, all polygon parts, all rings
   (holes preserved). Retire the first-feature/first-ring behaviour entirely.
9. **Dry-run preview**: map render + per-feature table + diff against existing + blocking-error list,
   before anything is written.
10. **Auto-match to existing parishes by slug** (`st-catherine` ↔ `st-catherine`), with a manual
    override for unmatched rows and an explicit `Saint` ↔ `St.` normalisation map.
11. **Integrity checks on import**: child within parent (`ST_Within`), sibling overlap
    (`ST_Overlaps`), coverage gaps, orphan pcodes.

### Phase 3 — Operational model

12. **Catalog-driven town creation.** Replace the free-text name field with a picker over admin2
    boundaries for the selected parish — pcode-keyed, so no typos and no cross-parish collisions.
13. **admin3 as a sub-zone tier.** Use communities to compose town coverage (select N communities →
    union → town border) and as fine-grained non-delivery cutouts.
14. **Derive cutouts from holes.** Interior rings become `exclude` zones automatically.
15. **Parish outline versioning**, matching the existing town coverage version/restore flow.
16. **Retire `town_pins`** in favour of admin2 centroids, or demote it to a pure display cache derived
    from boundary data.

### Phase 4 — UI/UX

17. **Boundary Library** view: browse admin0–3, search, preview, provenance, "use as town border".
18. **Layered map** with admin-level toggles and per-level styling.
19. **Import wizard**: pick files → auto-detect → preview → validate → confirm → progress → summary.
20. **Search + filter + bulk actions** across the parish/town list.
21. **Provenance badges** distinguishing official from hand-drawn geometry, with vintage.
22. **Coverage health dashboard**: unassigned areas, overlaps, stale vintages, towns without borders.

### Phase 5 — Consolidation

23. Merge the two import overlays into one parameterised component (RED-1).
24. Single shared GeoJSON traversal utility (RED-2).
25. Resolve the `foundation_polygon` / `parish_outline_templates` dual source of truth (RED-3).
26. Reconcile coverage geometry with the H3 indexing work rather than adding a third spatial model (PERF-3).
27. Guard or relocate `orderRingClockwise` so it can never touch imported geometry (LM-1).

---

## 9. Priority ranking

| Priority | Item | Why |
|---|---|---|
| **P0** | BUG-1 MultiPolygon truncation | Live customer coverage loss (Kingston −23.7%) |
| **P0** | BUG-4 Storage model | Root cause; blocks every fix |
| **P1** | BUG-2 Holes dropped | Silent over-coverage |
| **P1** | BUG-3 First-feature-only | Silent 93–99% data loss on bulk files |
| **P1** | BUG-5 Name collisions | Corrupts any matching logic; needs pcode first |
| **P1** | PERF-1 Editor freeze | Blocks adoption outright |
| **P2** | GAP-8 Bulk import | 900+ manual uploads is not viable |
| **P2** | GAP-1/2/3 Level, pcode, provenance | Prerequisites for a real import pipeline |
| **P2** | UX-1/2/3 Preview + honest errors | Prevents silent corruption reaching production |
| **P3** | PERF-2/3 Simplification, PostGIS | Scale and correctness headroom |
| **P3** | admin3 tier, catalog towns | New capability |
| **P4** | Redundancy consolidation, UI polish | Maintainability |

---

## 10. Recommended immediate action

Before importing anything from the new dataset:

1. **Check whether Kingston is currently in `parish_boundary` mode** and whether its stored
   `foundation_polygon` came from a MultiPolygon source. If so, coverage is already truncated in production.
2. **Do not import admin2/admin3 files through the existing UI** — each would import exactly one shape
   out of 7–79 and report success.
3. **Audit for stored simplemaps pcodes** (`JM01 = Kingston`) that would collide with the COD-AB scheme
   (`JM01 = Clarendon`).
4. Land Phase 1 items 1–2 and Phase 2 item 8, then import admin1 as the first real test.

---

## 11. Production check — 2026-08-27

Live audit against project `csfllzzastacofsvcdsc` (`delivery.service_parishes`):

| Parish | coverage_mode | foundation vertices | Classification |
|---|---|---:|---|
| Kingston | `town_zones` | 1,329 | **Not live parish-boundary delivery.** Foundation is outer gate only. Vertex count is below full COD-AB MultiPolygon (~4.3k across parts) — treat as incomplete / non-COD-AB until Phase B re-import. |
| St. Andrew | `town_zones` | 2,064 | Same — gate only |
| St. Catherine | `town_zones` | 3,557 | Same — gate only |
| All other parishes | `town_zones` | 0 | No foundation set |

**Pcode collision:** No `pcode` column existed on parishes/markets/zones at audit time — **no stored simplemaps pcodes to remapped.** COD-AB `adm1_pcode` is authoritative going forward.

**Customer blast radius today:** Low for BUG-1 synthetic-zone path (nobody in `parish_boundary`). Residual risk: town_zones outer-gate under-covers if customers near missing Kingston MultiPolygon parts are incorrectly blocked.

**Phase 0 controls applied:** Legacy GeoJSON import hard-blocks MultiPolygon (>1 part), FeatureCollection (>1 polygonal feature), and holes — ops must use Import Boundaries after Phase B.

---

## Appendix A — File reference

| File | LOC | Role | Key findings |
|---|---:|---|---|
| `MarketsPage.tsx` | 2,456 | Page shell, parish/town cards, overlays | GAP-9, UX-5, UX-14 |
| `ZoneMapEditor.tsx` | 1,351 | Map editing surface | PERF-1 |
| `CoordinateEntryOverlay.tsx` | 389 | Manual coordinate entry | PERF-1, LM-1 |
| `JamaicaOverviewMap.tsx` | 283 | Read-only overview | PERF-4, UX-12 |
| `coverageIo.ts` | 258 | GeoJSON/CSV parse + export | **BUG-1, BUG-2, BUG-3**, RED-2 |
| `ManageZonesOverlay.tsx` | 180 | Zone list management | — |
| `ImportTownBorderOverlay.tsx` | 170 | Border import modal | RED-1, UX-1, UX-11 |
| `coverageGeo.ts` | 152 | PIP, bounds, centroid, conflicts | LM-1, LM-2, PERF-3 |
| `ImportParishTownPinsOverlay.tsx` | 143 | Pin import modal | RED-1, RED-4 |
| `HexCellsMapOverlay.tsx` | 54 | H3 hex overlay | PERF-3 cross-ref |

## Appendix B — Backend reference

| File | Finding |
|---|---|
| `supabase/migrations/20260816123000_rush_ops_markets_zones.sql:13-17` | `polygon jsonb` single-ring storage (BUG-4) |
| `supabase/migrations/20260816190000_rush_parish_foundation.sql:1-25` | `foundation_polygon jsonb`; `parish_outline_templates` (BUG-4, RED-3) |
| `supabase/migrations/20260816150000_rush_service_parishes.sql:31-33` | Parish slugs — the join key (BUG-6) |
| `supabase/functions/delivery/admin/coverageZones.ts:139-158` | Parish outline → live customer zone (BUG-1 blast radius) |
| `supabase/migrations/20260829140000_h3_phase1_safety.sql:4` | PostGIS available but unused (PERF-3) |
| `packages/dash-coverage/src/sanitizeVertices.ts:4-14` | No vertex cap, no structural validation (BUG-4, PERF-2) |
| `packages/dash-admin-client/src/dashAdminService.ts:667-723` | `DashZoneVertex` / `DashParishRow` types (BUG-4, GAP-1/2/3) |
