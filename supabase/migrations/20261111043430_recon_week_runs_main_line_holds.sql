-- Week Reconciliation Round 1: main_line on week_runs + publish holds (WRA-11, WRA-27).

-- orgMainLine(profile): rideshare when Rideshare is in service_lines, else rush_delivery.
CREATE OR REPLACE FUNCTION recon.org_main_line(p_org text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(
      array_length(o.service_lines, 1),
      0
    ) = 0 THEN 'rideshare'
    WHEN 'rideshare' = ANY (o.service_lines) THEN 'rideshare'
    ELSE 'rush_delivery'
  END
  FROM public.organizations o
  WHERE o.id::text = p_org
  LIMIT 1;
$$;

COMMENT ON FUNCTION recon.org_main_line(text) IS
  'Frozen tag-account desk line at run creation; matches orgMainLine in reconSources.';

ALTER TABLE recon.week_runs
  ADD COLUMN IF NOT EXISTS main_line text;

UPDATE recon.week_runs wr
SET main_line = COALESCE(recon.org_main_line(wr.organization_id), 'rideshare')
WHERE wr.main_line IS NULL;

ALTER TABLE recon.week_runs
  ALTER COLUMN main_line SET NOT NULL;

ALTER TABLE recon.week_runs
  DROP CONSTRAINT IF EXISTS week_runs_main_line_check;

ALTER TABLE recon.week_runs
  ADD CONSTRAINT week_runs_main_line_check
  CHECK (main_line IN ('rideshare', 'rush_delivery'));

CREATE OR REPLACE FUNCTION recon.tg_week_runs_main_line_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.main_line IS NOT NULL
    AND NEW.main_line IS DISTINCT FROM OLD.main_line THEN
    RAISE EXCEPTION 'week_runs.main_line cannot change after it is set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS week_runs_main_line_immutable ON recon.week_runs;

CREATE TRIGGER week_runs_main_line_immutable
  BEFORE UPDATE ON recon.week_runs
  FOR EACH ROW
  EXECUTE FUNCTION recon.tg_week_runs_main_line_immutable();

ALTER TABLE recon.week_runs
  ALTER COLUMN version SET DEFAULT 1;

ALTER TABLE recon.week_runs
  ALTER COLUMN version SET NOT NULL;

CREATE TABLE IF NOT EXISTS recon.week_publish_holds (
  run_id uuid PRIMARY KEY
    REFERENCES recon.week_runs (id) ON DELETE CASCADE,
  hold_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE recon.week_publish_holds IS
  'Per-run calculator publish hold (2 min user activity). WRA-27.';

INSERT INTO recon.week_publish_holds (run_id, hold_until, updated_at)
SELECT id, NULL, now()
FROM recon.week_runs
ON CONFLICT (run_id) DO NOTHING;

ALTER TABLE recon.week_publish_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS week_publish_holds_org_select ON recon.week_publish_holds;

CREATE POLICY week_publish_holds_org_select ON recon.week_publish_holds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM recon.week_runs w
      WHERE w.id = run_id
        AND w.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')
    )
  );

REVOKE ALL ON recon.week_publish_holds FROM PUBLIC;
GRANT SELECT ON recon.week_publish_holds TO authenticated;
GRANT ALL ON recon.week_publish_holds TO service_role;

NOTIFY pgrst, 'reload schema';
