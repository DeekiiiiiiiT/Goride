-- Learning new part types from saved pages — Data layer only
-- (docs/part-type-learning-audit.md Rev 3, §2 D1–D9).
--
-- D1/D2  research_saved_page.result — a JSON shape only. NO column change (the shape is written out below).
-- D3     public.part_type_suggestion_dismissal — one row per phrase the owner marked "not a part we track".
-- D4     public.research_saved_page_diagram   — the page's drawings, private, deleted 30 days after the upload.
-- D5     three live clean-ups, each keyed on `code`, each a no-op where the row is absent (a replay stays green):
--        D5.1 brake-pads type rename, D5.2 Fluids engine-oil rename, D5.3 Filters cabin-filter draft.
-- D6     the 17 common part types Roam has no type for, each under its part group, active.
-- D7     one part_term_synonym row per seeded type, so Fleet finds it by the words printed on the page.
-- D9     nothing else is stored — not expressible in SQL; it is the server's rule (§3).
--
-- is_part is never set on any row here (PT-09, PT-13): a seeded type takes the column's default (true) and no
-- existing row's flag is touched. Additive only. No server route, no screen, no worker.
-- The logbook line lives in the SQL pasted on production (docs/part_type_learning_LIVE_apply.sql), never in this
-- file: `supabase db start` records the version itself, so a second INSERT would fail the replay.

-- ---------------------------------------------------------------------------
-- D1 + D2. research_saved_page.result — the JSON shape (no schema change)
-- ---------------------------------------------------------------------------
-- result = {
--   "rows": [ {
--     "partType":    "Air filter" | "Hose, air cleaner, no.1"   -- the type's name, else the page's own name;
--                                                             -- never the word "other"
--     "groupLine":   "17881 - HOSE, AIR CLEANER, NO.1",          -- the page's group row, as written
--     "lineText":    "17881-B1130  11.2016 - 09.2020  HOSE...",  -- the row's own line, prices removed, <= 300 chars
--     "lineNo":      42, "groupLineNo": 38,                      -- where they are on the page
--     "from":        "2016-11-01", "to": "2020-09-30",           -- the dates read off the row
--     "datesText":   "11.2016 – 09.2020",                        -- the same, in plain words
--     "numberOk":    true, "readsAgree": true,                   -- what the checks found on that row
--     "datesOk":     true, "placeOk": true,
--     "place":       null | "front" | "rear" | {"front":"left"…}, -- kept even when Roam has no type
--     "suggestion":  "<suggestion key>"                          -- unknown rows only
--   } ],                                                          -- at most 400 rows
--   "suggestions": [ {
--     "key":            "HOSE, AIR CLEANER, NO.1",               -- the group row's words, normalised
--     "name":           "Air cleaner hose",                      -- suggested plain name
--     "groupId":        "<uuid>", "groupName": "Belts & hoses",  -- suggested part group
--     "kind":           "new" | "existing" | "fixings",
--     "existingTypeId": "<uuid>" | null,                          -- for "existing"
--     "positionScheme": "none" | "axle" | "axle_left_right",
--     "pagePhrase":     "HOSE, AIR CLEANER, NO.1",               -- the catalogue's own words
--     "numbers":        ["17881-B1130"],                          -- distinct numbers, in page order
--     "rowCount":       1, "numberCount": 1,
--     "status":         "open" | "added" | "dismissed",
--     "typeId":         "<uuid>" | null, "typeName": null,        -- filled when added
--     "reason":         null                                      -- why it failed, in plain words
--   } ]                                                          -- at most 20 suggestions
--   "counts":     { … the four result groups … },
--   "otherTypes": [ … suggestion names (old results hold ["other"]) … ]
-- }
-- D2 writes suggestions once, during the upload, and edits them in place from the Add / Dismiss route (§3).
-- Nothing else from the page is kept: no price, no file, no whole page (D9).

-- ---------------------------------------------------------------------------
-- D3. public.part_type_suggestion_dismissal — "not a part we track"
-- ---------------------------------------------------------------------------
-- Deny-all RLS, service role only, same as research_saved_page. A dismissed phrase is never suggested again,
-- on any page, for any car. Undo = delete the row (§4 S2).
CREATE TABLE IF NOT EXISTS public.part_type_suggestion_dismissal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The group row's words, normalised the one way the server's lookup normalises them: upper case, letters and
  -- digits only (§2 D3). The check keeps every stored key in that exact form, so a dismissed phrase cannot be
  -- missed by the "is it dismissed?" lookup that decides whether a suggestion is offered (D8.2).
  phrase_key text NOT NULL UNIQUE
    CHECK (phrase_key <> '' AND phrase_key = upper(phrase_key) AND phrase_key !~ '[^A-Z0-9]'),
  -- The words as the page wrote them, so the owner recognises the row on the Part types screen.
  phrase text NOT NULL CHECK (btrim(phrase) <> ''),
  -- The group it was offered under. Context only: the phrase stays dismissed even if the group changes.
  group_id uuid REFERENCES public.maintenance_service_categories (id) ON DELETE SET NULL,
  -- Who and when. No FK, like research_saved_page.uploaded_by: removing a login must never bring a phrase back.
  dismissed_by uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  -- Why, in the owner's words, optional.
  note text
);

COMMENT ON TABLE public.part_type_suggestion_dismissal IS
  'Phrases the owner marked "not a part we track" (§2 D3). Server only; one row per normalised phrase, forever.';
COMMENT ON COLUMN public.part_type_suggestion_dismissal.phrase_key IS
  'The phrase normalised once, the same way the server normalises a group row before offering it: upper case, letters and digits only.';
COMMENT ON COLUMN public.part_type_suggestion_dismissal.phrase IS
  'The words as the page wrote them, shown back to the owner on the Part types screen (Hidden from saved pages).';

ALTER TABLE public.part_type_suggestion_dismissal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS part_type_suggestion_dismissal_deny_all ON public.part_type_suggestion_dismissal;
CREATE POLICY part_type_suggestion_dismissal_deny_all ON public.part_type_suggestion_dismissal
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.part_type_suggestion_dismissal FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.part_type_suggestion_dismissal TO service_role;

-- ---------------------------------------------------------------------------
-- D4. public.research_saved_page_diagram — the page's drawings, kept 30 days
-- ---------------------------------------------------------------------------
-- At most 3 drawings per upload, only when the file is a single-file page. Deny-all RLS, service role only.
-- This is what lets a part type added an hour later still get a picture (PT-16). Tens of KB per upload.
CREATE TABLE IF NOT EXISTS public.research_saved_page_diagram (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deleting the saved page deletes its drawings: an undone upload must not leave a private file behind.
  saved_page_id uuid NOT NULL REFERENCES public.research_saved_page (id) ON DELETE CASCADE,
  -- Private bucket: part-diagrams/pages/<savedPageId>/<uuid>.<ext>
  r2_key text NOT NULL,
  -- From the file's own bytes, never guessed.
  content_type text NOT NULL,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  -- The drawing's rectangle for the part map, as {x1,y1,x2,y2}, when the page has one. A hint only.
  map_box jsonb,
  -- Kept 30 days so a part added after the upload can still be pictured (PP-04, PT-16); then deleted.
  delete_after timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.research_saved_page_diagram IS
  'The catalogue drawings kept from one saved page (§2 D4). Private, never shown, deleted 30 days after the upload.';
COMMENT ON COLUMN public.research_saved_page_diagram.map_box IS
  'Image-map rectangle {x1,y1,x2,y2} as a hint only; Chrome scales these between .html and .mhtml.';
COMMENT ON COLUMN public.research_saved_page_diagram.delete_after IS
  '30 days after the upload. The picture worker deletes the file, then sets deleted_at.';

CREATE INDEX IF NOT EXISTS research_saved_page_diagram_page_idx
  ON public.research_saved_page_diagram (saved_page_id);
CREATE INDEX IF NOT EXISTS research_saved_page_diagram_due_idx
  ON public.research_saved_page_diagram (delete_after)
  WHERE deleted_at IS NULL;

ALTER TABLE public.research_saved_page_diagram ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_saved_page_diagram_deny_all ON public.research_saved_page_diagram;
CREATE POLICY research_saved_page_diagram_deny_all ON public.research_saved_page_diagram
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.research_saved_page_diagram FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_saved_page_diagram TO service_role;

-- ---------------------------------------------------------------------------
-- D5. Live clean-ups — three statements, each keyed on `code`, never on `id`
-- ---------------------------------------------------------------------------
-- `code` is unique on maintenance_service_categories, so each statement reaches exactly one row and is safe to
-- paste twice. Where the row does not exist (a fresh replay has neither the Filters cabin-filter row nor the
-- production name on ENG-OIL) the statement simply updates nothing.

-- D5.1 Rename the brake-pads part type: name "Brakes" -> "Brake pads" (PT-11).
-- Keyed on `code = 'brakes'`, which is the component (op code BRK-PADS). The Brakes *group* is `sys_brakes` and
-- keeps its name. Only `name` changes: code, op_code, plain_name, group, scheme, default_action and status stay
-- as they are, so its 8 parts and 57 confirmed fittings are untouched and Fleet (which shows plain_name) sees
-- no change.
UPDATE public.maintenance_service_categories
SET name = 'Brake pads'
WHERE code = 'brakes';

-- D5.2 Rename the Fluids engine-oil product: name and plain_name "Engine oil" -> "Engine oil (top-up)" (PT-09).
-- Keyed on `code = 'engine_oil_part'` (op code FLD-ENG-OIL, group Fluids). NOT the oil-change row
-- `code = 'oil'` (op code ENG-OIL), whose name, is_part, fit mode, 2 parts and fittings are all left alone, so
-- Fleet logs an oil change exactly as it does today. Only the two name columns change here.
UPDATE public.maintenance_service_categories
SET name = 'Engine oil (top-up)',
    plain_name = 'Engine oil (top-up)'
WHERE code = 'engine_oil_part';

-- D5.3 Hide the duplicate cabin-filter type: part_type_status -> 'draft' (PT-10).
-- Keyed on `code = 'cabin_air_filter'` (op code FILT-CAF, group Filters). This row exists on production only —
-- no migration creates it — so a fresh replay does nothing here and stays green. Kept, not deleted; the HVAC
-- row `code = 'cabin_filter'` stays active and is the one the Fleet synonyms and the 10,000 km rule use.
UPDATE public.maintenance_service_categories
SET part_type_status = 'draft'
WHERE code = 'cabin_air_filter';

-- ---------------------------------------------------------------------------
-- D6. Seed the 17 common part types Roam has no type for (§7)
-- ---------------------------------------------------------------------------
-- Each sits under its part group and is created the same way the Add button creates one: a group, an op code,
-- default_action 'replace', a position scheme and an active status. is_part is NOT named here on purpose: the
-- column default (true) marks it a part, and this migration never sets that flag (PT-09, PT-13).
-- The group is joined by name, so a database that has fewer groups (a fresh replay has 11 of the 13) simply
-- seeds the ones whose group exists. ON CONFLICT (code) DO NOTHING makes a second paste a no-op.
INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, parent_id, kind, op_code, part_type_status,
  position_scheme, default_fit_mode, default_action, sort_order
)
SELECT s.code, s.name, s.name, g.id, 'component', s.op_code, 'active',
       s.scheme, 'specific', 'replace', 900
FROM (VALUES
  -- Engine
  ('Engine',                 'Air cleaner housing',    'air_cleaner_housing',   'ENG-ACLHSG',     'none'),
  ('Engine',                 'Air cleaner inlet',      'air_cleaner_inlet',     'ENG-ACLIN',      'none'),
  ('Engine',                 'Ventilation pipe',       'ventilation_pipe',      'ENG-VENTPIPE',   'none'),
  ('Engine',                 'Engine mount',           'engine_mount',          'ENG-MOUNT',      'axle_left_right'),
  ('Engine',                 'Mass air flow sensor',   'mass_air_flow_sensor',  'ENG-MAFSENSOR',  'none'),
  -- Belts & hoses
  ('Belts & hoses',          'Air cleaner hose',       'air_cleaner_hose',      'BELT-ACHOSE',    'none'),
  ('Belts & hoses',          'Radiator hose',          'radiator_hose',         'BELT-RADHOSE',   'axle'),
  ('Belts & hoses',          'Heater hose',            'heater_hose',           'BELT-HEATHOSE',  'none'),
  ('Belts & hoses',          'Hose clamp',             'hose_clamp',            'BELT-HOSECLAMP', 'none'),
  ('Belts & hoses',          'Drive belt tensioner',   'drive_belt_tensioner',  'BELT-TENSION',   'none'),
  -- Suspension & steering
  ('Suspension & steering',  'Coil spring',            'coil_spring',           'SUS-COIL',       'axle_left_right'),
  ('Suspension & steering',  'Strut mount',            'strut_mount',           'SUS-STRUTMNT',   'axle_left_right'),
  ('Suspension & steering',  'Stabilizer bar bush',    'stabilizer_bar_bush',   'SUS-SWAYBUSH',   'axle'),
  ('Suspension & steering',  'Ball joint',             'ball_joint',            'SUS-BALLJOINT',  'axle_left_right'),
  ('Suspension & steering',  'Tie rod end',            'tie_rod_end',           'SUS-TIEROD',     'axle_left_right'),
  -- Transmission
  ('Transmission',           'Clutch kit',             'clutch_kit',            'TRN-CLUTCHKIT',  'none'),
  -- Lighting & visibility
  ('Lighting & visibility',  'Headlight assembly',     'headlight_assembly',    'LGT-HEADASSY',   'none')
) AS s (group_name, name, code, op_code, scheme)
JOIN public.maintenance_service_categories g
  ON g.kind = 'system'
 AND g.parent_id IS NULL
 AND g.name = s.group_name
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- D7. Seed a synonym for every seeded type
-- ---------------------------------------------------------------------------
-- term = the type's plain name lower-cased (a seeded type has no page phrase of its own yet), canonical = the
-- type's name, maintenance_component_id = the type. That is what makes Fleet find the new type by the words
-- printed on a page (PT-17). term is the primary key, so a second paste keeps the existing row.
INSERT INTO public.part_term_synonym (term, canonical, maintenance_component_id)
SELECT lower(c.plain_name), c.name, c.id
FROM public.maintenance_service_categories c
WHERE c.code IN (
  'air_cleaner_housing', 'air_cleaner_inlet', 'ventilation_pipe', 'engine_mount', 'mass_air_flow_sensor',
  'air_cleaner_hose', 'radiator_hose', 'heater_hose', 'hose_clamp', 'drive_belt_tensioner',
  'coil_spring', 'strut_mount', 'stabilizer_bar_bush', 'ball_joint', 'tie_rod_end',
  'clutch_kit', 'headlight_assembly'
)
ON CONFLICT (term) DO NOTHING;

-- The server reads and writes the two new tables through PostgREST.
NOTIFY pgrst, 'reload schema';
