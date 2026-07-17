-- Canonical toll settlement allocations: trip credits, dispute credits, charges.
-- Append-only with reversal rows. Idempotent apply/reverse via RPC.

CREATE TABLE IF NOT EXISTS public.toll_settlement_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL
    CHECK (source_type IN (
      'trip_refund',
      'unlinked_trip',
      'dispute_refund',
      'driver_charge',
      'write_off',
      'reversal'
    )),
  source_id TEXT NOT NULL,
  toll_id TEXT NOT NULL,
  claim_id TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  toll_period_anchor DATE,
  idempotency_key TEXT NOT NULL UNIQUE,
  reverses_id UUID REFERENCES public.toll_settlement_allocations(id),
  actor TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS toll_settlement_allocations_toll_id_idx
  ON public.toll_settlement_allocations (toll_id);

CREATE INDEX IF NOT EXISTS toll_settlement_allocations_source_idx
  ON public.toll_settlement_allocations (source_type, source_id);

CREATE INDEX IF NOT EXISTS toll_settlement_allocations_claim_id_idx
  ON public.toll_settlement_allocations (claim_id)
  WHERE claim_id IS NOT NULL;

COMMENT ON TABLE public.toll_settlement_allocations IS
  'Ordered reimbursements against imported tolls. remaining = cost - active credits.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.toll_settlement_allocations TO service_role;

-- Active (non-reversed) credit total for a toll.
CREATE OR REPLACE FUNCTION public.toll_settlement_active_credits(p_toll_id TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN a.source_type = 'reversal' THEN -a.amount
      WHEN a.source_type IN ('driver_charge', 'write_off') THEN 0
      WHEN EXISTS (
        SELECT 1 FROM public.toll_settlement_allocations r
        WHERE r.reverses_id = a.id
      ) THEN 0
      ELSE a.amount
    END
  ), 0)
  FROM public.toll_settlement_allocations a
  WHERE a.toll_id = p_toll_id
    AND a.source_type <> 'reversal';
$$;

-- Apply one allocation atomically. Rejects duplicate idempotency keys,
-- over-allocation vs toll cost, and reversed sources.
CREATE OR REPLACE FUNCTION public.toll_settlement_apply(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.toll_settlement_allocations%ROWTYPE;
  v_inserted public.toll_settlement_allocations%ROWTYPE;
  v_toll_cost NUMERIC := COALESCE((p->>'toll_cost')::NUMERIC, 0);
  v_amount NUMERIC := COALESCE((p->>'amount')::NUMERIC, 0);
  v_active NUMERIC;
  v_remaining NUMERIC;
BEGIN
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  SELECT * INTO v_existing
  FROM public.toll_settlement_allocations
  WHERE idempotency_key = p->>'idempotency_key';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'allocation', to_jsonb(v_existing)
    );
  END IF;

  v_active := public.toll_settlement_active_credits(p->>'toll_id');
  v_remaining := GREATEST(0, v_toll_cost - v_active);

  IF (p->>'source_type') IN ('trip_refund', 'unlinked_trip', 'dispute_refund')
     AND v_amount > v_remaining + 0.05 THEN
    RAISE EXCEPTION 'over_allocation: amount % exceeds remaining %', v_amount, v_remaining;
  END IF;

  INSERT INTO public.toll_settlement_allocations (
    source_type, source_id, toll_id, claim_id, amount,
    toll_period_anchor, idempotency_key, actor, notes, metadata
  ) VALUES (
    p->>'source_type',
    p->>'source_id',
    p->>'toll_id',
    NULLIF(p->>'claim_id', ''),
    v_amount,
    NULLIF(p->>'toll_period_anchor', '')::DATE,
    p->>'idempotency_key',
    NULLIF(p->>'actor', ''),
    NULLIF(p->>'notes', ''),
    COALESCE(p->'metadata', '{}'::jsonb)
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'allocation', to_jsonb(v_inserted),
    'remaining_after', GREATEST(0, v_toll_cost - public.toll_settlement_active_credits(p->>'toll_id'))
  );
END;
$$;

-- Reverse an active allocation by idempotency key or id.
CREATE OR REPLACE FUNCTION public.toll_settlement_reverse(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.toll_settlement_allocations%ROWTYPE;
  v_existing_rev public.toll_settlement_allocations%ROWTYPE;
  v_inserted public.toll_settlement_allocations%ROWTYPE;
  v_rev_key TEXT;
BEGIN
  IF COALESCE(p->>'idempotency_key', '') <> '' THEN
    SELECT * INTO v_target
    FROM public.toll_settlement_allocations
    WHERE idempotency_key = p->>'idempotency_key';
  ELSIF COALESCE(p->>'allocation_id', '') <> '' THEN
    SELECT * INTO v_target
    FROM public.toll_settlement_allocations
    WHERE id = (p->>'allocation_id')::UUID;
  ELSE
    RAISE EXCEPTION 'idempotency_key or allocation_id required';
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'noop', true, 'reason', 'not_found');
  END IF;

  IF v_target.source_type = 'reversal' THEN
    RETURN jsonb_build_object('ok', true, 'noop', true, 'reason', 'already_reversal');
  END IF;

  v_rev_key := COALESCE(NULLIF(p->>'reversal_idempotency_key', ''), 'rev:' || v_target.idempotency_key);

  SELECT * INTO v_existing_rev
  FROM public.toll_settlement_allocations
  WHERE idempotency_key = v_rev_key OR reverses_id = v_target.id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'allocation', to_jsonb(v_existing_rev)
    );
  END IF;

  INSERT INTO public.toll_settlement_allocations (
    source_type, source_id, toll_id, claim_id, amount,
    toll_period_anchor, idempotency_key, reverses_id, actor, notes, metadata
  ) VALUES (
    'reversal',
    v_target.source_id,
    v_target.toll_id,
    v_target.claim_id,
    v_target.amount,
    v_target.toll_period_anchor,
    v_rev_key,
    v_target.id,
    NULLIF(p->>'actor', ''),
    NULLIF(p->>'notes', ''),
    jsonb_build_object('reversed_source_type', v_target.source_type)
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'allocation', to_jsonb(v_inserted)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toll_settlement_active_credits(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.toll_settlement_apply(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.toll_settlement_reverse(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
