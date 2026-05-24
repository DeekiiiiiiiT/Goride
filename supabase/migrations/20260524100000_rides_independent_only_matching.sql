-- Gate Roam passenger dispatch to independent drivers during beta rollout.

ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS independent_only_matching BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN rides.dispatch_settings.independent_only_matching IS
  'When true, only independent drivers receive offers and can go online for Roam passenger dispatch.';

NOTIFY pgrst, 'reload schema';
