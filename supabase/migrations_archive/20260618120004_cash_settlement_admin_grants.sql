-- service_role grants for cash settlement admin tables (created after base rides schema grants).

GRANT ALL ON rides.admin_settlement_overrides TO service_role;
GRANT ALL ON rides.cash_settlement_disputes TO service_role;

-- Public views for hosted projects that use public PostgREST views.
CREATE OR REPLACE VIEW public.rides_admin_settlement_overrides AS
  SELECT * FROM rides.admin_settlement_overrides;

CREATE OR REPLACE VIEW public.rides_cash_settlement_disputes AS
  SELECT * FROM rides.cash_settlement_disputes;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_admin_settlement_overrides TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_cash_settlement_disputes TO service_role;

NOTIFY pgrst, 'reload schema';
