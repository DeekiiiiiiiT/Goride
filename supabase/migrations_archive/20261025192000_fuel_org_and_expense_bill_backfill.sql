-- Old fuel rows were posted before organisation was stamped. Copy it from
-- the fuel fill they point at. Rows with no matching fill stay blank.
UPDATE public.ledger_entries AS e
SET organization_id = f.organization_id::uuid
FROM fleet.fuel_entries AS f
WHERE e.entry_type = 'fuel_expense'
  AND e.organization_id IS NULL
  AND f.id = COALESCE(e.metadata->>'fuelEntryId', e.reference_id)
  AND f.organization_id IS NOT NULL
  AND btrim(f.organization_id) <> '';

-- Hub bills live on fleet.expense_documents, not in kv_store. Copy the ones
-- that were posted and are missing from the bill book. Safe to re-run.
INSERT INTO fleet.expense_bills (id, organization_id, bill_date, amount, self_approved, status)
SELECT
  d.id,
  COALESCE(d.organization_id, ''),
  COALESCE(d.incurred_date, CURRENT_DATE),
  COALESCE(
    NULLIF(d.payload_json->>'netAmount', '')::numeric,
    NULLIF(d.payload_json->>'net_amount', '')::numeric,
    d.gross_amount,
    0
  ),
  COALESCE((d.payload_json->>'selfApproved')::boolean, false),
  'posted'
FROM fleet.expense_documents AS d
WHERE COALESCE(d.status, d.payload_json->>'status') IN ('posted', 'partially_paid', 'paid', 'approved')
  AND d.id <> ''
  AND COALESCE(
    NULLIF(d.payload_json->>'netAmount', '')::numeric,
    NULLIF(d.payload_json->>'net_amount', '')::numeric,
    d.gross_amount,
    0
  ) >= 0
ON CONFLICT (id) DO NOTHING;

INSERT INTO fleet.expense_bill_lines (id, bill_id, account, direction, amount)
SELECT b.id || ':debit', b.id, 'expense', 'debit', b.amount
FROM fleet.expense_bills AS b
WHERE NOT EXISTS (SELECT 1 FROM fleet.expense_bill_lines AS l WHERE l.bill_id = b.id)
  AND b.amount >= 0
UNION ALL
SELECT b.id || ':credit', b.id, 'accounts_payable', 'credit', b.amount
FROM fleet.expense_bills AS b
WHERE NOT EXISTS (SELECT 1 FROM fleet.expense_bill_lines AS l WHERE l.bill_id = b.id)
  AND b.amount >= 0;
