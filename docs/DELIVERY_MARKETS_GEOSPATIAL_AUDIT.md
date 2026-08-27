# Delivery Markets — Geospatial Audit & Remediation Status

**Original audit:** 2026-08-27
**Last updated:** 2026-08-27 (OPEN remediation complete on live GoRide)
**Scope:** `packages/dash-admin/src/pages/markets/*`, `delivery.admin_boundaries` / `service_parishes` / `service_zone_polygons`, `supabase/functions/delivery/admin/boundaryRoutes.ts`, `scripts/import-codab-boundaries.ts`
**Data source:** COD-AB Jamaica admin0–admin3 at `Roam/Mapping/Jamaica` (43 files, 921 features, 301,966 points)

---

## 0. Status at a glance

All **OPEN-1…OPEN-10** items from the post-implementation re-audit are **Done** on live GoRide
(`csfllzzastacofsvcdsc`).

| Layer | State |
|---|---|
| Schema / PostGIS / catalog | ✅ Built and correct |
| Import pipeline + wizard + API | ✅ Built; service-role importer used for full load |
| Parser (MultiPolygon, holes, multi-feature) | ✅ Fixed |
| **COD-AB data imported** | ✅ **921 rows** (1 + 14 + 131 + 775) |
| **Kingston parish border** | ✅ **`JM03`, 2 parts, 4,370 pts** |
| Promote snapshots inside RPC | ✅ `20260830170000_promote_snapshot_and_reconcile.sql` |
| Town / zone pcodes | ✅ Reconciled where unique admin2 match exists |
| Portmore fake parish | ✅ Deleted (0 markets) |
| Catalog-only town create | ✅ Linked parishes use admin2 picker only |

**Live blast radius remains small.** Spanish Town is still the only active published town —
metadata pcode `JM0807` attached; published polygon **not** overwritten.

---

## 1. Resolved by the Phase 1–2 implementation

Verified present in `20260830140000_admin_boundaries_geospatial.sql`,
`20260830150000_boundary_promote_helpers.sql`, `20260830160000_point_in_geom_rpcs.sql`,
and the rewritten `coverageIo.ts`.

| ID | Finding | Resolution |
|---|---|---|
| BUG-1 | MultiPolygon truncation | ✅ `geometry(MultiPolygon,4326)`; all parts preserved through promote |
| BUG-2 | Interior rings dropped | ✅ Holes **materialised as `exclude` zones** in `promote_boundary_to_market_zone` |
| BUG-3 | First-feature-only import | ✅ `coverageIo.ts` rebuilt on `IoMultiPolygon { outer, holes }`; importer batches all features |
| BUG-4 | Storage model | ✅ `delivery.admin_boundaries` catalog + dual-write `geom` columns + sync triggers |
| BUG-5 | Name-collision identity | ✅ `UNIQUE (admin_level, pcode)`; upsert keyed on pcode |
| BUG-6 | Parish name/slug mismatch | ✅ `slugify()` normalises `Saint` → `st`; slug is the join key |
| GAP-1/2/3 | admin_level, pcode, provenance | ✅ All columns present incl. `source`, `source_version`, `valid_on` |
| GAP-4 | admin3 had no home | ✅ `union_admin3_to_market_zone` composes town coverage from communities |
| GAP-5 | area / centroid discarded | ✅ Captured; `ST_PointOnSurface` fallback at `20260830140000:244-245` |
| GAP-7 | No idempotent upsert | ✅ `ON CONFLICT (admin_level, pcode) DO UPDATE` |
| GAP-8 | No bulk import | ✅ `scripts/import-codab-boundaries.ts` + `ImportBoundariesWizard.tsx` |
| GAP-10 | No parish version history | ✅ `parish_outline_versions` + snapshot/restore endpoints |
| GAP-11 | No dry run | ✅ `--dry-run` flag and wizard preview |
| PERF-1 | Editor freeze | ✅ Vertex cap — `ZoneMapEditor.tsx:493`: `const editable = verts.length <= 500` |
| PERF-2 | No simplification tier | ✅ `geom_display` via `ST_SimplifyPreserveTopology(g, 0.00015)` |
| PERF-3 | PostGIS unused | ✅ `ST_Covers` RPCs (`point_in_parish_foundation`, `point_in_zone_geom`) |
| LM-2 | Naive vertex-average centroid | ✅ `ST_PointOnSurface` used instead |

**Centroid quality verified:** all 920 admin1–3 centroids supplied by COD-AB fall **inside** their own
polygon (checked by ray-cast against every ring, holes respected). They are point-on-surface quality
and safe for label placement — no need to recompute.

---

## 2. OPEN — remediation results (Done 2026-08-27)

### OPEN-1 — COD-AB import ✅ **Done**

Verified:
```
admin_level 0→1, 1→14, 2→131, 3→775  (total 921)
Kingston admin1: JM03, 2 parts, 4370 pts
```
Importer: `scripts/import-codab-via-sql.ts` (service-role upsert path).

### OPEN-2 — Kingston restored + fixtures purged ✅ **Done**

Kingston parish: `pcode=JM03`, foundation 2 parts / 4370 pts. Deleted `JM01K` and tiny `JM` fixture.
`parish_outline_versions` has Kingston pre-promote snapshots.

### OPEN-3 — Snapshot inside promote RPCs ✅ **Done**

Migration `20260830170000_promote_snapshot_and_reconcile.sql`:
- `promote_boundary_to_parish` inserts `parish_outline_versions` before overwrite
- `promote_boundary_to_market_zone` snapshots zones into `service_coverage_versions`
- HTTP double-snapshot removed from `boundaryRoutes.ts` (RPC-only path)

### OPEN-4 — St. Catherine / St. Andrew re-promoted ✅ **Done**

| Parish | pcode | parts | pts |
|---|---|---:|---:|
| st-catherine | JM08 | 2 | 4033 |
| st-andrew | JM06 | 1 | 2065 |

Matches catalog `st_numgeometries` / `st_npoints`.

### OPEN-5 — Town pcode reconcile ✅ **Done** (partial name coverage)

`delivery.reconcile_market_pcodes(true)` report:
- matched 4 (Old Harbour, Linstead, Bog Walk promoted; Spanish Town **metadata only** `JM0807`)
- unmatched 13 (not in St. Catherine admin2 catalog — e.g. Guy’s Hill, Ewarton, New Kingston)
- ambiguous 0

Unmatched towns remain for manual Boundary Library / Markets UI attach when needed.

### OPEN-6 — Portmore fake parish ✅ **Done**

Confirmed 0 markets → deleted `service_parishes` row `portmore`.

### OPEN-7 — Catalog-only town create ✅ **Done**

`MarketsPage.tsx`: linked parishes (`pcode` set) → catalog select + `createTownFromBoundary` only.
Free-text create kept only for unlinked parishes, with warning.

### OPEN-8 — Legacy import banner ✅ **Done**

`ImportTownBorderOverlay` keeps rare single-ring paste path; banner points ops to Import Boundaries.

### OPEN-9 — `orderRingClockwise` export ✅ **Done**

Raw export removed; only `orderRingClockwiseForManualCorners` exported; CoordinateEntryOverlay updated.

### OPEN-10 — `town_pins` demoted ✅ **Done**

Overview prefers market/catalog centers; pin import CTA labeled legacy; copy no longer treats pins as SoT.

---

## 2b. Historical OPEN detail (pre-remediation)

### OPEN-1 — The COD-AB import has never run ⚠️ **P0** (superseded — Done above)

`delivery.admin_boundaries` contains **2 rows**, neither of which is real data:

| pcode | name | parts | points | area_sqkm | Reality |
|---|---|---:|---:|---:|---|
| `JM` | Jamaica | 1 | **5** | 10991 | Real admin0 = 30,608 pts |
| `JM01K` | Kingston | 2 | **10** | 25 | Real Kingston = 4,370 pts, pcode `JM03` |

These are synthetic smoke-test fixtures. `JM01K` is not a COD-AB pcode. Expected after a real import:
**921 rows** (1 + 14 + 131 + 775).

**Fix:**
```bash
# 1. dry run
deno run -A scripts/import-codab-boundaries.ts \
  --dir "C:/Users/deeki/OneDrive/Documents/App and Web design/Roam/Mapping/Jamaica" \
  --token "$TOKEN" --dry-run

# 2. country + parishes first, verify, then towns + communities
deno run -A scripts/import-codab-boundaries.ts --dir "…" --token "$TOKEN" --levels 0,1
deno run -A scripts/import-codab-boundaries.ts --dir "…" --token "$TOKEN" --levels 2,3
```

Verify after step 2:
```sql
select admin_level, count(*) from delivery.admin_boundaries group by 1 order by 1;
-- expect 0→1, 1→14, 2→131, 3→775
select pcode, st_numgeometries(geom), st_npoints(geom)
from delivery.admin_boundaries where admin_level = 1 and name = 'Kingston';
-- expect JM03, 2 parts, 4370 points
```

---

### OPEN-2 — Kingston's parish border is a test fixture ⚠️ **P0**

```
slug=kingston  pcode=JM01K  foundation_boundary_pcode=JM01K
foundation_polygon = 4 points     (real: 4,370)
foundation_geom    = 10 points, 2 parts
```

Kingston's genuine outline is gone and **no snapshot exists** in `parish_outline_versions` (table is
empty — see OPEN-3 for why). Not customer-affecting today (`town_zones` mode, only town inactive),
but it is wrong data in a live table.

**Fix:** after OPEN-1 lands, re-promote from the catalog:
```sql
select delivery.promote_boundary_to_parish(
  (select id from delivery.service_parishes where slug = 'kingston'),
  'JM03'
);
```
Then delete the fixtures:
```sql
delete from delivery.admin_boundaries where pcode in ('JM01K')
   or (pcode = 'JM' and st_npoints(geom) < 100);
```

---

### OPEN-3 — Snapshot guard is only at the HTTP layer ⚠️ **P1**

`boundaryRoutes.ts:261-279` correctly snapshots `foundation_polygon` / `foundation_geom` into
`parish_outline_versions` **before** calling the promote RPC, and exposes list/restore endpoints.
That path is safe.

But `delivery.promote_boundary_to_parish()` performs a destructive `UPDATE` with **no internal
snapshot**. Anything calling the RPC directly — SQL console, another service, a migration — silently
overwrites with no recovery point. This is exactly how Kingston was clobbered: the versions table is
empty despite Kingston having had a foundation.

**Fix:** move the snapshot inside the function so the guarantee holds regardless of caller.
Insert into `parish_outline_versions` at the top of `promote_boundary_to_parish`, before the `UPDATE`,
when the parish already has a `foundation_polygon` or `foundation_geom`. Same for
`promote_boundary_to_market_zone` (which currently overwrites include zones with no history).

---

### OPEN-4 — St. Catherine's foundation is single-part ⚠️ **P2**

```
slug=st-catherine  foundation_polygon = 3,557 pts  foundation_geom = 1 part / 3,558 pts
```

COD-AB St. Catherine is a **2-part** MultiPolygon (3,558 + 475 points). The stored geometry matches
part `[0]` exactly — a fingerprint of the old truncating parser (original BUG-1). The lost part is
0.11% of area, so impact is cosmetic, but it is stale pre-fix data.

St. Andrew (2,064 pts, 1 part) should be re-checked the same way once the catalog is populated.

**Fix:** re-promote both from the catalog after OPEN-1; confirm `st_numgeometries` matches the source.

---

### OPEN-5 — No town or zone carries a pcode ⚠️ **P1**

Every `service_markets.pcode` and `service_zone_polygons.boundary_pcode` is `NULL`. The columns and
indexes exist; nothing has been reconciled into them. Until this is done the catalog and the
operational tables are two disconnected worlds, and BUG-5 (name collisions — "May Pen" exists in 5
parishes) remains a live hazard for any matching logic.

**Fix:** a reconciliation pass mapping the 17 existing towns to admin2 pcodes via
`promote_boundary_to_market_zone`, or an ops screen that lets someone confirm each match. Note the
existing town names are shouty imports (`OLD HARBOUR BAY`, `GUY'S HILL`) that will need
case-insensitive, apostrophe-tolerant matching **within the parent parish only**.

---

### OPEN-6 — Data hygiene: `Portmore` is registered as a parish ⚠️ **P2**

`delivery.service_parishes` holds 15 rows. Jamaica has 14 parishes. `Portmore` is a town in
St. Catherine (COD-AB has no admin1 entry for it), so it will never match an admin1 pcode and will
sit permanently unreconciled.

**Fix:** demote to a town under `st-catherine`, or delete if unused. Check for dependent markets first.

---

### OPEN-7 — Town creation is still free-text ⚠️ **P2** (GAP-9, Phase 3 item 12)

`MarketsPage.tsx:1846-1850` still creates towns from a typed `newTownName`. Every town created this
way starts with no pcode and no catalog link, re-creating the orphan problem the catalog was built to
solve.

**Fix:** replace the text input with a picker over `admin_boundaries WHERE admin_level = 2 AND
parent_pcode = <parish pcode>` — name, area, and pcode carried through on create.

---

### OPEN-8 — Import overlays not consolidated ⚠️ **P3** (RED-1)

Three overlays now coexist: `ImportBoundariesWizard.tsx` (new), `ImportTownBorderOverlay.tsx`,
`ImportParishTownPinsOverlay.tsx` (both legacy). The latter two duplicate file-picker + FileReader +
paste-textarea logic and route through the older single-shape path.

**Fix:** once catalog promotion covers the common cases, retire the two legacy overlays or fold them
into the wizard as "manual / paste" modes.

---

### OPEN-9 — `orderRingClockwise` is documented, not guarded ⚠️ **P3** (LM-1)

`coverageGeo.ts:70-71` adds a clarifying alias (`orderRingClockwiseForManualCorners`), but the raw
`orderRingClockwise` is still exported and `CoordinateEntryOverlay.tsx:170` still calls the raw name.
Angular sorting around a centroid is valid only for star-shaped polygons and would scramble any real
boundary.

**Fix:** stop exporting the raw name; export only the manual-corners alias.

---

### OPEN-10 — `town_pins` now fully redundant ⚠️ **P3** (RED-4)

With `center_lat` / `center_lng` on both `admin_boundaries` and `service_parishes`, the separate
`town_pins` jsonb path is a second source of truth for the same information.

**Fix:** derive pins from boundary centroids
(`SELECT name, center_lat, center_lng FROM delivery.admin_boundaries WHERE admin_level = 2`) and
retire `town_pins` / `ImportParishTownPinsOverlay`.

---

## 3. Decisions taken

**COD-AB `adminpoints` and `adminlines` layers — rejected, deleted 2026-08-27.**

The HDX archive ships two extra layers alongside admin0–3. Both were extracted, evaluated, and removed:

- **`jam_adminpoints`** (921 Point features) — *not* a settlement gazetteer. Exactly one point per
  admin0–3 polygon, and byte-identical to the `center_lon`/`center_lat` already in each polygon's
  properties (verified against `JM0101 Chapelton`). The importer already reads those
  (`import-codab-boundaries.ts:132-133`) and `upsert_admin_boundary` falls back to
  `ST_PointOnSurface`. Zero new information.
- **`jam_adminlines`** (2,310 LineStrings) — `left_pcod` / `right_pcod` and `name` are **null on all
  2,310 features**, so it carries no adjacency graph. Reproducible on demand via `ST_Boundary(geom)`.

Neither had any consumer in the codebase. Additionally, `import-codab-boundaries.ts:145` walks
`--dir` **recursively**, and the documented `--dir` is the Jamaica folder itself — so both layers
would have been opened and parsed on every import run (skipped safely, since Point/LineString fail
`geometryToParts`, but 4.6 MB of wasted I/O and a trap for future contributors).

**Canonical working set is the 43 polygon files** under `admin0-country/`, `admin1-parishes/`,
`admin2-towns-by-parish/`, `admin3-communities-by-parish/`. Do not add non-polygon layers to that
directory while the importer walks it recursively.

**Source fidelity confirmed.** The Shapefile→GeoJSON conversion was validated against the official
GeoJSON release: 921/921 features, 942/942 rings geometrically identical, max coordinate delta
**11 nanometres** (float serialisation only); 151 rings differ by starting vertex (rotation —
geometrically meaningless). The only property difference is `""` vs `null` in six always-empty
alternate-name/language columns, a DBF limitation. **Either archive is equally valid; no re-export
needed.**

---

## 4. Priority order

| Priority | Item | Blocking? |
|---|---|---|
| **P0** | OPEN-1 Run the COD-AB import | Yes — everything else waits on the catalog |
| **P0** | OPEN-2 Restore Kingston, purge fixtures | Yes — wrong data in a live table |
| **P1** | OPEN-3 Move snapshot into the RPC | **Do before OPEN-1** — protects St. Andrew / St. Catherine |
| **P1** | OPEN-5 Reconcile town/zone pcodes | Unlocks catalog-driven ops |
| **P2** | OPEN-4 Re-promote St. Catherine / St. Andrew | After catalog loads |
| **P2** | OPEN-6 Fix `Portmore` parish row | Independent |
| **P2** | OPEN-7 Catalog-driven town creation | After OPEN-5 |
| **P3** | OPEN-8/9/10 Consolidation & cleanup | Maintainability |

**Recommended sequence:** OPEN-3 → OPEN-1 (levels 0,1) → verify Kingston = `JM03` / 2 parts /
4,370 pts → OPEN-2 purge → OPEN-1 (levels 2,3) → OPEN-4 → OPEN-5.

---

## 5. Original audit findings (historical record)

The pre-implementation audit identified 7 bugs, 12 gaps, 5 redundancies, 2 landmines and 14 UX items.
Everything not listed in §2 above has been resolved — see the §1 table for the mapping.

Key measurements from the original audit, retained for reference:

| Level | Files | Features | Points | Size |
|---|---:|---:|---:|---:|
| admin0 | 1 | 1 | 30,608 | 1.15 MB |
| admin1 | 14 | 14 | 42,816 | 3.97 MB |
| admin2 | 14 | 131 | 79,240 | 7.39 MB |
| admin3 | 14 | 775 | 149,302 | 14.41 MB |
| **Total** | **43** | **921** | **301,966** | **26.93 MB** |

Name-collision measurements (why pcode is mandatory as the join key):

| Level | Distinct names | Duplicated across parishes |
|---|---:|---:|
| admin2 | 83 | **29** — "May Pen" in 5 parishes, "Lucea" in 4 |
| admin3 | 729 | **42** |

Pcode scheme differs from the legacy simplemaps file (`JM01 = Kingston` there,
`JM01 = Clarendon` in COD-AB; Kingston is `JM03`). Treat `adm1_pcode` from COD-AB as authoritative.

---

## Appendix — verification queries

```sql
-- catalog completeness
select admin_level, count(*) as n, count(geom_display) as with_display,
       count(center_lat) as with_center, min(valid_on) as vintage
from delivery.admin_boundaries group by 1 order by 1;

-- parish coverage state
select slug, name, coverage_mode, pcode, boundary_source,
       st_numgeometries(foundation_geom) as parts,
       st_npoints(foundation_geom) as pts,
       (select count(*) from delivery.service_markets m where m.parish_id = p.id) as towns
from delivery.service_parishes p order by sort_order;

-- unreconciled towns
select m.name, p.slug as parish, m.pcode
from delivery.service_markets m
left join delivery.service_parishes p on p.id = m.parish_id
where m.pcode is null;

-- built-in health view
select * from delivery.coverage_health_summary;
```
