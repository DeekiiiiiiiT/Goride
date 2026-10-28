-- The Plug service readers were locked with a dynamic loop. That loop does
-- run in the database, but a later recreate of the week-money functions never
-- revoked the public key. Supabase grants EXECUTE to anon and authenticated
-- by default, so those money reads were callable with the public app key.
-- A new migration is required: the earlier files are already applied.

REVOKE ALL ON FUNCTION public.svc_finance_coverage_lines(text, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_coverage_contracts(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_finance_week_locked(text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_lock_finance_week(text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_post_expense_bill(text, text, text, date, numeric, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_record_expense_payment(text, text, text, numeric, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_void_expense_bill(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_module_purchase_latest_completed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_module_purchase_attach_org(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_module_purchase_get(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_module_purchase_insert(uuid, uuid, text[], numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_module_purchase_set_redirect(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_module_purchase_complete(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_module_purchase_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_module_purchase_id_by_txn(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_module_purchase_fail(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_rush_fleet_week_money(text, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svc_finance_week_sides(text, date, date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.svc_finance_coverage_lines(text, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_coverage_contracts(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_finance_week_locked(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_lock_finance_week(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_post_expense_bill(text, text, text, date, numeric, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_record_expense_payment(text, text, text, numeric, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_void_expense_bill(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_module_purchase_latest_completed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_module_purchase_attach_org(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_module_purchase_get(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_module_purchase_insert(uuid, uuid, text[], numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_module_purchase_set_redirect(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_module_purchase_complete(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_module_purchase_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_module_purchase_id_by_txn(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_module_purchase_fail(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_rush_fleet_week_money(text, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.svc_finance_week_sides(text, date, date) TO service_role;
