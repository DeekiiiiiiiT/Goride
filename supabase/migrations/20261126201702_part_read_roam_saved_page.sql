-- S1c bug 1 (docs/part-type-auto-sort-audit.md AS-29): Roam's own saves get an honest page-read identity.
--
-- The first live run (26 Nov 20:06 UTC) failed every track: `research_page_read_owner_has_checker` says an
-- owner_browser read must name the person who did it, and Roam's save had actor = null. The constraint is right — a
-- browser check is a person's claim — so Roam gets its own path instead of borrowing one:
--
--   direct           the robot fetched the page itself            checked_by must be NULL
--   owner_browser    a person checked it in their browser         checked_by must be their login (unchanged)
--   roam_saved_page  Roam saved from the owner's uploaded page    checked_by must be NULL (Roam is not a user)
--
-- No column is added and no reader changes: `path` is read as text by the read log and by the saved-page save path.
-- The 40 existing `direct` rows and the 13 `owner_browser` rows already satisfy the tightened rule.
--
-- The logbook line lives in the SQL pasted on production (docs/part_type_read_roam_identity_LIVE_apply.sql), never in
-- this file: `supabase db start` records the version itself, so a second INSERT would fail the replay.

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
