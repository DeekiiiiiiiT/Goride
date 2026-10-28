-- The March history stub no longer creates this table. Later migrations
-- index and update it. Create it here only when a fresh replay is missing it.

CREATE TABLE IF NOT EXISTS public.kv_store_37f42386 (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS kv_store_37f42386_key_idx
  ON public.kv_store_37f42386 (key text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_kv_store_value
  ON public.kv_store_37f42386 USING gin (value);

ALTER TABLE public.kv_store_37f42386 ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.kv_store_37f42386 TO service_role;
