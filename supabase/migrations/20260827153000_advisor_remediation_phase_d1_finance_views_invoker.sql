-- Advisor remediation Phase D1: finance/sensitive views → security_invoker + revoke anon SELECT
-- Edge/service_role paths are unaffected. Base-table RLS applies once invoker is on.

DO $$
DECLARE
  v text;
  views text[] := ARRAY[
    'financial_events',
    'driver_financial_periods',
    'driver_financial_period_lines',
    'fleet_toll_ledger',
    'fleet_payment_ledger_lines',
    'fleet_driver_period_snapshots',
    'fleet_expense_journal',
    'fleet_transactions',
    'fleet_bank_statements',
    'fleet_bank_confirmations',
    'fleet_expense_payments',
    'fleet_expense_documents'
  ];
BEGIN
  FOREACH v IN ARRAY views
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v'
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', v);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', v);
    END IF;
  END LOOP;
END $$;
