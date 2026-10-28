-- Flag enterprise orgs still tagged rideshare (Path B cleanup helper view)
CREATE OR REPLACE VIEW public.enterprise_rideshare_orgs_audit AS
SELECT
  id,
  name,
  owner_id,
  business_type,
  product_line,
  created_at
FROM public.organizations
WHERE product_line = 'enterprise'
  AND business_type = 'rideshare';

COMMENT ON VIEW public.enterprise_rideshare_orgs_audit IS
  'Enterprise orgs with rideshare business_type — migrate or re-tag before locking Enterprise signup';
