# Geospatial dual-write soak & cutover

After COD-AB admin1–3 are imported and ops is stable for ≥7 days:

1. Confirm every active parish/zone used for customer resolve has `foundation_geom` / `geom` set.
2. Confirm `point_in_parish_foundation` matches JS PIP on a fixture set (Kingston 2-part, hole case).
3. Recompile all market H3 cells via publish / admin recompile.
4. Stop writing jsonb rings for new promotes (keep jsonb as derived export only).
5. Drop dual-write triggers only after a release that no longer reads jsonb for PIP.

Until then: jsonb + PostGIS dual-write remains intentional.
