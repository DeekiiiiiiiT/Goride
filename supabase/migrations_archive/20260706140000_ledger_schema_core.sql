-- Phase 6: Unified ledger schema (ADR 0005). Additive; unused until dual-write phases.

CREATE SCHEMA IF NOT EXISTS ledger;

CREATE TABLE IF NOT EXISTS ledger.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  account_key TEXT NOT NULL,
  account_class TEXT NOT NULL CHECK (account_class IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_role TEXT CHECK (owner_role IS NULL OR owner_role IN ('rider', 'driver', 'merchant', 'courier', 'system')),
  currency TEXT NOT NULL DEFAULT 'JMD',
  balance_minor BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_key, currency)
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_org ON ledger.accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_owner ON ledger.accounts(owner_user_id, owner_role);

CREATE TABLE IF NOT EXISTS ledger.entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  entry_type TEXT NOT NULL,
  product TEXT NOT NULL CHECK (product IN ('rides', 'fleet', 'dash', 'platform')),
  debit_account_id UUID NOT NULL REFERENCES ledger.accounts(id),
  credit_account_id UUID NOT NULL REFERENCES ledger.accounts(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  request_hash TEXT,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference_type TEXT,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_org_effective
  ON ledger.entries(organization_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference
  ON ledger.entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_type_effective
  ON ledger.entries(entry_type, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_debit ON ledger.entries(debit_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_credit ON ledger.entries(credit_account_id);

CREATE TABLE IF NOT EXISTS ledger.source_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id UUID NOT NULL REFERENCES ledger.entries(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL CHECK (source_system IN (
    'rides_payment_journal', 'kv_ledger_event', 'kv_toll_ledger', 'dash_payments', 'rides_ledger_lines'
  )),
  source_id TEXT NOT NULL,
  source_idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_source_receipts_idem
  ON ledger.source_receipts(source_system, source_idempotency_key)
  WHERE source_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_source_receipts_entry
  ON ledger.source_receipts(ledger_entry_id);

-- Infer account_class / owner_role from account_key prefix.
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
  IF p_account_key LIKE 'platform:%' THEN
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
SET search_path = ledger, public
AS $$
DECLARE
  v_id UUID;
  v_class TEXT;
  v_owner_role TEXT;
BEGIN
  SELECT id INTO v_id
  FROM ledger.accounts
  WHERE account_key = p_account_key AND currency = p_currency;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT account_class, owner_role INTO v_class, v_owner_role
  FROM ledger._infer_account_meta(p_account_key, p_user_id, p_role);

  INSERT INTO ledger.accounts (
    organization_id, account_key, account_class, owner_user_id, owner_role, currency, balance_minor
  )
  VALUES (
    p_organization_id, p_account_key, v_class, p_user_id, v_owner_role, p_currency, 0
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

CREATE OR REPLACE FUNCTION ledger._resolve_account_id(
  p_account_key TEXT,
  p_currency TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ledger, rides, public
AS $$
DECLARE
  v_id UUID;
  v_user_id UUID;
BEGIN
  IF p_account_key IN ('platform:receivable', 'platform:clearing') THEN
    RETURN ledger._ensure_account(p_account_key, p_currency, NULL, NULL, 'system');
  END IF;

  IF p_account_key ~ '^user:[0-9a-fA-F-]{36}:driver:(digital|cash|debt)$' THEN
    v_user_id := (regexp_match(p_account_key, '^user:([0-9a-fA-F-]{36}):driver:'))[1]::UUID;
    RETURN ledger._ensure_account(p_account_key, p_currency, NULL, v_user_id, 'driver');
  END IF;

  IF p_account_key ~ '^user:[0-9a-fA-F-]{36}:rider$' THEN
    v_user_id := (regexp_match(p_account_key, '^user:([0-9a-fA-F-]{36}):rider$'))[1]::UUID;
    RETURN ledger._ensure_account(p_account_key, p_currency, NULL, v_user_id, 'rider');
  END IF;

  IF p_account_key ~ '^user:[0-9a-fA-F-]{36}:driver$' THEN
    v_user_id := (regexp_match(p_account_key, '^user:([0-9a-fA-F-]{36}):driver$'))[1]::UUID;
    RETURN ledger._ensure_account(p_account_key, p_currency, NULL, v_user_id, 'driver');
  END IF;

  IF p_account_key ~ '^org:([0-9a-fA-F-]{36}):' THEN
    v_user_id := NULL;
    RETURN ledger._ensure_account(
      p_account_key,
      p_currency,
      (regexp_match(p_account_key, '^org:([0-9a-fA-F-]{36}):'))[1]::UUID,
      NULL,
      NULL
    );
  END IF;

  IF p_account_key ~ '^merchant:([0-9a-fA-F-]{36}):' THEN
    v_user_id := (regexp_match(p_account_key, '^merchant:([0-9a-fA-F-]{36}):'))[1]::UUID;
    RETURN ledger._ensure_account(p_account_key, p_currency, NULL, v_user_id, 'merchant');
  END IF;

  IF p_account_key ~ '^courier:([0-9a-fA-F-]{36}):' THEN
    v_user_id := (regexp_match(p_account_key, '^courier:([0-9a-fA-F-]{36}):'))[1]::UUID;
    RETURN ledger._ensure_account(p_account_key, p_currency, NULL, v_user_id, 'courier');
  END IF;

  SELECT id INTO v_id
  FROM ledger.accounts
  WHERE account_key = p_account_key AND currency = p_currency;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'account_not_found:%', p_account_key;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.post_entry(
  p_idempotency_key TEXT,
  p_entry_type TEXT,
  p_debit_account_key TEXT,
  p_credit_account_key TEXT,
  p_amount_minor BIGINT,
  p_currency TEXT,
  p_request_hash TEXT DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL,
  p_product TEXT DEFAULT 'platform',
  p_effective_at TIMESTAMPTZ DEFAULT now(),
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by_user_id UUID DEFAULT NULL,
  p_source_system TEXT DEFAULT NULL,
  p_source_id TEXT DEFAULT NULL,
  p_source_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ledger, public
AS $$
DECLARE
  v_debit_id UUID;
  v_credit_id UUID;
  v_first_id UUID;
  v_second_id UUID;
  v_inserted INTEGER;
  v_existing_hash TEXT;
  v_entry_id UUID;
  v_org_id UUID;
BEGIN
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'invalid_amount_minor';
  END IF;

  v_debit_id := ledger._resolve_account_id(p_debit_account_key, p_currency);
  v_credit_id := ledger._resolve_account_id(p_credit_account_key, p_currency);

  IF v_debit_id < v_credit_id THEN
    v_first_id := v_debit_id;
    v_second_id := v_credit_id;
  ELSE
    v_first_id := v_credit_id;
    v_second_id := v_debit_id;
  END IF;

  PERFORM id FROM ledger.accounts WHERE id = v_first_id FOR UPDATE;
  PERFORM id FROM ledger.accounts WHERE id = v_second_id FOR UPDATE;

  SELECT organization_id INTO v_org_id FROM ledger.accounts WHERE id = v_debit_id;
  v_org_id := COALESCE(p_organization_id, v_org_id);

  INSERT INTO ledger.entries (
    organization_id,
    idempotency_key,
    entry_type,
    product,
    debit_account_id,
    credit_account_id,
    amount_minor,
    currency,
    request_hash,
    effective_at,
    reference_type,
    reference_id,
    metadata,
    created_by_user_id
  )
  VALUES (
    v_org_id,
    p_idempotency_key,
    p_entry_type,
    p_product,
    v_debit_id,
    v_credit_id,
    p_amount_minor,
    p_currency,
    p_request_hash,
    COALESCE(p_effective_at, now()),
    p_reference_type,
    p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb),
    p_created_by_user_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_entry_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT id, request_hash INTO v_entry_id, v_existing_hash
    FROM ledger.entries
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_hash IS NOT NULL AND p_request_hash IS NOT NULL
       AND v_existing_hash IS DISTINCT FROM p_request_hash THEN
      RETURN jsonb_build_object('inserted', false, 'skipped', false, 'conflict', true, 'entry_id', NULL);
    END IF;

    RETURN jsonb_build_object(
      'inserted', false, 'skipped', true, 'conflict', false,
      'entry_id', v_entry_id
    );
  END IF;

  UPDATE ledger.accounts SET balance_minor = balance_minor - p_amount_minor WHERE id = v_debit_id;
  UPDATE ledger.accounts SET balance_minor = balance_minor + p_amount_minor WHERE id = v_credit_id;

  IF p_source_system IS NOT NULL AND p_source_id IS NOT NULL THEN
    INSERT INTO ledger.source_receipts (
      ledger_entry_id, source_system, source_id, source_idempotency_key
    )
    VALUES (v_entry_id, p_source_system, p_source_id, p_source_idempotency_key)
    ON CONFLICT (source_system, source_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'inserted', true, 'skipped', false, 'conflict', false,
    'entry_id', v_entry_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ledger_post_entry(
  p_idempotency_key TEXT,
  p_entry_type TEXT,
  p_debit_account_key TEXT,
  p_credit_account_key TEXT,
  p_amount_minor BIGINT,
  p_currency TEXT,
  p_request_hash TEXT DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL,
  p_product TEXT DEFAULT 'platform',
  p_effective_at TIMESTAMPTZ DEFAULT now(),
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by_user_id UUID DEFAULT NULL,
  p_source_system TEXT DEFAULT NULL,
  p_source_id TEXT DEFAULT NULL,
  p_source_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ledger, public
AS $$
  SELECT ledger.post_entry(
    p_idempotency_key, p_entry_type, p_debit_account_key, p_credit_account_key,
    p_amount_minor, p_currency, p_request_hash, p_organization_id, p_product,
    p_effective_at, p_reference_type, p_reference_id, p_metadata, p_created_by_user_id,
    p_source_system, p_source_id, p_source_idempotency_key
  );
$$;

INSERT INTO ledger.accounts (organization_id, account_key, account_class, owner_role, currency, balance_minor)
VALUES
  (NULL, 'platform:receivable', 'asset', 'system', 'JMD', 0),
  (NULL, 'platform:clearing', 'asset', 'system', 'JMD', 0)
ON CONFLICT (account_key, currency) DO NOTHING;

-- RLS skeleton (Option 1 — ADR 0004)
ALTER TABLE ledger.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.source_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_accounts_select ON ledger.accounts
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.rbac_is_platform_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = ledger.accounts.organization_id AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY ledger_entries_select ON ledger.entries
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.rbac_is_platform_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = ledger.entries.organization_id AND o.owner_id = auth.uid()
    )
  );

CREATE POLICY ledger_source_receipts_select ON ledger.source_receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledger.entries e
      WHERE e.id = ledger_entry_id
        AND (
          e.organization_id IS NULL
          OR public.rbac_is_platform_user(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = e.organization_id AND o.owner_id = auth.uid()
          )
        )
    )
  );

CREATE OR REPLACE VIEW public.ledger_accounts AS SELECT * FROM ledger.accounts;
CREATE OR REPLACE VIEW public.ledger_entries AS SELECT * FROM ledger.entries;
CREATE OR REPLACE VIEW public.ledger_source_receipts AS SELECT * FROM ledger.source_receipts;

GRANT SELECT ON public.ledger_accounts TO authenticated, service_role;
GRANT SELECT ON public.ledger_entries TO authenticated, service_role;
GRANT SELECT ON public.ledger_source_receipts TO authenticated, service_role;

REVOKE ALL ON FUNCTION ledger._ensure_account(TEXT, TEXT, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger._ensure_account(TEXT, TEXT, UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION ledger._resolve_account_id(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger._resolve_account_id(TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION ledger.post_entry(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger.post_entry(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB, UUID, TEXT, TEXT, TEXT
) TO service_role;
REVOKE ALL ON FUNCTION public.ledger_post_entry(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_post_entry(
  TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB, UUID, TEXT, TEXT, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
