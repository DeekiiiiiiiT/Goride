-- Permanent Roam Tag per passenger account: internal ID (company-only) + optional unique custom name.

CREATE TABLE IF NOT EXISTS rides.roam_passenger_tags (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Company-internal identifier — never exposed to clients. */
  internal_tag_id TEXT NOT NULL,
  /** User-chosen public handle (lowercase). NULL until the rider sets one. */
  custom_tag_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roam_passenger_tags_internal_unique UNIQUE (internal_tag_id),
  CONSTRAINT roam_passenger_tags_custom_unique UNIQUE (custom_tag_name),
  CONSTRAINT roam_passenger_tags_custom_format CHECK (
    custom_tag_name IS NULL OR (
      char_length(custom_tag_name) >= 3
      AND char_length(custom_tag_name) <= 24
      AND custom_tag_name ~ '^[a-z0-9_]+$'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_roam_passenger_tags_custom
  ON rides.roam_passenger_tags (custom_tag_name)
  WHERE custom_tag_name IS NOT NULL;

ALTER TABLE rides.roam_passenger_tags ENABLE ROW LEVEL SECURITY;

-- Edge service_role only (same pattern as rider_contacts).

CREATE OR REPLACE VIEW public.rides_roam_passenger_tags AS
  SELECT * FROM rides.roam_passenger_tags;

GRANT SELECT, INSERT, UPDATE ON public.rides_roam_passenger_tags TO service_role;

NOTIFY pgrst, 'reload schema';
