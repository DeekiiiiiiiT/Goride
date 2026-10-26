-- Run this only after the live Dominion server no longer has the public recovery link.
-- Confirm first: POST .../fleet-core/make-server-37f42386/recover-platform-owner returns 404.
--
-- Deletes the old "who is super admin" record.
-- Removes superadmin from prodigiousinvestments101@gmail.com's editable profile only.
-- Does not change deekiiiiiii@gmail.com.

DELETE FROM public.kv_store_37f42386
WHERE key = 'platform:superadmin_created';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'role'
WHERE lower(email) = 'prodigiousinvestments101@gmail.com'
  AND raw_user_meta_data->>'role' = 'superadmin';
