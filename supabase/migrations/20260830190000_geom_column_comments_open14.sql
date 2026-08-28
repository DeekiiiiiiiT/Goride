-- OPEN-14: document geom-first coverage contract on parish/zone columns.

COMMENT ON COLUMN delivery.service_parishes.foundation_polygon IS
  'LEGACY display projection: first outer ring only. NOT authoritative for coverage — '
  'multi-part parishes are truncated here. Use foundation_geom for all coverage decisions.';

COMMENT ON COLUMN delivery.service_parishes.foundation_geom IS
  'Source of truth for parish coverage (MultiPolygon, 4326). Read via parish_foundation_parts().';

COMMENT ON COLUMN delivery.service_zone_polygons.polygon IS
  'LEGACY display projection: first outer ring only. Use geom for coverage.';

COMMENT ON COLUMN delivery.service_zone_polygons.geom IS
  'Source of truth for zone coverage (MultiPolygon, 4326). Read via zone_geom_parts().';
