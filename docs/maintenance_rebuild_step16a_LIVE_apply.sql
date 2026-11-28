-- Build step 16a: Roam's own timed default rules have no car maker's manual behind them,
-- so they have no hard-use figure. Their figures are already set for hard use (oil every
-- 5,000 km is shorter than Toyota's own hard-use 7,500 km), so a hard-use car keeps them.
-- Owner decision 28 Nov 2026: tick "same as normal" on every one. No shorter figure is invented.
--
-- Touches only global Roam-policy rules that fall due on a timer and have no hard-use figure.
-- Car-maker rules, "as needed" jobs and any rule that already has a figure are left alone.
-- No due date changes: the tick only matters for a hard-use car, and the result is the same.

UPDATE public.maintenance_task_templates
SET severe_same_as_normal = true,
    updated_at = now()
WHERE template_scope = 'global'
  AND source_type = 'roam_policy'
  AND archived_at IS NULL
  AND status = 'active'
  AND coalesce(frequency_kind, 'recurring') = 'recurring'
  AND severe_interval_km IS NULL
  AND severe_interval_km_max IS NULL
  AND severe_interval_months IS NULL
  AND NOT coalesce(severe_same_as_normal, false);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261128004417', 'mm_roam_defaults_same_as_normal') ON CONFLICT (version) DO NOTHING;
