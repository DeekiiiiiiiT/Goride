-- Maintenance rebuild step 11 (MER-15): the work-order statuses the server already uses.
--
-- The server's lifecycle (maintenance_work_order_lifecycle.ts) moves a work order draft → open → in_shop →
-- completed, but the table only accepted draft / in_progress / completed / cancelled / planned. So approving a
-- driver request ("open") failed every time, and nothing could ever be "at the garage" ("in_shop"). Nobody saw
-- it because no driver request had been made yet.
--
-- The new Work orders tab reads them as:
--   draft (driver request)        Needs a decision
--   open / scheduled              Waiting to go in
--   in_shop / awaiting_parts      At the garage (off_road_at is set when it goes in)
--   in_progress                   Being saved (a Log service save that has not finished)
--   completed / closed            Done
--   cancelled                     Cancelled
-- planned stays the "Not done yet" planned jobs and never shows on the Work orders tab.

ALTER TABLE public.maintenance_work_orders DROP CONSTRAINT IF EXISTS maintenance_work_orders_status_check;
ALTER TABLE public.maintenance_work_orders ADD CONSTRAINT maintenance_work_orders_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text, 'open'::text, 'scheduled'::text, 'in_shop'::text, 'awaiting_parts'::text,
    'in_progress'::text, 'completed'::text, 'closed'::text, 'cancelled'::text, 'planned'::text
  ]));

-- Finishing a work order through Log service saves its jobs onto it (fleet_save_work_order). That function only
-- let a draft or in_progress work order be edited, so a work order that was approved (open) or taken in
-- (in_shop) could never be finished. The one condition is widened to the waiting / at-the-garage statuses; the
-- rest of the function is unchanged. It refuses to run if the condition is not found exactly once.
DO $patch$
DECLARE
  v_def text;
  v_old constant text := $q$v_wo.status NOT IN ('draft', 'in_progress')$q$;
  v_new constant text := $q$v_wo.status NOT IN ('draft', 'open', 'scheduled', 'in_shop', 'awaiting_parts', 'in_progress')$q$;
BEGIN
  v_def := pg_get_functiondef('public.fleet_save_work_order'::regproc);
  IF position(v_new IN v_def) > 0 THEN
    RETURN; -- already widened
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'fleet_save_work_order: expected the status check exactly once';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$patch$;
