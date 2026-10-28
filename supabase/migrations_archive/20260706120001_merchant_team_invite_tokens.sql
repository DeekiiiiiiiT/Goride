-- Merchant team invite tokens and email audit fields (additive)

ALTER TABLE delivery.merchant_team_invites
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS invitee_name text,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_send_error text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

UPDATE delivery.merchant_team_invites
SET token = encode(gen_random_bytes(24), 'hex')
WHERE token IS NULL;

ALTER TABLE delivery.merchant_team_invites
  ALTER COLUMN token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_team_invites_token_idx
  ON delivery.merchant_team_invites (token);

COMMENT ON COLUMN delivery.merchant_team_invites.token IS 'Secure token for invite deep links';
COMMENT ON COLUMN delivery.merchant_team_invites.invitee_name IS 'Optional display name set by inviting owner';
COMMENT ON COLUMN delivery.merchant_team_invites.email_sent_at IS 'When invite email was successfully sent';
COMMENT ON COLUMN delivery.merchant_team_invites.email_send_error IS 'Last email send failure reason (ops only)';
COMMENT ON COLUMN delivery.merchant_team_invites.accepted_at IS 'When invitee accepted the invite';
