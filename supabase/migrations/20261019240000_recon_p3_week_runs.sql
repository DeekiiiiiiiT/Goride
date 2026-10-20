-- Week Reconciliation P3: persisted runs, sources, steps, events (audit §4.4).

CREATE TABLE IF NOT EXISTS recon.week_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  service_line text NOT NULL CHECK (service_line IN ('rideshare', 'rush_delivery')),
  week_key date NOT NULL CHECK (extract(isodow FROM week_key) = 1),
  state text NOT NULL DEFAULT 'collecting'
    CHECK (state IN ('collecting', 'reconciling', 'ready_to_close', 'closed', 'reopened')),
  version bigint NOT NULL DEFAULT 1,
  opened_by text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by text,
  close_run_id uuid REFERENCES ledger.week_close_runs (id),
  UNIQUE (organization_id, service_line, week_key)
);

CREATE INDEX IF NOT EXISTS recon_week_runs_org_line_week_idx
  ON recon.week_runs (organization_id, service_line, week_key DESC);

CREATE TABLE IF NOT EXISTS recon.run_sources (
  run_id uuid NOT NULL REFERENCES recon.week_runs (id) ON DELETE CASCADE,
  source_id text NOT NULL,
  requirement text NOT NULL CHECK (requirement IN ('required', 'optional', 'not_applicable')),
  status text NOT NULL CHECK (status IN (
    'missing', 'partial', 'received', 'attested_none', 'waived', 'waiting_external', 'not_applicable'
  )),
  coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_hash text,
  row_count int,
  amount_minor bigint,
  attested_by text,
  attested_at timestamptz,
  attest_reason text,
  PRIMARY KEY (run_id, source_id)
);

CREATE TABLE IF NOT EXISTS recon.run_steps (
  run_id uuid NOT NULL REFERENCES recon.week_runs (id) ON DELETE CASCADE,
  step_id text NOT NULL,
  actionable int NOT NULL DEFAULT 0,
  informational int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  completed_by text,
  inputs_hash_at_complete text,
  PRIMARY KEY (run_id, step_id)
);

CREATE TABLE IF NOT EXISTS recon.run_events (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES recon.week_runs (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS recon_run_events_run_at_idx
  ON recon.run_events (run_id, at DESC);

-- RLS: authenticated org-scoped SELECT; mutations via service role (edge).
ALTER TABLE recon.week_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recon.run_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE recon.run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE recon.run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recon_week_runs_org_select ON recon.week_runs;
CREATE POLICY recon_week_runs_org_select ON recon.week_runs
  FOR SELECT TO authenticated
  USING (
    organization_id = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

DROP POLICY IF EXISTS recon_run_sources_org_select ON recon.run_sources;
CREATE POLICY recon_run_sources_org_select ON recon.run_sources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recon.week_runs w
      WHERE w.id = run_id
        AND w.organization_id = COALESCE(
          (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
          (auth.jwt() -> 'user_metadata' ->> 'organization_id')
        )
    )
  );

DROP POLICY IF EXISTS recon_run_steps_org_select ON recon.run_steps;
CREATE POLICY recon_run_steps_org_select ON recon.run_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recon.week_runs w
      WHERE w.id = run_id
        AND w.organization_id = COALESCE(
          (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
          (auth.jwt() -> 'user_metadata' ->> 'organization_id')
        )
    )
  );

DROP POLICY IF EXISTS recon_run_events_org_select ON recon.run_events;
CREATE POLICY recon_run_events_org_select ON recon.run_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recon.week_runs w
      WHERE w.id = run_id
        AND w.organization_id = COALESCE(
          (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
          (auth.jwt() -> 'user_metadata' ->> 'organization_id')
        )
    )
  );

REVOKE ALL ON recon.week_runs FROM PUBLIC;
REVOKE ALL ON recon.run_sources FROM PUBLIC;
REVOKE ALL ON recon.run_steps FROM PUBLIC;
REVOKE ALL ON recon.run_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE recon.run_events_id_seq FROM PUBLIC;

GRANT SELECT ON recon.week_runs TO authenticated;
GRANT SELECT ON recon.run_sources TO authenticated;
GRANT SELECT ON recon.run_steps TO authenticated;
GRANT SELECT ON recon.run_events TO authenticated;

GRANT ALL ON recon.week_runs TO service_role;
GRANT ALL ON recon.run_sources TO service_role;
GRANT ALL ON recon.run_steps TO service_role;
GRANT ALL ON recon.run_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE recon.run_events_id_seq TO service_role;

COMMENT ON TABLE recon.week_runs IS
  'One reconciliation run per org × service line × Monday week. Writes: service role only.';
COMMENT ON TABLE recon.run_sources IS
  'Materialized source requirements + coverage for a run. Writes: service role only.';
COMMENT ON TABLE recon.run_steps IS
  'Step completion snapshots (inputs hash at complete). Writes: service role only.';
COMMENT ON TABLE recon.run_events IS
  'Append-only run activity log. Writes: service role only.';

NOTIFY pgrst, 'reload schema';
