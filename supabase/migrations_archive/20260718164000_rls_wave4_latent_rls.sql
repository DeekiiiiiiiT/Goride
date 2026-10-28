-- RLS Wave 4: enable latent RLS + evidence_files scope + toll brain lock

-- ---------------------------------------------------------------------------
-- rides.ledger_lines
-- ---------------------------------------------------------------------------
ALTER TABLE rides.ledger_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rides_ledger_lines_participant_select ON rides.ledger_lines;
CREATE POLICY rides_ledger_lines_participant_select ON rides.ledger_lines
  FOR SELECT TO authenticated
  USING (driver_user_id = auth.uid() OR rider_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- rides.service_body_types — reference data; read-all, write service-only
-- ---------------------------------------------------------------------------
ALTER TABLE rides.service_body_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rides_service_body_types_read ON rides.service_body_types;
CREATE POLICY rides_service_body_types_read ON rides.service_body_types
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Cash settlement / payment obligation tables — default deny for clients
-- ---------------------------------------------------------------------------
ALTER TABLE rides.cash_settlement_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.admin_settlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.payment_obligations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- toll.brain_policies — match fuel pattern
-- ---------------------------------------------------------------------------
ALTER TABLE toll.brain_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS toll_brain_policies_service ON toll.brain_policies;
CREATE POLICY toll_brain_policies_service ON toll.brain_policies
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- public.toll_settlement_allocations
-- ---------------------------------------------------------------------------
ALTER TABLE public.toll_settlement_allocations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Passenger social / privacy tables
-- ---------------------------------------------------------------------------
ALTER TABLE rides.ride_trip_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ride_trip_shares_owner ON rides.ride_trip_shares;
CREATE POLICY ride_trip_shares_owner ON rides.ride_trip_shares
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

ALTER TABLE rides.ride_trip_share_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ride_trip_share_events_owner ON rides.ride_trip_share_events;
CREATE POLICY ride_trip_share_events_owner ON rides.ride_trip_share_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rides.ride_trip_shares s
      WHERE s.id = trip_share_id AND s.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rides.ride_trip_shares s
      WHERE s.id = trip_share_id AND s.owner_user_id = auth.uid()
    )
  );

ALTER TABLE rides.ride_passenger_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ride_passenger_invites_participant ON rides.ride_passenger_invites;
CREATE POLICY ride_passenger_invites_participant ON rides.ride_passenger_invites
  FOR ALL TO authenticated
  USING (
    claimed_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.id = ride_request_id
        AND (r.rider_user_id = auth.uid() OR r.passenger_user_id = auth.uid())
    )
  )
  WITH CHECK (
    claimed_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.id = ride_request_id AND r.rider_user_id = auth.uid()
    )
  );

ALTER TABLE rides.booking_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_requests_requester ON rides.booking_requests;
CREATE POLICY booking_requests_requester ON rides.booking_requests
  FOR ALL TO authenticated
  USING (requester_user_id = auth.uid())
  WITH CHECK (requester_user_id = auth.uid());

DROP POLICY IF EXISTS booking_requests_claimer_select ON rides.booking_requests;
CREATE POLICY booking_requests_claimer_select ON rides.booking_requests
  FOR SELECT TO authenticated
  USING (claimed_by_user_id = auth.uid());

ALTER TABLE rides.passenger_authorizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS passenger_authorizations_booker ON rides.passenger_authorizations;
CREATE POLICY passenger_authorizations_booker ON rides.passenger_authorizations
  FOR ALL TO authenticated
  USING (booker_user_id = auth.uid() OR passenger_user_id = auth.uid())
  WITH CHECK (booker_user_id = auth.uid());

ALTER TABLE rides.pickup_location_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pickup_location_requests_participant ON rides.pickup_location_requests;
CREATE POLICY pickup_location_requests_participant ON rides.pickup_location_requests
  FOR ALL TO authenticated
  USING (booker_user_id = auth.uid() OR rider_user_id = auth.uid())
  WITH CHECK (booker_user_id = auth.uid());

ALTER TABLE rides.roam_connection_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roam_connection_requests_participant ON rides.roam_connection_requests;
CREATE POLICY roam_connection_requests_participant ON rides.roam_connection_requests
  FOR ALL TO authenticated
  USING (requester_user_id = auth.uid() OR target_user_id = auth.uid())
  WITH CHECK (requester_user_id = auth.uid() OR target_user_id = auth.uid());

ALTER TABLE rides.roam_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roam_connections_participant ON rides.roam_connections;
CREATE POLICY roam_connections_participant ON rides.roam_connections
  FOR ALL TO authenticated
  USING (user_a_id = auth.uid() OR user_b_id = auth.uid())
  WITH CHECK (user_a_id = auth.uid() OR user_b_id = auth.uid());

ALTER TABLE rides.user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_blocks_blocker ON rides.user_blocks;
CREATE POLICY user_blocks_blocker ON rides.user_blocks
  FOR ALL TO authenticated
  USING (blocker_user_id = auth.uid())
  WITH CHECK (blocker_user_id = auth.uid());

ALTER TABLE rides.abuse_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS abuse_reports_reporter ON rides.abuse_reports;
CREATE POLICY abuse_reports_reporter ON rides.abuse_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_user_id = auth.uid());
CREATE POLICY abuse_reports_reporter_select ON rides.abuse_reports
  FOR SELECT TO authenticated
  USING (reporter_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- evidence_files — org-scoped read (skip if table not deployed yet)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.evidence_files') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS evidence_files_authenticated_read ON public.evidence_files';
    EXECUTE $p$
      CREATE POLICY evidence_files_authenticated_read ON public.evidence_files
        FOR SELECT TO authenticated
        USING (
          public.rbac_is_platform_user(auth.uid())
          OR (
            org_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.organizations o
              WHERE o.id::text = evidence_files.org_id AND o.owner_id = auth.uid()
            )
          )
          OR (
            org_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.driver_profiles dp
              WHERE dp.user_id = auth.uid() AND dp.fleet_id::text = evidence_files.org_id
            )
          )
        )
    $p$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Station devices / shift sessions — deny-all for authenticated if no policies
-- (writes stay service-role mediated)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'delivery' AND tablename = 'merchant_station_devices'
  ) THEN
    ALTER TABLE delivery.merchant_station_devices ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'delivery' AND tablename = 'merchant_station_devices'
    ) THEN
      CREATE POLICY merchant_station_devices_deny_authenticated
        ON delivery.merchant_station_devices
        FOR ALL TO authenticated
        USING (false)
        WITH CHECK (false);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'delivery' AND tablename = 'merchant_shift_sessions'
  ) THEN
    ALTER TABLE delivery.merchant_shift_sessions ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'delivery' AND tablename = 'merchant_shift_sessions'
    ) THEN
      CREATE POLICY merchant_shift_sessions_deny_authenticated
        ON delivery.merchant_shift_sessions
        FOR ALL TO authenticated
        USING (false)
        WITH CHECK (false);
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
