-- Uber activity timeline (D1-D3). Made-up rows only; everything rolls back.
-- Times are UTC; Jamaica = UTC-5. Week of Mon 2026-10-26.

BEGIN;

DO $$
DECLARE
  v_org uuid := 'c1111111-1111-4111-8111-111111111101';
  v_org_text text := v_org::text;
  v_driver text := 'drv-timeline-check';
  v_vehicle text := 'veh-timeline-check';
  v_status text;
  v_desk jsonb;
  v_a uuid;
  v_b uuid;
  v_cov jsonb;
  v_ok boolean;
BEGIN
  -- D1: unknown
  v_status := toll_system.driver_status_at(v_org, v_driver, v_vehicle, '2026-10-28 15:30+00', 'date_only');
  RAISE NOTICE 'D1 date_only -> unknown: %', CASE WHEN v_status = 'unknown' THEN 'PASS' ELSE 'FAIL (' || v_status || ')' END;
  v_status := toll_system.driver_status_at(v_org, NULL, v_vehicle, '2026-10-28 15:30+00', 'exact');
  RAISE NOTICE 'D1 no driver -> unknown: %', CASE WHEN v_status = 'unknown' THEN 'PASS' ELSE 'FAIL (' || v_status || ')' END;

  -- Timeline: 28 Oct online 14:00-16:00 (Uber) + Roam online 14:05; 29 Oct one short Uber stretch.
  INSERT INTO fleet.driver_activity_events (organization_id, driver_id, service_line, source, source_event_id, event_type, occurred_at)
  VALUES
    (v_org_text, v_driver, 'uber', 'uber_app_activity', 'tl-check-1', 'went_online',  '2026-10-28 14:00+00'),
    (v_org_text, v_driver, 'uber', 'uber_app_activity', 'tl-check-2', 'went_offline', '2026-10-28 16:00+00'),
    (v_org_text, v_driver, 'roam_rides', 'native',      'tl-check-3', 'went_online',  '2026-10-28 14:05+00'),
    (v_org_text, v_driver, 'roam_rides', 'native',      'tl-check-4', 'went_offline', '2026-10-28 15:55+00'),
    (v_org_text, v_driver, 'uber', 'uber_app_activity', 'tl-check-5', 'went_online',  '2026-10-29 13:00+00'),
    (v_org_text, v_driver, 'uber', 'uber_app_activity', 'tl-check-6', 'went_offline', '2026-10-29 13:10+00');

  -- InDrive trip on 29 Oct 14:00-15:45 (no Uber online then)
  INSERT INTO toll.platform_trips (organization_id, platform, platform_trip_id, driver_id, vehicle_id,
                                   request_at, pickup_at, dropoff_at, time_precision, payment_method)
  VALUES (v_org, 'indrive', 'trip-check-1', v_driver, v_vehicle,
          '2026-10-29 14:00+00', '2026-10-29 14:30+00', '2026-10-29 15:45+00', 'exact', 'cash');

  v_status := toll_system.driver_status_at(v_org, v_driver, v_vehicle, '2026-10-29 15:30+00', 'exact');
  RAISE NOTICE 'D1 inside InDrive trip -> on_trip: %', CASE WHEN v_status = 'on_trip' THEN 'PASS' ELSE 'FAIL (' || v_status || ')' END;
  v_status := toll_system.driver_status_at(v_org, v_driver, v_vehicle, '2026-10-30 15:30+00', 'exact');
  RAISE NOTICE 'D1 day with no timeline -> no_timeline: %', CASE WHEN v_status = 'no_timeline' THEN 'PASS' ELSE 'FAIL (' || v_status || ')' END;
  v_status := toll_system.driver_status_at(v_org, v_driver, v_vehicle, '2026-10-28 15:00+00', 'exact');
  RAISE NOTICE 'D1 online stretch -> online: %', CASE WHEN v_status = 'online' THEN 'PASS' ELSE 'FAIL (' || v_status || ')' END;
  v_status := toll_system.driver_status_at(v_org, v_driver, v_vehicle, '2026-10-28 16:30+00', 'exact');
  RAISE NOTICE 'D1 after going offline -> offline: %', CASE WHEN v_status = 'offline' THEN 'PASS' ELSE 'FAIL (' || v_status || ')' END;
  v_status := toll_system.driver_status_at(v_org, v_driver, v_vehicle, '2026-10-28 16:04:30+00', 'exact');
  RAISE NOTICE 'D1 4.5 min after offline -> online (slack): %', CASE WHEN v_status = 'online' THEN 'PASS' ELSE 'FAIL (' || v_status || ')' END;
  v_status := toll_system.driver_status_at(v_org, v_driver, v_vehicle, '2026-10-28 13:56+00', 'exact');
  RAISE NOTICE 'D1 4 min before online -> online (slack): %', CASE WHEN v_status = 'online' THEN 'PASS' ELSE 'FAIL (' || v_status || ')' END;
  v_status := toll_system.driver_status_at(v_org, v_driver, v_vehicle, '2026-10-28 13:30+00', 'exact');
  RAISE NOTICE 'D1 before first online that day -> offline: %', CASE WHEN v_status = 'offline' THEN 'PASS' ELSE 'FAIL (' || v_status || ')' END;

  -- D2: the toll desk. A = crossing while offline (no trip, pending). B = crossing while online.
  INSERT INTO toll.charges (organization_id, vehicle_id, driver_id, occurred_at, week_key, time_precision,
                            amount_minor, paid_by, source, source_ref)
  VALUES (v_org, v_vehicle, v_driver, '2026-10-28 16:30+00', '2026-10-26', 'minute', 25000, 'tag', 'tag_statement', 'tl-check-a')
  RETURNING id INTO v_a;
  INSERT INTO toll.charges (organization_id, vehicle_id, driver_id, occurred_at, week_key, time_precision,
                            amount_minor, paid_by, source, source_ref)
  VALUES (v_org, v_vehicle, v_driver, '2026-10-28 15:00+00', '2026-10-26', 'minute', 18000, 'tag', 'tag_statement', 'tl-check-b')
  RETURNING id INTO v_b;

  v_desk := toll_system.week_desk(v_org, '2026-10-26');
  SELECT bool_and(CASE WHEN (c ->> 'id')::uuid = v_a THEN c ->> 'driverStatus' = 'offline' AND (c ->> 'offlineFlag')::boolean
                       WHEN (c ->> 'id')::uuid = v_b THEN c ->> 'driverStatus' = 'online' AND NOT (c ->> 'offlineFlag')::boolean
                       ELSE true END)
    INTO v_ok FROM jsonb_array_elements(v_desk -> 'charges') c;
  RAISE NOTICE 'D2 offline crossing flagged, online crossing not: %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || (v_desk -> 'charges')::text END;
  RAISE NOTICE 'D2 summary counts the offline crossing: %',
    CASE WHEN (v_desk #>> '{summary,offlineFlagged}')::int = 1 AND (v_desk #>> '{summary,offlineFlaggedMinor}')::bigint = 25000
         THEN 'PASS' ELSE 'FAIL ' || coalesce((v_desk -> 'summary')::text, 'null') END;
  RAISE NOTICE 'D2 desk still has its other parts: %',
    CASE WHEN v_desk ?& ARRAY['weekKey','sealed','paid','weekVersion','result','charges','paybacks','kept','reviewPairs','late','blockers']
         THEN 'PASS' ELSE 'FAIL' END;

  -- D3: step 1 coverage
  v_cov := recon.compute_source_coverage(v_org_text, 'rideshare', 'uber_activity_timeline', '2026-10-26');
  RAISE NOTICE 'D3 days with a timeline are covered, others missing: %',
    CASE WHEN v_cov ->> '2026-10-28' = 'covered' AND v_cov ->> '2026-10-29' = 'covered' AND v_cov ->> '2026-10-30' = 'missing'
         THEN 'PASS' ELSE 'FAIL ' || v_cov::text END;
END;
$$;

ROLLBACK;
