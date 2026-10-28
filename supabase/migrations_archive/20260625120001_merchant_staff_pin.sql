-- Staff PIN station login (roster floor staff on shared tablets)

ALTER TABLE delivery.merchant_team_members
  ADD COLUMN IF NOT EXISTS login_type text NOT NULL DEFAULT 'account'
    CHECK (login_type IN ('account', 'roster')),
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS pin_status text NOT NULL DEFAULT 'unset'
    CHECK (pin_status IN ('unset', 'active', 'locked')),
  ADD COLUMN IF NOT EXISTS pin_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS pin_failed_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz;

COMMENT ON COLUMN delivery.merchant_team_members.login_type IS
  'account = Supabase user; roster = floor staff PIN-only on store tablet';
COMMENT ON COLUMN delivery.merchant_team_members.pin_status IS
  'unset = must create PIN; active = normal; locked = owner reset, must create new PIN';

CREATE TABLE IF NOT EXISTS delivery.merchant_shift_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES delivery.merchant_team_members(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS merchant_shift_sessions_token_hash_idx
  ON delivery.merchant_shift_sessions (token_hash)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS merchant_shift_sessions_member_idx
  ON delivery.merchant_shift_sessions (team_member_id)
  WHERE ended_at IS NULL;

ALTER TABLE delivery.order_events
  ADD COLUMN IF NOT EXISTS team_member_id uuid
    REFERENCES delivery.merchant_team_members(id) ON DELETE SET NULL;

ALTER TABLE delivery.merchant_shift_sessions ENABLE ROW LEVEL SECURITY;
