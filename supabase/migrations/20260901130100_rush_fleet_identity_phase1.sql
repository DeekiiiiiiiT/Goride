-- RoamFleet × Roam Rush Phase 1: courier↔fleet identity + person-centric roster

-- A. Couriers mirror driver_profiles fleet membership
ALTER TABLE delivery.courier_profiles
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'independent'
    CHECK (mode IN ('fleet', 'independent')),
  ADD COLUMN IF NOT EXISTS fleet_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fleet_joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS fleet_role text CHECK (fleet_role IN ('courier', 'lead_courier', 'trainer'));

CREATE INDEX IF NOT EXISTS idx_courier_profiles_fleet_id
  ON delivery.courier_profiles (fleet_id)
  WHERE fleet_id IS NOT NULL;

COMMENT ON COLUMN delivery.courier_profiles.mode IS 'fleet = employed by a RoamFleet org; independent = platform courier';
COMMENT ON COLUMN delivery.courier_profiles.fleet_id IS 'Owning fleet org when mode=fleet';

-- B. Historical fleet attribution on orders (stamped at accept)
ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS courier_fleet_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_courier_fleet_id
  ON delivery.orders (courier_fleet_id)
  WHERE courier_fleet_id IS NOT NULL;

-- C. Person-centric fleet roster
ALTER TABLE fleet.drivers
  ADD COLUMN IF NOT EXISTS service_lines text[] NOT NULL DEFAULT ARRAY['rideshare'],
  ADD COLUMN IF NOT EXISTS user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_org_user_uidx
  ON fleet.drivers (organization_id, user_id)
  WHERE user_id IS NOT NULL AND user_id <> '';

-- D. Unified workforce invites (drivers + couriers)
CREATE TABLE IF NOT EXISTS fleet.workforce_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  service_line text NOT NULL CHECK (service_line IN ('rideshare', 'rush_delivery')),
  invite_code text NOT NULL,
  invited_email text,
  invited_phone text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_workforce_invites_code_uidx
  ON fleet.workforce_invites (invite_code);
CREATE INDEX IF NOT EXISTS fleet_workforce_invites_org_idx
  ON fleet.workforce_invites (organization_id, status);

ALTER TABLE fleet.workforce_invites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE fleet.workforce_invites IS 'Fleet owner invites for drivers (rideshare) or couriers (rush_delivery)';
