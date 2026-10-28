-- Expose wallet tables via public views when `rides` schema is not in API exposed schemas.

CREATE OR REPLACE VIEW public.rides_payment_accounts AS
  SELECT * FROM rides.payment_accounts;

CREATE OR REPLACE VIEW public.rides_payment_journal_entries AS
  SELECT * FROM rides.payment_journal_entries;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_payment_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_payment_journal_entries TO service_role;

NOTIFY pgrst, 'reload schema';
