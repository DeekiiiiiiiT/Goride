-- Phase C: Enterprise marketplace matching for logistics jobs (org-fleet supply v1).
-- Does NOT write into rides.ride_requests / rides.driver_offers.

-- ---------------------------------------------------------------------------
-- jobs: matching fields + matching status
-- ---------------------------------------------------------------------------
ALTER TABLE logistics.jobs
  DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE logistics.jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'unassigned', 'matching', 'assigned', 'in_progress', 'completed', 'cancelled', 'exception'
  ));

ALTER TABLE logistics.jobs
  ADD COLUMN IF NOT EXISTS matching_wave INTEGER NOT NULL DEFAULT 0;

ALTER TABLE logistics.jobs
  ADD COLUMN IF NOT EXISTS matching_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_logistics_jobs_org_matching
  ON logistics.jobs (organization_id, status)
  WHERE status = 'matching';

-- ---------------------------------------------------------------------------
-- job_offers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics.job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES logistics.jobs(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'superseded')),
  wave INTEGER NOT NULL DEFAULT 1,
  rank_score NUMERIC(14, 6),
  distance_km NUMERIC(14, 6),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, driver_user_id, wave)
);

CREATE INDEX IF NOT EXISTS idx_logistics_job_offers_job
  ON logistics.job_offers (job_id, status);

CREATE INDEX IF NOT EXISTS idx_logistics_job_offers_driver_pending
  ON logistics.job_offers (driver_user_id, status)
  WHERE status = 'pending';

ALTER TABLE logistics.job_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistics_job_offers_select ON logistics.job_offers;
CREATE POLICY logistics_job_offers_select ON logistics.job_offers
  FOR SELECT TO authenticated
  USING (
    logistics.user_owns_org(organization_id)
    OR driver_user_id = auth.uid()
  );

DROP POLICY IF EXISTS logistics_job_offers_no_insert ON logistics.job_offers;
CREATE POLICY logistics_job_offers_no_insert ON logistics.job_offers
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS logistics_job_offers_no_update ON logistics.job_offers;
CREATE POLICY logistics_job_offers_no_update ON logistics.job_offers
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS logistics_job_offers_no_delete ON logistics.job_offers;
CREATE POLICY logistics_job_offers_no_delete ON logistics.job_offers
  FOR DELETE TO authenticated USING (false);

GRANT SELECT ON logistics.job_offers TO authenticated;
GRANT ALL ON logistics.job_offers TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic accept RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION logistics.accept_job_offer(
  p_offer_id UUID,
  p_driver_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = logistics, public
AS $$
DECLARE
  v_offer logistics.job_offers%ROWTYPE;
  v_job logistics.jobs%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_offer
  FROM logistics.job_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_found');
  END IF;

  IF v_offer.driver_user_id IS DISTINCT FROM p_driver_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_wrong_driver');
  END IF;

  IF v_offer.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_pending', 'status', v_offer.status);
  END IF;

  IF v_offer.expires_at <= v_now THEN
    UPDATE logistics.job_offers SET status = 'expired' WHERE id = v_offer.id;
    RETURN jsonb_build_object('ok', false, 'error', 'offer_expired');
  END IF;

  SELECT * INTO v_job
  FROM logistics.jobs
  WHERE id = v_offer.job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_found');
  END IF;

  IF v_job.status NOT IN ('matching', 'unassigned') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_open', 'status', v_job.status);
  END IF;

  UPDATE logistics.job_offers
  SET status = 'accepted'
  WHERE id = v_offer.id;

  UPDATE logistics.job_offers
  SET status = 'superseded'
  WHERE job_id = v_job.id
    AND status = 'pending'
    AND id IS DISTINCT FROM v_offer.id;

  UPDATE logistics.jobs
  SET
    status = 'assigned',
    assignee_type = 'roam_marketplace',
    assignee_driver_id = p_driver_user_id,
    assigned_at = v_now,
    updated_at = v_now
  WHERE id = v_job.id;

  INSERT INTO logistics.job_events (
    organization_id, job_id, event_type, from_status, to_status,
    actor_user_id, note, payload, idempotency_key, occurred_at
  ) VALUES (
    v_job.organization_id,
    v_job.id,
    'marketplace_offer_accepted',
    v_job.status,
    'assigned',
    p_driver_user_id,
    'Driver accepted marketplace offer',
    jsonb_build_object('offer_id', v_offer.id, 'wave', v_offer.wave),
    'accept:' || v_offer.id::text,
    v_now
  )
  ON CONFLICT (organization_id, idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'offer_id', v_offer.id,
    'status', 'assigned'
  );
END;
$$;

REVOKE ALL ON FUNCTION logistics.accept_job_offer(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION logistics.accept_job_offer(UUID, UUID) TO service_role;

-- Public wrapper so Edge can call via default PostgREST rpc path
CREATE OR REPLACE FUNCTION public.logistics_accept_job_offer(
  p_offer_id UUID,
  p_driver_user_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, logistics
AS $$
  SELECT logistics.accept_job_offer(p_offer_id, p_driver_user_id);
$$;

REVOKE ALL ON FUNCTION public.logistics_accept_job_offer(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logistics_accept_job_offer(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Activate enterprise matching product profile
-- ---------------------------------------------------------------------------
UPDATE matching.product_profiles
SET is_active = TRUE,
    overrides = COALESCE(overrides, '{}'::jsonb) || jsonb_build_object(
      'body_type_filtering_enabled', false,
      'independent_only_matching', false
    )
WHERE product_key = 'enterprise'
  AND surface_key = 'default';
