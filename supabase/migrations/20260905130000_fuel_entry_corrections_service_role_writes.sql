-- Fuel entry corrections: writes are service-role only via the edge function
-- (fuel_controller sealed-edit path). Authenticated JWT clients keep SELECT
-- for org-scoped history reads; direct PostgREST INSERT is not allowed.
--
-- Requires 20260905120000_fuel_entry_corrections.sql first (creates the table).
-- Safe no-op if that migration has not been applied yet.

DO $$
BEGIN
  IF to_regclass('public.fuel_entry_corrections') IS NULL THEN
    RAISE NOTICE 'fuel_entry_corrections missing — apply 20260905120000_fuel_entry_corrections first';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS fuel_entry_corrections_org_insert ON public.fuel_entry_corrections;

  COMMENT ON TABLE public.fuel_entry_corrections IS
    'Append-only audit of corrections to locked/signed fuel entries. SELECT: org JWT. INSERT: service role / edge function only.';
END $$;
