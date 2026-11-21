-- Found in the owner's first live reconcile (week of 9 Nov 2026): 12 tolls on Uber trips that Uber paid back
-- short (J$370 on J$390, J$275 on J$280, …; J$240 in all) sat in "Tolls with no trip" with no dispute. Their
-- trips were matched before disputes were switched on, and a dispute only opens at the moment of matching.
--
-- toll_system.open_missing_disputes(company): for every open toll (week not sealed) that still has money left,
-- whose linked trip payback from a platform that takes disputes is used up, and that has no dispute yet, it
-- opens the dispute the normal way (open_dispute as the system). The usual rules apply: the 9 days run from the
-- trip; a dispute found after its 9 days opens late and the fleet bears it, as for any late report (Q10).
-- It runs now for every company and from then on at the start of every matcher run (every 10 minutes).

CREATE OR REPLACE FUNCTION toll_system.open_missing_disputes(p_company uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r     record;
  v_n   int := 0;
  v_res jsonb;
BEGIN
  IF NOT coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT DISTINCT ON (c.id) c.id AS charge_id, c.version AS charge_version, p.id AS payback_id, p.version AS payback_version
    FROM toll.charges c
    JOIN toll.allocations a ON a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL
    JOIN toll.paybacks p ON p.organization_id = a.organization_id AND p.id = a.payback_id
    JOIN toll.platform_settings ps ON ps.organization_id = p.organization_id AND ps.platform = p.platform AND ps.takes_disputes
    WHERE c.organization_id = p_company AND NOT c.is_legacy
      AND p.kind = 'trip_line' AND p.reversal_of IS NULL AND NOT p.is_legacy
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks x WHERE x.organization_id = p.organization_id AND x.reversal_of = p.id)
      AND toll_system.payback_open_minor(p_company, p.id) = 0
      AND toll_system.charge_open_minor(p_company, c.id) > 0
      AND NOT toll_system.charge_has_active_dispute(p_company, c.id)
      AND NOT toll_system.week_is_sealed(p_company, toll_system.charge_counted_week(p_company, c.id, c.week_key))
    ORDER BY c.id, a.created_at DESC
  LOOP
    BEGIN
      v_res := toll_system.run_system_command(
        p_company, 'open_dispute', 'catch-up-dispute:' || r.charge_id::text,
        jsonb_build_object('charge_id', r.charge_id, 'payback_id', r.payback_id,
                           'expected_charge_version', r.charge_version, 'expected_payback_version', r.payback_version),
        'matcher:auto_dispute');
      IF NOT coalesce((v_res ->> 'replay')::boolean, false) THEN v_n := v_n + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One toll that can't open must never stop the others or the matcher run.
      RAISE LOG 'open_missing_disputes skipped charge %: %', r.charge_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION toll_system.open_missing_disputes(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Every matcher run (match_claim calls this first when disputes are on).
CREATE OR REPLACE FUNCTION toll_system.match_refuse_missing_settings(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_missing jsonb;
BEGIN
  -- Self-setup: dispute policy, dispute text and plaza rules for anything new; platforms from the Roam list.
  PERFORM toll_system.seed_dispute_setup(p_company, false);
  PERFORM toll_system.apply_platform_defaults(p_company);
  v_missing := toll_system.settings_missing_list(p_company);
  IF jsonb_array_length(v_missing) > 0 THEN
    PERFORM toll_write.refuse('SETTINGS_MISSING', jsonb_build_object('missing', v_missing));
  END IF;
  -- Catch-up: short-paid Uber trips matched without a dispute (e.g. matched before disputes were on).
  PERFORM toll_system.open_missing_disputes(p_company);
END;
$$;
REVOKE ALL ON FUNCTION toll_system.match_refuse_missing_settings(uuid) FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT s.organization_id AS id FROM toll.switch_state s WHERE s.toll_disputes LOOP
    PERFORM toll_system.open_missing_disputes(r.id);
  END LOOP;
END;
$$;
