-- Menu engine: normalised menus, brands, kits, published snapshots.
-- Legacy columns (menu_items.options, pizza_menu, pizza_recipe) stay until quiet-week cutover.

CREATE TABLE IF NOT EXISTS delivery.menu_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kind text NOT NULL CHECK (owner_kind IN ('brand', 'merchant')),
  owner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  version integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  published_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_kind, owner_id)
);

CREATE TABLE IF NOT EXISTS delivery.menu_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL REFERENCES delivery.menus(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by text,
  UNIQUE (menu_id, version)
);

CREATE TABLE IF NOT EXISTS delivery.menu_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL REFERENCES delivery.menus(id) ON DELETE CASCADE,
  name text NOT NULL,
  section_type text NOT NULL DEFAULT 'standard',
  sort integer NOT NULL DEFAULT 0,
  availability_window jsonb,
  archived_at timestamptz,
  legacy_category_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_sections_menu_idx ON delivery.menu_sections(menu_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS delivery.menu_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL REFERENCES delivery.menus(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES delivery.menu_sections(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'standard',
  name text NOT NULL,
  description text,
  image_url text,
  base_price numeric(12, 2) NOT NULL DEFAULT 0,
  prep_minutes integer,
  source_label text,
  archived_at timestamptz,
  price_checked_at timestamptz,
  pizza_config jsonb,
  wings_config jsonb,
  legacy_item_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_products_menu_idx ON delivery.menu_products(menu_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS delivery.option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL REFERENCES delivery.menus(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_label text,
  source_step integer,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 0,
  free_count integer NOT NULL DEFAULT 0,
  pricing_mode text NOT NULL DEFAULT 'add' CHECK (pricing_mode IN ('add', 'replace', 'included')),
  portion_levels jsonb,
  placement_enabled boolean NOT NULL DEFAULT false,
  condition jsonb,
  default_refund text NOT NULL DEFAULT 'price' CHECK (default_refund IN ('nothing', 'price')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES delivery.option_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_label text,
  price numeric(12, 2) NOT NULL DEFAULT 0,
  max_qty integer NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  nested_group_id uuid REFERENCES delivery.option_groups(id) ON DELETE SET NULL,
  sort integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  condition jsonb
);

CREATE TABLE IF NOT EXISTS delivery.option_price_matrix (
  option_id uuid NOT NULL REFERENCES delivery.options(id) ON DELETE CASCADE,
  context_option_id uuid NOT NULL REFERENCES delivery.options(id) ON DELETE CASCADE,
  price numeric(12, 2) NOT NULL,
  PRIMARY KEY (option_id, context_option_id)
);

CREATE TABLE IF NOT EXISTS delivery.product_option_groups (
  product_id uuid NOT NULL REFERENCES delivery.menu_products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES delivery.option_groups(id) ON DELETE CASCADE,
  sort integer NOT NULL DEFAULT 0,
  overrides jsonb,
  PRIMARY KEY (product_id, group_id)
);

CREATE TABLE IF NOT EXISTS delivery.combo_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES delivery.menu_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_label text,
  source_step integer,
  allowed_product_ids uuid[] NOT NULL DEFAULT '{}',
  locked_selections jsonb,
  upcharges jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS delivery.location_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('product', 'option', 'section')),
  target_id uuid NOT NULL,
  price numeric(12, 2),
  is_available boolean,
  UNIQUE (merchant_id, target_kind, target_id)
);

CREATE TABLE IF NOT EXISTS delivery.menu_kits (
  id text PRIMARY KEY,
  cuisine text NOT NULL,
  name text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Multi-cuisine on merchants (primary stays cuisine_type for discovery cards).
ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS cuisines text[] NOT NULL DEFAULT '{}';

UPDATE delivery.merchants
SET cuisines = ARRAY[cuisine_type]
WHERE cuisine_type IS NOT NULL
  AND cuisine_type <> ''
  AND (cuisines IS NULL OR cardinality(cuisines) = 0);

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS menu_brand_id uuid REFERENCES delivery.menu_brands(id) ON DELETE SET NULL;

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS engine_menu_id uuid REFERENCES delivery.menus(id) ON DELETE SET NULL;

-- Engine order lines store menuVersion + selections inside delivery.orders.items jsonb
-- (see customerOrderRoutes dual-read path). No separate order_items table.

COMMENT ON TABLE delivery.menus IS 'Draft/published menu owned by a brand or merchant; customer reads published snapshots only.';
COMMENT ON TABLE delivery.menu_versions IS 'Frozen JSON snapshot for priceLine; every order names its version.';
COMMENT ON TABLE delivery.option_groups IS 'Shared referenced groups — not stamped onto products.';

-- Seed built-in kits (ops can insert more without a release).
INSERT INTO delivery.menu_kits (id, cuisine, name, payload) VALUES
  ('kit-pizza-chain', 'Pizza', 'Pizza (chain-style)', '{"sections":[{"name":"Pizza","sectionType":"pizza"},{"name":"Wings","sectionType":"wings"},{"name":"Sides","sectionType":"standard"},{"name":"Desserts","sectionType":"standard"},{"name":"Drinks","sectionType":"sized"},{"name":"Deals","sectionType":"combo"}]}'::jsonb),
  ('kit-jamaican', 'Jamaican', 'Jamaican plates', '{"sections":[{"name":"Plates","sectionType":"build_your_own"},{"name":"Soups","sectionType":"standard"},{"name":"Patties","sectionType":"standard"},{"name":"Drinks","sectionType":"sized"},{"name":"Pizza","sectionType":"pizza"}]}'::jsonb),
  ('kit-chinese', 'Chinese', 'Chinese combos', '{"sections":[{"name":"Combos","sectionType":"combo"},{"name":"À la carte","sectionType":"sized"},{"name":"Drinks","sectionType":"sized"}]}'::jsonb),
  ('kit-burgers', 'Fast food', 'Burgers & meals', '{"sections":[{"name":"Burgers","sectionType":"build_your_own"},{"name":"Sides","sectionType":"standard"},{"name":"Drinks","sectionType":"sized"}]}'::jsonb),
  ('kit-chicken', 'Chicken', 'Chicken pieces & meals', '{"sections":[{"name":"Pieces","sectionType":"wings"},{"name":"Meals","sectionType":"combo"},{"name":"Sides","sectionType":"standard"}]}'::jsonb),
  ('kit-sushi', 'Japanese', 'Sushi rolls & combos', '{"sections":[{"name":"Rolls","sectionType":"sized"},{"name":"Combos","sectionType":"combo"},{"name":"Sides","sectionType":"standard"}]}'::jsonb),
  ('kit-bakery', 'Bakery', 'Café drinks & pastries', '{"sections":[{"name":"Drinks","sectionType":"sized"},{"name":"Pastries","sectionType":"standard"}]}'::jsonb)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, payload = EXCLUDED.payload, cuisine = EXCLUDED.cuisine;
