-- Courier-only Roam Tags + workforce invite targeting by user

CREATE TABLE IF NOT EXISTS delivery.courier_roam_tags (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Company-internal identifier — never exposed to clients. */
  internal_tag_id TEXT NOT NULL,
  /** User-chosen public handle (lowercase). NULL until the courier sets one. */
  custom_tag_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT courier_roam_tags_internal_unique UNIQUE (internal_tag_id),
  CONSTRAINT courier_roam_tags_custom_unique UNIQUE (custom_tag_name),
  CONSTRAINT courier_roam_tags_custom_format CHECK (
    custom_tag_name IS NULL OR (
      char_length(custom_tag_name) >= 3
      AND char_length(custom_tag_name) <= 24
      AND custom_tag_name ~ '^[a-z0-9_]+$'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_courier_roam_tags_custom
  ON delivery.courier_roam_tags (custom_tag_name)
  WHERE custom_tag_name IS NOT NULL;

ALTER TABLE delivery.courier_roam_tags ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.delivery_courier_roam_tags AS
  SELECT * FROM delivery.courier_roam_tags;

GRANT SELECT, INSERT, UPDATE ON public.delivery_courier_roam_tags TO service_role;

COMMENT ON TABLE delivery.courier_roam_tags IS
  'Courier-only personal Roam Tags (separate from passenger rides.roam_passenger_tags).';

-- Targeted invites: owner invites courier by Roam Tag → courier Accept/Decline in-app
ALTER TABLE fleet.workforce_invites
  ADD COLUMN IF NOT EXISTS invited_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE fleet.workforce_invites
  ADD COLUMN IF NOT EXISTS invite_kind text NOT NULL DEFAULT 'code';

UPDATE fleet.workforce_invites
SET invite_kind = 'code'
WHERE invite_kind IS NULL OR invite_kind = '';

ALTER TABLE fleet.workforce_invites
  DROP CONSTRAINT IF EXISTS fleet_workforce_invites_invite_kind_check;

ALTER TABLE fleet.workforce_invites
  ADD CONSTRAINT fleet_workforce_invites_invite_kind_check
  CHECK (invite_kind IN ('code', 'roam_tag'));

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'fleet'
      AND t.relname = 'workforce_invites'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE fleet.workforce_invites DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE fleet.workforce_invites
  DROP CONSTRAINT IF EXISTS fleet_workforce_invites_status_check;

ALTER TABLE fleet.workforce_invites
  ADD CONSTRAINT fleet_workforce_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'expired', 'revoked', 'declined'));

CREATE INDEX IF NOT EXISTS fleet_workforce_invites_invited_user_idx
  ON fleet.workforce_invites (invited_user_id, status)
  WHERE invited_user_id IS NOT NULL;

DROP VIEW IF EXISTS public.fleet_workforce_invites;
CREATE VIEW public.fleet_workforce_invites
  WITH (security_invoker = true)
AS
  SELECT * FROM fleet.workforce_invites;

GRANT SELECT, INSERT, UPDATE ON public.fleet_workforce_invites TO service_role;
GRANT SELECT, INSERT ON public.fleet_workforce_invites TO authenticated;

NOTIFY pgrst, 'reload schema';
