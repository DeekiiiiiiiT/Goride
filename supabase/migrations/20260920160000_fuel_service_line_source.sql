-- Phase 0: fuel/expense service-line attribution provenance.
-- See FUEL_SERVICE_LINE_SPLIT_AUDIT.md §3.2 and FUEL_SERVICE_LINE_SPLIT_DECISIONS.md.

ALTER TABLE fleet.fuel_entries
  ADD COLUMN IF NOT EXISTS service_line_source text,
  ADD COLUMN IF NOT EXISTS service_line_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_line_set_by uuid;

ALTER TABLE fleet.expense_journal
  ADD COLUMN IF NOT EXISTS service_line_source text,
  ADD COLUMN IF NOT EXISTS service_line_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_line_set_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fleet_fuel_entries_service_line_source_chk'
  ) THEN
    ALTER TABLE fleet.fuel_entries
      ADD CONSTRAINT fleet_fuel_entries_service_line_source_chk
      CHECK (
        service_line_source IS NULL
        OR service_line_source IN (
          'program', 'explicit', 'trip', 'vehicle', 'driver', 'unattributed'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fleet_expense_journal_service_line_source_chk'
  ) THEN
    ALTER TABLE fleet.expense_journal
      ADD CONSTRAINT fleet_expense_journal_service_line_source_chk
      CHECK (
        service_line_source IS NULL
        OR service_line_source IN (
          'program', 'explicit', 'trip', 'vehicle', 'driver', 'unattributed'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN fleet.fuel_entries.service_line_source IS
  'How service_line was resolved: program|explicit|trip|vehicle|driver|unattributed. explicit is sticky.';
COMMENT ON COLUMN fleet.fuel_entries.service_line_set_at IS
  'Set only when service_line_source = explicit.';
COMMENT ON COLUMN fleet.fuel_entries.service_line_set_by IS
  'Actor uuid when service_line_source = explicit.';

COMMENT ON COLUMN fleet.expense_journal.service_line_source IS
  'How service_line was resolved: program|explicit|trip|vehicle|driver|unattributed. explicit is sticky.';
COMMENT ON COLUMN fleet.expense_journal.service_line_set_at IS
  'Set only when service_line_source = explicit.';
COMMENT ON COLUMN fleet.expense_journal.service_line_set_by IS
  'Actor uuid when service_line_source = explicit.';

CREATE INDEX IF NOT EXISTS fleet_fuel_entries_org_service_line_date_idx
  ON fleet.fuel_entries (organization_id, service_line, date DESC);

CREATE INDEX IF NOT EXISTS fleet_expense_journal_org_service_line_idx
  ON fleet.expense_journal (organization_id, service_line);

-- Stale public.fleet_* views reject new columns on PostgREST upsert (see 20260902160000).
CREATE OR REPLACE VIEW public.fleet_fuel_entries AS
  SELECT * FROM fleet.fuel_entries;

CREATE OR REPLACE VIEW public.fleet_expense_journal AS
  SELECT * FROM fleet.expense_journal;

GRANT SELECT ON public.fleet_fuel_entries TO authenticated;
GRANT ALL ON public.fleet_fuel_entries TO service_role;

GRANT SELECT ON public.fleet_expense_journal TO authenticated;
GRANT ALL ON public.fleet_expense_journal TO service_role;

NOTIFY pgrst, 'reload schema';
