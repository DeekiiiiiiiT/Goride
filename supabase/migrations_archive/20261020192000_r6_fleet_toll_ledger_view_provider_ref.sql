-- R6 hotfix: public.fleet_toll_ledger view was created before provider_ref existed.
-- Postgres expands SELECT * at CREATE time, so the view never exposed provider_ref.
-- Dual-write upserts then fail: "Could not find the 'provider_ref' column of
-- 'fleet_toll_ledger' in the schema cache" — which breaks Link all / reconcile.

CREATE OR REPLACE VIEW public.fleet_toll_ledger
WITH (security_invoker = true) AS
  SELECT * FROM fleet.toll_ledger;

GRANT SELECT ON public.fleet_toll_ledger TO authenticated;
GRANT ALL ON public.fleet_toll_ledger TO service_role;
REVOKE ALL ON TABLE public.fleet_toll_ledger FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
