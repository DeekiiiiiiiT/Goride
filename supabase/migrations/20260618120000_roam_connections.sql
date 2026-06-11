-- Consent-based Roam connections (friend requests) + blocks/reports.

CREATE TABLE IF NOT EXISTS rides.roam_connection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_phone_e164 TEXT NOT NULL CHECK (char_length(trim(target_phone_e164)) > 0),
  target_display_name TEXT NOT NULL CHECK (char_length(trim(target_display_name)) > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'rejected', 'cancelled', 'expired'
  )),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN (
    'manual', 'roam_tag', 'device_import', 'book_for_someone', 'contacts_page'
  )),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roam_connection_requests_pending_user
  ON rides.roam_connection_requests(requester_user_id, target_user_id)
  WHERE status = 'pending' AND target_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_roam_connection_requests_pending_phone
  ON rides.roam_connection_requests(requester_user_id, target_phone_e164)
  WHERE status = 'pending' AND target_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_roam_connection_requests_target_status
  ON rides.roam_connection_requests(target_user_id, status)
  WHERE target_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roam_connection_requests_requester_status
  ON rides.roam_connection_requests(requester_user_id, status);

CREATE INDEX IF NOT EXISTS idx_roam_connection_requests_phone_pending
  ON rides.roam_connection_requests(target_phone_e164, status)
  WHERE target_user_id IS NULL AND status = 'pending';

CREATE TABLE IF NOT EXISTS rides.roam_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  established_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roam_connections_canonical_order CHECK (user_a_id < user_b_id),
  CONSTRAINT roam_connections_distinct_users CHECK (user_a_id <> user_b_id),
  UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_roam_connections_user_a ON rides.roam_connections(user_a_id);
CREATE INDEX IF NOT EXISTS idx_roam_connections_user_b ON rides.roam_connections(user_b_id);

CREATE TABLE IF NOT EXISTS rides.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_blocks_distinct CHECK (blocker_user_id <> blocked_user_id),
  UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON rides.user_blocks(blocked_user_id);

CREATE TABLE IF NOT EXISTS rides.abuse_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL CHECK (char_length(trim(reason_code)) > 0),
  details TEXT,
  context_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT abuse_reports_distinct CHECK (reporter_user_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_abuse_reports_reported ON rides.abuse_reports(reported_user_id);

-- Grandfather existing linked contacts as accepted connections.
INSERT INTO rides.roam_connections (user_a_id, user_b_id, established_at)
SELECT
  LEAST(rc.owner_user_id, rc.linked_user_id),
  GREATEST(rc.owner_user_id, rc.linked_user_id),
  rc.created_at
FROM rides.rider_contacts rc
WHERE rc.linked_user_id IS NOT NULL
  AND rc.owner_user_id <> rc.linked_user_id
ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

INSERT INTO rides.roam_connection_requests (
  requester_user_id,
  target_user_id,
  target_phone_e164,
  target_display_name,
  status,
  source,
  expires_at,
  responded_at,
  created_at,
  updated_at
)
SELECT
  rc.owner_user_id,
  rc.linked_user_id,
  rc.phone_e164,
  rc.display_name,
  'accepted',
  'manual',
  rc.created_at + INTERVAL '30 days',
  rc.created_at,
  rc.created_at,
  rc.updated_at
FROM rides.rider_contacts rc
WHERE rc.linked_user_id IS NOT NULL
  AND rc.owner_user_id <> rc.linked_user_id
  AND NOT EXISTS (
    SELECT 1 FROM rides.roam_connection_requests rcr
    WHERE rcr.requester_user_id = rc.owner_user_id
      AND rcr.target_user_id = rc.linked_user_id
      AND rcr.status = 'accepted'
  );

CREATE OR REPLACE VIEW public.rides_roam_connection_requests AS
  SELECT * FROM rides.roam_connection_requests;

CREATE OR REPLACE VIEW public.rides_roam_connections AS
  SELECT * FROM rides.roam_connections;

CREATE OR REPLACE VIEW public.rides_user_blocks AS
  SELECT * FROM rides.user_blocks;

CREATE OR REPLACE VIEW public.rides_abuse_reports AS
  SELECT * FROM rides.abuse_reports;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_roam_connection_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_roam_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_user_blocks TO service_role;
GRANT SELECT, INSERT ON public.rides_abuse_reports TO service_role;

NOTIFY pgrst, 'reload schema';
