-- Merchant team members and invites (partner app Screen 39)

CREATE TABLE delivery.merchant_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'manager', 'admin')),
  permissions text[] NOT NULL DEFAULT ARRAY['orders']::text[],
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX merchant_team_one_owner_per_merchant
  ON delivery.merchant_team_members (merchant_id)
  WHERE is_owner = true;

CREATE INDEX merchant_team_members_merchant_idx
  ON delivery.merchant_team_members (merchant_id);

CREATE TABLE delivery.merchant_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'manager', 'admin')),
  permissions text[] NOT NULL DEFAULT ARRAY['orders']::text[],
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX merchant_team_invites_pending_email
  ON delivery.merchant_team_invites (merchant_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX merchant_team_invites_merchant_idx
  ON delivery.merchant_team_invites (merchant_id);

ALTER TABLE delivery.merchant_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.merchant_team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchant owners manage team members"
  ON delivery.merchant_team_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_team_members.merchant_id
        AND m.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_team_members.merchant_id
        AND m.owner_id = auth.uid()
    )
  );

CREATE POLICY "Merchant owners manage team invites"
  ON delivery.merchant_team_invites
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_team_invites.merchant_id
        AND m.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_team_invites.merchant_id
        AND m.owner_id = auth.uid()
    )
  );

-- Backfill owner rows for existing merchants
INSERT INTO delivery.merchant_team_members (
  merchant_id, user_id, email, name, role, permissions, is_owner
)
SELECT
  m.id,
  m.owner_id,
  m.email,
  COALESCE(m.name, 'Owner'),
  'admin',
  ARRAY['orders', 'menu', 'analytics', 'payouts']::text[],
  true
FROM delivery.merchants m
WHERE NOT EXISTS (
  SELECT 1
  FROM delivery.merchant_team_members t
  WHERE t.merchant_id = m.id AND t.is_owner = true
);

COMMENT ON TABLE delivery.merchant_team_members IS 'Staff with access to a merchant partner account';
COMMENT ON TABLE delivery.merchant_team_invites IS 'Pending email invites to join a merchant team';
