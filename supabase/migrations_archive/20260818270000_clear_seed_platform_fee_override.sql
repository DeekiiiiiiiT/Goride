-- Kingston seed re-applied 0.15 on commission_rate as if it were restaurant take-rate.
-- That column is the customer platform-fee override; NULL = global 5%.
UPDATE delivery.merchants
SET commission_rate = NULL
WHERE commission_rate = 0.15;
