-- Record the 21 migrations that were run by hand in the SQL editor (6–8 Nov 2026)
-- in Supabase's migration logbook (supabase_migrations.schema_migrations).
--
-- Touches ONLY the logbook. No tables, data or functions change.
-- First it checks that the three uncertain ones really are on live; if any check
-- fails, it stops with an error and nothing is written. Safe to run twice.

DO $$
DECLARE
  v_missing text := '';
BEGIN
  -- 20261107012459: part drawer marks platform twins Needs checking
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_catalog_master_part'
      AND p.prosrc LIKE '%Same body as a listed car; no source for this car yet%'
  ) THEN v_missing := v_missing || ' 20261107012459'; END IF;

  -- 20261107022905: history trigger only keeps parts-import batch ids
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_master_revision'
      AND p.prosrc LIKE '%part_import_batch b WHERE b.id = v_import%'
  ) THEN v_missing := v_missing || ' 20261107022905'; END IF;

  -- 20261107025603: Toyota Tank M900A has its brake specs
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_catalog
    WHERE id = 'a72af492-48f6-420f-92b3-69452f01c186'
      AND front_brake_type IS NOT NULL AND rear_brake_type IS NOT NULL
  ) THEN v_missing := v_missing || ' 20261107025603'; END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'Not on live yet:%. Nothing was written. Send this message to Claude.', v_missing;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES
    ('20261106194045', 'roomy_brakes_phase1_data'),
    ('20261106201235', 'roomy_brakes_phase2_part_types'),
    ('20261106204744', 'roomy_brakes_phase3a_trust'),
    ('20261107004225', 'roomy_brakes_phase3b_trust_labels'),
    ('20261107012459', 'roomy_brakes_phase4_admin_part_fits'),
    ('20261107022905', 'master_revision_import_batch_fk_fix'),
    ('20261107025603', 'roomy_brakes_phase5_sister_brake_specs'),
    ('20261107135127', 'add_part_genuine_saves_oem'),
    ('20261107142326', 'parts_readiness_refresh_in_background'),
    ('20261107143650', 'universal_section_all_spec_links'),
    ('20261107203849', 'add_part_default_name_from_type'),
    ('20261107205652', 'part_default_name_keep_capitals'),
    ('20261107212002', 'self_serve_part_lookup_add_more_prefill'),
    ('20261107213549', 'part_position_catalogue_number'),
    ('20261108003859', 'add_parts_catalog_page_batch'),
    ('20261108022115', 'vehicles_maker_logos_and_labels'),
    ('20261108024736', 'vehicles_makers_summary_and_difference_label'),
    ('20261108034937', 'readiness_uses_listing_trust'),
    ('20261108143040', 'fleet_maintenance_kpi_notifications_public_views'),
    ('20261108155655', 'admin_vehicles_dashboard'),
    ('20261108163024', 'revoke_trust_trigger_fns')
  ON CONFLICT (version) DO NOTHING;
END $$;

-- Should return 21 or more (other migrations in the same date range count too).
SELECT count(*) AS recorded
FROM supabase_migrations.schema_migrations
WHERE version BETWEEN '20261106194045' AND '20261108163024';
