-- Toll disputes D1: invariant counts (must stay 0).

BEGIN;

DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n
  FROM toll.allocations a
  WHERE a.bearer = 'platform'
    AND a.reversed_by IS NULL
    AND a.payback_id IS NULL
    AND NOT (a.provisional = true AND a.dispute_id IS NOT NULL);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'platform allocations missing payback or provisional+dispute: %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM toll.allocations a
  WHERE a.bearer <> 'platform'
    AND a.reversed_by IS NULL
    AND a.payback_id IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'non-platform allocations with payback: %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM (
    SELECT d.organization_id, d.charge_id, count(*) AS c
    FROM toll.disputes d
    WHERE d.state NOT IN ('won', 'part_won', 'lost')
    GROUP BY d.organization_id, d.charge_id
    HAVING count(*) > 1
  ) x;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'two non-final disputes on one charge: %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM toll.disputes d
  WHERE d.recovered_minor > d.owed_minor;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'recovered_minor > owed_minor: %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM toll.disputes d
  JOIN LATERAL (
    SELECT coalesce(sum(l.amount_minor), 0) AS s
    FROM toll.dispute_links l
    WHERE l.organization_id = d.organization_id
      AND l.dispute_id = d.id
      AND l.reversed_by IS NULL
  ) s ON true
  WHERE s.s > d.owed_minor;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'active dispute links exceed owed: %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM toll.platform_settings ps
  WHERE ps.payback_mode = 'rider_pays_driver'
    AND (ps.auto_apply OR ps.takes_disputes);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rider_pays_driver with auto_apply or takes_disputes: %', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM toll.carried_facts f
  WHERE f.kind = 'dispute_result' AND f.dispute_id IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'dispute_result carried fact without dispute_id: %', v_n;
  END IF;

  RAISE NOTICE 'toll_disputes_schema_checks: ok';
END;
$$;

ROLLBACK;