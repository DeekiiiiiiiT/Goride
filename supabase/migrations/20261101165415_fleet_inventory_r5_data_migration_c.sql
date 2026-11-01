-- Prod sync R6-06 (R5 data pass C): dash cam serialized asset + kit issue from legacy equipment (idempotent).

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
BEGIN
  PERFORM fleet.inv_verify_chain(v_org);
END $$;
