-- Haulage freight catalog (admin-managed "brain").

CREATE TABLE IF NOT EXISTS rides.haulage_categories (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{0,40}$'),
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'inventory_2',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rides.haulage_item_subgroups (
  id TEXT NOT NULL CHECK (id ~ '^[a-z][a-z0-9_]{0,40}$'),
  category_id TEXT NOT NULL REFERENCES rides.haulage_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (category_id, id)
);

CREATE TABLE IF NOT EXISTS rides.haulage_items (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{0,40}$'),
  category_id TEXT NOT NULL REFERENCES rides.haulage_categories(id) ON DELETE RESTRICT,
  subgroup_id TEXT,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  subtitle TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'inventory_2',
  emoji TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  requires_manual_specs BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT haulage_items_subgroup_fk
    FOREIGN KEY (category_id, subgroup_id)
    REFERENCES rides.haulage_item_subgroups(category_id, id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rides.haulage_item_variants (
  item_id TEXT NOT NULL REFERENCES rides.haulage_items(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (id ~ '^[a-z][a-z0-9_]{0,40}$'),
  label TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  weight_kg NUMERIC(8, 2) NOT NULL CHECK (weight_kg > 0),
  length_cm NUMERIC(8, 2),
  width_cm NUMERIC(8, 2),
  height_cm NUMERIC(8, 2),
  min_body_type_slug TEXT REFERENCES rides.vehicle_types(slug) ON DELETE SET NULL,
  upright_only BOOLEAN NOT NULL DEFAULT FALSE,
  fragile_default BOOLEAN NOT NULL DEFAULT FALSE,
  requires_disassembly_default BOOLEAN NOT NULL DEFAULT FALSE,
  gear_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, id)
);

CREATE INDEX IF NOT EXISTS idx_haulage_items_category_sort
  ON rides.haulage_items (category_id, sort_order, id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_haulage_variants_item_sort
  ON rides.haulage_item_variants (item_id, sort_order, id)
  WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS update_haulage_categories_updated_at ON rides.haulage_categories;
CREATE TRIGGER update_haulage_categories_updated_at
  BEFORE UPDATE ON rides.haulage_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_haulage_item_subgroups_updated_at ON rides.haulage_item_subgroups;
CREATE TRIGGER update_haulage_item_subgroups_updated_at
  BEFORE UPDATE ON rides.haulage_item_subgroups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_haulage_items_updated_at ON rides.haulage_items;
CREATE TRIGGER update_haulage_items_updated_at
  BEFORE UPDATE ON rides.haulage_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_haulage_item_variants_updated_at ON rides.haulage_item_variants;
CREATE TRIGGER update_haulage_item_variants_updated_at
  BEFORE UPDATE ON rides.haulage_item_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE rides.haulage_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.haulage_item_subgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.haulage_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.haulage_item_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS haulage_categories_read ON rides.haulage_categories;
CREATE POLICY haulage_categories_read ON rides.haulage_categories
  FOR SELECT TO authenticated USING (is_active = TRUE);

DROP POLICY IF EXISTS haulage_subgroups_read ON rides.haulage_item_subgroups;
CREATE POLICY haulage_subgroups_read ON rides.haulage_item_subgroups
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS haulage_items_read ON rides.haulage_items;
CREATE POLICY haulage_items_read ON rides.haulage_items
  FOR SELECT TO authenticated USING (is_active = TRUE);

DROP POLICY IF EXISTS haulage_variants_read ON rides.haulage_item_variants;
CREATE POLICY haulage_variants_read ON rides.haulage_item_variants
  FOR SELECT TO authenticated USING (is_active = TRUE);

GRANT SELECT ON rides.haulage_categories TO authenticated;
GRANT SELECT ON rides.haulage_item_subgroups TO authenticated;
GRANT SELECT ON rides.haulage_items TO authenticated;
GRANT SELECT ON rides.haulage_item_variants TO authenticated;
GRANT ALL ON rides.haulage_categories TO service_role;
GRANT ALL ON rides.haulage_item_subgroups TO service_role;
GRANT ALL ON rides.haulage_items TO service_role;
GRANT ALL ON rides.haulage_item_variants TO service_role;

DROP VIEW IF EXISTS public.rides_haulage_categories;
CREATE VIEW public.rides_haulage_categories AS SELECT * FROM rides.haulage_categories;
DROP VIEW IF EXISTS public.rides_haulage_item_subgroups;
CREATE VIEW public.rides_haulage_item_subgroups AS SELECT * FROM rides.haulage_item_subgroups;
DROP VIEW IF EXISTS public.rides_haulage_items;
CREATE VIEW public.rides_haulage_items AS SELECT * FROM rides.haulage_items;
DROP VIEW IF EXISTS public.rides_haulage_item_variants;
CREATE VIEW public.rides_haulage_item_variants AS SELECT * FROM rides.haulage_item_variants;

GRANT SELECT ON public.rides_haulage_categories TO authenticated;
GRANT SELECT ON public.rides_haulage_item_subgroups TO authenticated;
GRANT SELECT ON public.rides_haulage_items TO authenticated;
GRANT SELECT ON public.rides_haulage_item_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_haulage_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_haulage_item_subgroups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_haulage_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_haulage_item_variants TO service_role;

NOTIFY pgrst, 'reload schema';
