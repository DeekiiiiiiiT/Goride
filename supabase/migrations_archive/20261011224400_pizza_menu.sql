-- Pizza prices live once on the section. Each pizza only stores how it starts.

ALTER TABLE delivery.menu_categories
  ADD COLUMN IF NOT EXISTS pizza_menu jsonb;

ALTER TABLE delivery.menu_items
  ADD COLUMN IF NOT EXISTS pizza_recipe jsonb;

COMMENT ON COLUMN delivery.menu_categories.pizza_menu IS
  'Shared pizza sizes, crust fees, extra cheese, and topping prices for this section.';

COMMENT ON COLUMN delivery.menu_items.pizza_recipe IS
  'How this pizza starts: cheese amount, usual crust, sauce, and toppings.';
