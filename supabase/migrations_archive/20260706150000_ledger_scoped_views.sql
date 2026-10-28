-- Phase 13: Scoped ledger read views (ADR 0003 — security_invoker).

CREATE OR REPLACE VIEW public.ledger_scoped_fleet
WITH (security_invoker = true)
AS
SELECT e.*
FROM ledger.entries e
WHERE e.organization_id IS NOT NULL
  AND (
    public.rbac_is_platform_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = e.organization_id AND o.owner_id = auth.uid()
    )
  );

CREATE OR REPLACE VIEW public.ledger_scoped_dominion
WITH (security_invoker = true)
AS
SELECT e.*
FROM ledger.entries e
WHERE public.rbac_is_platform_user(auth.uid());

CREATE OR REPLACE VIEW public.ledger_scoped_driver
WITH (security_invoker = true)
AS
SELECT e.*
FROM ledger.entries e
JOIN ledger.accounts a ON a.id = e.credit_account_id OR a.id = e.debit_account_id
WHERE a.owner_user_id = auth.uid() AND a.owner_role = 'driver';

CREATE OR REPLACE VIEW public.ledger_scoped_passenger
WITH (security_invoker = true)
AS
SELECT e.*
FROM ledger.entries e
JOIN ledger.accounts a ON a.id = e.credit_account_id OR a.id = e.debit_account_id
WHERE a.owner_user_id = auth.uid() AND a.owner_role = 'rider';

GRANT SELECT ON public.ledger_scoped_fleet TO authenticated, service_role;
GRANT SELECT ON public.ledger_scoped_dominion TO authenticated, service_role;
GRANT SELECT ON public.ledger_scoped_driver TO authenticated, service_role;
GRANT SELECT ON public.ledger_scoped_passenger TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
