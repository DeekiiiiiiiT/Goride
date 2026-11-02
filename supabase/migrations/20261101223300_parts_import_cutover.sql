-- Retire legacy import RPCs after parts-import-by-area cutover

DROP FUNCTION IF EXISTS public.import_parts_catalog_rows(jsonb, uuid);
DROP FUNCTION IF EXISTS public.undo_parts_catalog_batch(uuid);
DROP FUNCTION IF EXISTS public.admin_recent_import_batches();

DROP TABLE IF EXISTS public.part_import_restore;
