-- Per-customer feature packaging for Roam Enterprise.
-- null = inherit product-line enabledModules; object = explicit overrides.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb NULL;

COMMENT ON COLUMN public.organizations.enabled_modules IS
  'Per-org module overrides (boolean map). null inherits platform:settings:enterprise.enabledModules. Effective = product-line ∩ org (explicit false wins).';

CREATE INDEX IF NOT EXISTS idx_organizations_enabled_modules
  ON public.organizations USING gin (enabled_modules)
  WHERE enabled_modules IS NOT NULL;
