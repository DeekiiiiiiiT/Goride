-- Roam sorts unknown parts by itself — Data layer only
-- (docs/part-type-auto-sort-audit.md Rev 3, §4 D1).
--
-- D1  part_term_synonym            — one row per traced part name: phrase_key, added_by, added_at, reason.
-- D1  part_type_suggestion_dismissal — set_by (owner / roam); dismissed_by becomes nullable (Roam is not a user).
-- D1  two indexes                  — the partial unique phrase key and a GIN index on the saved result's rows.
-- D1  part_name_answer_set(...)    — one atomic answer: track writes the synonym and clears the dismissal;
--                                    skip clears the synonym and writes the dismissal; an owner answer is never
--                                    overwritten by set_by = 'roam' (G7).
--
-- Nothing else. No unique index on term (the primary key already is one), no server route, no screen, no worker.
-- The logbook line lives in the SQL pasted on production (docs/part_type_auto_sort_LIVE_apply.sql), never in this
-- file: `supabase db start` records the version itself, so a second INSERT would fail the replay.

-- ---------------------------------------------------------------------------
-- D1. part_term_synonym — the remembered answer for a part name
-- ---------------------------------------------------------------------------
-- phrase_key is the page phrase normalised the one way the server normalises it (upper case, letters and digits
-- only). The 58 existing rows keep a NULL key: they are search words, not answers to a page name.
--
-- added_by is added with DEFAULT 'seed' and the default is then changed to 'owner'. That is the one-time backfill
-- without an UPDATE: every row that exists now takes 'seed', and every row written after this migration takes
-- 'owner' unless the caller says otherwise. Re-running the paste file cannot relabel a later owner row as seed.
ALTER TABLE public.part_term_synonym
  ADD COLUMN IF NOT EXISTS phrase_key text,
  ADD COLUMN IF NOT EXISTS added_by text NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS added_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.part_term_synonym
  ALTER COLUMN added_by SET DEFAULT 'owner';

ALTER TABLE public.part_term_synonym
  DROP CONSTRAINT IF EXISTS part_term_synonym_added_by_check;
ALTER TABLE public.part_term_synonym
  ADD CONSTRAINT part_term_synonym_added_by_check CHECK (added_by IN ('seed', 'owner', 'roam'));

COMMENT ON COLUMN public.part_term_synonym.phrase_key IS
  'The page phrase this row answers, normalised once: upper case, letters and digits only (§4 D1). NULL on the seed synonyms.';
COMMENT ON COLUMN public.part_term_synonym.added_by IS
  'Who wrote the row: seed (the original synonym list), owner or roam (§2 steps 1 and 3).';
COMMENT ON COLUMN public.part_term_synonym.added_at IS
  'When the answer was set. The seed rows carry the migration time.';
COMMENT ON COLUMN public.part_term_synonym.reason IS
  'Why, in a few plain words: "Sold and replaced on its own", "Part of the heater unit" (§2).';

-- ---------------------------------------------------------------------------
-- D1. part_type_suggestion_dismissal — set_by, and dismissed_by becomes nullable
-- ---------------------------------------------------------------------------
-- set_by records whether the owner or Roam said "not tracked". Roam is not a user, so its rows have no
-- dismissed_by; every reader already treats dismissed_by as optional.
ALTER TABLE public.part_type_suggestion_dismissal
  ADD COLUMN IF NOT EXISTS set_by text NOT NULL DEFAULT 'owner';

ALTER TABLE public.part_type_suggestion_dismissal
  ALTER COLUMN dismissed_by DROP NOT NULL;

ALTER TABLE public.part_type_suggestion_dismissal
  DROP CONSTRAINT IF EXISTS part_type_suggestion_dismissal_set_by_check;
ALTER TABLE public.part_type_suggestion_dismissal
  ADD CONSTRAINT part_type_suggestion_dismissal_set_by_check CHECK (set_by IN ('owner', 'roam'));

COMMENT ON COLUMN public.part_type_suggestion_dismissal.set_by IS
  'Who said "not a part we track": owner or roam (§2 steps 1 and 3).';
COMMENT ON COLUMN public.part_type_suggestion_dismissal.dismissed_by IS
  'The owner login, when set_by = owner. NULL for a Roam row (Roam is not a user).';

-- ---------------------------------------------------------------------------
-- D1. Indexes
-- ---------------------------------------------------------------------------
-- One answer per phrase. Partial, so the 58 search-only synonym rows (phrase_key NULL) are not constrained.
CREATE UNIQUE INDEX IF NOT EXISTS part_term_synonym_phrase_key_uidx
  ON public.part_term_synonym (phrase_key)
  WHERE phrase_key IS NOT NULL;

-- A name can be found across every saved page's kept rows: result->'rows' @> '[{"phraseKey":"..."}]' (§4 R4).
CREATE INDEX IF NOT EXISTS research_saved_page_result_rows_gin
  ON public.research_saved_page USING gin ((result -> 'rows'));

-- ---------------------------------------------------------------------------
-- D1. part_name_answer_set — one atomic answer, one row per phrase
-- ---------------------------------------------------------------------------
-- p_phrase_key : the normalised page phrase (upper case, letters and digits only).
-- p_phrase     : for track, the synonym's search word (the plain name, e.g. "Air cleaner hose");
--                for skip, the words as the page wrote them, shown back to the owner.
-- p_verdict    : 'track' or 'skip'.
-- p_type_id    : the part type for track; ignored for skip.
-- p_set_by     : 'owner' or 'roam'.
-- p_reason     : a few plain words, optional.
-- p_actor      : the owner's login for a skip (stored as dismissed_by). NULL for Roam.
--
-- G7: if the saved answer for this phrase was set by the owner, a Roam call changes nothing and answers
-- {"set":"owner_wins"}. An owner call may replace a Roam answer (the review list's flip).
-- G8: the synonym and the dismissal are written in the same transaction, so a phrase is never both.
-- A seed synonym (added_by = 'seed') is never deleted and never relabelled: track gives it a phrase_key and a
-- reason, skip takes those two back, and its term keeps finding the part in Fleet.
CREATE OR REPLACE FUNCTION public.part_name_answer_set(
  p_phrase_key text,
  p_phrase text,
  p_verdict text,
  p_type_id uuid,
  p_set_by text,
  p_reason text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_key text := upper(btrim(coalesce(p_phrase_key, '')));
  v_phrase text := btrim(coalesce(p_phrase, ''));
  v_verdict text := lower(btrim(coalesce(p_verdict, '')));
  v_set_by text := lower(btrim(coalesce(p_set_by, '')));
  v_term text := lower(btrim(coalesce(p_phrase, '')));
  v_canonical text;
  v_existing_term text;
  v_existing_component uuid;
  v_owner boolean := false;
BEGIN
  IF v_key = '' OR v_key ~ '[^A-Z0-9]' THEN
    RAISE EXCEPTION 'Invalid phrase key';
  END IF;
  IF v_phrase = '' THEN
    RAISE EXCEPTION 'A phrase is required';
  END IF;
  IF v_verdict NOT IN ('track', 'skip') THEN
    RAISE EXCEPTION 'Invalid verdict';
  END IF;
  IF v_set_by NOT IN ('owner', 'roam') THEN
    RAISE EXCEPTION 'Invalid set_by';
  END IF;

  -- G7: an owner answer is never overwritten by Roam.
  IF v_set_by = 'roam' THEN
    SELECT
      EXISTS (SELECT 1 FROM public.part_term_synonym s
               WHERE s.phrase_key = v_key AND s.added_by = 'owner')
      OR EXISTS (SELECT 1 FROM public.part_type_suggestion_dismissal d
                  WHERE d.phrase_key = v_key AND d.set_by = 'owner')
    INTO v_owner;
    IF v_owner THEN
      RETURN jsonb_build_object('set', 'owner_wins', 'phrase_key', v_key);
    END IF;
  END IF;

  IF v_verdict = 'track' THEN
    IF p_type_id IS NULL THEN
      RAISE EXCEPTION 'A part type is required for track';
    END IF;
    SELECT c.name INTO v_canonical
    FROM public.maintenance_service_categories c
    WHERE c.id = p_type_id AND c.kind = 'component' AND c.is_part;
    IF v_canonical IS NULL THEN
      RAISE EXCEPTION 'Part type not found';
    END IF;

    -- A row already carrying this phrase_key is updated in place. A seed row stays a seed row: only its
    -- reason changes, so a later skip clears the key instead of deleting a starter search word.
    UPDATE public.part_term_synonym s
       SET canonical = CASE WHEN s.added_by = 'seed' THEN s.canonical ELSE v_canonical END,
           maintenance_component_id = CASE WHEN s.added_by = 'seed' THEN s.maintenance_component_id ELSE p_type_id END,
           added_by = CASE WHEN s.added_by = 'seed' THEN s.added_by ELSE v_set_by END,
           added_at = CASE WHEN s.added_by = 'seed' THEN s.added_at ELSE now() END,
           reason = p_reason
     WHERE s.phrase_key = v_key;
    IF NOT FOUND THEN
      SELECT s.term, s.maintenance_component_id
      INTO v_existing_term, v_existing_component
      FROM public.part_term_synonym s
      WHERE s.term = v_term;

      IF v_existing_term IS NULL THEN
        INSERT INTO public.part_term_synonym
          (term, canonical, maintenance_component_id, phrase_key, added_by, added_at, reason)
        VALUES
          (v_term, v_canonical, p_type_id, v_key, v_set_by, now(), p_reason);
      ELSIF v_existing_component IS DISTINCT FROM p_type_id THEN
        -- The word already finds another type (a seed synonym, or another answer). Never repoint it silently.
        RAISE EXCEPTION 'That word already finds another part type';
      ELSE
        -- A seed synonym for the same type: adopt it as this phrase's answer without losing the starter word.
        -- Only the key and the reason move; added_by stays 'seed', so a later skip clears the key.
        UPDATE public.part_term_synonym s
           SET phrase_key = v_key,
               reason = p_reason
         WHERE s.term = v_existing_term
           AND s.added_by = 'seed';

        IF NOT FOUND THEN
          UPDATE public.part_term_synonym s
             SET phrase_key = v_key,
                 canonical = v_canonical,
                 maintenance_component_id = p_type_id,
                 added_by = v_set_by,
                 added_at = now(),
                 reason = p_reason
           WHERE s.term = v_existing_term;
        END IF;
      END IF;
    END IF;

    DELETE FROM public.part_type_suggestion_dismissal d WHERE d.phrase_key = v_key;
  ELSE
    -- A starter synonym is never deleted: it only loses its answer (phrase_key) and its reason.
    DELETE FROM public.part_term_synonym s
     WHERE s.phrase_key = v_key
       AND s.added_by <> 'seed';

    UPDATE public.part_term_synonym s
       SET phrase_key = NULL,
           reason = NULL
     WHERE s.phrase_key = v_key
       AND s.added_by = 'seed';

    INSERT INTO public.part_type_suggestion_dismissal
      (phrase_key, phrase, dismissed_by, note, set_by, dismissed_at)
    VALUES
      (v_key, v_phrase,
       CASE WHEN v_set_by = 'owner' THEN p_actor ELSE NULL END,
       p_reason, v_set_by, now())
    ON CONFLICT (phrase_key) DO UPDATE
      SET phrase = excluded.phrase,
          note = excluded.note,
          set_by = excluded.set_by,
          dismissed_by = excluded.dismissed_by,
          dismissed_at = now();
  END IF;

  RETURN jsonb_build_object('set', v_verdict, 'phrase_key', v_key, 'type_id', p_type_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.part_name_answer_set(text, text, text, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_name_answer_set(text, text, text, uuid, text, text, uuid)
  TO service_role;

-- The server calls the function and reads the new columns through PostgREST.
NOTIFY pgrst, 'reload schema';

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261126181621', 'part_type_auto_sort') ON CONFLICT (version) DO NOTHING;
