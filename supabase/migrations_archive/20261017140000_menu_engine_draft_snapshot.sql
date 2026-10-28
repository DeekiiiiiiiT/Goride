-- Admin drafts persist on the menu row until publish.
-- Published truth remains menu_versions.snapshot; normalised product tables stay unused this wave.

ALTER TABLE delivery.menus
  ADD COLUMN IF NOT EXISTS draft_snapshot jsonb;

COMMENT ON COLUMN delivery.menus.draft_snapshot IS
  'Working engine menu JSON for admin/partner editors. Publish copies into menu_versions.';

COMMENT ON TABLE delivery.menu_sections IS
  'Reserved for a future relational editor. Canonical storage is menus.draft_snapshot + menu_versions.snapshot.';

COMMENT ON TABLE delivery.menu_products IS
  'Reserved for a future relational editor. Canonical storage is snapshot JSON.';

COMMENT ON TABLE delivery.option_groups IS
  'Reserved for a future relational editor. Canonical storage is snapshot JSON.';
