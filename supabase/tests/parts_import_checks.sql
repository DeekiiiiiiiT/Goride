-- Parts import by area — SQL regression checks (audit PI-11)

BEGIN;

SELECT plan(8);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'part_import_promote'),
  'part_import_promote exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'part_import_validate'),
  'part_import_validate exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'part_import_undo_preflight'),
  'part_import_undo_preflight exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'part_import_revalidate_line'),
  'part_import_revalidate_line exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'part_import_route_review_rows'),
  'part_import_route_review_rows exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'part_import_row' AND column_name = 'existing_line_no'
  ),
  'part_import_row.existing_line_no column exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'part_import_ledger_by_area'
  ),
  'part_import_ledger_by_area view exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'part_import_ledger_by_area' AND column_name = 'undo_blocked_reasons'
  ),
  'ledger view exposes undo_blocked_reasons'
);

SELECT finish();

ROLLBACK;
