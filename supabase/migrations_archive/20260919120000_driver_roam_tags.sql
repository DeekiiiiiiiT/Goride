-- Driver-only Roam Tags (separate from courier + passenger tags)

CREATE TABLE IF NOT EXISTS public.driver_roam_tags (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Company-internal identifier — never exposed to clients. */
  internal_tag_id TEXT NOT NULL,
  /** User-chosen public handle (lowercase). NULL until the driver sets one. */
  custom_tag_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT driver_roam_tags_internal_unique UNIQUE (internal_tag_id),
  CONSTRAINT driver_roam_tags_custom_unique UNIQUE (custom_tag_name),
  CONSTRAINT driver_roam_tags_custom_format CHECK (
    custom_tag_name IS NULL OR (
      char_length(custom_tag_name) >= 3
      AND char_length(custom_tag_name) <= 24
      AND custom_tag_name ~ '^[a-z0-9_]+$'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_driver_roam_tags_custom
  ON public.driver_roam_tags (custom_tag_name)
  WHERE custom_tag_name IS NOT NULL;

ALTER TABLE public.driver_roam_tags ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.driver_roam_tags TO service_role;

COMMENT ON TABLE public.driver_roam_tags IS
  'Driver-only personal Roam Tags (separate from delivery.courier_roam_tags and rides.roam_passenger_tags).';

NOTIFY pgrst, 'reload schema';
