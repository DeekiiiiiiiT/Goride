-- Phase E: cold backup of money islands before KV hard-retire (2026-08-11).
CREATE TABLE IF NOT EXISTS ledger.kv_money_backup_20260811 (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ledger.kv_money_backup_20260811 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ledger.kv_money_backup_20260811 FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE ledger.kv_money_backup_20260811 TO service_role;

INSERT INTO ledger.kv_money_backup_20260811 (key, value)
SELECT key, value
FROM public.kv_store_37f42386
WHERE key LIKE 'ledger_event:%'
   OR key LIKE 'toll_ledger:%'
   OR key LIKE 'ledger_event_idem:%'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, backed_up_at = now();

CREATE TABLE IF NOT EXISTS ledger.financial_events_backup_20260811 AS
SELECT * FROM ledger.financial_events WHERE false;

INSERT INTO ledger.financial_events_backup_20260811
SELECT fe.* FROM ledger.financial_events fe
WHERE NOT EXISTS (
  SELECT 1 FROM ledger.financial_events_backup_20260811 b WHERE b.id = fe.id
);

CREATE TABLE IF NOT EXISTS rides.payment_journal_entries_backup_20260811 AS
SELECT * FROM rides.payment_journal_entries WHERE false;

INSERT INTO rides.payment_journal_entries_backup_20260811
SELECT j.* FROM rides.payment_journal_entries j
WHERE NOT EXISTS (
  SELECT 1 FROM rides.payment_journal_entries_backup_20260811 b WHERE b.id = j.id
);

REVOKE ALL ON TABLE ledger.financial_events_backup_20260811 FROM PUBLIC;
GRANT SELECT ON TABLE ledger.financial_events_backup_20260811 TO service_role;
REVOKE ALL ON TABLE rides.payment_journal_entries_backup_20260811 FROM PUBLIC;
GRANT SELECT ON TABLE rides.payment_journal_entries_backup_20260811 TO service_role;
