-- G5 contract. Do not run this until the old border routes have had zero calls for 14 days.
-- It is not a migration. Applying it now would remove the rollback copy.

-- DROP TABLE IF EXISTS delivery.parish_boundary_templates;
-- DROP TABLE IF EXISTS delivery.town_boundary_templates;
-- ALTER TABLE delivery.service_parishes
--   DROP COLUMN IF EXISTS foundation_geom,
--   DROP COLUMN IF EXISTS foundation_polygon;
-- ALTER TABLE delivery.service_markets DROP COLUMN IF EXISTS outline_geom;
-- DROP TABLE IF EXISTS delivery.admin_boundaries;

SELECT 'held' AS status, 'Run only after 14 quiet days and a written go-ahead.' AS note;
