-- Petrojam wholesale fuel prices (Dominion → Fuel Management → Prices)
-- Synced from https://www.petrojam.com/price/ (latest page only)

CREATE SCHEMA IF NOT EXISTS fuel;

GRANT USAGE ON SCHEMA fuel TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS fuel.petrojam_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_date DATE NOT NULL,
  gasolene_87 NUMERIC,
  gasolene_90 NUMERIC,
  auto_diesel NUMERIC,
  kerosene NUMERIC,
  propane NUMERIC,
  butane NUMERIC,
  hfo NUMERIC,
  asphalt NUMERIC,
  ulsd NUMERIC,
  source_url TEXT NOT NULL DEFAULT 'https://www.petrojam.com/price/',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fuel_petrojam_prices_price_date_unique UNIQUE (price_date)
);

CREATE INDEX IF NOT EXISTS idx_fuel_petrojam_prices_date_desc
  ON fuel.petrojam_prices (price_date DESC);

COMMENT ON TABLE fuel.petrojam_prices IS
  'Petrojam ex-refinery / wholesale product prices (JMD). Not retail pump prices.';

GRANT SELECT, INSERT, UPDATE, DELETE ON fuel.petrojam_prices TO service_role;
GRANT SELECT ON fuel.petrojam_prices TO authenticated;

ALTER TABLE fuel.petrojam_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_petrojam_prices_service ON fuel.petrojam_prices;
CREATE POLICY fuel_petrojam_prices_service ON fuel.petrojam_prices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP VIEW IF EXISTS public.fuel_petrojam_prices;
CREATE OR REPLACE VIEW public.fuel_petrojam_prices AS
  SELECT * FROM fuel.petrojam_prices;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_petrojam_prices TO service_role;
GRANT SELECT ON public.fuel_petrojam_prices TO authenticated;
