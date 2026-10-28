-- In-House desk redesign: server drafts, archive, section kinds, pause history.

ALTER TABLE delivery.in_house_stores
  ADD COLUMN IF NOT EXISTS setup_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS paused_by text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS tos_reviewed_by text;

ALTER TABLE delivery.in_house_stores DROP CONSTRAINT IF EXISTS in_house_stores_setup_status_check;
ALTER TABLE delivery.in_house_stores
  ADD CONSTRAINT in_house_stores_setup_status_check CHECK (setup_status IN ('draft', 'ready'));

UPDATE delivery.in_house_stores s
SET setup_status = 'ready'
FROM delivery.merchants m
WHERE m.id = s.merchant_id
  AND m.in_house_live IS TRUE
  AND (s.setup_status IS NULL OR s.setup_status = 'draft');

ALTER TABLE delivery.menu_categories
  ADD COLUMN IF NOT EXISTS section_kind text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE delivery.menu_categories DROP CONSTRAINT IF EXISTS menu_categories_section_kind_check;
ALTER TABLE delivery.menu_categories
  ADD CONSTRAINT menu_categories_section_kind_check CHECK (section_kind IN ('standard', 'sized', 'pizza'));

UPDATE delivery.menu_categories
SET section_kind = 'pizza'
WHERE section_kind = 'standard' AND name ~* 'pizza';

UPDATE delivery.menu_categories
SET section_kind = 'sized'
WHERE section_kind = 'standard' AND name ~* 'drink';

ALTER TABLE delivery.menu_items
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS menu_items_merchant_archived_idx
  ON delivery.menu_items (merchant_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS in_house_stores_archived_idx
  ON delivery.in_house_stores (merchant_id)
  WHERE archived_at IS NULL;
