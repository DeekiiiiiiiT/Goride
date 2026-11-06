-- M-03: support govern attempts stored as proposals (server layer).

CREATE TABLE IF NOT EXISTS public.catalog_governance_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_by uuid,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT catalog_governance_proposal_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_governance_proposal_pending
  ON public.catalog_governance_proposal (status, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.catalog_governance_proposal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_governance_proposal_deny ON public.catalog_governance_proposal;
CREATE POLICY catalog_governance_proposal_deny
  ON public.catalog_governance_proposal
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.catalog_governance_proposal FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.catalog_governance_proposal TO service_role;
