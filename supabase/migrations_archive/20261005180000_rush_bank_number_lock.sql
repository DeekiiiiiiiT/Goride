-- Signed-in users can read their own bank row, but not the full account number.
-- A table-level SELECT makes a column REVOKE do nothing, so the table grant comes off first.
-- Vault holds the number. New pgsodium column encryption is not used.

ALTER TABLE payments.merchant_bank_accounts
  ADD COLUMN IF NOT EXISTS account_secret_id uuid;

ALTER TABLE payments.courier_bank_accounts
  ADD COLUMN IF NOT EXISTS account_secret_id uuid;

CREATE OR REPLACE FUNCTION payments.seal_bank_account_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = payments, vault, public
AS $$
BEGIN
  IF NEW.account_number IS NULL OR btrim(NEW.account_number) = '' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'vault' AND p.proname = 'create_secret'
  ) THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;
  IF NEW.account_secret_id IS NULL THEN
    NEW.account_secret_id := vault.create_secret(
      btrim(NEW.account_number),
      'rush-bank-' || TG_TABLE_NAME || '-' || NEW.id::text,
      'Rush payout account'
    );
  ELSE
    PERFORM vault.update_secret(NEW.account_secret_id, btrim(NEW.account_number));
  END IF;
  NEW.account_number := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION payments.seal_bank_account_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS merchant_bank_accounts_seal_number ON payments.merchant_bank_accounts;
CREATE TRIGGER merchant_bank_accounts_seal_number
  BEFORE INSERT OR UPDATE OF account_number ON payments.merchant_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION payments.seal_bank_account_number();

DROP TRIGGER IF EXISTS courier_bank_accounts_seal_number ON payments.courier_bank_accounts;
CREATE TRIGGER courier_bank_accounts_seal_number
  BEFORE INSERT OR UPDATE OF account_number ON payments.courier_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION payments.seal_bank_account_number();

UPDATE payments.merchant_bank_accounts
SET account_number = account_number
WHERE account_number IS NOT NULL
  AND btrim(account_number) <> ''
  AND account_secret_id IS NULL;

UPDATE payments.courier_bank_accounts
SET account_number = account_number
WHERE account_number IS NOT NULL
  AND btrim(account_number) <> ''
  AND account_secret_id IS NULL;

CREATE OR REPLACE FUNCTION payments.bank_account_number(p_party text, p_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = payments, vault, public
AS $$
DECLARE
  v_secret uuid;
  v_plain text;
  v_number text;
BEGIN
  IF p_party = 'courier' THEN
    SELECT account_secret_id, account_number INTO v_secret, v_plain
    FROM payments.courier_bank_accounts WHERE id = p_id;
  ELSIF p_party = 'merchant' THEN
    SELECT account_secret_id, account_number INTO v_secret, v_plain
    FROM payments.merchant_bank_accounts WHERE id = p_id;
  ELSE
    RETURN NULL;
  END IF;

  IF v_secret IS NOT NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_number
      FROM vault.decrypted_secrets
      WHERE id = v_secret;
    EXCEPTION
      WHEN undefined_table THEN
        v_number := NULL;
    END;
    IF v_number IS NOT NULL AND btrim(v_number) <> '' THEN
      RETURN v_number;
    END IF;
  END IF;

  RETURN NULLIF(btrim(COALESCE(v_plain, '')), '');
END;
$$;

REVOKE ALL ON FUNCTION payments.bank_account_number(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION payments.bank_account_number(text, uuid) TO service_role;

REVOKE SELECT ON TABLE payments.merchant_bank_accounts FROM anon, authenticated, PUBLIC;
REVOKE SELECT ON TABLE payments.courier_bank_accounts FROM anon, authenticated, PUBLIC;

GRANT SELECT (
  id,
  merchant_id,
  provider,
  provider_account_id,
  bank_name,
  account_holder_name,
  account_last4,
  account_type,
  routing_number_last4,
  currency,
  is_default,
  is_verified,
  created_at,
  branch
) ON payments.merchant_bank_accounts TO anon, authenticated;

GRANT SELECT (
  id,
  courier_id,
  bank_name,
  branch,
  account_holder_name,
  account_last4,
  account_type,
  is_default,
  is_verified,
  created_at
) ON payments.courier_bank_accounts TO anon, authenticated;

UPDATE payments.merchant_bank_accounts
SET is_verified = false
WHERE is_verified IS TRUE
  AND (
    NULLIF(btrim(account_holder_name), '') IS NULL
    OR NULLIF(btrim(bank_name), '') IS NULL
    OR NULLIF(btrim(branch), '') IS NULL
    OR (
      NULLIF(btrim(account_number), '') IS NULL
      AND account_secret_id IS NULL
    )
  );

UPDATE payments.courier_bank_accounts
SET is_verified = false
WHERE is_verified IS TRUE
  AND (
    NULLIF(btrim(account_holder_name), '') IS NULL
    OR NULLIF(btrim(bank_name), '') IS NULL
    OR NULLIF(btrim(branch), '') IS NULL
    OR (
      NULLIF(btrim(account_number), '') IS NULL
      AND account_secret_id IS NULL
    )
  );
