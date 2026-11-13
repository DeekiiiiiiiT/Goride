-- Shop fees group (docs/maintenance-shop-fees-group-audit.md, SF-01).
-- A job group for shop charges that are not a part of the car, starting with the
-- mechanic's inspection / diagnostic fee (the job itself is added in Dominion → Jobs).
--   is_part = false            → kept out of Find parts and the parts database
--   quick_job_eligible = true  → shown on Fleet → Log service
-- Safe to run twice: does nothing if the group already exists.

INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, kind, parent_id, is_part, quick_job_eligible,
  status, op_code, icon_key, sort_order, field_schema, updated_at
)
VALUES (
  'sys_shop_fees', 'Shop fees', 'Shop fees', 'system', NULL, false, true,
  'active', 'SHOP', 'wrench', 1110, '{"fields":[]}'::jsonb, now()
)
ON CONFLICT (code) DO NOTHING;
