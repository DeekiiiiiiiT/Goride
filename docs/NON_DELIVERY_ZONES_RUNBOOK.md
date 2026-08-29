# Non-Delivery Zones — Ops Runbook

**Program:** Non-Delivery Zones Full Implementation  
**Last updated:** 2026-08-29

> **Launch footprint:** Prefer [Service Areas runbook](./SERVICE_AREAS_RUNBOOK.md) (ADR-0018). Red cutouts are for temporary hazards *inside* live service areas — not for inventing the launch shape.

> **Priority:** New exclusions default to **100**. Service areas stay at **10**. Equal-priority ties favour **exclude** (fail-safe). Safe islands need include priority **higher than** the surrounding exclude (e.g. exclude 100 + island 200).

---

## Spanish Town E2E validation (Phase 0 / EXC-8)

Use this checklist before relying on exclusions in production. Prefer a **surcharge** policy once for money-path proof (SURCHARGE-1), then a **block** cutout for messaging.

1. Open **Dash Admin → Markets → Spanish Town**.
2. Confirm a **magenta service area** (or green full-border include) is live.
3. **Draw non-delivery zone** (polygon) *inside* that live delivery area — keep it small.
4. **Details** on the cutout:
   - **Category:** Safety (required for publish)
   - **Policy:** Surcharge (e.g. J$200) for the money-path pilot — or Block for hard reject copy
   - **Priority:** leave **100** (default) unless modelling a safe island nearby
   - **Effective to:** ~24h from now
5. **Publish coverage** — resolve any red conflict banners first.
6. Confirm **net coverage** refreshed: `service_markets.net_coverage_geom IS NOT NULL` for Spanish Town.
7. **Test pin** inside cutout:
   - Surcharge: quote shows higher delivery fee; `platform + courier ≈ deliveryFee`
   - Block: “We don’t deliver here”
8. Customer app at same pin: surcharge on checkout total, or excluded-zone copy if blocked.
9. After **Effective to**: engine ignores the zone; check `delivery.v_expired_active_exclusions` if still `is_active`.
10. **Restore** prior coverage version → pin behaves normally again (restore also refreshes net coverage).
11. Record test pin lat/lng and version id in Notion (geospatial program page).

**Pilot pin (EXC-8 audit insert, 2026-08-28; priority bumped 2026-08-29):** near Service area 1 centroid  
`18.02126, -76.97146` — zone name `EXC-8 audit pilot (safety surcharge)` (priority **100**, surcharge J$200).

**Closeout pilots (2026-08-29, ~7-day `effective_to`):**
- `EXC closeout block pilot` — market `block` + `zone_schedules` `00:00:00`–`23:59:59` (use `23:59:59`, not `23:59:00`, if you need near-24h coverage; for true always-on, omit schedules entirely)
- `EXC closeout parish scoped block` — St. Catherine parish `scoped_exclusion_zones`

---

## Temporary safety cutout (24h)

1. Draw or radius-cutout the area.
2. **Details** → Category: **Safety** → set **Effective to** (24h).
3. Publish.
4. After expiry, zone auto-ignored by engine; run hygiene query if still `is_active`:

```sql
SELECT * FROM delivery.v_expired_active_exclusions;
```

---

## Parish-wide hazard (one polygon)

1. **Markets → Platform exclusions → Parish** tab.
2. **Add** → edit **Details** (category, expiry, reason). Prefer a real polygon overlapping the towns you intend to block (placeholder box may miss live service areas).
3. No per-town duplicate draw needed — applies to all towns in parish at evaluation.

---

## Recurring schedule (API only — no Markets UI yet)

Attach windows when creating/updating a market cutout or scoped exclusion:

```http
PATCH /admin/markets/{marketId}/zones/{zoneId}
{
  "schedules": [
    {
      "dow": [0, 1, 2, 3, 4, 5, 6],
      "start_time": "20:00",
      "end_time": "23:59:59",
      "timezone": "America/Jamaica"
    }
  ]
}
```

Scoped: `PATCH /admin/markets/scoped-exclusions/{id}` with the same `schedules` array.  
Empty / omitted schedules = always active (subject to `effective_*` / `is_active`). Prefer that for true 24/7 safety zones. If you express a near-all-day window, use `end_time: "23:59:59"` — end is **inclusive** through that minute (no 23:59 gap). Evaluation honours an injected `at` clock in `@roam/dash-coverage` tests.

---

## Safe island inside a no-go area

1. Draw **exclude** at priority **100** (default).
2. Draw small **include** polygon over hospital/gated community at priority **200** (must be higher than the exclude).
3. Publish — test pin inside island should deliver.

---

## Hygiene (weekly)

```sql
-- Expired but still active
SELECT * FROM delivery.v_expired_active_exclusions;

-- Stale temporary/safety without expiry (>90 days)
SELECT id, name, category, created_at FROM delivery.service_zone_polygons
WHERE kind = 'exclude' AND effective_to IS NULL
  AND category IN ('temporary','safety') AND created_at < now() - interval '90 days';

-- Duplicate excludes across markets
SELECT a.name, a.market_id, b.market_id
FROM delivery.service_zone_polygons a
JOIN delivery.service_zone_polygons b
  ON a.id < b.id AND a.kind = 'exclude' AND b.kind = 'exclude'
 AND a.market_id <> b.market_id AND st_intersects(a.geom, b.geom);

-- Net coverage populated?
SELECT name, net_coverage_geom IS NOT NULL AS has_net, net_coverage_stats
FROM delivery.service_markets
WHERE is_active;
```

---

## PostGIS coverage eval (EXC-6)

| Env secret | Effect |
|---|---|
| `COVERAGE_POSTGIS_EVAL=1` | Shadow dual-run: GiST candidates vs full JS; logs `[coverage] PostGIS parity mismatch` (zone ids). No customer behavior change. Staging first. |
| `COVERAGE_POSTGIS_PRIMARY=1` | Primary: evaluate on GiST candidate subset; full JS fallback on RPC error / empty geom. Keep EVAL on during soak. Unset PRIMARY to rollback. |

Set on the **delivery** Edge Function, then redeploy:

```bash
supabase secrets set COVERAGE_POSTGIS_EVAL=1 --project-ref <staging-or-prod>
# after zero unexplained mismatches:
supabase secrets set COVERAGE_POSTGIS_PRIMARY=1 --project-ref <staging-or-prod>
```

---

## Rollback

**Markets → town map → Version history → Restore** — re-publishes prior snapshot and refreshes `net_coverage_geom`.
