-- Switch OFF "no driver pay before the week's tolls are sealed" for everyone (back to how it was).
-- Takes effect within 30 seconds.
UPDATE public.kv_store_37f42386
SET value = value || jsonb_build_object('enabled', false, 'enabledForOrgs', '[]'::jsonb,
                                        'updatedAt', now()::text, 'updatedBy', 'owner via SQL editor')
WHERE key = 'feature_flag:toll_seal_before_pay';

SELECT key, value ->> 'enabled' AS enabled, value -> 'enabledForOrgs' AS enabled_for
FROM public.kv_store_37f42386 WHERE key = 'feature_flag:toll_seal_before_pay';
