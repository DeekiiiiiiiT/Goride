-- M-2 fuel money-commit accounts: seed keys used by fuel_financial_reset.ts
-- (platform:driver_payable, platform:driver_cash_outlay). These were never in
-- the chart of accounts, so finalize raised account_not_found on money_commit.

INSERT INTO ledger.accounts (organization_id, account_key, account_class, owner_role, currency, balance_minor)
VALUES
  (NULL, 'platform:driver_payable', 'liability', 'system', 'JMD', 0),
  (NULL, 'platform:driver_cash_outlay', 'liability', 'system', 'JMD', 0)
ON CONFLICT (account_key, currency) DO NOTHING;

-- Keep liability classification for ensure/resolve metadata (catch-all platform:% is asset).
CREATE OR REPLACE FUNCTION ledger._infer_account_meta(
  p_account_key TEXT,
  p_user_id UUID,
  p_role TEXT
)
RETURNS TABLE(account_class TEXT, owner_role TEXT)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_account_key LIKE 'platform:fleet_%_expense' OR p_account_key = 'platform:write_off' THEN
    RETURN QUERY SELECT 'expense'::TEXT, 'system'::TEXT;
  ELSIF p_account_key IN (
    'platform:driver_reimbursement_payable',
    'platform:driver_payable',
    'platform:driver_cash_outlay',
    'platform:toll_tag_clearing',
    'platform:fuel_card_clearing'
  ) THEN
    RETURN QUERY SELECT 'liability'::TEXT, 'system'::TEXT;
  ELSIF p_account_key IN (
    'platform:receivable',
    'platform:clearing',
    'platform:driver_receivable',
    'platform:reimbursement_receivable',
    'platform:bank_clearing'
  ) THEN
    RETURN QUERY SELECT 'asset'::TEXT, 'system'::TEXT;
  ELSIF p_account_key LIKE 'platform:%' THEN
    RETURN QUERY SELECT 'asset'::TEXT, 'system'::TEXT;
  ELSIF p_account_key ~ '^user:[^:]+:rider$' THEN
    RETURN QUERY SELECT 'asset'::TEXT, 'rider'::TEXT;
  ELSIF p_account_key ~ '^user:[^:]+:driver' THEN
    RETURN QUERY SELECT 'asset'::TEXT, 'driver'::TEXT;
  ELSIF p_account_key LIKE 'org:%' THEN
    RETURN QUERY SELECT 'asset'::TEXT, NULL::TEXT;
  ELSIF p_account_key LIKE 'merchant:%' THEN
    RETURN QUERY SELECT 'asset'::TEXT, 'merchant'::TEXT;
  ELSIF p_account_key LIKE 'courier:%' THEN
    RETURN QUERY SELECT 'liability'::TEXT, 'courier'::TEXT;
  ELSE
    RETURN QUERY SELECT 'asset'::TEXT, COALESCE(p_role, NULL::TEXT);
  END IF;
END;
$$;
