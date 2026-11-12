-- Switch ON "no driver pay before the week's tolls are sealed" for ONE fleet.
-- The fleet below is the one with toll weeks on the live database (found in the R0 look).
-- Check the name in the result is YOUR fleet. Takes effect within 30 seconds.
-- To undo: run toll_seal_before_pay_OFF.sql.
INSERT INTO public.kv_store_37f42386 (key, value)
VALUES ('feature_flag:toll_seal_before_pay', jsonb_build_object(
  'enabled', false,                                            -- off for everyone else
  'enabledForOrgs', jsonb_build_array('8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'),
  'description', 'Refuse driver pay until the week''s tolls are sealed (collect always allowed)',
  'updatedAt', now()::text,
  'updatedBy', 'owner via SQL editor'))
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

SELECT o.name AS switched_on_for, o.id
FROM public.organizations o
WHERE o.id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
