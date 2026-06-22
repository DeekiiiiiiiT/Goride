-- Tracks users who authenticated on the partner portal (not the full Roam auth pool).
CREATE TABLE IF NOT EXISTS delivery.partner_signup_intents (
  user_id uuid PRIMARY KEY,
  email text,
  source text NOT NULL DEFAULT 'portal',
  wizard_step text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_signup_intents_last_seen
  ON delivery.partner_signup_intents (last_seen_at DESC);

ALTER TABLE delivery.partner_signup_intents ENABLE ROW LEVEL SECURITY;

GRANT ALL ON delivery.partner_signup_intents TO service_role;

COMMENT ON TABLE delivery.partner_signup_intents IS
  'Users who signed into partner.roamdash.co — used for admin unfinished-setup (excludes riders/drivers/customers).';
