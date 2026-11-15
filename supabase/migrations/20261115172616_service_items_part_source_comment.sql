-- Service items S6 follow-up (code review): correct the part_source column comment. The column went live on
-- 15 Nov 2026 (not 16 Nov), and NULL has two meanings, both stated.
COMMENT ON COLUMN public.maintenance_work_order_line_item.part_source IS
  'How a part item''s part was chosen: car = from this car''s own parts list (part_id set, server-checked); size = from "fits by size"; typed = typed in. NULL = saved before this column existed (15 Nov 2026), or a part item with no part chosen.';
