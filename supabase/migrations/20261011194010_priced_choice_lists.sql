-- A priced choice is required, and each option is the dish price.
-- A section can share one saved list with every dish in it.

ALTER TABLE delivery.menu_choice_lists DROP CONSTRAINT IF EXISTS menu_choice_lists_kind_check;
ALTER TABLE delivery.menu_choice_lists
  ADD CONSTRAINT menu_choice_lists_kind_check
  CHECK (kind IN ('included', 'extra', 'priced'));

ALTER TABLE delivery.menu_categories
  ADD COLUMN IF NOT EXISTS choice_list_ids uuid[] NOT NULL DEFAULT '{}';
