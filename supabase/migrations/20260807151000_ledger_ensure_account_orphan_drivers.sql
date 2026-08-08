-- Historic fleet KV events may reference driverIds no longer in auth.users.
-- Creating ledger.accounts with a hard FK would fail dual-write / backfill.
CREATE OR REPLACE FUNCTION ledger._ensure_account(
  p_account_key TEXT,
  p_currency TEXT,
  p_organization_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_role TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ledger, public, auth
AS $$
DECLARE
  v_id UUID;
  v_class TEXT;
  v_owner_role TEXT;
  v_owner UUID := p_user_id;
BEGIN
  IF v_owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_owner) THEN
    v_owner := NULL;
  END IF;

  SELECT id INTO v_id
  FROM ledger.accounts
  WHERE account_key = p_account_key AND currency = p_currency;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT account_class, owner_role INTO v_class, v_owner_role
  FROM ledger._infer_account_meta(p_account_key, v_owner, p_role);

  INSERT INTO ledger.accounts (
    organization_id, account_key, account_class, owner_user_id, owner_role, currency, balance_minor
  )
  VALUES (
    p_organization_id, p_account_key, v_class, v_owner, v_owner_role, p_currency, 0
  )
  ON CONFLICT (account_key, currency) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM ledger.accounts
    WHERE account_key = p_account_key AND currency = p_currency;
  END IF;

  RETURN v_id;
END;
$$;
