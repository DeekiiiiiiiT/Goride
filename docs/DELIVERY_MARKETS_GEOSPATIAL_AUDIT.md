# Delivery Markets — Geospatial Audit & Remediation Status

**Original audit:** 2026-08-27
**Last updated:** 2026-08-27 (OPEN-1…OPEN-16 complete on live GoRide)
**Scope:** `packages/dash-admin/src/pages/markets/*`, `delivery.admin_boundaries` / `service_parishes` / `service_zone_polygons`, `supabase/functions/delivery/admin/boundaryRoutes.ts`, `scripts/import-codab-boundaries.ts`
**Data source:** COD-AB Jamaica admin0–admin3 at `Roam/Mapping/Jamaica` (43 files, 921 features, 301,966 points)

---

## 0. Status at a glance

All **OPEN-1…OPEN-16** items are **Done** on live GoRide
(`csfllzzastacofsvcdsc`) — independently verified against the live database, not self-reported.

> OPEN-11…13 closed in the follow-up pass: geom-first coverage, New Kingston fixture purge,
> admin3 community-union UI. **Re-verified 2026-08-27** — including a functional probe proving the
> previously-lost 23.7% of Kingston now resolves as covered (§2c).
>
> **OPEN-15…16** closed after Spanish Town ops session: delete-town control + apply-official-border
> on existing catalog-linked towns; legacy St. Catherine bulk-import towns purged; Spanish Town
> re-created from `JM0807`, published, and active (§2d).
>
> **OPEN-14** closed 2026-08-27: schema column comments now document `*_geom` as coverage SoT
> (`20260830190000_geom_column_comments_open14.sql`).

**Verification evidence (2026-08-27):**

| Check | Result |
|---|---|
| Catalog rows | 921 (1 / 14 / 131 / 775) · **0 invalid geometries** · all with `geom_display` + centroid · vintage `2024-08-02` |
| Point fidelity vs source | admin0 = 30,608 ✓ · admin1 min 1,638 (Manchester) / max 4,627 (Clarendon) ✓ |
| Parish ↔ catalog | `ST_Equals(foundation_geom, catalog.geom) = true` for **all 14** |
| Fixtures | 0 remaining (`JM01K` and tiny `JM` purged) |
| Parishes | 14 (Portmore deleted) · 0 without pcode |
| Snapshots | `20260830170000` present; Kingston / St. Andrew / St. Catherine each have 2 versions |

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
| Delete town (ops UI) | ✅ Trash on town row → `DELETE /admin/markets/:id` |
| Apply official border (existing town) | ✅ Button when `pcode` set + no include zone |

**Live blast radius:** Spanish Town is the **only** market row (`1` total). It is **active**,
**published**, `pcode=JM0807`, `boundary_pcode=JM0807`, include zone **1,124 pts** (official COD-AB
geom). Legacy St. Catherine bulk-import towns (16 rows, ALL CAPS, no pcode) and the New Kingston
fixture market were deleted 2026-08-27.

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

`delivery.reconcile_market_pcodes(true)` report (initial run):
- matched 4 (Old Harbour, Linstead, Bog Walk promoted; Spanish Town **metadata only** `JM0807` at
  that time — hand-drawn border intentionally left intact)
- unmatched 13 (not in St. Catherine admin2 catalog — e.g. Guy’s Hill, Ewarton, New Kingston)
- ambiguous 0

**Subsequent ops (2026-08-27):** legacy town rows deleted; Spanish Town re-created from catalog with
full `JM0807` geom (see §2d). Unmatched admin3-only names remain available via community union when
needed.

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

## 2c. Post-remediation verification (2026-08-27)

Independent verification against live GoRide (`csfllzzastacofsvcdsc`) confirmed OPEN-1…OPEN-10 are
genuinely complete. Three further items surfaced (OPEN-11 / 12 / 13) — all now **Done and
independently re-verified**. OPEN-14 (schema comments) **Done** 2026-08-27.

---

### OPEN-11 — Legacy `jsonb` ring truncation is still load-bearing ✅ **Done — verified**

Coverage paths now prefer PostGIS geom via `delivery.parish_foundation_parts` /
`delivery.zone_geom_parts` / `delivery.geom_to_coverage_parts` (`20260830180000`).

- Parish synthetic zones use full MultiPolygon parts
- Town zone reads attach `multiPolygon` from geom
- Publish/restore snapshots carry `multiPolygon` + `boundary_pcode` and restore `geom`
- `parishModeSuggest` treats `foundation_geom` as a valid foundation

Legacy jsonb rings may still be truncated for dual-write display; they are no longer used for
coverage decisions when geom exists.

#### Verification evidence (independent, 2026-08-27)

**Functional proof — the previously-lost region now resolves as covered.** A probe placed on
Kingston's second polygon part (the 23.7% that the truncated ring omitted):

```
probe (17.93828, -76.81897)      st_covers(part1, probe) = false   ← outside part [1]
delivery.point_in_parish_foundation(kingston, …) = true             ← now covered ✓
delivery.parish_foundation_parts(kingston) → 2 parts                ✓
part areas: 20.61 km² + 6.40 km²  →  part 2 = 23.7% of the parish
```

**Call sites traced end-to-end:**

| Site | Verified |
|---|---|
| `coverageZones.ts:139` | `parish_foundation_parts` RPC when `foundation_geom` present |
| `coverageZones.ts:82-105` | `multiPolygon` attached from live geom |
| `coveragePlatform.ts:38-54` | `zoneSnapshotPayload` emits `multiPolygon` **and** `boundary_pcode` |
| `marketRoutes.ts:1362-1382` | geom-first; full `multi` → `buildParishSyntheticZone` → emitted as `multiPolygon` |
| `parishCoverage.ts:73-81` | `isMultiPolygonShape` returns **all** parts; first outer ring kept only as the legacy `polygon` field |
| `parishModeSuggest.ts:56-58` | `hasGeom \|\| Boolean(foundation)` — suggestion toast no longer a trap |

**Tests:** `packages/dash-coverage` — **25/25 passing**, including
`uses multiPolygon when present (second part)` and `treats hole as outside include multiPolygon`.

**Guards:** zone-jsonb-truncated = **0**; multi-part parish in `parish_boundary` mode = **0**.
(Parish-jsonb guard returns 2 **by design** — see the design contract note below.)

---

### OPEN-12 — Leftover smoke-test zone on New Kingston ✅ **Done — verified**

Deleted fixture zone “Kingston delivery area”, cleared `published_version_id`, removed orphan
coverage versions. Market row kept inactive for future catalog create.

**Verified (2026-08-27 initial):** New Kingston → 0 zones, `published = false`, `draft_dirty = true`.
Zone count 5 → 4. No tiny published zones remain.

**Follow-up (same day):** New Kingston **market row deleted** during legacy purge. Spanish Town was
later deleted and re-created from catalog by ops; current row is catalog-clean with official geom
(see §2d).

---

### OPEN-13 — 13 of 17 towns remain unreconciled ✅ **Done** (ops path)

Admin3 community multi-select → `unionCommunitiesToMarket` added on town cards (“Build from
communities…”) for linked parishes. No auto-union of all 13.

**Verified wiring:** `MarketsPage.tsx` → `unionCommunitiesToMarket`
(`dashAdminService.ts`) → `POST /admin/markets/markets/:marketId/union-communities`
(`boundaryRoutes.ts:295-310`) → `union_admin3_to_market_zone` RPC. UI surfaces as
**“Build from communities…”** with a per-community checkbox list. When the town already has a
catalog `pcode`, the list is scoped to **that town's admin3 children** (`parent_pcode = town.pcode`);
otherwise it falls back to the whole parish.

---

### OPEN-15 — No delete-town control in Markets UI ✅ **Done — verified**

Ops could delete parish rows (trash on parish header) but not individual towns. Legacy cleanup
required SQL or direct API calls.

**Fix:** `deleteMarket` in `dashAdminService.ts` → `DELETE /admin/markets/:id`
(`marketRoutes.ts:1117`). Town row trash icon with confirm dialog in `MarketsPage.tsx`.

**Used 2026-08-27:** purged 16 legacy St. Catherine towns + New Kingston fixture via the same API
path (also run once via approved SQL reset before the UI shipped).

---

### OPEN-16 — No “apply catalog border” on existing towns ✅ **Done — verified**

`promoteMarketBoundary` / `POST …/markets/:marketId/promote-boundary` existed but was only reachable
via **Create from catalog** on **new** towns. Existing rows with a `pcode` but a deleted hand-drawn
border (Spanish Town after ops deleted the old green zone) had no one-click recovery — ops were sent
to **Build from communities…** incorrectly.

**Fix:** expanded town row shows **“Apply official border (JM0807)”** when `town.pcode` is set and
include zone count is 0. Calls `promoteMarketBoundary`.

**Correct ops path for admin2 catalog towns:** Create from catalog (new) **or** Apply official border
(existing) — **not** community union.

---

### OPEN-14 — Schema comments contradict the geom-first contract ✅ **Done — verified**

With OPEN-11 landed, `foundation_geom` / `service_zone_polygons.geom` are the **source of truth for
coverage**, and the `jsonb` columns are a legacy first-ring projection kept for back-compat. The
database's own documentation previously pointed developers at the truncated columns.

**Fix applied:** migration `20260830190000_geom_column_comments_open14.sql` on live GoRide:

| Column | Comment (summary) |
|---|---|
| `service_parishes.foundation_polygon` | LEGACY display — first outer ring only; not for coverage |
| `service_parishes.foundation_geom` | SoT for parish coverage; use `parish_foundation_parts()` |
| `service_zone_polygons.polygon` | LEGACY display — first outer ring only |
| `service_zone_polygons.geom` | SoT for zone coverage; use `zone_geom_parts()` |

**Verified:** `pg_description` on all four columns matches the migration text (2026-08-27).

---

### Design contract — the parish jsonb guard is expected to return 2

The appendix guard *"parishes whose legacy jsonb is a truncated view of their real geometry"*
returns **2 rows (Kingston, St. Catherine)** and **that is now correct behaviour, not a failure**.

It was written before OPEN-11 to detect the bug. Post-fix, truncated jsonb is the accepted
dual-write contract; the property that matters is that **nothing reads it for coverage**. Guards 2
and 3 (zone truncation, multi-part parish in `parish_boundary` mode) remain true 0-row invariants.

Do not "fix" guard 1 by backfilling all parts into the jsonb — flat `{lat,lng}[]` cannot represent
multi-part geometry, which was BUG-4. Re-interpret it as an inventory of parishes whose jsonb must
never be used for coverage.

---

## 2d. Ops playbook — Spanish Town clean launch (2026-08-27)

Lessons from the first real catalog-driven town launch. Parishes and Boundary Library (921 rows) were
already clean; **town rows were not**.

### What was legacy vs official

| Layer | Legacy? | Action taken |
|---|---|---|
| 14 parishes (`JM01`–`JM14`, cod-ab borders) | No — keep | None |
| Boundary Library (921 COD-AB rows) | No — keep | None |
| 16 St. Catherine towns (ALL CAPS, no pcode) | Yes — pre-catalog bulk import | Deleted all |
| New Kingston fixture market (Kingston parish) | Yes — smoke test | Deleted |
| Spanish Town (seed + hand-drawn border, then border deleted) | Hybrid broken | Deleted → recreated from `JM0807` |

### Correct workflow (admin2 town in catalog)

1. St. Catherine → **+ Add town** → **Spanish Town (`JM0807`)** → **Create from catalog**
2. **Open map** → confirm green border
3. **Publish coverage**
4. Toggle **Active** ON

Alternative on an **existing** catalog-linked town missing its border: expand town → **Apply official
border (`pcode`)** — do not use community union.

### Communities — when they apply

| Case | Tool |
|---|---|
| Town exists at admin2 (e.g. Spanish Town `JM0807`) | Create from catalog / Apply official border |
| Place exists only at admin3 (e.g. Sligoville `JM080714` as its own market) | Manual town → **Build from communities…** → Union |
| Neighborhood inside an official town border but **not** in Boundary Library (e.g. local names like “Magil Palm”) | **Nothing** — if inside the green border, delivery already works. Do **not** hand-insert rows into `admin_boundaries`. Extend the town border on the map only if geography is genuinely outside COD-AB. |

Spanish Town has **20** official admin3 communities under `JM0807` (Sydenham, Sligoville, etc.).
Informal subdivision names not in COD-AB are expected; the town-level polygon is authoritative.

### Verified live state (post-launch)

```
markets total = 1
Spanish Town: active=true, published=true, draft_dirty=false,
  pcode=JM0807, boundary_pcode=JM0807, include zone ≈1124 pts
readiness: merchants=3 matched, couriers=3 matched (market_id may have changed after recreate)
```

---

### OPEN-11 — Legacy `jsonb` ring truncation is still load-bearing ⚠️ **P1** (historical)

The dual-write design stores full geometry in PostGIS `geom` columns but keeps a **single outer ring**
in the legacy `jsonb` columns (`promote_boundary_to_parish` comments this as *"primary outer ring as
legacy jsonb for clients still on flat rings"*). Three code paths still read the **jsonb**, not the
`geom` — so multi-part boundaries silently lose every part after `[0]`.

**Confirmed truncation in live data:**

| Parish | `foundation_geom` | legacy `foundation_polygon` | Area lost if jsonb is used |
|---|---:|---:|---:|
| Kingston (`JM03`) | 4,370 pts / 2 parts | **1,329 pts** | **23.7%** |
| St. Catherine (`JM08`) | 4,033 pts / 2 parts | 3,557 pts | 0.11% |

**Catalog exposure — how many boundaries are multi-part:**

| Level | Multi-part | With holes | Max parts |
|---|---:|---:|---:|
| admin0 | 1 | 0 | 2 |
| admin1 | 2 | 0 | 2 |
| admin2 | **8** | **7** | **3** |
| admin3 | 1 | 0 | 2 |

Holes are handled correctly (materialised as `exclude` zones). **Multi-part truncation is not.**

**The three call sites:**

1. **`coverageZones.ts:178`** — `parish_boundary` synthetic customer zone
   ```ts
   buildParishSyntheticZone(parishId, market.id, parish.name, parish.foundation_polygon)
   //                                                          ^^^^^^^^^^^^^^^^^^^^^^^^ truncated
   ```
   Lines 161 and 174 also gate on `foundation_polygon` alone and should accept `has_foundation_geom`.
   *(The outer-gate check at line 105 is correct — it uses the `point_in_parish_foundation` RPC.)*

2. **`coverageZones.ts:74`** — town zone coverage read: `polygon: Array.isArray(z.polygon) ? … : []`.
   Harmless today (all 5 live zones are single-part) but will truncate as soon as one of the 8
   multi-part admin2 boundaries is promoted to a town.

3. **`coveragePlatform.ts:32`** — `zoneSnapshotPayload` stores `polygon: z.polygon` only. Publishing a
   multi-part town **freezes the truncated ring into the published version**, and restore replays it.
   No `geom` and no `boundary_pcode` are carried into the snapshot.

**Reachability — this is one click away, today.**
`parishModeSuggest.ts:60-68` suggests `parish_boundary` when a parish is `town_zones` + has a
foundation + has **exactly one** active town with includes. St. Catherine matches that condition right
now (Spanish Town), so ops sees a toast with an **"Apply Parish border"** action that would switch it
onto the truncated ring. Kingston is dormant only because New Kingston is inactive — activating it
arms the same toast with **23.7%** of the parish at stake.

**Fix:**
- Prefer `foundation_geom` / `z.geom` wherever a coverage decision is made; fall back to jsonb only
  when the geom column is null.
- Extend `zoneSnapshotPayload` to persist the full geometry (GeoJSON or WKB) plus `boundary_pcode`,
  so published versions and restores are lossless.
- Consider emitting **all** parts into the legacy jsonb as a MultiPolygon-aware structure, or add a
  `foundation_parts` count so a stale reader can at least detect that it is seeing a partial shape.

**Guard query — should return 0 rows once fixed:**
```sql
select slug, jsonb_array_length(foundation_polygon) as jsonb_pts,
       st_npoints(foundation_geom) as geom_pts, st_numgeometries(foundation_geom) as parts
from delivery.service_parishes
where st_numgeometries(foundation_geom) > 1
  and jsonb_array_length(foundation_polygon) < st_npoints(foundation_geom) - 1;
-- currently: kingston, st-catherine
```

---

### OPEN-12 — Leftover smoke-test zone on New Kingston ⚠️ **P2**

The `JM01K` era left an orphan zone behind when the boundary fixtures were purged:

```
market   = New Kingston (kingston)   is_active = false   pcode = NULL
zone     = "Kingston delivery area"  source = 'import'   boundary_pcode = NULL
polygon  = 4 jsonb pts / 5 geom pts  (a synthetic box)
published_version_id IS NOT NULL  →  flagged published
```

Inactive so it is not serving customers, but it is a published-flagged fake delivery area sitting in
a live table, and it will reappear in any coverage export, health view, or overview map.

**Fix:** delete the zone and clear `published_version_id` on New Kingston (or delete the market if it
was only ever a fixture), then re-promote from `JM03`'s admin2 children if a real Kingston town is
wanted.

---

### OPEN-13 — 13 of 17 towns remain unreconciled ⚠️ **P3** (tracking only)

`reconcile_market_pcodes` matched 4 of 17 (Bog Walk `JM0801`, Linstead `JM0802`, Old Harbour `JM0804`
promoted with real geometry; Spanish Town `JM0807` metadata-only, published polygon correctly left
intact). The other 13 are **legitimately absent from the admin2 catalog** — Guy's Hill, Ewarton,
Sligoville and similar sit at **admin3**, not admin2.

This is expected, not a defect. Recorded so it is not re-investigated. When those towns need real
borders, the path is `union_admin3_to_market_zone` over the relevant community pcodes rather than an
admin2 match.

Note for any future matcher: existing town names are shouty legacy imports (`OLD HARBOUR BAY`,
`GUY'S HILL`) — matching must be case-insensitive, apostrophe-tolerant, and **scoped to the parent
parish** (29 of 83 admin2 names repeat across parishes; "May Pen" exists in 5).

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

**Do not hand-author catalog communities.** `admin_boundaries` is COD-AB official data only (bulk
import / upsert). Local or informal neighborhood names absent from COD-AB (e.g. “Magil Palm” inside
Spanish Town) are not missing data — delivery follows the **town** polygon. Extend operational borders
via map edit / GeoJSON import on the market, not by inserting fake admin3 rows.

**Source fidelity confirmed.** The Shapefile→GeoJSON conversion was validated against the official
GeoJSON release: 921/921 features, 942/942 rings geometrically identical, max coordinate delta
**11 nanometres** (float serialisation only); 151 rings differ by starting vertex (rotation —
geometrically meaningless). The only property difference is `""` vs `null` in six always-empty
alternate-name/language columns, a DBF limitation. **Either archive is equally valid; no re-export
needed.**

---

## 4. Priority order

### Outstanding work

**None.** OPEN-1…OPEN-16 are complete and independently verified on live GoRide.

### Completed (2026-08-27)

| Priority | Item | Status |
|---|---|---|
| P0 | OPEN-1 Run the COD-AB import | ✅ 921 rows verified |
| P0 | OPEN-2 Restore Kingston, purge fixtures | ✅ `JM03`, 2 parts, 4,370 pts |
| P1 | OPEN-3 Move snapshot into the RPC | ✅ `20260830170000` |
| P1 | OPEN-5 Reconcile town/zone pcodes | ✅ 4 matched, 13 tracked as OPEN-13 |
| P2 | OPEN-4 Re-promote St. Catherine / St. Andrew | ✅ `ST_Equals` = true |
| P2 | OPEN-6 Fix `Portmore` parish row | ✅ deleted |
| P2 | OPEN-7 Catalog-driven town creation | ✅ picker for linked parishes |
| P3 | OPEN-8/9/10 Consolidation & cleanup | ✅ |
| **P1** | **OPEN-11** Geom-first coverage (3 call sites) | ✅ `20260830180000` · functional probe passes · 25/25 tests |
| **P2** | **OPEN-12** New Kingston fixture cleanup | ✅ 0 zones, unpublished |
| **P3** | **OPEN-13** admin3 community-union ops path | ✅ "Build from communities…" wired end-to-end |
| **P2** | **OPEN-15** Delete town in Markets UI | ✅ trash + `deleteMarket` client |
| **P2** | **OPEN-16** Apply official border on existing catalog town | ✅ promote button on town card |
| **P3** | **OPEN-14** Schema comments name `*_geom` as coverage SoT | ✅ `20260830190000` |
| — | Spanish Town clean launch | ✅ 1 market, `JM0807` published + active (§2d) |

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

### OPEN-11 regression guards

> **Guards 2 and 3 must return 0 rows. Guard 1 is expected to return 2** (Kingston, St. Catherine) —
> see the design-contract note in §2c. It is an inventory, not a failure.

```sql
-- 1. INVENTORY (expect 2): parishes whose legacy jsonb is a first-ring-only projection.
--    These rows are fine — the contract is that nothing reads jsonb for coverage.
--    Do NOT "fix" by backfilling parts: flat {lat,lng}[] cannot hold multi-part geometry (BUG-4).
select slug, jsonb_array_length(foundation_polygon) as jsonb_pts,
       st_npoints(foundation_geom) as geom_pts, st_numgeometries(foundation_geom) as parts
from delivery.service_parishes
where st_numgeometries(foundation_geom) > 1
  and jsonb_array_length(foundation_polygon) < st_npoints(foundation_geom) - 1;

-- 2. same check for town zones (fires once a multi-part admin2 is promoted)
select z.id, z.name, jsonb_array_length(z.polygon) as jsonb_pts,
       st_npoints(z.geom) as geom_pts, st_numgeometries(z.geom) as parts
from delivery.service_zone_polygons z
where st_numgeometries(z.geom) > 1
  and jsonb_array_length(z.polygon) < st_npoints(z.geom) - 1;

-- 3. multi-part parishes currently in parish_boundary mode (was: live truncation risk)
select slug, name, st_numgeometries(foundation_geom) as parts
from delivery.service_parishes
where coverage_mode = 'parish_boundary' and st_numgeometries(foundation_geom) > 1;
```

### OPEN-11 functional check — the coverage probe

The structural guards cannot prove coverage actually works. This probes a point on a parish's
**second** polygon part and asserts the coverage RPC covers it. Expect `rpc_covers = true` and
`parts_returned = 2`; before the fix this returned `false`.

```sql
with k as (select foundation_geom g, id from delivery.service_parishes where slug = 'kingston'),
p as (select st_geometryn(g,1) a, st_geometryn(g,2) b, id from k),
probe as (select st_pointonsurface(b) pt, a, b, id from p)
select st_y(pt) as lat, st_x(pt) as lng,
       st_covers(a, pt)                                             as inside_part1_only,
       delivery.point_in_parish_foundation(id, st_y(pt), st_x(pt))  as rpc_covers,
       jsonb_array_length(delivery.parish_foundation_parts(id))     as parts_returned,
       round((st_area(b::geography) /
             (st_area(a::geography) + st_area(b::geography)) * 100)::numeric, 1) as part2_pct
from probe;
-- 2026-08-27: inside_part1_only=false · rpc_covers=true · parts_returned=2 · part2_pct=23.7
```

### Catalog multi-part / hole census (exposure sizing for OPEN-11)

```sql
select admin_level,
       count(*) filter (where st_numgeometries(geom) > 1) as multipart,
       count(*) filter (where st_nrings(geom) > st_numgeometries(geom)) as with_holes,
       max(st_numgeometries(geom)) as max_parts
from delivery.admin_boundaries group by admin_level order by admin_level;
-- 2026-08-27: L0 1/0/2 · L1 2/0/2 · L2 8/7/3 · L3 1/0/2
```
