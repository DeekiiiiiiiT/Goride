-- MER-03: the database can finally say "this row is a part schedule".
--
-- Before: due_kind allowed only service_package / statutory_inspection, so the 16 part rules
-- and the 5 service packages all claimed to be packages, and the only way to tell them apart
-- was whether a part was attached. Two values are added and nothing else about the 21 rows
-- changes. No rule, interval, status or revision is touched.
--
--   part_schedule       one part has a rhythm (a component is attached)
--   inspection          a check row that belongs to no single part
--   service_package     Basic / Intermediate / Major style package (unchanged)
--   statutory_inspection  e.g. the shaken-style statutory due (unchanged, unused today)

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_due_kind_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_due_kind_check
  CHECK (due_kind IN ('service_package', 'statutory_inspection', 'part_schedule', 'inspection'));

-- The 16 rows with a component are part schedules. The 5 packages (component_id IS NULL) stay
-- service_package. updated_at is deliberately not touched: no number on these rows changed, so
-- the master revision log and the rule ordering stay as they are.
UPDATE public.maintenance_task_templates
SET due_kind = 'part_schedule'
WHERE component_id IS NOT NULL
  AND due_kind <> 'part_schedule';

COMMENT ON COLUMN public.maintenance_task_templates.due_kind IS
  'part_schedule = a part with a rhythm; service_package = Basic/Major style package; statutory_inspection = e.g. shaken-style statutory due; inspection = a check row with no part attached.';

-- A row with a part attached is a part schedule, never a "package". The column default is still
-- service_package (a package is written without a part), so a writer that leaves the default would
-- quietly recreate the bug MER-03 fixes. The row is corrected on the way in instead.
CREATE OR REPLACE FUNCTION public.trg_mtt_due_kind_from_shape()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.component_id IS NOT NULL AND NEW.due_kind = 'service_package' THEN
    NEW.due_kind := 'part_schedule';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_mtt_due_kind_from_shape ON public.maintenance_task_templates;
CREATE TRIGGER mm_mtt_due_kind_from_shape
  BEFORE INSERT OR UPDATE OF component_id, due_kind ON public.maintenance_task_templates
  FOR EACH ROW EXECUTE FUNCTION public.trg_mtt_due_kind_from_shape();

REVOKE ALL ON FUNCTION public.trg_mtt_due_kind_from_shape() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
