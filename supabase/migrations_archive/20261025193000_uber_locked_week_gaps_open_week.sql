-- Locked Uber weeks stay signed. The file difference is entered once in the
-- open week of 19 Oct, on the fleet account, so it is not a driver's trip.
-- A short week is added. A long week is a reversal. Safe to re-run.

INSERT INTO ledger.entries (
  idempotency_key,
  entry_type,
  product,
  debit_account_id,
  credit_account_id,
  amount_minor,
  currency,
  effective_at,
  reference_type,
  reference_id,
  organization_id,
  metadata
)
SELECT
  v.idempotency_key,
  'fare_earning',
  'roam_driver',
  CASE WHEN v.reversal
    THEN '3fab652a-08cf-49b9-bfd2-a5c7665c85a8'::uuid
    ELSE 'dd9ba937-71ec-4c7e-956b-79af6ce76a47'::uuid
  END,
  CASE WHEN v.reversal
    THEN 'dd9ba937-71ec-4c7e-956b-79af6ce76a47'::uuid
    ELSE '3fab652a-08cf-49b9-bfd2-a5c7665c85a8'::uuid
  END,
  v.amount_minor,
  'JMD',
  TIMESTAMPTZ '2026-10-24 12:00:00+00',
  'financial_event',
  v.source_week,
  '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'::uuid,
  jsonb_build_object(
    'driverId', '73dfc14d-3798-4a00-8d86-b2a3eb632f54',
    'platform', 'Uber',
    'direction', CASE WHEN v.reversal THEN 'outflow' ELSE 'inflow' END,
    'description', 'Uber file correction for the week of ' || v.source_week,
    'grossAmount', v.amount_minor / 100.0,
    'sourceWeek', v.source_week,
    'periodStart', '2026-10-19',
    'periodEnd', '2026-10-25',
    'recognitionBasis', 'prior_period_adjustment',
    'reversal', v.reversal
  )
FROM (
  VALUES
    ('uber_file_gap:2026-07-13', '2026-07-13', 334009::bigint, false),
    ('uber_file_gap:2026-07-20', '2026-07-20', 222082::bigint, false),
    ('uber_file_gap:2026-07-27', '2026-07-27', 117221::bigint, false),
    ('uber_file_gap:2026-08-10', '2026-08-10', 150000::bigint, true)
) AS v(idempotency_key, source_week, amount_minor, reversal)
ON CONFLICT (idempotency_key) DO NOTHING;
