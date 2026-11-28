-- Answers teach Roam, build step 1 (docs/answers-teach-roam-audit.md §3, AT-01 / AT-04 / AT-07 / AT-09).
--
-- One table for what a car maker calls a part: public.part_maker_word. The saved-page upload and the browser check both
-- read it (server step 2), and the owner's answers write to it. It replaces the hand-written partFinder() rows in
-- saved_page_proof.ts and apps/admin researchModel.ts.
--
-- Why a new table and not part_term_synonym (build note, plan Rev 3.1): part_term_synonym's key is `term` alone, so one
-- heading can't be stored for two makers. Fleet's find-parts search (readPartTerm) and the catalogue editor
-- (catalog_routes upsert on term) also use that table. It stays exactly as it is.
--
-- Rows:
--   * set_by 'seed': the 10 partFinder rows for Toyota, Daihatsu and Lexus (the makes partFinder served), each on the
--     one part type it was written for. Today partFinder also lent these words to look-alike types (Drive belt
--     tensioner took "BELT, V-RIBBED", Spark Plug Wires took "PLUG, SPARK", the parking-brake strut set and
--     hold-down spring took "SHOE SET, BRAKE", the air cleaner housing and inlet took the air filter row); the seed
--     doesn't.
--   * set_by 'owner': a lesson from an answer. A wording lesson has make only. A place lesson has make, model and axle.
--     One heading per make (and model) points at one part type; a newer answer replaces an older one.
-- The phrase key is normalisePhrase() in saved_page_phrases.ts (side words removed, upper case, A–Z and 0–9 only).
-- service_role only, like the other research tables.

CREATE TABLE IF NOT EXISTS public.part_maker_word (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase_key text NOT NULL CHECK (phrase_key ~ '^[A-Z0-9]+$'),
  phrase text NOT NULL CHECK (btrim(phrase) <> ''),
  make text NOT NULL CHECK (btrim(make) <> ''),
  model text CHECK (model IS NULL OR btrim(model) <> ''),
  maintenance_component_id uuid NOT NULL REFERENCES public.maintenance_service_categories(id) ON DELETE CASCADE,
  axle text CHECK (axle IN ('front', 'rear')),
  search_word text CHECK (search_word IS NULL OR btrim(search_word) <> ''),
  set_by text NOT NULL CHECK (set_by IN ('seed', 'owner')),
  parts_saved integer NOT NULL DEFAULT 0 CHECK (parts_saved >= 0),
  answered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- AT-07: a place is only ever learned for one model.
  CONSTRAINT part_maker_word_axle_needs_model CHECK (axle IS NULL OR model IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS part_maker_word_heading_uidx
  ON public.part_maker_word (phrase_key, lower(make), coalesce(lower(model), ''));
CREATE INDEX IF NOT EXISTS part_maker_word_make_idx ON public.part_maker_word (lower(make));
CREATE INDEX IF NOT EXISTS part_maker_word_component_idx ON public.part_maker_word (maintenance_component_id);

COMMENT ON TABLE public.part_maker_word IS
  'Answers teach Roam (AT-01): what a car maker calls a part. seed = old partFinder rows; owner = lessons from answers. service_role only.';

ALTER TABLE public.part_maker_word ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.part_maker_word FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.part_maker_word TO service_role;

-- Seed: the 10 partFinder rows, word for word, for each make partFinder served. A part type missing on a database is
-- skipped (local copies may lack one).
INSERT INTO public.part_maker_word (phrase_key, phrase, make, maintenance_component_id, search_word, set_by)
SELECT upper(regexp_replace(s.phrase, '[^A-Za-z0-9]', '', 'g')), s.phrase, m.make, c.id, s.search_word, 'seed'
FROM (VALUES
  ('HVAC-CABIN', 'air filter', 'ELEMENT, CLEAN AIR FILTER (or AIR REFINER)'),
  ('FILT-AIR', 'air cleaner', 'ELEMENT SUB-ASSY, AIR CLEANER FILTER'),
  ('ENG-SPARK', 'spark plug', 'PLUG, SPARK'),
  ('SUS-SHOCK', 'shock absorber', 'ABSORBER ASSY, SHOCK'),
  ('ENG-THERM', 'thermostat', 'THERMOSTAT'),
  ('BRK-PADS', 'disc brake', 'PAD KIT, DISC BRAKE'),
  ('BRK-SHOES', 'brake shoe', 'SHOE SET, BRAKE'),
  ('LGT-WIPER', 'wiper', 'BLADE ASSY, WIPER'),
  ('BELT-SERP', 'belt', 'BELT, V-RIBBED'),
  ('FILT-OF', 'oil filter', 'FILTER SUB-ASSY, OIL')
) AS s(op_code, search_word, phrase)
CROSS JOIN (VALUES ('Toyota'), ('Daihatsu'), ('Lexus')) AS m(make)
JOIN public.maintenance_service_categories c ON c.op_code = s.op_code AND c.kind = 'component'
ON CONFLICT DO NOTHING;

-- Read: every word for one make (seed and owner), with the part type's name. The upload and the browser check call it.
CREATE OR REPLACE FUNCTION public.part_maker_words_for(p_make text)
RETURNS TABLE (
  id uuid,
  phrase_key text,
  phrase text,
  make text,
  model text,
  maintenance_component_id uuid,
  part_type_name text,
  axle text,
  search_word text,
  set_by text,
  parts_saved integer,
  answered_by uuid,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT w.id, w.phrase_key, w.phrase, w.make, w.model, w.maintenance_component_id, c.name, w.axle, w.search_word,
         w.set_by, w.parts_saved, w.answered_by, w.updated_at
  FROM public.part_maker_word w
  JOIN public.maintenance_service_categories c ON c.id = w.maintenance_component_id
  WHERE lower(w.make) = lower(btrim(coalesce(p_make, '')))
  ORDER BY w.set_by DESC, w.updated_at DESC;
$$;

-- Write: one owner answer becomes a lesson (AT-04). A newer answer for the same heading, make and model replaces the
-- older one (AT-09 rule 4); its saved-parts count starts again when the part type changes.
CREATE OR REPLACE FUNCTION public.part_maker_word_set(
  p_phrase_key text,
  p_phrase text,
  p_make text,
  p_model text,
  p_component_id uuid,
  p_axle text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_key text := btrim(coalesce(p_phrase_key, ''));
  v_make text := nullif(btrim(coalesce(p_make, '')), '');
  v_model text := nullif(btrim(coalesce(p_model, '')), '');
  v_axle text := nullif(lower(btrim(coalesce(p_axle, ''))), '');
  v_before public.part_maker_word%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_key !~ '^[A-Z0-9]+$' THEN RAISE EXCEPTION 'phrase key required' USING ERRCODE = 'invalid_parameter_value'; END IF;
  IF nullif(btrim(coalesce(p_phrase, '')), '') IS NULL THEN
    RAISE EXCEPTION 'phrase required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_make IS NULL THEN RAISE EXCEPTION 'make required' USING ERRCODE = 'invalid_parameter_value'; END IF;
  IF v_axle IS NOT NULL AND v_axle NOT IN ('front', 'rear') THEN
    RAISE EXCEPTION 'axle must be front or rear' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_axle IS NOT NULL AND v_model IS NULL THEN
    RAISE EXCEPTION 'a place lesson needs the model' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_service_categories c
    WHERE c.id = p_component_id AND c.kind = 'component' AND c.is_part AND c.part_type_status = 'active'
  ) THEN
    RAISE EXCEPTION 'unknown part type' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_before FROM public.part_maker_word w
  WHERE w.phrase_key = v_key AND lower(w.make) = lower(v_make) AND coalesce(lower(w.model), '') = coalesce(lower(v_model), '')
  FOR UPDATE;

  INSERT INTO public.part_maker_word (phrase_key, phrase, make, model, maintenance_component_id, axle, set_by, answered_by)
  VALUES (v_key, btrim(p_phrase), v_make, v_model, p_component_id, v_axle, 'owner', p_actor)
  ON CONFLICT (phrase_key, lower(make), coalesce(lower(model), '')) DO UPDATE
    SET phrase = excluded.phrase,
        maintenance_component_id = excluded.maintenance_component_id,
        axle = excluded.axle,
        set_by = 'owner',
        answered_by = excluded.answered_by,
        parts_saved = CASE WHEN part_maker_word.maintenance_component_id = excluded.maintenance_component_id
                           THEN part_maker_word.parts_saved ELSE 0 END,
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.dominion_audit_log (actor, action, table_name, row_id, before, after)
  VALUES (p_actor, 'part_maker_word_set', 'part_maker_word', v_id::text,
          CASE WHEN v_before.id IS NULL THEN NULL ELSE to_jsonb(v_before) END,
          jsonb_build_object('phrase_key', v_key, 'phrase', btrim(p_phrase), 'make', v_make, 'model', v_model,
                             'component_id', p_component_id, 'axle', v_axle));

  RETURN jsonb_build_object('id', v_id, 'replaced', v_before.id IS NOT NULL);
END;
$$;

-- Undo (AT-09 rule 3): forget one owner lesson. Seed rows can't be forgotten here. Parts saved with it stay saved.
CREATE OR REPLACE FUNCTION public.part_maker_word_forget(p_id uuid, p_actor uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_before public.part_maker_word%ROWTYPE;
BEGIN
  DELETE FROM public.part_maker_word w WHERE w.id = p_id AND w.set_by = 'owner' RETURNING * INTO v_before;
  IF v_before.id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.dominion_audit_log (actor, action, table_name, row_id, before, after)
  VALUES (p_actor, 'part_maker_word_forget', 'part_maker_word', p_id::text, to_jsonb(v_before), NULL);
  RETURN true;
END;
$$;

-- Count: a lesson saved n more parts (AT-08, "Saved 3 parts").
CREATE OR REPLACE FUNCTION public.part_maker_word_saved(p_id uuid, p_count integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.part_maker_word
  SET parts_saved = parts_saved + greatest(coalesce(p_count, 0), 0)
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.part_maker_words_for(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_maker_words_for(text) TO service_role;
REVOKE ALL ON FUNCTION public.part_maker_word_set(text, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_maker_word_set(text, text, text, text, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.part_maker_word_forget(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_maker_word_forget(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.part_maker_word_saved(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_maker_word_saved(uuid, integer) TO service_role;
