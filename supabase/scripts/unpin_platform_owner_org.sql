-- Reviewed data fix. Do not run until a person has confirmed the platform owner
-- should not be pinned to a customer fleet.
-- Clears organizationId on platform-owner accounts only. Does not delete the user.

UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data - 'organizationId'
WHERE COALESCE(raw_app_meta_data->>'role', '') IN ('platform_owner', 'superadmin')
  AND COALESCE(raw_app_meta_data->>'organizationId', '') <> '';
