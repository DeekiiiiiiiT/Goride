-- Phase 3: pending invites + identity action support

CREATE TABLE IF NOT EXISTS platform.pending_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scope_type TEXT NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global', 'product', 'market')),
  scope_id UUID NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_invites_email ON platform.pending_invites(email);
CREATE INDEX IF NOT EXISTS idx_pending_invites_active ON platform.pending_invites(email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

GRANT ALL ON platform.pending_invites TO service_role;
