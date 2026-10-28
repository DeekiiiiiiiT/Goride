-- Issuer merchant name → verified GOD station (separate from GPS aliases)
CREATE TABLE IF NOT EXISTS public.station_merchant_aliases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL,
  issuer           text NOT NULL DEFAULT 'jaa',
  raw_name         text NOT NULL,
  normalized_name  text NOT NULL,
  station_id       text NOT NULL,
  source           text NOT NULL CHECK (source IN ('admin_link', 'heal_auto', 'seed')),
  confirmed_by     uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, issuer, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_station_merchant_aliases_lookup
  ON public.station_merchant_aliases (organization_id, issuer, normalized_name);

CREATE INDEX IF NOT EXISTS idx_station_merchant_aliases_station
  ON public.station_merchant_aliases (station_id);

ALTER TABLE public.station_merchant_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS station_merchant_aliases_select_org ON public.station_merchant_aliases;
CREATE POLICY station_merchant_aliases_select_org
  ON public.station_merchant_aliases
  FOR SELECT
  TO authenticated
  USING (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

GRANT SELECT ON public.station_merchant_aliases TO authenticated;
GRANT ALL ON public.station_merchant_aliases TO service_role;

-- Seed: JAA "FESCO OVAL SPANISH TOWN ROAD" → FESCO Spanish Town Road
INSERT INTO public.station_merchant_aliases (
  organization_id, issuer, raw_name, normalized_name, station_id, source
) VALUES (
  '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  'jaa',
  'FESCO OVAL SPANISH TOWN ROAD',
  'fesco oval spanish town road',
  '9d72d4e7-369b-40eb-b730-e4f751c5640b',
  'seed'
)
ON CONFLICT (organization_id, issuer, normalized_name) DO UPDATE
SET station_id = EXCLUDED.station_id,
    raw_name = EXCLUDED.raw_name,
    source = EXCLUDED.source;
