-- Menu library: admin-managed cuisines, starter kits linked by cuisine id, and dish templates.
-- Product types stay code-defined (each has engine pricing, an editor and a ticket layout);
-- dish templates are named presets on top of them.

-- 1. Cuisines -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delivery.cuisines (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  aliases text[] NOT NULL DEFAULT '{}',
  sort integer NOT NULL DEFAULT 0,
  icon_url text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cuisines_label_lower_key ON delivery.cuisines (lower(label));

INSERT INTO delivery.cuisines (id, label, sort) VALUES
  ('jamaican', 'Jamaican', 10),
  ('caribbean', 'Caribbean', 20),
  ('grill', 'Grill', 30),
  ('seafood', 'Seafood', 40),
  ('vegan-options', 'Vegan Options', 50),
  ('chinese', 'Chinese', 60),
  ('indian', 'Indian', 70),
  ('italian', 'Italian', 80),
  ('american', 'American', 90),
  ('fast-food', 'Fast Food', 100),
  ('pizza', 'Pizza', 110),
  ('fried-chicken', 'Fried Chicken', 115),
  ('burgers', 'Burgers', 116),
  ('vegetarian', 'Vegetarian', 120),
  ('vegan', 'Vegan', 130),
  ('bakery', 'Bakery', 140),
  ('cafe', 'Cafe', 150),
  ('mexican', 'Mexican', 160),
  ('japanese', 'Japanese', 170),
  ('thai', 'Thai', 180),
  ('bbq', 'BBQ', 190),
  ('healthy', 'Healthy', 200),
  ('salads', 'Salads', 205),
  ('desserts', 'Desserts', 210),
  ('other', 'Other', 1000)
ON CONFLICT (id) DO NOTHING;

UPDATE delivery.cuisines SET aliases = ARRAY['Chicken'] WHERE id = 'fried-chicken' AND aliases = '{}';

-- Split legacy combined labels ("Italian • Pizza") into separate cuisines, keeping order.
-- cuisine_type (the store-card display string) is left as-is.
UPDATE delivery.merchants m
SET cuisines = ARRAY(
  SELECT part FROM (
    SELECT btrim(p) AS part, min(o * 100 + po) AS ord
    FROM unnest(m.cuisines) WITH ORDINALITY AS c(label, o),
         unnest(string_to_array(c.label, '•')) WITH ORDINALITY AS s(p, po)
    WHERE btrim(p) <> ''
    GROUP BY btrim(p)
  ) x ORDER BY ord
)
WHERE EXISTS (SELECT 1 FROM unnest(m.cuisines) l WHERE l LIKE '%•%');

-- 2. Starter kits link to cuisines by id -----------------------------------

ALTER TABLE delivery.menu_kits
  ADD COLUMN IF NOT EXISTS cuisine_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE delivery.menu_kits k
SET cuisine_ids = ARRAY(
  SELECT c.id FROM delivery.cuisines c
  WHERE lower(c.label) = lower(k.cuisine)
     OR lower(k.cuisine) = ANY (SELECT lower(a) FROM unnest(c.aliases) a)
)
WHERE cardinality(k.cuisine_ids) = 0;

-- 3. Dish templates ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS delivery.menu_product_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text,
  product_type text NOT NULL
    CHECK (product_type IN ('standard', 'sized', 'pizza', 'wings', 'combo', 'build_your_own')),
  cuisine_ids text[] NOT NULL DEFAULT '{}',
  -- { product: MenuProduct, groups: OptionGroup[], priceMatrix: OptionPriceCell[] }
  payload jsonb NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- 4. Rename / merge run in one transaction so restaurants never point at a missing label.

CREATE OR REPLACE FUNCTION delivery.menu_library_rename_cuisine(p_id text, p_label text)
RETURNS void
LANGUAGE plpgsql
SET search_path = delivery, pg_temp
AS $$
DECLARE
  old_label text;
  new_label text := btrim(p_label);
BEGIN
  SELECT label INTO old_label FROM delivery.cuisines WHERE id = p_id FOR UPDATE;
  IF old_label IS NULL THEN RAISE EXCEPTION 'cuisine_not_found'; END IF;
  IF new_label = '' THEN RAISE EXCEPTION 'label_required'; END IF;
  IF old_label = new_label THEN RETURN; END IF;

  UPDATE delivery.cuisines
  SET label = new_label,
      aliases = CASE WHEN old_label = ANY (aliases) THEN aliases ELSE aliases || old_label END,
      updated_at = now()
  WHERE id = p_id;

  UPDATE delivery.merchants SET cuisines = array_replace(cuisines, old_label, new_label)
  WHERE old_label = ANY (cuisines);
  UPDATE delivery.merchants SET cuisine_types = array_replace(cuisine_types, old_label, new_label)
  WHERE old_label = ANY (cuisine_types);
  UPDATE delivery.merchants SET cuisine_type = new_label WHERE cuisine_type = old_label;
END;
$$;

CREATE OR REPLACE FUNCTION delivery.menu_library_merge_cuisine(p_from text, p_into text)
RETURNS void
LANGUAGE plpgsql
SET search_path = delivery, pg_temp
AS $$
DECLARE
  from_row delivery.cuisines%ROWTYPE;
  into_label text;
BEGIN
  IF p_from = p_into THEN RAISE EXCEPTION 'same_cuisine'; END IF;
  SELECT * INTO from_row FROM delivery.cuisines WHERE id = p_from FOR UPDATE;
  SELECT label INTO into_label FROM delivery.cuisines WHERE id = p_into FOR UPDATE;
  IF from_row.id IS NULL OR into_label IS NULL THEN RAISE EXCEPTION 'cuisine_not_found'; END IF;

  -- Replace then de-duplicate, keeping first-seen order (the first cuisine is the primary).
  UPDATE delivery.merchants m
  SET cuisines = ARRAY(
    SELECT x FROM unnest(array_replace(m.cuisines, from_row.label, into_label)) WITH ORDINALITY t(x, o)
    GROUP BY x ORDER BY min(o)
  )
  WHERE from_row.label = ANY (m.cuisines);

  UPDATE delivery.merchants m
  SET cuisine_types = ARRAY(
    SELECT x FROM unnest(array_replace(m.cuisine_types, from_row.label, into_label)) WITH ORDINALITY t(x, o)
    GROUP BY x ORDER BY min(o)
  )
  WHERE from_row.label = ANY (m.cuisine_types);

  UPDATE delivery.merchants SET cuisine_type = into_label WHERE cuisine_type = from_row.label;

  UPDATE delivery.menu_kits k
  SET cuisine_ids = ARRAY(
    SELECT x FROM unnest(array_replace(k.cuisine_ids, p_from, p_into)) WITH ORDINALITY t(x, o)
    GROUP BY x ORDER BY min(o)
  ), updated_at = now()
  WHERE p_from = ANY (k.cuisine_ids);

  UPDATE delivery.menu_product_templates t
  SET cuisine_ids = ARRAY(
    SELECT x FROM unnest(array_replace(t.cuisine_ids, p_from, p_into)) WITH ORDINALITY u(x, o)
    GROUP BY x ORDER BY min(o)
  ), updated_at = now()
  WHERE p_from = ANY (t.cuisine_ids);

  -- Old spellings keep matching search and kits.
  UPDATE delivery.cuisines
  SET aliases = ARRAY(
    SELECT DISTINCT a FROM unnest(aliases || from_row.label || from_row.aliases) a
    WHERE lower(a) <> lower(into_label)
  ), updated_at = now()
  WHERE id = p_into;

  DELETE FROM delivery.cuisines WHERE id = p_from;
END;
$$;

-- 5. Access: service role only (the delivery edge function). -------------------

ALTER TABLE delivery.cuisines ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.menu_product_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.menu_kits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON delivery.cuisines, delivery.menu_product_templates FROM anon, authenticated;
GRANT ALL ON delivery.cuisines, delivery.menu_product_templates TO service_role;

REVOKE ALL ON FUNCTION delivery.menu_library_rename_cuisine(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION delivery.menu_library_merge_cuisine(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery.menu_library_rename_cuisine(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION delivery.menu_library_merge_cuisine(text, text) TO service_role;

COMMENT ON TABLE delivery.cuisines IS 'Admin-managed cuisine list (Menu library). merchants.cuisines stores labels; rename/merge rewrite them.';
COMMENT ON TABLE delivery.menu_product_templates IS 'Dish templates: a product type plus pre-filled choices. Copied into a menu, never linked.';
