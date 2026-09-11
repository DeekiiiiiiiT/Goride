-- Pass 6: closed weeks with residual cash that never landed on a successor opening.
-- Review before any repair. Prefer Retry freeze / re-Close after N-3 deploy.

SELECT
  p.driver_id,
  d.name AS driver_name,
  p.period_anchor::text,
  p.cash_still_held,
  p.metadata->'financeCore'->>'custodyTransferredTo' AS transferred_to,
  p.metadata->'financeCore'->>'custodyTransferredAmount' AS transferred_amt,
  succ.metadata->'financeCore'->>'openingCashCustody' AS successor_opening
FROM ledger.driver_financial_periods p
JOIN fleet.drivers d ON d.id = p.driver_id
LEFT JOIN ledger.driver_financial_periods succ
  ON succ.driver_id = p.driver_id
 AND succ.period_anchor = NULLIF(p.metadata->'financeCore'->>'custodyTransferredTo', '')::date
WHERE p.status = 'closed'
  AND COALESCE(p.cash_still_held, 0) > 0.5
  AND (
    COALESCE(p.metadata->'financeCore'->>'custodyTransferredTo', '') = ''
    OR COALESCE((succ.metadata->'financeCore'->>'openingCashCustody')::numeric, 0) <= 0.5
  )
ORDER BY p.period_anchor, d.name;
