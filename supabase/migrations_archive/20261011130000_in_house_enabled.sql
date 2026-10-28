-- Owner turned the In-House desk on for production. Each store still has its own live switch.

UPDATE public.platform_feature_flags
SET enabled = true, updated_at = now()
WHERE name = 'IN_HOUSE_ENABLED';
