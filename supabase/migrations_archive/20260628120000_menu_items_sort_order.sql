-- Add sort_order to menu_items for merchant drag-reorder
ALTER TABLE delivery.menu_items
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_menu_items_sort
  ON delivery.menu_items(merchant_id, category_id, sort_order);

-- Backfill sort_order by created_at within each category
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY merchant_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY created_at
    ) * 10 AS new_sort_order
  FROM delivery.menu_items
)
UPDATE delivery.menu_items mi
SET sort_order = ranked.new_sort_order
FROM ranked
WHERE mi.id = ranked.id
  AND mi.sort_order = 0;

COMMENT ON COLUMN delivery.menu_items.sort_order IS 'Display order within category for merchant menu management';
