-- Parish border history. Current borders already match COD-AB, so these stay retired.
INSERT INTO geo.boundary_versions (
  pcode, version, geom, geom_display, area_sqkm, source, notes, status, created_by, created_at
)
SELECT
  sp.pcode,
  1 + ROW_NUMBER() OVER (PARTITION BY sp.pcode ORDER BY ov.version),
  COALESCE(ov.foundation_geom, delivery.jsonb_ring_to_multipolygon(ov.foundation_polygon)),
  delivery.simplify_boundary_display(
    COALESCE(ov.foundation_geom, delivery.jsonb_ring_to_multipolygon(ov.foundation_polygon))
  ),
  NULL,
  COALESCE(NULLIF(btrim(ov.boundary_source), ''), 'manual'),
  COALESCE(ov.label, 'Parish border history'),
  'retired',
  ov.created_by,
  ov.created_at
FROM delivery.parish_outline_versions ov
JOIN delivery.service_parishes sp ON sp.id = ov.parish_id
WHERE sp.pcode IS NOT NULL
  AND COALESCE(ov.foundation_geom, delivery.jsonb_ring_to_multipolygon(ov.foundation_polygon)) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM geo.boundary_versions existing
    WHERE existing.pcode = sp.pcode
      AND existing.notes = COALESCE(ov.label, 'Parish border history')
      AND existing.created_at = ov.created_at
  );

-- Hand-drawn templates, kept only as retired history when the slug matches a place.
INSERT INTO geo.boundary_versions (
  pcode, version, geom, geom_display, source, notes, status
)
SELECT
  b.pcode,
  (SELECT COALESCE(MAX(v.version), 1) + 1 FROM geo.boundary_versions v WHERE v.pcode = b.pcode),
  delivery.jsonb_ring_to_multipolygon(t.polygon),
  delivery.simplify_boundary_display(delivery.jsonb_ring_to_multipolygon(t.polygon)),
  'manual',
  'Retired parish template ' || t.slug,
  'retired'
FROM delivery.parish_outline_templates t
JOIN geo.boundaries b ON b.slug = t.slug AND b.admin_level = 1
WHERE t.polygon IS NOT NULL
  AND jsonb_typeof(t.polygon) = 'array'
  AND jsonb_array_length(t.polygon) >= 3
  AND NOT EXISTS (
    SELECT 1 FROM geo.boundary_versions v
    WHERE v.pcode = b.pcode AND v.notes = 'Retired parish template ' || t.slug
  );

INSERT INTO geo.boundary_versions (
  pcode, version, geom, geom_display, source, notes, status
)
SELECT
  b.pcode,
  (SELECT COALESCE(MAX(v.version), 1) + 1 FROM geo.boundary_versions v WHERE v.pcode = b.pcode),
  delivery.jsonb_ring_to_multipolygon(t.polygon),
  delivery.simplify_boundary_display(delivery.jsonb_ring_to_multipolygon(t.polygon)),
  'manual',
  'Retired town template ' || t.slug,
  'retired'
FROM delivery.town_outline_templates t
JOIN geo.boundaries b ON b.slug = t.slug AND b.admin_level = 2
WHERE t.polygon IS NOT NULL
  AND jsonb_typeof(t.polygon) = 'array'
  AND jsonb_array_length(t.polygon) >= 3
  AND NOT EXISTS (
    SELECT 1 FROM geo.boundary_versions v
    WHERE v.pcode = b.pcode AND v.notes = 'Retired town template ' || t.slug
  );

INSERT INTO geo.places (kind, name, lat, lng, pcode, source, status)
SELECT
  'town_centre',
  COALESCE(NULLIF(btrim(pin->>'name'), ''), 'Pin'),
  (pin->>'lat')::double precision,
  (pin->>'lng')::double precision,
  sp.pcode,
  'town_pins',
  'active'
FROM delivery.service_parishes sp
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sp.town_pins, '[]'::jsonb)) pin
WHERE sp.pcode IS NOT NULL
  AND (pin->>'lat') ~ '^-?[0-9]'
  AND (pin->>'lng') ~ '^-?[0-9]'
  AND NOT EXISTS (
    SELECT 1 FROM geo.places pl
    WHERE pl.pcode = sp.pcode
      AND pl.kind = 'town_centre'
      AND pl.name = COALESCE(NULLIF(btrim(pin->>'name'), ''), 'Pin')
      AND pl.lat = (pin->>'lat')::double precision
      AND pl.lng = (pin->>'lng')::double precision
  );

INSERT INTO geo.place_aliases (pcode, alias_kind, alias_value)
SELECT b.pcode, 'rush_slug', b.slug
FROM geo.boundaries b
ON CONFLICT DO NOTHING;

INSERT INTO geo.place_aliases (pcode, alias_kind, alias_value)
SELECT
  b.pcode,
  'fare_parish',
  CASE b.slug
    WHEN 'st-elizabeth' THEN 'saint-elizabeth'
    WHEN 'st-james' THEN 'saint-james'
    WHEN 'st-ann' THEN 'saint-ann'
    WHEN 'st-catherine' THEN 'saint-catherine'
    WHEN 'st-mary' THEN 'saint-mary'
    WHEN 'st-andrew' THEN 'saint-andrew'
    WHEN 'st-thomas' THEN 'saint-thomas'
    ELSE b.slug
  END
FROM geo.boundaries b
WHERE b.admin_level = 1
ON CONFLICT DO NOTHING;

INSERT INTO geo.place_aliases (pcode, alias_kind, alias_value)
SELECT
  b.pcode,
  'county',
  CASE b.slug
    WHEN 'hanover' THEN 'cornwall'
    WHEN 'st-elizabeth' THEN 'cornwall'
    WHEN 'st-james' THEN 'cornwall'
    WHEN 'trelawny' THEN 'cornwall'
    WHEN 'westmoreland' THEN 'cornwall'
    WHEN 'st-ann' THEN 'middlesex'
    WHEN 'st-mary' THEN 'middlesex'
    WHEN 'manchester' THEN 'middlesex'
    WHEN 'clarendon' THEN 'middlesex'
    WHEN 'st-catherine' THEN 'middlesex'
    ELSE 'surrey'
  END
FROM geo.boundaries b
WHERE b.admin_level = 1
ON CONFLICT DO NOTHING;

INSERT INTO geo.place_aliases (pcode, alias_kind, alias_value)
SELECT b.pcode, 'fare_locality', b.slug
FROM geo.boundaries b
WHERE b.admin_level = 2
ON CONFLICT DO NOTHING;

INSERT INTO geo.subscribers (app_key, impact_path, apply_path, enabled)
VALUES ('rush', '/internal/geo/impact', '/internal/geo/apply', true)
ON CONFLICT (app_key) DO UPDATE
SET impact_path = EXCLUDED.impact_path, apply_path = EXCLUDED.apply_path;
