-- Deploy the new calculator image before applying this.
-- The previous image treats a week-picture job as a driver.

ALTER TABLE recon.week_runs
  ADD COLUMN IF NOT EXISTS desk_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS desk_computed_at timestamptz,
  ADD COLUMN IF NOT EXISTS desk_requested_at timestamptz;

COMMENT ON COLUMN recon.week_runs.desk_snapshot IS
  'Saved source cards, steps, and unassigned totals for the week screen. Close does not trust this.';
