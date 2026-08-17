-- Heal corrupted fuel cycle cumulative/excessVolume metadata (> 1.5× tank capacity).
-- After deploy, run POST /fuel/cycles/recalculate?vehicleId=<id> for affected vehicles.

UPDATE public.kv_store_37f42386
SET value = jsonb_set(
  jsonb_set(
    value,
    '{metadata,cumulativeLitersAtEntry}',
    to_jsonb(
      LEAST(
        COALESCE((value->'metadata'->>'cumulativeLitersAtEntry')::numeric, 0),
        COALESCE((value->'metadata'->>'tankCapacityAtEntry')::numeric, 36) * 1.02
      )
    )
  ),
  '{metadata,excessVolume}',
  'null'::jsonb,
  true
)
WHERE key LIKE 'fuel_entry:%'
  AND (value->'metadata'->>'cumulativeLitersAtEntry') IS NOT NULL
  AND (value->'metadata'->>'cumulativeLitersAtEntry')::numeric >
      COALESCE((value->'metadata'->>'tankCapacityAtEntry')::numeric, 36) * 1.5;
