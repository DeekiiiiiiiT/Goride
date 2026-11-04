import fs from "node:fs";

const rev11 = fs.readFileSync(
  "supabase/migrations/20261104120000_parts_auto_match_rev11_engine.sql",
  "utf8",
);
const baseM = fs.readFileSync(
  "supabase/migrations/20261102210000_parts_auto_match.sql",
  "utf8",
);

function sliceFn(src, name, nextName) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = src.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start);
  if (start < 0 || end < 0) throw new Error(`slice ${name}`);
  return src.slice(start, end);
}

let indexRules = sliceFn(rev11, "part_match_index_rules", "part_match_archive_derived_changes");
indexRules = indexRules.replace(
  "      AND pm.interchange_group_id IS NOT NULL\n      AND pm2.interchange_group_id IS NOT NULL",
  "      AND (pm.interchange_group_id IS NOT NULL OR pm2.interchange_group_id IS NOT NULL)",
);
indexRules = indexRules.replace(
  `    FROM merge_pairs mp
    WHERE EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND gb.busy)
      AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND gb.busy)
    ON CONFLICT DO NOTHING`,
  `    FROM merge_pairs mp
    WHERE (
      (EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND gb.busy)
        AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND gb.busy))
      OR (
        (EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND gb.busy)
          AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND NOT gb.busy))
        OR (EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.from_group AND NOT gb.busy)
          AND EXISTS (SELECT 1 FROM group_busy gb WHERE gb.group_id = mp.to_group AND gb.busy))
      )
    )
    ON CONFLICT DO NOTHING`,
);
indexRules = indexRules.replace(
  `    JOIN group_busy gb_from ON gb_from.group_id = mp.from_group AND NOT gb_from.busy
    JOIN group_busy gb_to ON gb_to.group_id = mp.to_group AND NOT gb_to.busy`,
  `    JOIN group_busy gb_from ON gb_from.group_id = mp.from_group AND NOT gb_from.busy
    JOIN group_busy gb_to ON gb_to.group_id = mp.to_group AND NOT gb_to.busy
    WHERE NOT (
      (gb_from.busy AND NOT gb_to.busy) OR (NOT gb_from.busy AND gb_to.busy)
    )`,
);
indexRules = indexRules.replace(
  `      AND (p_group_id IS NULL OR pm.interchange_group_id = p_group_id OR pm2.interchange_group_id = p_group_id)`,
  `      AND (
        p_group_id IS NOT NULL AND (pm.interchange_group_id = p_group_id OR pm2.interchange_group_id = p_group_id)
        OR p_group_id IS NULL AND (
          NOT EXISTS (SELECT 1 FROM _pm_batch_scope LIMIT 1)
          OR EXISTS (
            SELECT 1 FROM _pm_batch_scope bs
            WHERE bs.group_id IN (pm.interchange_group_id, pm2.interchange_group_id)
          )
        )
      )`,
);

const archive = `CREATE OR REPLACE FUNCTION public.part_match_archive_derived_changes(
  p_new_engine_version integer
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

  INSERT INTO public.part_fit_derived_archive (
    derived_id, interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to,
    rule, matched_keys, vehicle_oe_number_id, part_oe_reference_ids, reason_code, reason_params,
    status, engine_version, computed_at, checking_note, archive_reason, removal_cause, superseded_by_engine_version
  )
  SELECT
    d.id, d.interchange_group_id, d.vehicle_catalog_id, d.position, d.side, d.year_from, d.year_to,
    d.rule, d.matched_keys, d.vehicle_oe_number_id, d.part_oe_reference_ids, d.reason_code, d.reason_params,
    d.status, d.engine_version, d.computed_at, d.checking_note,
    CASE WHEN d.engine_version IS DISTINCT FROM p_new_engine_version THEN 'changed' ELSE 'removed' END,
    CASE WHEN d.engine_version IS DISTINCT FROM p_new_engine_version THEN 'engine_version_bump' ELSE 'scope_removed' END,
    p_new_engine_version
  FROM public.part_fit_derived d
  WHERE (
    NOT v_scoped
    AND d.engine_version IS DISTINCT FROM p_new_engine_version
  ) OR (
    v_scoped AND EXISTS (
      SELECT 1 FROM _pm_scope sp
      WHERE sp.group_id = d.interchange_group_id AND sp.vehicle_id = d.vehicle_catalog_id
    )
    AND d.engine_version IS DISTINCT FROM p_new_engine_version
  ) OR (
    v_scoped AND NOT EXISTS (SELECT 1 FROM _pm_scope LIMIT 1)
    AND EXISTS (
      SELECT 1 FROM _pm_batch_scope bs
      WHERE bs.group_id = d.interchange_group_id AND bs.vehicle_id = d.vehicle_catalog_id
    )
    AND d.engine_version IS DISTINCT FROM p_new_engine_version
  );
END;
$$;
`;

let partsForVehicle = rev11.slice(
  rev11.indexOf("CREATE OR REPLACE FUNCTION public.parts_for_vehicle"),
  rev11.indexOf("CREATE MATERIALIZED VIEW public.variant_parts_readiness"),
);
if (!partsForVehicle.includes("universal")) {
  partsForVehicle = partsForVehicle.replace(
    "  hits AS (",
    `  universal_hits AS (
    SELECT
      up.part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'universal'::text AS rule_source,
      up.position,
      pm.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      4 AS tier,
      NULL::text AS source_make,
      up.evidence_url,
      'universal'::text AS fit_source,
      'universal'::text AS via,
      'live'::text AS match_status,
      'universal_part'::text AS match_reason_code,
      jsonb_build_object('universal_part_id', up.id) AS match_reason_params,
      up.side,
      NULL::uuid AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      NULL::text AS checking_note
    FROM public.universal_part up
    JOIN public.part_master pm ON pm.id = up.part_id
    JOIN public.part_interchange_group g ON g.id = pm.interchange_group_id
    JOIN cat ON true
    WHERE up.active = true
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT public.part_listing_exclusion_blocks(
        pm.interchange_group_id, cat.id, up.position, up.side, cat.match_year
      )
  ),
  sister_derived AS (
    SELECT
      pm.id AS part_id,
      pm.name AS part_name,
      pm.oem_part_number,
      pm.manufacturer,
      pm.part_kind,
      g.fit_scope,
      'derived'::text AS rule_source,
      d.position,
      d.interchange_group_id,
      pm.maintenance_component_id,
      pm.category_id,
      pm.description,
      2 AS tier,
      (src.make || ' ' || src.model) AS source_make,
      NULL::text AS evidence_url,
      'derived'::text AS fit_source,
      'sister'::text AS via,
      d.status AS match_status,
      d.reason_code AS match_reason_code,
      d.reason_params AS match_reason_params,
      d.side,
      d.id AS derived_id,
      (SELECT pin.value FROM public.part_index_number pin WHERE pin.part_id = pm.id AND pin.index_type = 'wva' ORDER BY pin.created_at DESC LIMIT 1) AS wva,
      d.checking_note
    FROM public.part_fit_derived d
    JOIN public.vehicle_catalog src ON src.id = d.vehicle_catalog_id
    JOIN cat ON true
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    JOIN public.part_interchange_group g ON g.id = d.interchange_group_id
    WHERE public.parts_auto_match_enabled()
      AND d.status IN ('live', 'needs_checking')
      AND d.vehicle_catalog_id <> cat.id
      AND src.platform_id IN (SELECT id FROM family)
      AND lower(src.make || ' ' || src.model) <> lower(cat.make || ' ' || cat.model)
      AND (p_component_id IS NULL OR pm.maintenance_component_id = p_component_id)
      AND NOT public.part_listing_exclusion_blocks(
        d.interchange_group_id, cat.id, d.position, d.side, cat.match_year
      )
      AND (
        d.year_from IS NULL OR cat.match_year IS NULL OR cat.match_year >= d.year_from
      )
      AND (
        d.year_to IS NULL OR cat.match_year IS NULL OR cat.match_year <= d.year_to
      )
  ),
  hits AS (`,
  );
  partsForVehicle = partsForVehicle.replace(
    "    SELECT * FROM listing_hits\n    UNION ALL\n    SELECT * FROM derived_hits\n    UNION ALL\n    SELECT * FROM link_tier3_hits",
    `    SELECT * FROM listing_hits
    UNION ALL
    SELECT * FROM derived_hits
    UNION ALL
    SELECT * FROM sister_derived
    UNION ALL
    SELECT * FROM link_tier3_hits
    UNION ALL
    SELECT * FROM universal_hits`,
  );
}
partsForVehicle = partsForVehicle.replace(
  "  LEFT JOIN badges b ON b.part_id = h.part_id;\n$$;",
  `  LEFT JOIN badges b ON b.part_id = h.part_id
  ORDER BY h.tier ASC NULLS LAST, h.part_name ASC NULLS LAST, h.position ASC NULLS LAST, h.side ASC NULLS LAST;
$$;`,
);

let health = baseM.slice(
  baseM.indexOf("CREATE OR REPLACE FUNCTION public.part_match_health"),
  baseM.indexOf("REVOKE ALL ON FUNCTION public.part_norm_position_report_resolve"),
);
health = health.replace(
  `'tierBreakdown', CASE
      WHEN p_vehicle_id IS NULL THEN '{}'::jsonb
      ELSE (`,
  `'tierBreakdown', (`,
);
health = health.replace(
  `        ) t
      )
    END,`,
  `        ) t
      ),`,
);
health = health.replace(
  "FROM public.parts_for_vehicle(p_vehicle_id, NULL, NULL) p",
  "FROM public.parts_for_vehicle(coalesce(p_vehicle_id, (SELECT id FROM public.vehicle_catalog ORDER BY id LIMIT 1)), NULL, NULL) p\n          WHERE p_vehicle_id IS NULL OR true",
);

let syncConflicts = sliceFn(baseM, "part_match_sync_conflicts", "part_match_conflict_keep");
syncConflicts = syncConflicts.replace(
  `    AND c.matched_key IS NOT DISTINCT FROM src.oe_number_norm
    AND NOT EXISTS (`,
  `    AND c.matched_key IS NOT DISTINCT FROM src.oe_number_norm
    AND (
      c.detail IS DISTINCT FROM src.detail
      OR c.vehicle_oe_number_id IS DISTINCT FROM src.vehicle_oe_number_id
      OR c.matched_key IS DISTINCT FROM src.oe_number_norm
    )
    AND NOT EXISTS (`,
);

const keepOnConflict = `        WHERE public.part_listing.origin IS DISTINCT FROM 'manual'
          AND public.part_listing.origin IS DISTINCT FROM 'import';`;

let conflictKeep = rev11.slice(
  rev11.indexOf("CREATE OR REPLACE FUNCTION public.part_match_conflict_keep"),
  rev11.indexOf("CREATE OR REPLACE FUNCTION public.parts_for_vehicle"),
);
if (!conflictKeep.includes("'import'")) {
  conflictKeep = conflictKeep.replace(
    "        WHERE public.part_listing.origin IS DISTINCT FROM 'manual';",
    keepOnConflict,
  );
}

const cleanup = `
CREATE OR REPLACE FUNCTION public.part_match_retention_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.part_match_recompute_log
  WHERE started_at < now() - interval '90 days';
  DELETE FROM public.part_match_recompute_checkpoint
  WHERE started_at < now() - interval '90 days';
  DELETE FROM public.part_fit_derived_archive
  WHERE computed_at < now() - interval '90 days';
END;
$$;

REVOKE ALL ON FUNCTION public.part_match_retention_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.part_match_retention_cleanup() TO service_role;
`;

const schema = `
ALTER TABLE public.interchange_group_merge_log
  ALTER COLUMN from_group DROP NOT NULL;

ALTER TABLE public.interchange_group_merge_log
  DROP CONSTRAINT IF EXISTS interchange_group_merge_log_distinct;

ALTER TABLE public.interchange_group_merge_log
  ADD CONSTRAINT interchange_group_merge_log_distinct
  CHECK (from_group IS NULL OR from_group <> to_group);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'part-match-retention-cleanup';
    PERFORM cron.schedule(
      'part-match-retention-cleanup',
      '15 4 * * 0',
      $$SELECT public.part_match_retention_cleanup();$$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'part-match-retention-cleanup cron skipped: %', SQLERRM;
END $$;
`;

const listingTrigger = `
CREATE OR REPLACE FUNCTION public.part_match_trg_listing_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('part_match.busy', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.part_norm_position_backfill_report r
    SET resolved_at = now(), resolved_by = NEW.verified_by
    WHERE r.resolved_at IS NULL
      AND r.listing_id = NEW.id
      AND (OLD.position IS DISTINCT FROM NEW.position OR OLD.side IS DISTINCT FROM NEW.side);
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _pm_batch_scope (
    group_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    PRIMARY KEY (group_id, vehicle_id)
  ) ON COMMIT DROP;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT n.interchange_group_id AS gid, n.vehicle_catalog_id AS vid FROM new_rows n
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    INSERT INTO _pm_batch_scope (group_id, vehicle_id)
    SELECT DISTINCT s.gid, s.vid
    FROM (
      SELECT o.interchange_group_id AS gid, o.vehicle_catalog_id AS vid FROM old_rows o
    ) s
    WHERE s.gid IS NOT NULL AND s.vid IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.part_match_recompute_buffered();
  RETURN NULL;
END; $$;
`;

const header = `-- Parts auto-matching Rev 12 audit (engine + read models)
-- Depends on 20261105100000_parts_auto_match_rev12_hotfix.sql

`;

fs.writeFileSync(
  "supabase/migrations/20261105120000_parts_auto_match_rev12_audit.sql",
  [
    header,
    schema,
    archive,
    indexRules,
    conflictKeep,
    syncConflicts,
    health,
    "DROP FUNCTION IF EXISTS public.parts_for_vehicle(uuid, uuid, integer);\n",
    partsForVehicle,
    cleanup,
    listingTrigger,
  ].join("\n\n"),
);

console.log("wrote rev12 audit migration");
