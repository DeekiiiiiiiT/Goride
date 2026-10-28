-- Phase 2: historical backfill + legacy↔remittance drift monitor.
-- Opening balances from courier_cash_balances; one adjustment event per courier.
-- Event replay of collected rows is best-effort for orders still present.

-- Drift: legacy major units vs remittance minor/100
CREATE OR REPLACE VIEW delivery.v_remittance_legacy_drift AS
SELECT
  coalesce(a.courier_id, b.courier_id) AS courier_id,
  coalesce(b.balance_jmd, 0)::numeric AS legacy_balance_jmd,
  coalesce(a.balance_minor, 0)::numeric / 100.0 AS remittance_balance_jmd,
  round(
    coalesce(b.balance_jmd, 0)::numeric
    - (coalesce(a.balance_minor, 0)::numeric / 100.0),
    2
  ) AS drift_jmd
FROM delivery.courier_remittance_accounts a
FULL OUTER JOIN delivery.courier_cash_balances b
  ON a.courier_id = b.courier_id
WHERE round(
  coalesce(b.balance_jmd, 0)::numeric
  - (coalesce(a.balance_minor, 0)::numeric / 100.0),
  2
) <> 0;

GRANT SELECT ON delivery.v_remittance_legacy_drift TO service_role;

-- Opening balances: seed remittance accounts from legacy when remittance is empty.
DO $$
DECLARE
  r record;
  v_minor bigint;
  v_key text;
BEGIN
  FOR r IN
    SELECT courier_id, balance_jmd
    FROM delivery.courier_cash_balances
    WHERE balance_jmd > 0
  LOOP
    v_minor := round(r.balance_jmd * 100)::bigint;
    v_key := 'cod:backfill:opening:v1:' || r.courier_id::text;

    IF EXISTS (
      SELECT 1 FROM delivery.courier_remittance_events
      WHERE idempotency_key = v_key
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM delivery.courier_remittance_accounts
      WHERE courier_id = r.courier_id AND balance_minor > 0
    ) THEN
      CONTINUE;
    END IF;

    PERFORM delivery.apply_remittance_event(
      p_courier_id := r.courier_id,
      p_event_type := 'adjustment',
      p_amount_minor := v_minor,
      p_idempotency_key := v_key,
      p_actor_type := 'migration',
      p_notes := 'Phase 2 opening balance from courier_cash_balances',
      p_metadata := jsonb_build_object(
        'source', 'courier_cash_balances',
        'legacy_balance_jmd', r.balance_jmd
      )
    );
  END LOOP;
END $$;
