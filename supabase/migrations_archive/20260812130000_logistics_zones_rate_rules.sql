-- Phase E: service zones + smarter freight rate cards.

CREATE TABLE IF NOT EXISTS logistics.service_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'service'
    CHECK (kind IN ('service', 'pricing')),
  geojson JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistics_service_zones_org_kind
  ON logistics.service_zones (organization_id, kind, active);

ALTER TABLE logistics.service_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistics_service_zones_select ON logistics.service_zones;
CREATE POLICY logistics_service_zones_select ON logistics.service_zones
  FOR SELECT TO authenticated
  USING (logistics.user_owns_org(organization_id));

DROP POLICY IF EXISTS logistics_service_zones_no_insert ON logistics.service_zones;
CREATE POLICY logistics_service_zones_no_insert ON logistics.service_zones
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS logistics_service_zones_no_update ON logistics.service_zones;
CREATE POLICY logistics_service_zones_no_update ON logistics.service_zones
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS logistics_service_zones_no_delete ON logistics.service_zones;
CREATE POLICY logistics_service_zones_no_delete ON logistics.service_zones
  FOR DELETE TO authenticated USING (false);

GRANT SELECT ON logistics.service_zones TO authenticated;
GRANT ALL ON logistics.service_zones TO service_role;

-- Rate card strategies (flat remains default / amount_minor canonical for flat).
ALTER TABLE freight.rate_cards
  ADD COLUMN IF NOT EXISTS pricing_strategy TEXT NOT NULL DEFAULT 'flat'
    CHECK (pricing_strategy IN ('flat', 'distance_tier', 'zone', 'per_stop')),
  ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN freight.rate_cards.pricing_strategy IS
  'flat | distance_tier | zone | per_stop — amount_minor is flat amount / fallback.';
COMMENT ON COLUMN freight.rate_cards.rules IS
  'Strategy payload: distance tiers, zone amounts, or per-stop base+perStop.';
