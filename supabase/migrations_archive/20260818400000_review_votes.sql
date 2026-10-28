-- Helpful votes on customer-visible order reviews (review id = order id).
CREATE TABLE IF NOT EXISTS delivery.review_votes (
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES delivery.customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_review_votes_order
  ON delivery.review_votes(order_id);

ALTER TABLE delivery.review_votes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON delivery.review_votes TO authenticated;
GRANT ALL ON delivery.review_votes TO service_role;

COMMENT ON TABLE delivery.review_votes IS
  'Customer "helpful" votes on another customer''s delivered-order review.';
