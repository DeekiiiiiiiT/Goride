# Community Reference Layer — Implementation Plan

**Date:** 2026-10-14 · **Status:** Plan only — no code changed
**Goal:** Draw the 775 admin3 community boundaries on the Jamaica overview map as a **faint grey
reference layer** with labels at high zoom — so you can snap service areas to real community lines.
**Not** a coverage layer: communities are not markets and must never be styled like one.

---

## What already exists (and what you reuse)

| Piece | Status |
|---|---|
| 775 admin3 boundaries, 0 invalid, `geom_display` populated | ✅ in `delivery.admin_boundaries` |
| `display_rings_json()` / `simplify_boundary_display()` helpers | ✅ used by the town RPC |
| **Viewport culling** — `viewBox(bounds)` + `shapeIntersectsView()` | ✅ already in `JamaicaOverviewMap.tsx:306-311` |
| Zoom sync + redraw loop (`z > 9` gate, `clearTowns()`) | ✅ `JamaicaOverviewMap.tsx:298-307` |

The hard part — culling by viewport — is built. This is mostly a copy of the town layer.

**Missing:** there is no `overview_community_shapes()`, `/overview-shapes` returns only
`{ towns, parishes }`, and the component has only `showParishes` / `showTowns`.

---

## Step 1 — RPC

Mirror `overview_town_shapes()`, but read straight from the catalog (communities are not markets, so
there is no `service_markets` join):

```sql
CREATE OR REPLACE FUNCTION delivery.overview_community_shapes()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'delivery', 'public'
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.name), '[]'::jsonb)
  FROM (
    SELECT
      b.pcode,
      b.name,
      b.parent_pcode,                         -- admin2 town
      COALESCE(b.center_lat, ST_Y(ST_PointOnSurface(COALESCE(b.geom_display, b.geom)))) AS center_lat,
      COALESCE(b.center_lng, ST_X(ST_PointOnSurface(COALESCE(b.geom_display, b.geom)))) AS center_lng,
      delivery.display_rings_json(
        COALESCE(b.geom_display, delivery.simplify_boundary_display(b.geom))
      ) AS rings
    FROM delivery.admin_boundaries b
    WHERE b.admin_level = 3
  ) s;
$$;

GRANT EXECUTE ON FUNCTION delivery.overview_community_shapes() TO service_role;
```

Note it returns **`geom_display`**, not `geom` — 55,152 points instead of 149,302.

---

## Step 2 — Route

`boundaryRoutes.ts:125` — add a third parallel RPC:

```ts
const [townsRes, parishesRes, communitiesRes] = await Promise.all([
  db.rpc("overview_town_shapes"),
  db.rpc("overview_parish_shapes"),
  db.rpc("overview_community_shapes"),
]);
…
return c.json({ towns, parishes, communities });
```

Keep it non-fatal the same way `parishes` already is — if the community RPC errors, return `[]`
rather than failing the whole overview.

---

## Step 3 — Client type

Add `DashOverviewCommunityShape` beside `DashOverviewTownShape`:

```ts
export interface DashOverviewCommunityShape {
  pcode: string;
  name: string;
  parent_pcode: string | null;
  center_lat: number | null;
  center_lng: number | null;
  rings: Array<Array<{ lat: number; lng: number }>>;
}
```

---

## Step 4 — Component

`JamaicaOverviewMap.tsx` — add alongside the town layer:

- `communityShapes?: DashOverviewCommunityShape[]` prop
- `layerCommunities` state + a **Communities (zoom)** checkbox next to *Towns (zoom)*
- a legend entry: faint grey swatch, label *"Community (reference)"*
- its own draw loop in the same `sync()` that redraws towns, reusing `viewBox` / `shapeIntersectsView`

**Styling — must read as background, not coverage:**

```ts
{
  strokeColor: '#94a3b8',   // slate-400
  strokeOpacity: 0.35,
  strokeWeight: 1,
  fillOpacity: 0,           // outline only — no fill
  clickable: false,         // never steals clicks from the zone editor
  zIndex: 1,                // under parishes, towns, cutouts
}
```

Labels: same `applyTownNames` pattern, gated **one zoom level tighter** than the polygons.

---

## Step 5 — Zoom + perf gating ⚠️ the part that matters

| Layer | Shapes | Display points |
|---|---:|---:|
| Towns (admin2) | 131 | 25,318 |
| **Communities (admin3)** | **775** | **55,152** |

**6× the shapes, ~2× the points** on a map that still creates one `google.maps.Polygon` per shape.

| Control | Setting |
|---|---|
| Polygon gate | `z >= 12` — stricter than towns (`z > 9`) |
| Label gate | `z >= 13` |
| Viewport cull | **required** — reuse `shapeIntersectsView`, do not draw all 775 |
| Default | **off** — opt-in checkbox, not on by default |

At zoom 12+ with culling, a typical viewport holds a handful of communities, not 775.

---

## Verification

```sql
-- RPC returns all 775 with rings
select jsonb_array_length(delivery.overview_community_shapes()) as shapes;
-- expect 775

-- every community has drawable rings and a centre
select count(*) filter (where (s->>'rings') is null or jsonb_array_length(s->'rings') = 0) as no_rings,
       count(*) filter (where (s->>'center_lat') is null) as no_centre
from jsonb_array_elements(delivery.overview_community_shapes()) s;
-- expect 0, 0

-- payload size sanity
select pg_size_pretty(length(delivery.overview_community_shapes()::text)::bigint) as payload;
```

In the browser: open the overview, tick **Communities**, zoom past 12 over Spanish Town. You should
see faint grey outlines under the magenta service area, names appearing at 13, and no lag when
panning. Zoom out to 9 — they should disappear entirely.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | 775 polygons tank the map | Zoom gate 12+, viewport cull, default off. Measure pan/zoom before shipping |
| R2 | Mistaken for coverage | Outline-only, grey, `zIndex: 1`, legend says *"reference"*. No fill, ever |
| R3 | Steals clicks in the zone editor | `clickable: false`. This layer is on the read-only overview; do **not** add it to `ZoneMapEditor` without re-checking vertex dragging |
| R4 | Payload growth on `/overview-shapes` | It's one more array on an admin-only endpoint. If it bites, add `?levels=` and fetch communities only when the layer is on |

---

## Order of work

1. Step 1 RPC → verify with the SQL above
2. Step 2 route → confirm `communities` appears in the response
3. Steps 3–4 type + component, default **off**
4. Step 5 gating, then measure panning at zoom 12 over Montego Bay (the densest, 38 communities)
5. Only if it feels good: consider defaulting on at high zoom
