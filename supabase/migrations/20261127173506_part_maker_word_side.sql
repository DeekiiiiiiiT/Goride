-- Answers teach Roam, build step 2 (docs/answers-teach-roam-audit.md AT-05 / AT-07, build note 3).
--
-- 1. part_maker_word gains `side` (left / right / both). A side answer ("Both sides" on the Roomy strut mount) is
--    remembered like a front/rear answer: for one make and model. The write function takes p_side, so the old
--    7-argument version is dropped first (callers use named arguments, so two versions would be ambiguous).
-- 2. The switch: catalog_research_settings.answers_teach_roam, off by default. With it off the upload works exactly as
--    today. Go-live turns it on (for everyone: it isn't per company).

ALTER TABLE public.part_maker_word ADD COLUMN IF NOT EXISTS side text;
ALTER TABLE public.part_maker_word DROP CONSTRAINT IF EXISTS part_maker_word_side_check;
ALTER TABLE public.part_maker_word ADD CONSTRAINT part_maker_word_side_check CHECK (side IN ('left', 'right', 'both'));
ALTER TABLE public.part_maker_word DROP CONSTRAINT IF EXISTS part_maker_word_side_needs_model;
ALTER TABLE public.part_maker_word ADD CONSTRAINT part_maker_word_side_needs_model CHECK (side IS NULL OR model IS NOT NULL);

ALTER TABLE public.catalog_research_settings ADD COLUMN IF NOT EXISTS answers_teach_roam boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.catalog_research_settings.answers_teach_roam IS
  'Answers teach Roam switch (docs/answers-teach-roam-audit.md §6): wording / place / side rows become questions and lessons are used.';

DROP FUNCTION IF EXISTS public.part_maker_words_for(text);
CREATE FUNCTION public.part_maker_words_for(p_make text)
RETURNS TABLE (
  id uuid,
  phrase_key text,
  phrase text,
  make text,
  model text,
  maintenance_component_id uuid,
  part_type_name text,
  axle text,
  side text,
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
  SELECT w.id, w.phrase_key, w.phrase, w.make, w.model, w.maintenance_component_id, c.name, w.axle, w.side,
         w.search_word, w.set_by, w.parts_saved, w.answered_by, w.updated_at
  FROM public.part_maker_word w
  JOIN public.maintenance_service_categories c ON c.id = w.maintenance_component_id
  WHERE lower(w.make) = lower(btrim(coalesce(p_make, '')))
  ORDER BY w.set_by DESC, w.updated_at DESC;
$$;

DROP FUNCTION IF EXISTS public.part_maker_word_set(text, text, text, text, uuid, text, uuid);
CREATE FUNCTION public.part_maker_word_set(
  p_phrase_key text,
  p_phrase text,
  p_make text,
  p_model text,
  p_component_id uuid,
  p_axle text,
  p_side text,
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
  v_side text := nullif(lower(btrim(coalesce(p_side, ''))), '');
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
  IF v_side IS NOT NULL AND v_side NOT IN ('left', 'right', 'both') THEN
    RAISE EXCEPTION 'side must be left, right or both' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (v_axle IS NOT NULL OR v_side IS NOT NULL) AND v_model IS NULL THEN
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

  INSERT INTO public.part_maker_word (phrase_key, phrase, make, model, maintenance_component_id, axle, side, set_by, answered_by)
  VALUES (v_key, btrim(p_phrase), v_make, v_model, p_component_id, v_axle, v_side, 'owner', p_actor)
  ON CONFLICT (phrase_key, lower(make), coalesce(lower(model), '')) DO UPDATE
    SET phrase = excluded.phrase,
        maintenance_component_id = excluded.maintenance_component_id,
        -- A newer answer for one of the two keeps the other one the owner already gave.
        axle = coalesce(excluded.axle, part_maker_word.axle),
        side = coalesce(excluded.side, part_maker_word.side),
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
                             'component_id', p_component_id, 'axle', v_axle, 'side', v_side));

  RETURN jsonb_build_object('id', v_id, 'replaced', v_before.id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.part_maker_words_for(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_maker_words_for(text) TO service_role;
REVOKE ALL ON FUNCTION public.part_maker_word_set(text, text, text, text, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_maker_word_set(text, text, text, text, uuid, text, text, uuid) TO service_role;
