-- D1 (F-03 table only): fuel.week_lines — schema + RLS. No writer.

CREATE TABLE IF NOT EXISTS fuel.week_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  period_id text NOT NULL,
  week_start date NOT NULL,
  vehicle_id text NOT NULL,
  driver_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN (
    'uber_trips', 'to_pickups', 'company_errands', 'personal', 'personal_allowance',
    'commute', 'unexplained_km', 'no_odometer_fills'
  )),
  -- 0 km only for a line not priced by km (no-odometer fills, or a week with no distance).
  km numeric NOT NULL CHECK (km >= 0),
  -- Exact cost per km in minor units (J$ × 100, unrounded): each line is priced from the
  -- full value (prompt "FOR CLAUDE": J$24,500 ÷ 1,503 = J$16.300732/km), not from J$16.30.
  -- Null for a line not priced by km.
  cost_per_km_minor numeric CHECK (cost_per_km_minor IS NULL OR cost_per_km_minor > 0),
  driver_pct numeric NOT NULL CHECK (driver_pct >= 0 AND driver_pct <= 100),
  -- A part may be J$0.00 (commute: company pays all; personal: driver pays all), but the line
  -- is never empty, so the week's lines still add up to the fuel bought.
  driver_amount_minor bigint NOT NULL CHECK (driver_amount_minor >= 0),
  company_amount_minor bigint NOT NULL CHECK (company_amount_minor >= 0),
  CONSTRAINT fuel_week_lines_amount_positive CHECK (driver_amount_minor + company_amount_minor > 0),
  policy_version_id uuid,
  engine_version text NOT NULL,
  -- Set when the week is reopened: the line is kept, never edited or deleted (F-03, F-32).
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_week_lines_reversal_complete CHECK (
    (reversed_by IS NULL AND reversed_at IS NULL) OR (reversed_by IS NOT NULL AND reversed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS fuel_week_lines_org_week_idx
  ON fuel.week_lines (org_id, week_start);

CREATE INDEX IF NOT EXISTS fuel_week_lines_period_idx
  ON fuel.week_lines (org_id, period_id);

ALTER TABLE fuel.week_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY fuel_week_lines_org_select ON fuel.week_lines
  FOR SELECT TO authenticated
  USING (
    -- app_metadata only (users can edit user_metadata themselves); same as toll_read.current_company().
    org_id = COALESCE(
      NULLIF(auth.jwt() -> 'app_metadata' ->> 'organizationId', ''),
      NULLIF(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')
    )
  );

COMMENT ON TABLE fuel.week_lines IS
  'Fuel money lines per car × purpose × locked week (v3+). Writer is separate; forward-only, no backfill.';

GRANT SELECT ON fuel.week_lines TO authenticated;
GRANT ALL ON fuel.week_lines TO service_role;