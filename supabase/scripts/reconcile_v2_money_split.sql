-- Read-only: flag v2 card settlements where merchant receivable drifted from food − commission.
-- Run in Supabase SQL editor. No writes.
-- Tolerance: 2 cents (matches capture assert).
-- market_id lives on delivery.merchants (not orders).

WITH settled AS (
  SELECT
    o.id AS order_id,
    o.order_number,
    m.market_id,
    o.status,
    o.payment_method,
    o.subtotal,
    COALESCE(o.discount, 0) AS discount,
    COALESCE(o.merchant_commission_amount, 0) AS merchant_commission_amount,
    ROUND(
      (GREATEST(0, COALESCE(o.subtotal, 0) - COALESCE(o.discount, 0))
        - COALESCE(o.merchant_commission_amount, 0))::numeric,
      2
    ) AS expected_merchant_receivable,
    t.id AS transaction_id,
    t.net_amount,
    (t.provider_data -> 'money_split' ->> 'merchantReceivable')::numeric AS split_merchant_receivable,
    (t.provider_data -> 'money_split' ->> 'platformFee')::numeric AS split_platform_fee,
    (t.provider_data -> 'money_split' ->> 'courierPayable')::numeric AS split_courier_payable,
    t.amount AS capture_amount,
    t.created_at AS settled_at
  FROM delivery.orders o
  LEFT JOIN delivery.merchants m ON m.id = o.merchant_id
  INNER JOIN payments.transactions t
    ON t.order_id = o.id
   AND t.status = 'completed'
  WHERE o.pricing_model = 'v2'
)
SELECT
  order_id,
  order_number,
  market_id,
  status,
  payment_method,
  expected_merchant_receivable,
  COALESCE(split_merchant_receivable, net_amount) AS recorded_merchant_receivable,
  ROUND(
    COALESCE(split_merchant_receivable, net_amount) - expected_merchant_receivable,
    2
  ) AS delta_jmd,
  split_platform_fee,
  split_courier_payable,
  capture_amount,
  settled_at
FROM settled
WHERE ABS(
  COALESCE(split_merchant_receivable, net_amount) - expected_merchant_receivable
) > 0.02
ORDER BY ABS(
  COALESCE(split_merchant_receivable, net_amount) - expected_merchant_receivable
) DESC,
settled_at DESC;
