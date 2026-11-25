-- RE-58 (research audit §3 item 4, 25 Nov 2026): a number the owner confirmed in a browser check is the owner's, not
-- the engine's. promote_part_proposal marks every routed proposal trustSetBy 'engine'; the save keeps 'engine' when the
-- evidence reads exist. Now a row whose route is 'owner_browser' is saved as set by 'owner', and keeps its evidence
-- reads (they are the owner's answers on file). The 4 listings saved this way so far are corrected.

DO $patch$
DECLARE
  d text;
  setby_old constant text := $q$THEN 'engine' ELSE 'owner' END;$q$;
  setby_new constant text := $q$THEN CASE WHEN v_row->>'trustRoute' = 'owner_browser' THEN 'owner' ELSE 'engine' END ELSE 'owner' END;$q$;
  reads_old constant text := $q$IF v_list_set_by <> 'engine' THEN$q$;
  reads_new constant text := $q$IF v_list_set_by <> 'engine' AND v_row->>'trustRoute' IS DISTINCT FROM 'owner_browser' THEN$q$;
BEGIN
  d := pg_get_functiondef('public.save_self_serve_part_in_batch(jsonb,uuid,integer,boolean)'::regprocedure);
  IF (length(d) - length(replace(d, setby_old, ''))) / length(setby_old) <> 1 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch: expected the engine/owner choice once — not patched';
  END IF;
  IF (length(d) - length(replace(d, reads_old, ''))) / length(reads_old) <> 1 THEN
    RAISE EXCEPTION 'save_self_serve_part_in_batch: expected the evidence-reads reset once — not patched';
  END IF;
  d := replace(d, setby_old, setby_new);
  d := replace(d, reads_old, reads_new);
  EXECUTE d;
END
$patch$;

UPDATE public.part_listing
SET trust_set_by = 'owner'
WHERE trust_route = 'owner_browser' AND trust_set_by = 'engine';
