-- Pricing commission rollout: tax split columns, COD backfill, promos off, Spanish Town v2 profile

ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS tax_food_jmd numeric,
  ADD COLUMN IF NOT EXISTS tax_platform_jmd numeric,
  ADD COLUMN IF NOT EXISTS tax_rate_food_percent numeric,
  ADD COLUMN IF NOT EXISTS tax_rate_platform_percent numeric,
  ADD COLUMN IF NOT EXISTS courier_tip_net numeric;

COMMENT ON COLUMN delivery.orders.tax_food_jmd IS 'GCT on merchant food supply (Model B)';
COMMENT ON COLUMN delivery.orders.tax_platform_jmd IS 'GCT on platform service + delivery platform share';
COMMENT ON COLUMN delivery.orders.courier_tip_net IS 'Tip after card processing fee deduction';

ALTER TABLE delivery.courier_cash_events
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Disable launch promos on active global profile
UPDATE delivery.global_pricing_profiles
SET rules = jsonb_set(
  COALESCE(rules, '{}'::jsonb),
  '{launch_promos,free_delivery_first_n_orders}',
  '0'::jsonb,
  true
),
updated_at = now()
WHERE is_active = true;

-- Backfill COD ledger for delivered cash orders missing events (legacy split)
DO $$
DECLARE
  r record;
  v_subtotal numeric;
  v_discount numeric;
  v_discounted numeric;
  v_platform_fee numeric;
  v_delivery_fee numeric;
  v_tip numeric;
  v_tax numeric;
  v_total numeric;
  v_platform_due numeric;
  v_merchant_due numeric;
  v_ledger numeric;
  v_balance numeric;
  v_threshold numeric := 10000;
BEGIN
  FOR r IN
    SELECT o.*
    FROM delivery.orders o
    WHERE o.payment_method = 'cash'
      AND o.status IN ('delivered', 'completed')
      AND o.courier_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM delivery.courier_cash_events e WHERE e.order_id = o.id
      )
  LOOP
    v_subtotal := COALESCE(r.subtotal, 0);
    v_discount := COALESCE(r.discount, 0);
    v_discounted := GREATEST(0, v_subtotal - v_discount);
    v_platform_fee := COALESCE(r.platform_fee, 0);
    v_delivery_fee := COALESCE(r.delivery_fee, 0);
    v_tip := COALESCE(r.tip, 0);
    v_tax := COALESCE(r.tax, 0);
    v_total := COALESCE(r.total, 0);

    IF r.pricing_model = 'v2' THEN
      v_platform_due := ROUND(
        COALESCE(r.service_fee, r.platform_fee, 0)
        + COALESCE(r.merchant_commission_amount, 0)
        + GREATEST(0, COALESCE(r.delivery_fee_platform_amount, 0))
        + v_tax,
        2
      );
      v_merchant_due := ROUND(GREATEST(0, v_discounted - COALESCE(r.merchant_commission_amount, 0)), 2);
    ELSE
      -- Platform holds GCT on COD; merchant gets food only
      v_platform_due := ROUND(v_platform_fee + v_tax, 2);
      v_merchant_due := ROUND(v_discounted, 2);
    END IF;

    v_ledger := ROUND(v_platform_due + v_merchant_due, 2);
    IF v_ledger <= 0 THEN
      CONTINUE;
    END IF;

    v_threshold := 10000;
    SELECT balance_jmd, pause_threshold_jmd
    INTO v_balance, v_threshold
    FROM delivery.courier_cash_balances
    WHERE courier_id = r.courier_id;

    IF NOT FOUND THEN
      v_balance := 0;
      v_threshold := 10000;
      INSERT INTO delivery.courier_cash_balances (
        courier_id, balance_jmd, pause_threshold_jmd, is_paused
      ) VALUES (
        r.courier_id,
        v_ledger,
        COALESCE(v_threshold, 10000),
        v_ledger >= COALESCE(v_threshold, 10000)
      );
      v_balance := v_ledger;
    ELSE
      v_balance := ROUND(COALESCE(v_balance, 0) + v_ledger, 2);
      v_threshold := COALESCE(v_threshold, 10000);
      UPDATE delivery.courier_cash_balances
      SET balance_jmd = v_balance,
          pause_threshold_jmd = COALESCE(pause_threshold_jmd, v_threshold),
          is_paused = v_balance >= COALESCE(pause_threshold_jmd, v_threshold),
          paused_at = CASE WHEN v_balance >= COALESCE(pause_threshold_jmd, v_threshold) THEN now() ELSE paused_at END,
          updated_at = now()
      WHERE courier_id = r.courier_id;
    END IF;

    INSERT INTO delivery.courier_cash_events (
      courier_id, order_id, event_type, amount_jmd, balance_after, notes, metadata
    ) VALUES (
      r.courier_id,
      r.id,
      'collected',
      v_ledger,
      v_balance,
      'COD backfill: platform J$' || v_platform_due || ', merchant J$' || v_merchant_due,
      jsonb_build_object(
        'backfill', true,
        'platform_due_jmd', v_platform_due,
        'merchant_due_jmd', v_merchant_due
      )
    );
  END LOOP;
END $$;

-- Spanish Town town-layer Model B profile (pricing_v2_enabled per-town enablement)
DO $$
DECLARE
  st_market_id uuid;
  st_rules jsonb;
BEGIN
  SELECT id INTO st_market_id FROM delivery.service_markets WHERE slug = 'spanish-town' LIMIT 1;
  IF st_market_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM delivery.market_pricing_profiles
    WHERE market_id = st_market_id AND is_active = true
  ) THEN
    RETURN;
  END IF;

  SELECT rules INTO st_rules
  FROM delivery.global_pricing_profiles
  WHERE is_active = true
  ORDER BY version DESC
  LIMIT 1;

  IF st_rules IS NULL THEN
    st_rules := '{}'::jsonb;
  END IF;

  st_rules := st_rules
    || jsonb_build_object('pricing_v2_enabled', true)
    || jsonb_build_object(
      'launch_promos', jsonb_build_object('free_delivery_first_n_orders', 0)
    )
    || jsonb_build_object('road_distance_multiplier', 1.4);

  INSERT INTO delivery.market_pricing_profiles (
    market_id, version, is_active, rules, override_enabled
  ) VALUES (
    st_market_id, 1, true, st_rules, true
  );
END $$;
