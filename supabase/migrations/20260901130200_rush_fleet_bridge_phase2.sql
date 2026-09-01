-- RoamFleet × Roam Rush Phase 2: delivery projection side table + service_line dimension

ALTER TABLE fleet.trips
  ADD COLUMN IF NOT EXISTS service_line text CHECK (service_line IN ('rideshare', 'rush_delivery'));

CREATE TABLE IF NOT EXISTS fleet.delivery_details (
  trip_id text PRIMARY KEY REFERENCES fleet.trips(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  order_id uuid NOT NULL,
  order_number text,
  merchant_id uuid,
  merchant_name text,
  delivery_fee numeric,
  tip numeric,
  cod_collected numeric,
  platform_due numeric,
  merchant_due numeric,
  stack_group_id uuid,
  drop_sequence int,
  distance_km numeric,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_delivery_details_order_uidx
  ON fleet.delivery_details (order_id);
CREATE INDEX IF NOT EXISTS fleet_delivery_details_org_idx
  ON fleet.delivery_details (organization_id);

ALTER TABLE fleet.fuel_entries ADD COLUMN IF NOT EXISTS service_line text;
ALTER TABLE fleet.expense_journal ADD COLUMN IF NOT EXISTS service_line text;
ALTER TABLE fleet.toll_ledger ADD COLUMN IF NOT EXISTS service_line text;

COMMENT ON TABLE fleet.delivery_details IS 'Queryable Rush order fields linked to fleet.trips projection';

CREATE OR REPLACE VIEW public.fleet_delivery_details AS
  SELECT * FROM fleet.delivery_details;

CREATE OR REPLACE VIEW public.fleet_workforce_invites AS
  SELECT * FROM fleet.workforce_invites;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_delivery_details TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_workforce_invites TO service_role;
