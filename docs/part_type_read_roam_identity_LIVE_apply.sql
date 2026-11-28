-- Roam's saved-page saves get their own page-read identity — Data layer only
-- (docs/part-type-auto-sort-audit.md AS-29, migration 20261126201702_part_read_roam_saved_page).
--
-- What the owner is fixing: the first live run (26 Nov 20:06 UTC) saved nothing. Every track ended "waiting" with
--   new row for relation "research_page_read" violates check constraint "research_page_read_owner_has_checker"
-- because Roam's save has actor = null and the constraint (rightly) asks an owner_browser read to name a person.
--
-- The fix here: Roam's read gets its own path, `roam_saved_page` ("Roam, from a saved page"), and the constraint says
-- a person's browser check still needs their login, while a robot read and Roam's own save name no user.
--
-- Nothing else changes. No column is added, no table is touched, no reader changes, and no existing row is rewritten:
-- the 40 `direct` rows and the 13 `owner_browser` rows already satisfy the tightened rule.
--
-- Paste this whole file into the Supabase SQL editor. It ends with the logbook line, so the migration list matches
-- production afterwards. The committed file (supabase/migrations/20261126201702_part_read_roam_saved_page.sql) is the
-- same SQL without that line: `supabase db start` records the version itself, so a second INSERT would fail replay.

-- ---------------------------------------------------------------------------
-- 1. The path's own values: the three above, nothing else.
-- ---------------------------------------------------------------------------
ALTER TABLE public.research_page_read
  DROP CONSTRAINT IF EXISTS research_page_read_path_check;

ALTER TABLE public.research_page_read
  ADD CONSTRAINT research_page_read_path_check
  CHECK (path IN ('direct', 'owner_browser', 'roam_saved_page'));

-- ---------------------------------------------------------------------------
-- 2. Who a read belongs to, one rule per path.
-- ---------------------------------------------------------------------------
-- A person's browser check still names them; nothing here loosens that. A robot read and Roam's own save name no
-- user, because neither is one.
ALTER TABLE public.research_page_read
  DROP CONSTRAINT IF EXISTS research_page_read_owner_has_checker;

ALTER TABLE public.research_page_read
  ADD CONSTRAINT research_page_read_owner_has_checker
  CHECK (
    (path = 'owner_browser' AND checked_by IS NOT NULL)
    OR (path = 'direct' AND checked_by IS NULL)
    OR (path = 'roam_saved_page' AND checked_by IS NULL)
  );

COMMENT ON COLUMN public.research_page_read.path IS
  'Who read the page: direct (the robot fetched it), owner_browser (a person checked it in their browser), '
  'roam_saved_page (Roam saved from the owner''s uploaded saved page). A robot or Roam read carries no checked_by.';

COMMENT ON COLUMN public.research_page_read.checked_by IS
  'The person who did an owner_browser read. NULL for a direct read and for roam_saved_page: Roam is not a user.';

-- The server reads and writes these rows through PostgREST.
NOTIFY pgrst, 'reload schema';

-- Logbook, so the production migration list matches the repo after this paste.
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261126201702', 'part_read_roam_saved_page') ON CONFLICT (version) DO NOTHING;
