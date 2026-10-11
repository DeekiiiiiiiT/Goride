-- In-House audit closeout. Does not edit the already-applied procurement migrations.

-- Live hole: anyone with the public key could rewrite feature flags.
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_feature_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.platform_feature_flags TO service_role;

UPDATE public.platform_feature_flags
SET enabled = false, updated_at = now()
WHERE name = 'IN_HOUSE_ENABLED';

-- Split exceptions so a bought order can never be queued again.
ALTER TABLE delivery.procurement_tasks DROP CONSTRAINT IF EXISTS procurement_tasks_state_check;
ALTER TABLE delivery.procurement_tasks
  ADD CONSTRAINT procurement_tasks_state_check CHECK (state IN (
    'queued', 'claimed', 'placing', 'placed_external', 'ready_for_pickup',
    'picked_up', 'closed', 'exception', 'exception_before_purchase',
    'exception_after_purchase', 'awaiting_customer', 'abandoned'
  ));

ALTER TABLE delivery.procurement_tasks
  ADD COLUMN IF NOT EXISTS sla_warned_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_paged_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_seen_at timestamptz;

-- Roam absorbs a price gap up to the lesser of the percent and this dollar cap (J$500).
ALTER TABLE delivery.in_house_stores
  ADD COLUMN IF NOT EXISTS absorb_cap_minor bigint NOT NULL DEFAULT 50000;
ALTER TABLE delivery.in_house_stores
  ALTER COLUMN price_tolerance_bps SET DEFAULT 1000;

-- Identical card charges must stay as separate lines so a double purchase can be seen.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'delivery'
      AND rel.relname = 'in_house_card_statement_lines'
      AND con.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE delivery.in_house_card_statement_lines DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE delivery.in_house_card_statement_lines
  ADD COLUMN IF NOT EXISTS import_batch_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS line_no int DEFAULT 1;

UPDATE delivery.in_house_card_statement_lines
SET import_batch_id = COALESCE(import_batch_id, gen_random_uuid()),
    line_no = COALESCE(line_no, 1)
WHERE import_batch_id IS NULL OR line_no IS NULL;

ALTER TABLE delivery.in_house_card_statement_lines
  ALTER COLUMN import_batch_id SET NOT NULL,
  ALTER COLUMN line_no SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS in_house_statement_batch_line_uidx
  ON delivery.in_house_card_statement_lines (import_batch_id, line_no);

CREATE OR REPLACE VIEW delivery.v_in_house_paid_without_task AS
SELECT o.id AS order_id, o.created_at
FROM delivery.orders o
JOIN delivery.merchants m ON m.id = o.merchant_id
WHERE m.procurement_mode = 'in_house'
  AND o.money_state = 'captured'
  AND o.created_at < now() - interval '2 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM delivery.procurement_tasks t WHERE t.order_id = o.id
  );

CREATE OR REPLACE VIEW delivery.v_in_house_variance_outliers AS
SELECT t.id AS task_id, t.order_id, t.variance_minor
FROM delivery.procurement_tasks t
JOIN delivery.in_house_stores s ON s.merchant_id = t.merchant_id
WHERE t.actual_total_minor IS NOT NULL
  AND t.expected_cost_minor > 0
  AND t.variance_minor > LEAST(
    (t.expected_cost_minor * s.price_tolerance_bps) / 10000,
    s.absorb_cap_minor
  )
  AND t.customer_price_approved_at IS NULL;

GRANT SELECT ON delivery.v_in_house_paid_without_task TO service_role;
