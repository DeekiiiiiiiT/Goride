-- R19-01: week blockers keep one row per source and carry their amounts.
-- Two "no activity" sources used to share one (code) slot, so the whole
-- week-level insert failed and Close showed a blocker no step listed.
-- Old worker images still insert without source_id; that keeps the old,
-- stricter uniqueness for them, so this is safe to apply before the deploy.

ALTER TABLE recon.week_blockers
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS persisted numeric,
  ADD COLUMN IF NOT EXISTS expected numeric,
  ADD COLUMN IF NOT EXISTS delta numeric;

DROP INDEX IF EXISTS recon.week_blockers_unit_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS week_blockers_unit_uidx
  ON recon.week_blockers (organization_id, week_key, service_line, driver_id, code, source_id)
  NULLS NOT DISTINCT;

COMMENT ON COLUMN recon.week_blockers.source_id IS
  'Recon source a SOURCE_* blocker is about. Null for driver and week money checks.';
