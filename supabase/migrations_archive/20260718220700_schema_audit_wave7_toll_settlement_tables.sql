-- Schema audit Wave 7: typed toll.settlement_allocations + backfill from public table
-- Dual-write: extend public.toll_settlement_apply/reverse to mirror into toll schema.
-- Legacy public.toll_settlement_allocations remains readable until a follow-up cutover.

CREATE TABLE IF NOT EXISTS toll.settlement_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_public_id UUID UNIQUE,
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
  trip_id UUID,
  claim_id TEXT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  toll_period_anchor DATE,
  idempotency_key TEXT NOT NULL UNIQUE,
  reverses_id UUID REFERENCES toll.settlement_allocations(id),
  actor TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  parse_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (parse_status IN ('ok', 'unparsed', 'legacy_backfill')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS toll_settlement_allocations_toll_id_idx
  ON toll.settlement_allocations (toll_id);

CREATE INDEX IF NOT EXISTS toll_settlement_allocations_source_idx
  ON toll.settlement_allocations (source_type, source_id);

CREATE INDEX IF NOT EXISTS toll_settlement_allocations_claim_id_idx
  ON toll.settlement_allocations (claim_id)
  WHERE claim_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS toll_settlement_allocations_trip_id_idx
  ON toll.settlement_allocations (trip_id)
  WHERE trip_id IS NOT NULL;

COMMENT ON TABLE toll.settlement_allocations IS
  'Typed toll settlement credits/charges (amount_minor). Dual-written with public.toll_settlement_allocations during cutover.';

ALTER TABLE toll.settlement_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE toll.settlement_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE toll.settlement_allocations TO service_role;

INSERT INTO toll.settlement_allocations (
  id,
  legacy_public_id,
  source_type,
  source_id,
  toll_id,
  trip_id,
  claim_id,
  amount_minor,
  toll_period_anchor,
  idempotency_key,
  reverses_id,
  actor,
  notes,
  metadata,
  parse_status,
  created_at
)
SELECT
  p.id,
  p.id,
  p.source_type,
  p.source_id,
  p.toll_id,
  CASE
    WHEN (p.metadata->>'trip_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (p.metadata->>'trip_id')::uuid
    WHEN p.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND p.source_type IN ('trip_refund', 'unlinked_trip')
      THEN p.source_id::uuid
    ELSE NULL
  END,
  p.claim_id,
  GREATEST(1, ROUND(p.amount * 100)::bigint),
  p.toll_period_anchor,
  p.idempotency_key,
  NULL,
  p.actor,
  p.notes,
  COALESCE(p.metadata, '{}'::jsonb),
  'legacy_backfill',
  p.created_at
FROM public.toll_settlement_allocations p
ON CONFLICT (idempotency_key) DO NOTHING;

UPDATE toll.settlement_allocations t
SET reverses_id = p.reverses_id
FROM public.toll_settlement_allocations p
WHERE t.legacy_public_id = p.id
  AND p.reverses_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM toll.settlement_allocations x WHERE x.id = p.reverses_id
  );

CREATE OR REPLACE FUNCTION toll.mirror_settlement_from_public(p_row public.toll_settlement_allocations)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = toll, public, pg_temp
AS $$
BEGIN
  INSERT INTO toll.settlement_allocations (
    id, legacy_public_id, source_type, source_id, toll_id, trip_id, claim_id,
    amount_minor, toll_period_anchor, idempotency_key, reverses_id, actor, notes,
    metadata, parse_status, created_at
  ) VALUES (
    p_row.id,
    p_row.id,
    p_row.source_type,
    p_row.source_id,
    p_row.toll_id,
    CASE
      WHEN (p_row.metadata->>'trip_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (p_row.metadata->>'trip_id')::uuid
      ELSE NULL
    END,
    p_row.claim_id,
    GREATEST(1, ROUND(p_row.amount * 100)::bigint),
    p_row.toll_period_anchor,
    p_row.idempotency_key,
    p_row.reverses_id,
    p_row.actor,
    p_row.notes,
    COALESCE(p_row.metadata, '{}'::jsonb),
    'ok',
    COALESCE(p_row.created_at, now())
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    reverses_id = EXCLUDED.reverses_id,
    notes = EXCLUDED.notes,
    metadata = EXCLUDED.metadata;
END;
$$;

REVOKE ALL ON FUNCTION toll.mirror_settlement_from_public(public.toll_settlement_allocations) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION toll.mirror_settlement_from_public(public.toll_settlement_allocations) TO service_role;

-- Preserve original apply/reverse behavior; add dual-write mirror calls
CREATE OR REPLACE FUNCTION public.toll_settlement_apply(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, toll, pg_temp
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
    PERFORM toll.mirror_settlement_from_public(v_existing);
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

  PERFORM toll.mirror_settlement_from_public(v_inserted);

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'allocation', to_jsonb(v_inserted),
    'remaining_after', GREATEST(0, v_toll_cost - public.toll_settlement_active_credits(p->>'toll_id'))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.toll_settlement_reverse(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, toll, pg_temp
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
    PERFORM toll.mirror_settlement_from_public(v_existing_rev);
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

  PERFORM toll.mirror_settlement_from_public(v_inserted);

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'allocation', to_jsonb(v_inserted)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toll_settlement_apply(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.toll_settlement_reverse(JSONB) TO service_role;
