-- LC-21b (owner 20 Nov, docs/log-service-parts-gaps-audit.md 0c4): a by-size product (battery, bulb, fluid…) saved on
-- its own — no cars ticked — no longer needs a source page. With no link it is saved as Needs checking
-- (source_trust(NULL) = 'needs_checking' → part_master.catalog_decision 'pending'), never Confirmed.
-- Car fits, car specs and factory numbers still need a link (their tables keep evidence_url NOT NULL, and the fluid
-- bundle that writes car specs keeps its own check).

ALTER TABLE public.universal_part ALTER COLUMN evidence_url DROP NOT NULL;

-- save_universal_part: the link check goes (the table now allows none).
DO $patch$
DECLARE
  v_def text;
  v_old text := 'RAISE EXCEPTION ''A universal item needs a source link'';';
  v_new text := 'NULL; -- LC-21b: a by-size product may be saved without a source link (Needs checking)';
BEGIN
  v_def := pg_get_functiondef('public.save_universal_part(jsonb)'::regprocedure);
  IF position('LC-21b' IN v_def) > 0 THEN
    RETURN; -- already patched
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'save_universal_part: expected the link check exactly once — not patched';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END;
$patch$;

-- save_self_serve_part_in_batch: the link stays required except for a by-size save with no factory numbers.
DO $patch$
DECLARE
  v_def text;
  v_old text := 'IF v_evidence IS NULL THEN RAISE EXCEPTION ''A source link is required''; END IF;';
  v_new text := 'IF v_evidence IS NULL AND (coalesce(p_input->>''fitMode'', '''') <> ''spec'' OR jsonb_array_length(coalesce(p_input->''factoryNumbers'', ''[]''::jsonb)) > 0) THEN RAISE EXCEPTION ''A source link is required''; END IF; -- LC-21b';
BEGIN
  v_def := pg_get_functiondef('public.save_self_serve_part_in_batch(jsonb, uuid, integer, boolean)'::regprocedure);
  IF position('LC-21b' IN v_def) > 0 THEN
    RETURN; -- already patched
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch: expected the link check exactly once — not patched';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END;
$patch$;

-- Self-checks
DO $check$
BEGIN
  IF position('LC-21b' IN pg_get_functiondef('public.save_universal_part(jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'save_universal_part not patched';
  END IF;
  IF position('LC-21b' IN
       pg_get_functiondef('public.save_self_serve_part_in_batch(jsonb, uuid, integer, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch not patched';
  END IF;
  IF public.source_trust(NULL, 'toyota', ARRAY['Interstate']) = 'confirmed' THEN
    RAISE EXCEPTION 'a part with no link must never be Confirmed';
  END IF;
END;
$check$;
