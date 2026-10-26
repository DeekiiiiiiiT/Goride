-- Retired.
-- This script used to replace the whole trusted role list with only platform_owner.
-- That strips fleet and driver access from the account.
-- Use supabase/scripts/transfer_platform_ownership.sql instead.

DO $$
BEGIN
  RAISE EXCEPTION 'provision_platform_admin.sql is retired. Run supabase/scripts/transfer_platform_ownership.sql instead.';
END $$;
