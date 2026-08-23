ALTER TABLE platform.pending_invites
  ADD COLUMN IF NOT EXISTS accepted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
