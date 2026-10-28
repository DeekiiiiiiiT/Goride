-- Cutover: Accounting GCT engine is the sole live charge source (V1).
-- Removes KV dual-read authority; kill switch lives on resolver flags (gct_enabled).

UPDATE accounting.gct_engine_flags
SET
  value = jsonb_build_object(
    'prefer_db', true,
    'kv_fallback', false,
    'db_authoritative', true,
    'gct_enabled', true
  ),
  updated_at = now()
WHERE key = 'resolver';

INSERT INTO accounting.gct_engine_flags (key, value)
VALUES (
  'resolver',
  '{"prefer_db": true, "kv_fallback": false, "db_authoritative": true, "gct_enabled": true}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
