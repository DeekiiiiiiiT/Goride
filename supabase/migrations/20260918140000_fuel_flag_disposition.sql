-- Fill-level flag dispositions — durable answer to a classifier claim.
-- Current-state unique (org, entry, flag_code); history via fuel_period_audit.

CREATE TABLE IF NOT EXISTS public.fuel_flag_disposition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  entry_id text NOT NULL,
  flag_code text NOT NULL,
  action text NOT NULL CHECK (action IN ('accepted', 'corrected', 'escalated')),
  note text,
  period_id text REFERENCES public.fuel_reconciliation_period (id),
  actor_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, entry_id, flag_code)
);

CREATE INDEX IF NOT EXISTS fuel_flag_disposition_org_entry_idx
  ON public.fuel_flag_disposition (org_id, entry_id);

CREATE INDEX IF NOT EXISTS fuel_flag_disposition_period_idx
  ON public.fuel_flag_disposition (period_id)
  WHERE period_id IS NOT NULL;

ALTER TABLE public.fuel_flag_disposition ENABLE ROW LEVEL SECURITY;

-- SELECT: org JWT. Writes: service role / edge only (no authenticated INSERT/UPDATE).
CREATE POLICY fuel_flag_disposition_org_select ON public.fuel_flag_disposition
  FOR SELECT TO authenticated
  USING (
    org_id::text = COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
      (auth.jwt() -> 'user_metadata' ->> 'organization_id')
    )
  );

COMMENT ON TABLE public.fuel_flag_disposition IS
  'Current disposition per fill flag_code. SELECT: org JWT. INSERT/UPDATE: service role / edge only. Audit trail via fuel_period_audit.flag_disposition.';

-- Backfill from SQL fuel_entries that already carry reconExceptionAck / exceptionResolvedAt.
INSERT INTO public.fuel_flag_disposition (org_id, entry_id, flag_code, action, note, actor_id, at)
SELECT
  fe.organization_id::uuid,
  fe.id,
  'signal_exception',
  'accepted',
  NULLIF(
    COALESCE(
      fe.payload_json -> 'metadata' ->> 'exceptionResolveNote',
      fe.payload_json ->> 'exceptionResolveNote',
      ''
    ),
    ''
  ),
  COALESCE(
    NULLIF(
      COALESCE(
        fe.payload_json -> 'metadata' ->> 'exceptionResolvedBy',
        fe.payload_json ->> 'exceptionResolvedBy',
        ''
      ),
      ''
    )::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  COALESCE(
    NULLIF(
      COALESCE(
        fe.payload_json -> 'metadata' ->> 'exceptionResolvedAt',
        fe.payload_json ->> 'exceptionResolvedAt',
        ''
      ),
      ''
    )::timestamptz,
    fe.updated_at,
    now()
  )
FROM fleet.fuel_entries fe
WHERE fe.organization_id IS NOT NULL
  AND fe.organization_id ~ '^[0-9a-fA-F-]{36}$'
  AND (
    COALESCE(fe.payload_json -> 'metadata' ->> 'reconExceptionAck', fe.payload_json ->> 'reconExceptionAck')
      IN ('true', '1', 'True')
    OR COALESCE(fe.payload_json -> 'metadata' ->> 'exceptionResolvedAt', fe.payload_json ->> 'exceptionResolvedAt')
      IS NOT NULL
  )
ON CONFLICT (org_id, entry_id, flag_code) DO NOTHING;
