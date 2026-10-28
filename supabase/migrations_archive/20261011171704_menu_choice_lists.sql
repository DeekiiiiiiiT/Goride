-- Saved choice lists a restaurant can attach to many dishes.
-- Included lists are a required free choice. Extra lists are optional add-ons.

CREATE TABLE IF NOT EXISTS delivery.menu_choice_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('included', 'extra')),
  max_selections int NOT NULL DEFAULT 0,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_choice_lists_merchant
  ON delivery.menu_choice_lists (merchant_id, kind, name);

ALTER TABLE delivery.menu_choice_lists ENABLE ROW LEVEL SECURITY;

GRANT ALL ON delivery.menu_choice_lists TO service_role;

COMMENT ON TABLE delivery.menu_choice_lists IS
  'Reusable dish choices. Editing a list rewrites every dish that points at it.';
