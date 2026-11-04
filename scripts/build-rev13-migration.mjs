import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const hotfix = fs.readFileSync(
  path.join(repo, "supabase/migrations/20261105100000_parts_auto_match_rev12_hotfix.sql"),
  "utf8",
);
const rev11 = fs.readFileSync(
  path.join(repo, "supabase/migrations/20261104120000_parts_auto_match_rev11_engine.sql"),
  "utf8",
);

function extract(fnName, sql) {
  const re = new RegExp(
    `(CREATE OR REPLACE FUNCTION public\\.${fnName}\\([\\s\\S]*?\\n\\$\\$;)`,
  );
  const m = sql.match(re);
  if (!m) throw new Error(`missing ${fnName}`);
  return m[1];
}

const matRe =
  /(CREATE MATERIALIZED VIEW public\.variant_parts_readiness AS[\s\S]*?GRANT ALL ON TABLE public\.variant_parts_readiness TO service_role;)/;
const matM = rev11.match(matRe);
if (!matM) throw new Error("matview missing");
const matview = matM[1];

let pairs = extract("part_match_recompute_pairs", hotfix);
pairs = pairs.replace(
  /\s+AND NOT EXISTS \(\s+SELECT 1 FROM public\.part_listing pl\s+WHERE pl\.interchange_group_id = sp\.group_id\s+AND pl\.vehicle_catalog_id = sp\.vehicle_id\s+AND NOT public\.part_side_covers\(pl\.position, pl\.side, von\.position, von\.side\)\s+\)/s,
  "",
);
pairs = pairs.replace(
  /public\.part_match_derived_status_for\(sp\.group_id, sp\.vehicle_id, von\.id\)/g,
  "'live'::text",
);
pairs = pairs.replace(
  /status, engine_version, computed_at, checking_note, archive_reason, superseded_by_engine_version\s+\)\s+SELECT\s+tr\.id,/,
  "status, engine_version, computed_at, checking_note, archive_reason, removal_cause, superseded_by_engine_version\n    )\n    SELECT\n      tr.id,",
);
pairs = pairs.replace(
  /tr\.checking_note, 'removed', v_engine\s+FROM to_remove/,
  "tr.checking_note, 'removed', 'scope_removed', v_engine\n    FROM to_remove",
);

let recompute = extract("part_match_recompute", hotfix);
const refreshBlock = `
    PERFORM public.part_match_refresh_derived_status(p_group_id, p_vehicle_id);
    PERFORM public.part_match_apply_suppression(p_group_id, p_vehicle_id);`;
recompute = recompute.replace(
  /PERFORM public\.part_match_sync_conflicts\(NULL, NULL\);/,
  `PERFORM public.part_match_sync_conflicts(NULL, NULL);${refreshBlock}`,
);
recompute = recompute.replace(
  /PERFORM public\.part_match_sync_conflicts\(p_group_id, p_vehicle_id\);/,
  `PERFORM public.part_match_sync_conflicts(p_group_id, p_vehicle_id);${refreshBlock}`,
);

let undo = extract("part_import_undo", hotfix);
undo = undo.replace(
  /ELSIF c\.table_name = 'interchange_group_merge_log' THEN\s+IF EXISTS \(\s+SELECT 1 FROM public\.part_match_conflict pc WHERE pc\.status = 'kept'\s+\) THEN\s+CONTINUE;\s+END IF;/s,
  `ELSIF c.table_name = 'interchange_group_merge_log' THEN
        IF EXISTS (
          SELECT 1 FROM public.interchange_group_merge_log ml
          JOIN public.part_match_conflict pc ON pc.id = ml.conflict_id
          WHERE ml.id = c.row_id AND pc.status = 'kept'
        ) THEN
          CONTINUE;
        END IF;`,
);

const header = `-- Parts auto-matching Rev 13 closeout (audit X8, X2, X4, status timing)
-- Depends on 20261105120000_parts_auto_match_rev12_audit.sql

CREATE OR REPLACE FUNCTION public.part_match_refresh_derived_status(
  p_group_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scoped boolean := false;
BEGIN
  BEGIN
    v_scoped := EXISTS (SELECT 1 FROM _pm_scope LIMIT 1);
  EXCEPTION WHEN undefined_table THEN
    v_scoped := false;
  END;
  IF NOT v_scoped THEN
    BEGIN
      v_scoped := EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1);
    EXCEPTION WHEN undefined_table THEN
      v_scoped := false;
    END;
  END IF;

  UPDATE public.part_fit_derived d
  SET status = public.part_match_derived_status_for(
    d.interchange_group_id, d.vehicle_catalog_id, d.vehicle_oe_number_id
  )
  WHERE d.status <> 'suppressed'
    AND (
      (NOT v_scoped AND (p_group_id IS NULL OR d.interchange_group_id = p_group_id)
        AND (p_vehicle_id IS NULL OR d.vehicle_catalog_id = p_vehicle_id))
      OR (v_scoped AND EXISTS (
        SELECT 1 FROM _pm_scope sp
        WHERE sp.group_id = d.interchange_group_id AND sp.vehicle_id = d.vehicle_catalog_id
      ))
      OR (v_scoped AND EXISTS (
        SELECT 1 FROM _pm_batch_scope bs
        WHERE bs.group_id = d.interchange_group_id AND bs.vehicle_catalog_id = d.vehicle_catalog_id
      ))
    );
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_refresh_derived_status(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_refresh_derived_status(uuid, uuid) TO service_role;


`;

const footer = `

DROP MATERIALIZED VIEW IF EXISTS public.variant_parts_readiness;

${matview}

REFRESH MATERIALIZED VIEW public.variant_parts_readiness;
`;

const out = `${header}\n\n${pairs}\n\n\n\n${recompute}\n\n\n\n${undo}${footer}\n`;
const outPath = path.join(
  repo,
  "supabase/migrations/20261106120000_parts_auto_match_rev13_closeout.sql",
);
fs.writeFileSync(outPath, out);
console.log("Wrote", outPath, out.length, "bytes");
