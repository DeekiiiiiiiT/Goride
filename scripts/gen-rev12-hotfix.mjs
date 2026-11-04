import fs from "node:fs";

const rev11 = fs.readFileSync(
  "supabase/migrations/20261104120000_parts_auto_match_rev11_engine.sql",
  "utf8",
);
const start = rev11.indexOf("CREATE OR REPLACE FUNCTION public.part_match_recompute_pairs");
const end = rev11.indexOf("CREATE OR REPLACE FUNCTION public.part_match_recompute(", start);
if (start < 0 || end < 0) throw new Error("bounds");
let pairs = rev11.slice(start, end);

pairs = pairs.replace(
  `\n    AND NOT EXISTS (
      SELECT 1 FROM public.part_listing pl
      WHERE pl.interchange_group_id = sp.group_id
        AND pl.vehicle_catalog_id = sp.vehicle_id
        AND NOT public.part_side_covers(pl.position, pl.side, von.position, von.side)
    )`,
  "",
);

const desiredStart = pairs.indexOf("  INSERT INTO _pm_desired");
const conflictStart = pairs.indexOf("  INSERT INTO public.part_match_conflict");
const mergeStart = pairs.indexOf("  WITH merge_run AS");
if (conflictStart > desiredStart) {
  const conflicts = pairs.slice(conflictStart, mergeStart);
  pairs =
    pairs.slice(0, desiredStart) +
    conflicts +
    pairs.slice(desiredStart, conflictStart) +
    pairs.slice(mergeStart);
}

const recomputeStart = rev11.indexOf("CREATE OR REPLACE FUNCTION public.part_match_recompute(");
const recomputeEnd = rev11.indexOf("CREATE OR REPLACE FUNCTION public.part_import_undo", recomputeStart);
let recompute = rev11.slice(recomputeStart, recomputeEnd);
recompute = recompute.replace(
  /^BEGIN\r?\n/m,
  `BEGIN
  PERFORM set_config('part_match.busy', 'on', true);
`,
);
recompute = recompute.replace(
  /(\nEND;\n\$\$;\n)$/,
  `
  PERFORM set_config('part_match.busy', 'off', true);
$1`,
);
recompute = recompute.replace(
  /EXCEPTION WHEN OTHERS THEN\r?\n    UPDATE public\.part_match_recompute_log/,
  `EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('part_match.busy', 'off', true);
    UPDATE public.part_match_recompute_log`,
);

const undoStart = rev11.indexOf("CREATE OR REPLACE FUNCTION public.part_import_undo");
const undoEnd = rev11.indexOf("CREATE OR REPLACE FUNCTION public.part_match_conflict_keep", undoStart);
let undo = rev11.slice(undoStart, undoEnd);
undo = undo.replace(
  `        IF EXISTS (
          SELECT 1 FROM public.part_match_conflict pc WHERE pc.status = 'kept'
        ) THEN
          CONTINUE;
        END IF;`,
  `        IF EXISTS (
          SELECT 1
          FROM public.interchange_group_merge_log ml
          JOIN public.part_match_conflict pc ON pc.id = ml.conflict_id
          WHERE ml.id = c.row_id AND pc.status = 'kept'
        ) THEN
          CONTINUE;
        END IF;`,
);

const triggerNames = [
  "part_match_trg_vehicle_oe",
  "part_match_trg_oe_supersession",
  "part_match_trg_part_reference",
  "part_match_trg_group_from_part",
  "part_match_trg_part_supersession",
  "part_match_trg_listing_scope",
  "part_match_trg_catalog_years",
  "part_match_trg_index_number",
];

const baseM = fs.readFileSync(
  "supabase/migrations/20261102210000_parts_auto_match.sql",
  "utf8",
);
const triggers = triggerNames
  .map((name) => {
    const s = baseM.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    const e = baseM.indexOf("END; $$;", s) + "END; $$;".length;
    if (s < 0) throw new Error(name);
    let body = baseM.slice(s, e);
    if (!body.includes("part_match.busy")) {
      body = body.replace(
        /BEGIN\r?\n/,
        `BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN NULL;
  END IF;
`,
      );
    }
    return body;
  })
  .join("\n\n");

let bufferedStart = baseM.indexOf("CREATE OR REPLACE FUNCTION public.part_match_recompute_buffered");
let bufferedEnd = baseM.indexOf("CREATE OR REPLACE FUNCTION public.part_match_archive_derived_changes", bufferedStart);
let buffered = baseM.slice(bufferedStart, bufferedEnd);
buffered = buffered.replace(
  /BEGIN\r?\n/,
  `BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN;
  END IF;
`,
);

const header = `-- Parts auto-matching Rev 12 hotfix (audit blocking: X7, X2, X3, X4, derived remove-batch)
-- Generated patches on Rev 11 / base M.

ALTER TABLE public.part_listing_exclusion
  ALTER COLUMN evidence_url DROP NOT NULL;

`;

const removeBatch = `CREATE OR REPLACE FUNCTION public.part_match_derived_remove_batch(
  p_derived_ids uuid[],
  p_actor uuid,
  p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_found integer;
  v_pair record;
BEGIN
  IF p_derived_ids IS NULL OR array_length(p_derived_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Pick at least one fit.';
  END IF;
  SELECT count(*) INTO v_found
  FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids);
  IF v_found <> array_length(p_derived_ids, 1) THEN
    RAISE EXCEPTION 'Unknown derived fit';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _pm_remove_pairs (
    interchange_group_id uuid NOT NULL,
    vehicle_catalog_id uuid NOT NULL,
    PRIMARY KEY (interchange_group_id, vehicle_catalog_id)
  ) ON COMMIT DROP;
  TRUNCATE _pm_remove_pairs;
  INSERT INTO _pm_remove_pairs (interchange_group_id, vehicle_catalog_id)
  SELECT DISTINCT d.interchange_group_id, d.vehicle_catalog_id
  FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids);

  INSERT INTO public.part_listing_exclusion (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    reason, evidence_url, source, created_by
  )
  SELECT
    d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    coalesce(nullif(btrim(p_note), ''), 'Removed derived fit'),
    NULL, 'auto_match_removed', p_actor
  FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.part_fit_derived d
  WHERE d.id = ANY (p_derived_ids);

  FOR v_pair IN SELECT * FROM _pm_remove_pairs LOOP
    PERFORM public.part_match_recompute(v_pair.interchange_group_id, v_pair.vehicle_catalog_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_derived_remove_batch(uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_derived_remove_batch(uuid[], uuid, text) TO service_role;
`;

const proof = `
-- Proof X7: part edit triggering index merge completes without stack depth error
DO $$
DECLARE
  v_group uuid := 'a9000006-0000-4000-8000-000000000002';
BEGIN
  PERFORM public.part_match_recompute(v_group, 'a9000005-0000-4000-8000-000000000003');
  UPDATE public.part_master SET manufacturer = manufacturer WHERE id = 'a9000007-0000-4000-8000-000000000002';
  PERFORM public.part_match_index_rules(v_group);
  PERFORM public.part_match_recompute(v_group, 'a9000005-0000-4000-8000-000000000003');
END $$;
`;

fs.writeFileSync(
  "supabase/migrations/20261105100000_parts_auto_match_rev12_hotfix.sql",
  header + removeBatch + "\n\n" + pairs + "\n\n" + recompute + "\n\n" + undo + "\n\n" + buffered + "\n\n" + triggers + proof,
);

console.log("wrote hotfix migration");
