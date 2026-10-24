-- G5 contract. Do not run this until 14 quiet days after 2026-10-24
-- with zero calls to the routes listed below, and a separate go-ahead.
-- It is not a migration. The drops stay commented. The check fails closed
-- while anything still uses these objects.

-- Routes that still answer 410 (leave them until this script is approved):
--   POST   /admin/parishes
--   PATCH  /admin/parishes/:parishId          (name or slug only)
--   PUT    /admin/parishes/:parishId/outline
--   PUT    /admin/parishes/:parishId/town-pins
--   DELETE /admin/parishes/:parishId
--   POST   /admin/boundaries/import
--   POST   /admin/parishes/:parishId/outline-versions/:versionId/restore

DO $$
DECLARE
  hit text;
BEGIN
  SELECT string_agg(ref, ', ' ORDER BY ref)
    INTO hit
  FROM (
    SELECT n.nspname || '.' || p.proname AS ref
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('delivery', 'geo', 'public')
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~*
        'parish_outline_templates|town_outline_templates|town_pins|foundation_polygon|parish_outline_versions|admin_boundaries'
    UNION ALL
    SELECT n.nspname || '.' || c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('delivery', 'geo', 'public')
      AND c.relkind = 'v'
      AND pg_get_viewdef(c.oid, true) ~*
        'parish_outline_templates|town_outline_templates|town_pins|foundation_polygon|parish_outline_versions|admin_boundaries'
  ) refs;
  IF hit IS NOT NULL THEN
    RAISE EXCEPTION 'still referenced: %', hit;
  END IF;
END $$;

-- DROP TABLE IF EXISTS delivery.parish_outline_templates;
-- DROP TABLE IF EXISTS delivery.town_outline_templates;
-- DROP TABLE IF EXISTS delivery.parish_outline_versions;
-- ALTER TABLE delivery.service_parishes DROP COLUMN IF EXISTS town_pins;
-- ALTER TABLE delivery.service_parishes DROP COLUMN IF EXISTS foundation_polygon;
-- DROP TABLE IF EXISTS delivery.admin_boundaries;

SELECT 'held' AS status, 'Run only after 14 quiet days from 2026-10-24 and a written go-ahead.' AS note;
