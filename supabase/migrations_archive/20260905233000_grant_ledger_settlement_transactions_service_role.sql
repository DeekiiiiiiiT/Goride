-- public.driver_settlement_transactions is security_invoker=true, so service_role
-- must hold privileges on ledger.driver_settlement_transactions. Without this,
-- Pay/Undo cash sync loads zero txs and writes settlement_paid=0 (Fleet owes stuck).

GRANT SELECT, INSERT, UPDATE, DELETE ON ledger.driver_settlement_transactions TO service_role;

-- Keep public view grants aligned (edge writes through the view).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_settlement_transactions TO service_role;
