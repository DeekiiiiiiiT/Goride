# Non-Delivery Zones — Ops Runbook

**Program:** Non-Delivery Zones Full Implementation  
**Last updated:** 2026-08-28

---

## Spanish Town E2E validation (Phase 0)

Use this checklist before relying on exclusions in production.

1. Open **Dash Admin → Markets → Spanish Town**.
2. Confirm a green **include** (town border) exists.
3. **Draw non-delivery zone** (polygon) in a neighborhood you can visit on a map.
4. Click **Details** on the new cutout → set **Category** (required) and optional expiry.
5. **Publish coverage** — resolve any red conflict banners first.
6. **Test pin** inside cutout → “We don’t deliver here”.
7. Customer app: save address at same pin → “We're not currently serving your address.”
8. Attempt checkout → blocked (server + client).
9. **Restore** prior coverage version → address deliverable again.
10. Record test pin lat/lng and version id in Notion audit tracker.

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
2. **Add** → edit **Details** (category, expiry, reason).
3. No per-town duplicate draw needed — applies to all towns in parish at evaluation.

---

## Safe island inside a no-go area

1. Draw **exclude** at priority **10** (default).
2. Draw small **include** polygon over hospital/gated community at priority **30+**.
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
```

---

## Rollback

**Markets → town map → Version history → Restore** — re-publishes prior snapshot.

Feature flags (env): `COVERAGE_POSTGIS_EVAL=1` enables PostGIS parity logging in staging only.
