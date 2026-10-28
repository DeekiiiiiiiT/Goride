-- Strip legacy per-market tax_rate_percent from pricing rule blobs.
-- Statutory GCT is not a market override. Live charging still dual-reads KV until db_authoritative.

-- Remove tax_rate_percent keys from JSONB rules columns where present
DO $$
DECLARE
  r RECORD;
BEGIN
  -- delivery.pricing_rules (if table exists with rules jsonb)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'delivery' AND table_name = 'pricing_rules'
  ) THEN
    UPDATE delivery.pricing_rules
    SET rules = rules - 'tax_rate_percent'
    WHERE rules ? 'tax_rate_percent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'delivery' AND table_name = 'pricing_rule_layers'
      AND column_name = 'rules'
  ) THEN
    UPDATE delivery.pricing_rule_layers
    SET rules = rules - 'tax_rate_percent'
    WHERE rules ? 'tax_rate_percent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'delivery' AND table_name = 'party_pricing_rules'
      AND column_name = 'rules'
  ) THEN
    UPDATE delivery.party_pricing_rules
    SET rules = rules - 'tax_rate_percent'
    WHERE rules ? 'tax_rate_percent';
  END IF;
END $$;

-- Reset POS overrides that were backfilled to 16.5 — follow standard engine rate
UPDATE delivery.merchants
SET pos_tax_rate_percent = NULL
WHERE pos_tax_rate_percent IS NOT NULL
  AND ABS(pos_tax_rate_percent - 16.5) < 0.001;

COMMENT ON COLUMN delivery.merchants.pos_tax_rate_percent IS
  'Optional POS override %. NULL = use Dominion/accounting standard GCT rate when registered.';
