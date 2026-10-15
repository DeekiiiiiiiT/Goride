-- In-House desk cleanup (audit B4 / B5) · 2026-10-15
-- Safe to re-run. Soft-archives only; no hard deletes.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) lobster_stocks_and_grill × 4 → keep the oldest, archive 3
-- Keep: 269f4492-1daf-4d9f-b0cf-e6ac7a745b19 (created 03:24:50)
-- ─────────────────────────────────────────────────────────────
UPDATE delivery.in_house_stores
SET archived_at = coalesce(archived_at, now()),
    updated_at = now()
WHERE merchant_id IN (
  '3a678b7d-976e-401a-8724-f51504a07dfd', -- 03:24:57
  '73b2b366-8644-4083-aa95-70c4e7becb44', -- 03:25:02
  '88431e3e-3ab1-4a74-8f9b-d1a657f70276'  -- 03:25:02
);

UPDATE delivery.merchants
SET in_house_live = false,
    is_active = false,
    updated_at = now()
WHERE id IN (
  '3a678b7d-976e-401a-8724-f51504a07dfd',
  '73b2b366-8644-4083-aa95-70c4e7becb44',
  '88431e3e-3ab1-4a74-8f9b-d1a657f70276'
);

-- ─────────────────────────────────────────────────────────────
-- 2) Domino's empty duplicate sections → keep inactive
-- Keep Pizza (7 dishes): 716bd4b3-47b7-4795-bec5-7c158f83394f
-- Keep Sides (2 dishes): 8d9b2ee9-d6c8-4775-b242-09bc35a3d275
-- ─────────────────────────────────────────────────────────────
UPDATE delivery.menu_categories
SET is_active = false
WHERE id IN (
  -- empty Pizza copies
  '68a9fec2-318e-4eb8-8e1d-7a6dea31fdd4',
  '1414536b-dac8-4dc2-b5a4-2a631dcedc72',
  'fcd1f7ec-dc9c-434d-82de-e324a68ce94c',
  '7ac8f805-bbc4-4257-857d-572014481685',
  'f8f90804-4e6e-4be2-a01c-07c9dfda17cb',
  '64e274b9-3b99-4db9-9519-df773f3ecc6e',
  -- empty Sides copy
  '0d9e923f-d38c-446d-bfe6-f6a0e252bf26',
  -- unused Chicken
  'a721fd99-c558-4cfa-8e5c-43569ef45df2'
);

COMMIT;

-- Verify after running:
-- SELECT m.id, m.name, s.archived_at, m.is_active
-- FROM delivery.merchants m
-- JOIN delivery.in_house_stores s ON s.merchant_id = m.id
-- WHERE lower(m.name) LIKE '%lobster%'
-- ORDER BY m.created_at;
--
-- SELECT c.name, c.is_active, count(i.id) FILTER (WHERE i.archived_at IS NULL) AS dishes
-- FROM delivery.menu_categories c
-- LEFT JOIN delivery.menu_items i ON i.category_id = c.id
-- JOIN delivery.merchants m ON m.id = c.merchant_id
-- WHERE m.name ILIKE '%domino%'
-- GROUP BY c.id, c.name, c.is_active
-- ORDER BY c.name, dishes DESC;
