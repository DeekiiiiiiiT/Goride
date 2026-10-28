-- Unified Driver Financial Ledger Rebuild
-- Immutable events + allocations + outbox + weekly period projections.
-- Extends ledger.* (ADR 0005); does not invent a third money store.

-- ── Expand source_system allow-list for new domain writers ─────────────────
ALTER TABLE ledger.source_receipts DROP CONSTRAINT IF EXISTS source_receipts_source_system_check;
ALTER TABLE ledger.source_receipts ADD CONSTRAINT source_receipts_source_system_check CHECK (
  source_system IN (
    'rides_payment_journal',
    'kv_ledger_event',
    'kv_toll_ledger',
    'dash_payments',
    'rides_ledger_lines',
    'financial_event',
    'toll_workflow',
    'fuel_ops',
    'driver_charge',
    'period_close',
    'backfill'
  )
);

-- ── Immutable financial events ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger.financial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT,
  domain TEXT NOT NULL CHECK (domain IN ('toll', 'fuel', 'cash', 'earnings', 'payout', 'other')),
  event_type TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_id TEXT NOT NULL,
  driver_id TEXT,
  vehicle_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  period_anchor DATE NOT NULL, -- Monday (fleet TZ) of the week
  amount_minor BIGINT NOT NULL, -- signed: positive = inflow to driver / credit; negative = outflow
  currency TEXT NOT NULL DEFAULT 'JMD',
  direction TEXT NOT NULL CHECK (direction IN ('inflow', 'outflow', 'neutral')),
  reverses_event_id UUID REFERENCES ledger.financial_events(id),
  correlation_id TEXT,
  causation_id TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ledger_entry_id UUID REFERENCES ledger.entries(id),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_events_driver_period
  ON ledger.financial_events(driver_id, period_anchor, occurred_at);
CREATE INDEX IF NOT EXISTS idx_fin_events_source
  ON ledger.financial_events(source_system, source_id);
CREATE INDEX IF NOT EXISTS idx_fin_events_domain_type
  ON ledger.financial_events(domain, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_events_reverses
  ON ledger.financial_events(reverses_event_id)
  WHERE reverses_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_events_active_source
  ON ledger.financial_events(source_system, source_id, event_type)
  WHERE reverses_event_id IS NULL;

-- ── Versioned allocations (fuel splits, toll recoveries, write-offs) ───────
CREATE TABLE IF NOT EXISTS ledger.financial_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  financial_event_id UUID NOT NULL REFERENCES ledger.financial_events(id) ON DELETE CASCADE,
  allocation_type TEXT NOT NULL CHECK (allocation_type IN (
    'fleet_share',
    'driver_share',
    'platform_reimbursement',
    'driver_charge',
    'write_off',
    'trip_refund',
    'unlinked_trip',
    'dispute_refund',
    'tag_top_up',
    'cash_returned',
    'reversal'
  )),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'JMD',
  driver_id TEXT,
  toll_id TEXT,
  claim_id TEXT,
  fuel_entry_id TEXT,
  period_anchor DATE,
  idempotency_key TEXT NOT NULL UNIQUE,
  reverses_id UUID REFERENCES ledger.financial_allocations(id),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_alloc_event ON ledger.financial_allocations(financial_event_id);
CREATE INDEX IF NOT EXISTS idx_fin_alloc_driver_period
  ON ledger.financial_allocations(driver_id, period_anchor);
CREATE INDEX IF NOT EXISTS idx_fin_alloc_toll ON ledger.financial_allocations(toll_id)
  WHERE toll_id IS NOT NULL;

-- ── Transactional outbox for projection refresh ────────────────────────────
CREATE TABLE IF NOT EXISTS ledger.financial_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL DEFAULT 'period_projection_refresh',
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_outbox_pending
  ON ledger.financial_outbox(status, available_at)
  WHERE status IN ('pending', 'processing');

-- ── Weekly driver financial period projection ──────────────────────────────
CREATE TABLE IF NOT EXISTS ledger.driver_financial_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  driver_id TEXT NOT NULL,
  period_anchor DATE NOT NULL, -- Monday
  period_end DATE NOT NULL,    -- Sunday
  timezone TEXT NOT NULL DEFAULT 'America/Jamaica',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'reopened')),
  -- Money (JMD major units, 2dp) — denormalized for fast tab reads
  toll_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  toll_cash_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  toll_tag_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  toll_reimbursed NUMERIC(14,2) NOT NULL DEFAULT 0,
  toll_charged_to_driver NUMERIC(14,2) NOT NULL DEFAULT 0,
  toll_unmatched_count INTEGER NOT NULL DEFAULT 0,
  toll_reconciled_count INTEGER NOT NULL DEFAULT 0,
  toll_workflow_actionable INTEGER NOT NULL DEFAULT 0,
  dispute_refund_matched NUMERIC(14,2) NOT NULL DEFAULT 0,
  dispute_refund_unmatched NUMERIC(14,2) NOT NULL DEFAULT 0,
  fuel_driver_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  fuel_gas_card_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  fuel_deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
  fuel_fleet_share NUMERIC(14,2) NOT NULL DEFAULT 0,
  fuel_net_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
  fuel_finalized BOOLEAN NOT NULL DEFAULT false,
  earnings_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_collected NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_returned NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_still_held NUMERIC(14,2) NOT NULL DEFAULT 0,
  settlement_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payout_net NUMERIC(14,2) NOT NULL DEFAULT 0,
  settlement_status TEXT NOT NULL DEFAULT 'pending',
  payout_status TEXT NOT NULL DEFAULT 'pending',
  toll_status TEXT NOT NULL DEFAULT 'n/a', -- reconciled | unmatched | n/a
  source_event_hash TEXT NOT NULL DEFAULT '',
  projection_version INTEGER NOT NULL DEFAULT 1,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  reopened_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, period_anchor)
);

CREATE INDEX IF NOT EXISTS idx_dfp_status ON ledger.driver_financial_periods(status, period_anchor DESC);
CREATE INDEX IF NOT EXISTS idx_dfp_org_period
  ON ledger.driver_financial_periods(organization_id, period_anchor DESC);

CREATE TABLE IF NOT EXISTS ledger.driver_financial_period_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES ledger.driver_financial_periods(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  source_system TEXT,
  source_id TEXT,
  financial_event_id UUID REFERENCES ledger.financial_events(id) ON DELETE SET NULL,
  description TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'JMD',
  occurred_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dfp_lines_period ON ledger.driver_financial_period_lines(period_id, domain);
CREATE INDEX IF NOT EXISTS idx_dfp_lines_source
  ON ledger.driver_financial_period_lines(source_system, source_id)
  WHERE source_id IS NOT NULL;

-- ── Account taxonomy seeds (fleet expense / payables / clearing) ───────────
INSERT INTO ledger.accounts (organization_id, account_key, account_class, owner_role, currency, balance_minor)
VALUES
  (NULL, 'platform:fleet_toll_expense', 'expense', 'system', 'JMD', 0),
  (NULL, 'platform:fleet_fuel_expense', 'expense', 'system', 'JMD', 0),
  (NULL, 'platform:driver_receivable', 'asset', 'system', 'JMD', 0),
  (NULL, 'platform:driver_reimbursement_payable', 'liability', 'system', 'JMD', 0),
  (NULL, 'platform:toll_tag_clearing', 'liability', 'system', 'JMD', 0),
  (NULL, 'platform:fuel_card_clearing', 'liability', 'system', 'JMD', 0),
  (NULL, 'platform:reimbursement_receivable', 'asset', 'system', 'JMD', 0),
  (NULL, 'platform:bank_clearing', 'asset', 'system', 'JMD', 0),
  (NULL, 'platform:write_off', 'expense', 'system', 'JMD', 0)
ON CONFLICT (account_key, currency) DO NOTHING;

-- Teach account resolver about new keys
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
  ELSIF p_account_key IN ('platform:driver_reimbursement_payable', 'platform:toll_tag_clearing', 'platform:fuel_card_clearing') THEN
    RETURN QUERY SELECT 'liability'::TEXT, 'system'::TEXT;
  ELSIF p_account_key IN ('platform:receivable', 'platform:clearing', 'platform:driver_receivable', 'platform:reimbursement_receivable', 'platform:bank_clearing') THEN
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

-- ── Reverse a ledger entry (append-only) ───────────────────────────────────
CREATE OR REPLACE FUNCTION ledger.reverse_entry(
  p_entry_id UUID,
  p_idempotency_key TEXT,
  p_reason TEXT DEFAULT NULL,
  p_created_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ledger, public
AS $$
DECLARE
  v_src ledger.entries%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_src FROM ledger.entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry_not_found:%', p_entry_id;
  END IF;

  -- Swap debit/credit to reverse
  v_result := ledger.post_entry(
    p_idempotency_key,
    v_src.entry_type || '_reversal',
    (SELECT account_key FROM ledger.accounts WHERE id = v_src.credit_account_id),
    (SELECT account_key FROM ledger.accounts WHERE id = v_src.debit_account_id),
    v_src.amount_minor,
    v_src.currency,
    NULL,
    v_src.organization_id,
    v_src.product,
    now(),
    'reversal',
    v_src.id::TEXT,
    jsonb_build_object('reverses_entry_id', v_src.id, 'reason', p_reason),
    p_created_by_user_id,
    'financial_event',
    'reversal:' || v_src.id::TEXT,
    p_idempotency_key
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ledger_reverse_entry(
  p_entry_id UUID,
  p_idempotency_key TEXT,
  p_reason TEXT DEFAULT NULL,
  p_created_by_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ledger, public
AS $$
  SELECT ledger.reverse_entry(p_entry_id, p_idempotency_key, p_reason, p_created_by_user_id);
$$;

-- ── Atomic financial event post ────────────────────────────────────────────
-- Inserts event, posts balanced journal legs (when amount != 0), writes source
-- receipt, enqueues period projection refresh. Idempotent via idempotency_key.
CREATE OR REPLACE FUNCTION ledger.post_financial_event(
  p_idempotency_key TEXT,
  p_request_hash TEXT,
  p_domain TEXT,
  p_event_type TEXT,
  p_source_system TEXT,
  p_source_id TEXT,
  p_driver_id TEXT,
  p_vehicle_id TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_period_anchor DATE,
  p_amount_minor BIGINT,          -- signed
  p_currency TEXT DEFAULT 'JMD',
  p_direction TEXT DEFAULT 'outflow',
  p_organization_id UUID DEFAULT NULL,
  p_product TEXT DEFAULT 'roam_fleet',
  p_debit_account_key TEXT DEFAULT NULL,
  p_credit_account_key TEXT DEFAULT NULL,
  p_reverses_event_id UUID DEFAULT NULL,
  p_correlation_id TEXT DEFAULT NULL,
  p_causation_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_created_by_user_id UUID DEFAULT NULL,
  p_allocations JSONB DEFAULT '[]'::jsonb  -- [{allocation_type, amount_minor, ...}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ledger, public
AS $$
DECLARE
  v_existing ledger.financial_events%ROWTYPE;
  v_event_id UUID;
  v_entry_result JSONB;
  v_entry_id UUID;
  v_abs BIGINT;
  v_debit TEXT;
  v_credit TEXT;
  v_alloc JSONB;
  v_alloc_id UUID;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  SELECT * INTO v_existing
  FROM ledger.financial_events
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.request_hash IS NOT NULL AND p_request_hash IS NOT NULL
       AND v_existing.request_hash IS DISTINCT FROM p_request_hash THEN
      RETURN jsonb_build_object(
        'inserted', false, 'skipped', false, 'conflict', true,
        'event_id', NULL, 'ledger_entry_id', NULL
      );
    END IF;
    RETURN jsonb_build_object(
      'inserted', false, 'skipped', true, 'conflict', false,
      'event_id', v_existing.id, 'ledger_entry_id', v_existing.ledger_entry_id
    );
  END IF;

  v_abs := abs(COALESCE(p_amount_minor, 0));

  -- Default account legs when amount posts to the journal
  v_debit := p_debit_account_key;
  v_credit := p_credit_account_key;
  IF v_abs > 0 AND (v_debit IS NULL OR v_credit IS NULL) THEN
    IF p_direction = 'outflow' THEN
      v_debit := COALESCE(v_debit, 'platform:fleet_toll_expense');
      v_credit := COALESCE(v_credit, 'platform:clearing');
      IF p_domain = 'fuel' THEN
        v_debit := COALESCE(p_debit_account_key, 'platform:fleet_fuel_expense');
      END IF;
      IF p_event_type IN ('toll_charged_to_driver', 'driver_charge') THEN
        v_debit := COALESCE(p_debit_account_key,
          CASE WHEN p_driver_id ~ '^[0-9a-fA-F-]{36}$'
            THEN 'user:' || p_driver_id || ':driver:digital'
            ELSE 'platform:driver_receivable' END);
        v_credit := COALESCE(p_credit_account_key, 'platform:clearing');
      END IF;
    ELSIF p_direction = 'inflow' THEN
      v_debit := COALESCE(v_debit, 'platform:clearing');
      v_credit := COALESCE(v_credit,
        CASE WHEN p_driver_id ~ '^[0-9a-fA-F-]{36}$'
          THEN 'user:' || p_driver_id || ':driver:digital'
          ELSE 'platform:clearing' END);
    END IF;
  END IF;

  IF v_abs > 0 AND v_debit IS NOT NULL AND v_credit IS NOT NULL THEN
    v_entry_result := ledger.post_entry(
      'fin_event:' || p_idempotency_key,
      p_event_type,
      v_debit,
      v_credit,
      v_abs,
      COALESCE(p_currency, 'JMD'),
      p_request_hash,
      p_organization_id,
      COALESCE(p_product, 'roam_fleet'),
      p_occurred_at,
      p_source_system,
      p_source_id,
      COALESCE(p_payload, '{}'::jsonb),
      p_created_by_user_id,
      'financial_event',
      p_idempotency_key,
      p_idempotency_key
    );
    IF (v_entry_result->>'conflict')::boolean THEN
      RETURN jsonb_build_object(
        'inserted', false, 'skipped', false, 'conflict', true,
        'event_id', NULL, 'ledger_entry_id', NULL
      );
    END IF;
    v_entry_id := (v_entry_result->>'entry_id')::UUID;
  END IF;

  INSERT INTO ledger.financial_events (
    organization_id, idempotency_key, request_hash, domain, event_type,
    source_system, source_id, driver_id, vehicle_id, occurred_at, period_anchor,
    amount_minor, currency, direction, reverses_event_id, correlation_id,
    causation_id, payload, ledger_entry_id, created_by_user_id
  ) VALUES (
    p_organization_id, p_idempotency_key, p_request_hash, p_domain, p_event_type,
    p_source_system, p_source_id, p_driver_id, p_vehicle_id, p_occurred_at, p_period_anchor,
    COALESCE(p_amount_minor, 0), COALESCE(p_currency, 'JMD'), p_direction,
    p_reverses_event_id, p_correlation_id, p_causation_id,
    COALESCE(p_payload, '{}'::jsonb), v_entry_id, p_created_by_user_id
  )
  RETURNING id INTO v_event_id;

  -- Allocations (optional)
  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      INSERT INTO ledger.financial_allocations (
        organization_id, financial_event_id, allocation_type, amount_minor, currency,
        driver_id, toll_id, claim_id, fuel_entry_id, period_anchor, idempotency_key,
        reverses_id, notes, metadata
      ) VALUES (
        p_organization_id,
        v_event_id,
        v_alloc->>'allocation_type',
        (v_alloc->>'amount_minor')::BIGINT,
        COALESCE(v_alloc->>'currency', p_currency, 'JMD'),
        COALESCE(v_alloc->>'driver_id', p_driver_id),
        v_alloc->>'toll_id',
        v_alloc->>'claim_id',
        v_alloc->>'fuel_entry_id',
        COALESCE((v_alloc->>'period_anchor')::DATE, p_period_anchor),
        COALESCE(v_alloc->>'idempotency_key', p_idempotency_key || ':' || (v_alloc->>'allocation_type')),
        (v_alloc->>'reverses_id')::UUID,
        v_alloc->>'notes',
        COALESCE(v_alloc->'metadata', '{}'::jsonb)
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id INTO v_alloc_id;
    END LOOP;
  END IF;

  -- Outbox: refresh this driver's week
  INSERT INTO ledger.financial_outbox (topic, payload)
  VALUES (
    'period_projection_refresh',
    jsonb_build_object(
      'driver_id', p_driver_id,
      'period_anchor', p_period_anchor,
      'event_id', v_event_id,
      'domain', p_domain,
      'event_type', p_event_type
    )
  );

  RETURN jsonb_build_object(
    'inserted', true, 'skipped', false, 'conflict', false,
    'event_id', v_event_id, 'ledger_entry_id', v_entry_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ledger_post_financial_event(
  p_idempotency_key TEXT,
  p_request_hash TEXT,
  p_domain TEXT,
  p_event_type TEXT,
  p_source_system TEXT,
  p_source_id TEXT,
  p_driver_id TEXT,
  p_vehicle_id TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_period_anchor DATE,
  p_amount_minor BIGINT,
  p_currency TEXT DEFAULT 'JMD',
  p_direction TEXT DEFAULT 'outflow',
  p_organization_id UUID DEFAULT NULL,
  p_product TEXT DEFAULT 'roam_fleet',
  p_debit_account_key TEXT DEFAULT NULL,
  p_credit_account_key TEXT DEFAULT NULL,
  p_reverses_event_id UUID DEFAULT NULL,
  p_correlation_id TEXT DEFAULT NULL,
  p_causation_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_created_by_user_id UUID DEFAULT NULL,
  p_allocations JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ledger, public
AS $$
  SELECT ledger.post_financial_event(
    p_idempotency_key, p_request_hash, p_domain, p_event_type, p_source_system,
    p_source_id, p_driver_id, p_vehicle_id, p_occurred_at, p_period_anchor,
    p_amount_minor, p_currency, p_direction, p_organization_id, p_product,
    p_debit_account_key, p_credit_account_key, p_reverses_event_id,
    p_correlation_id, p_causation_id, p_payload, p_created_by_user_id, p_allocations
  );
$$;

-- ── Public views + grants ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.financial_events AS SELECT * FROM ledger.financial_events;
CREATE OR REPLACE VIEW public.financial_allocations AS SELECT * FROM ledger.financial_allocations;
CREATE OR REPLACE VIEW public.financial_outbox AS SELECT * FROM ledger.financial_outbox;
CREATE OR REPLACE VIEW public.driver_financial_periods AS SELECT * FROM ledger.driver_financial_periods;
CREATE OR REPLACE VIEW public.driver_financial_period_lines AS SELECT * FROM ledger.driver_financial_period_lines;

ALTER TABLE ledger.financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.financial_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.financial_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.driver_financial_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.driver_financial_period_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_events_select ON ledger.financial_events FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.rbac_is_platform_user(auth.uid())
    OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.owner_id = auth.uid())
  );
CREATE POLICY fin_alloc_select ON ledger.financial_allocations FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.rbac_is_platform_user(auth.uid())
    OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.owner_id = auth.uid())
  );
CREATE POLICY dfp_select ON ledger.driver_financial_periods FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.rbac_is_platform_user(auth.uid())
    OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.owner_id = auth.uid())
  );
CREATE POLICY dfp_lines_select ON ledger.driver_financial_period_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledger.driver_financial_periods p
      WHERE p.id = period_id
        AND (
          p.organization_id IS NULL
          OR public.rbac_is_platform_user(auth.uid())
          OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p.organization_id AND o.owner_id = auth.uid())
        )
    )
  );

GRANT SELECT ON public.financial_events TO authenticated, service_role;
GRANT SELECT ON public.financial_allocations TO authenticated, service_role;
GRANT SELECT ON public.financial_outbox TO service_role;
GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
GRANT SELECT ON public.driver_financial_period_lines TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ledger_reverse_entry(UUID, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ledger_post_financial_event(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, DATE, BIGINT,
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, JSONB, UUID, JSONB
) TO service_role;

NOTIFY pgrst, 'reload schema';
