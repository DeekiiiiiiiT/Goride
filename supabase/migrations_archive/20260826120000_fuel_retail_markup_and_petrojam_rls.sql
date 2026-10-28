-- Fuel retail markup versions + honest Petrojam RLS (Phase 4)

-- 1) Authenticated can SELECT petrojam wholesale rows (was GRANT without policy → empty under RLS)
DROP POLICY IF EXISTS fuel_petrojam_prices_authenticated_select ON fuel.petrojam_prices;
CREATE POLICY fuel_petrojam_prices_authenticated_select ON fuel.petrojam_prices
  FOR SELECT TO authenticated USING (true);

-- View: security_invoker so RLS on underlying table applies
DROP VIEW IF EXISTS public.fuel_petrojam_prices;
CREATE VIEW public.fuel_petrojam_prices
  WITH (security_invoker = true)
  AS SELECT * FROM fuel.petrojam_prices;

GRANT SELECT ON public.fuel_petrojam_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_petrojam_prices TO service_role;

-- 2) Versioned retail markup (wholesale + factors → estimated pump JMD/L)
CREATE TABLE IF NOT EXISTS fuel.retail_price_markup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT NOT NULL,
  effective_from DATE NOT NULL,
  published_at TIMESTAMPTZ,
  is_published BOOLEAN NOT NULL DEFAULT false,
  -- Additive JMD/L margins by grade (duty + retail margin approximation)
  gasolene_87_markup NUMERIC NOT NULL DEFAULT 0,
  gasolene_90_markup NUMERIC NOT NULL DEFAULT 0,
  auto_diesel_markup NUMERIC NOT NULL DEFAULT 0,
  ulsd_markup NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fuel_retail_price_markup_effective_from_unique UNIQUE (effective_from)
);

CREATE INDEX IF NOT EXISTS idx_fuel_retail_markup_effective
  ON fuel.retail_price_markup (effective_from DESC);

COMMENT ON TABLE fuel.retail_price_markup IS
  'Versioned additives (JMD/L) on Petrojam wholesale to estimate retail pump prices.';

GRANT SELECT ON fuel.retail_price_markup TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fuel.retail_price_markup TO service_role;

ALTER TABLE fuel.retail_price_markup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_retail_markup_service ON fuel.retail_price_markup;
CREATE POLICY fuel_retail_markup_service ON fuel.retail_price_markup
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fuel_retail_markup_authenticated_select ON fuel.retail_price_markup;
CREATE POLICY fuel_retail_markup_authenticated_select ON fuel.retail_price_markup
  FOR SELECT TO authenticated USING (is_published = true);

CREATE OR REPLACE VIEW public.fuel_retail_price_markup
  WITH (security_invoker = true)
  AS SELECT * FROM fuel.retail_price_markup;

GRANT SELECT ON public.fuel_retail_price_markup TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_retail_price_markup TO service_role;

NOTIFY pgrst, 'reload schema';
