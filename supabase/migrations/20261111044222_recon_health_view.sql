-- WRA-31: calculator and week health for alerts (Round 2 route reads with service_role).

DROP VIEW IF EXISTS public.recon_health;

CREATE OR REPLACE VIEW recon.health
WITH (security_invoker = true)
AS
SELECT
  orgs.organization_id,
  wc.emergency_off AS calculator_paused,
  wc.updated_at AS calculator_paused_since,
  coalesce(pend.pending_units, 0)::bigint AS pending_units,
  pend.oldest_pending_age_seconds,
  pub.last_open_desk_computed_at,
  coalesce(appr.pending_approvals_over_24h, 0)::bigint AS pending_approvals_over_24h,
  coalesce(stale.open_runs_over_14_days, 0)::bigint AS open_runs_over_14_days,
  NULL::numeric AS reject_rate_24h,
  NULL::numeric AS failure_rate_24h
FROM (
  SELECT organization_id
  FROM recon.week_runs
  UNION
  SELECT organization_id
  FROM recon.projection_state
) orgs
CROSS JOIN recon.worker_control wc
LEFT JOIN LATERAL (
  SELECT
    count(*)::bigint AS pending_units,
    extract(epoch FROM (now() - min(ps.updated_at)))::bigint AS oldest_pending_age_seconds
  FROM recon.projection_state ps
  WHERE ps.organization_id = orgs.organization_id
    AND ps.status = 'pending'
) pend ON true
LEFT JOIN LATERAL (
  SELECT max(wr.desk_computed_at) AS last_open_desk_computed_at
  FROM recon.week_runs wr
  WHERE wr.organization_id = orgs.organization_id
    AND wr.state IS DISTINCT FROM 'closed'
) pub ON true
LEFT JOIN LATERAL (
  SELECT count(*)::bigint AS pending_approvals_over_24h
  FROM recon.run_events re
  JOIN recon.week_runs wr ON wr.id = re.run_id
  WHERE wr.organization_id = orgs.organization_id
    AND re.status = 'pending_approval'
    AND re.at < now() - interval '24 hours'
) appr ON true
LEFT JOIN LATERAL (
  SELECT count(*)::bigint AS open_runs_over_14_days
  FROM recon.week_runs wr
  WHERE wr.organization_id = orgs.organization_id
    AND wr.state IS DISTINCT FROM 'closed'
    AND wr.service_line IN (
      SELECT recon.active_recon_lines(wr.organization_id)
    )
    AND (wr.week_key + 6) < recon.fleet_today() - 14
) stale ON true
WHERE wc.id = 1;

COMMENT ON VIEW recon.health IS
  'Per-org recon calculator health. reject_rate_24h and failure_rate_24h need Round 2 HTTP telemetry.';

GRANT SELECT ON recon.health TO service_role;

NOTIFY pgrst, 'reload schema';
