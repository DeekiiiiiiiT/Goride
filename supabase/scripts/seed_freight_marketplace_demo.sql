-- Optional demo seed for Courier ↔ Freight Forwarder marketplace.
-- Does NOT create auth users. Pair with existing smoke logins in
-- docs/products/WAREHOUSE_COURIER_MODEL.md
--
-- Creates 2 extra placeholder (off-platform) partners linked to whatever
-- enterprise orgs already exist: one external FF for the first courier,
-- one external courier for the first warehouse.

INSERT INTO public.organizations (
  owner_id,
  name,
  slug,
  product_line,
  business_type,
  status,
  is_external,
  created_by_org_id,
  subscribed_products,
  external_contact
)
SELECT
  NULL,
  'Demo Off-Platform Forwarder',
  'ext-demo-ff-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  'enterprise',
  'warehouse',
  'active',
  true,
  o.id,
  '["warehouse"]'::jsonb,
  '{"name":"Demo FF desk","email":"demo-ff@example.com"}'::jsonb
FROM public.organizations o
WHERE o.product_line = 'enterprise'
  AND o.business_type = 'freight_forwarding'
  AND o.is_external = false
ORDER BY o.created_at
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.organizations (
  owner_id,
  name,
  slug,
  product_line,
  business_type,
  status,
  is_external,
  created_by_org_id,
  subscribed_products,
  external_contact
)
SELECT
  NULL,
  'Demo Off-Platform Courier',
  'ext-demo-courier-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  'enterprise',
  'freight_forwarding',
  'active',
  true,
  o.id,
  '["courier"]'::jsonb,
  '{"name":"Demo courier desk","email":"demo-courier@example.com"}'::jsonb
FROM public.organizations o
WHERE o.product_line = 'enterprise'
  AND o.business_type = 'warehouse'
  AND o.is_external = false
ORDER BY o.created_at
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO freight.warehouse_courier_links (
  warehouse_org_id,
  courier_org_id,
  status,
  initiated_by,
  accepted_at,
  terms
)
SELECT
  ext.id,
  courier.id,
  'active',
  'courier',
  now(),
  '{"free_days":7,"per_day_minor":150,"currency":"USD","handling_minor":250}'::jsonb
FROM public.organizations courier
JOIN public.organizations ext
  ON ext.is_external = true
 AND ext.created_by_org_id = courier.id
 AND ext.business_type = 'warehouse'
WHERE courier.business_type = 'freight_forwarding'
  AND courier.is_external = false
ON CONFLICT (warehouse_org_id, courier_org_id) DO NOTHING;

INSERT INTO freight.warehouse_courier_links (
  warehouse_org_id,
  courier_org_id,
  status,
  initiated_by,
  accepted_at,
  terms
)
SELECT
  wh.id,
  ext.id,
  'active',
  'warehouse',
  now(),
  '{"free_days":7,"per_day_minor":150,"currency":"USD","handling_minor":250}'::jsonb
FROM public.organizations wh
JOIN public.organizations ext
  ON ext.is_external = true
 AND ext.created_by_org_id = wh.id
 AND ext.business_type = 'freight_forwarding'
WHERE wh.business_type = 'warehouse'
  AND wh.is_external = false
ON CONFLICT (warehouse_org_id, courier_org_id) DO NOTHING;
