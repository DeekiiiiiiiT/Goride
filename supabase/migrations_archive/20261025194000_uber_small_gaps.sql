-- Remaining Uber file gaps. Open weeks are corrected in that week.
-- Locked weeks (Aug 17, Aug 31, Oct 12) are entered once in the open week
-- of 19 Oct, on the fleet account. Safe to re-run.

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
  'dd9ba937-71ec-4c7e-956b-79af6ce76a47'::uuid,
  '3fab652a-08cf-49b9-bfd2-a5c7665c85a8'::uuid,
  v.amount_minor,
  'JMD',
  v.effective_at,
  'financial_event',
  v.source_week,
  '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'::uuid,
  jsonb_build_object(
    'driverId', '73dfc14d-3798-4a00-8d86-b2a3eb632f54',
    'platform', 'Uber',
    'direction', 'inflow',
    'description', 'Uber file correction for the week of ' || v.source_week,
    'grossAmount', v.amount_minor / 100.0,
    'sourceWeek', v.source_week,
    'periodStart', v.period_start,
    'periodEnd', v.period_end,
    'recognitionBasis', 'prior_period_adjustment',
    'reversal', false
  )
FROM (
  VALUES
    ('uber_file_gap:2026-08-17', '2026-08-17', 5250::bigint, TIMESTAMPTZ '2026-10-24 12:00:00+00', '2026-10-19', '2026-10-25'),
    ('uber_file_gap:2026-08-31', '2026-08-31', 17850::bigint, TIMESTAMPTZ '2026-10-24 12:00:00+00', '2026-10-19', '2026-10-25'),
    ('uber_file_gap:2026-10-12', '2026-10-12', 5250::bigint, TIMESTAMPTZ '2026-10-24 12:00:00+00', '2026-10-19', '2026-10-25'),
    ('uber_file_gap:2026-09-07', '2026-09-07', 43768::bigint, TIMESTAMPTZ '2026-09-07 12:00:00+00', '2026-09-07', '2026-09-13'),
    ('uber_file_gap:2026-09-14', '2026-09-14', 16342::bigint, TIMESTAMPTZ '2026-09-14 12:00:00+00', '2026-09-14', '2026-09-20'),
    ('uber_file_gap:2026-09-21', '2026-09-21', 26250::bigint, TIMESTAMPTZ '2026-09-21 12:00:00+00', '2026-09-21', '2026-09-27'),
    ('uber_file_gap:2026-09-28', '2026-09-28', 113919::bigint, TIMESTAMPTZ '2026-09-28 12:00:00+00', '2026-09-28', '2026-10-04'),
    ('uber_file_gap:2026-10-05', '2026-10-05', 50043::bigint, TIMESTAMPTZ '2026-10-05 12:00:00+00', '2026-10-05', '2026-10-11')
) AS v(idempotency_key, source_week, amount_minor, effective_at, period_start, period_end)
ON CONFLICT (idempotency_key) DO NOTHING;
