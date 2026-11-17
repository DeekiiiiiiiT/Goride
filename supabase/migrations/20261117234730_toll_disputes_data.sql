-- Toll disputes Round D1: data layer only (docs/toll-build/cursor-D1-disputes-data.md).

-- 1. Feature switches + read helpers
ALTER TABLE toll.switch_state
  ADD COLUMN toll_disputes boolean NOT NULL DEFAULT false,
  ADD COLUMN rider_pays_driver boolean NOT NULL DEFAULT false,
  ADD COLUMN logged_trips boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.toll_disputes_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.toll_disputes FROM toll.switch_state s
                   WHERE s.organization_id = toll_read.current_company()), false);
$$;

CREATE OR REPLACE FUNCTION public.toll_rider_pays_driver_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.rider_pays_driver FROM toll.switch_state s
                   WHERE s.organization_id = toll_read.current_company()), false);
$$;

CREATE OR REPLACE FUNCTION public.toll_logged_trips_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.logged_trips FROM toll.switch_state s
                   WHERE s.organization_id = toll_read.current_company()), false);
$$;

REVOKE ALL ON FUNCTION public.toll_disputes_enabled() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.toll_rider_pays_driver_enabled() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.toll_logged_trips_enabled() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toll_disputes_enabled() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toll_rider_pays_driver_enabled() TO authenticated;
GRANT EXECUTE ON FUNCTION public.toll_logged_trips_enabled() TO authenticated;

-- 2. platform_settings (C1, AA2)
ALTER TABLE toll.platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_payback_mode_check;

ALTER TABLE toll.platform_settings
  ADD COLUMN takes_disputes boolean NOT NULL DEFAULT false,
  ADD COLUMN dispute_window_days int,
  ADD COLUMN refund_periods int,
  ADD COLUMN no_report_fallback_days int;

ALTER TABLE toll.platform_settings
  ADD CONSTRAINT platform_settings_payback_mode_check CHECK (
    payback_mode IN ('per_trip', 'adjustments', 'none', 'native', 'rider_pays_driver')
  ),
  ADD CONSTRAINT platform_settings_dispute_ints_positive CHECK (
    (dispute_window_days IS NULL OR dispute_window_days > 0)
    AND (refund_periods IS NULL OR refund_periods > 0)
    AND (no_report_fallback_days IS NULL OR no_report_fallback_days > 0)
  ),
  ADD CONSTRAINT platform_settings_takes_disputes_fields CHECK (
    NOT takes_disputes
    OR (
      dispute_window_days IS NOT NULL
      AND refund_periods IS NOT NULL
      AND no_report_fallback_days IS NOT NULL
    )
  ),
  ADD CONSTRAINT platform_settings_rider_pays_driver_aa2 CHECK (
    payback_mode <> 'rider_pays_driver'
    OR (auto_apply = false AND takes_disputes = false)
  );

CREATE OR REPLACE FUNCTION toll.tg_platform_settings_rider_pays_driver()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.payback_mode = 'rider_pays_driver' AND (NEW.auto_apply OR NEW.takes_disputes) THEN
    RAISE EXCEPTION USING MESSAGE = 'PLATFORM_SETTINGS_RIDER_PAYS_DRIVER_AA2', ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_settings_rider_pays_driver_guard
  BEFORE INSERT OR UPDATE ON toll.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_platform_settings_rider_pays_driver();

-- 3. plaza_rates
CREATE TABLE toll.plaza_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id text NOT NULL REFERENCES toll.plaza_rules (plaza_id),
  rate_kind text NOT NULL CHECK (rate_kind IN ('tag_price', 'platform_refund')),
  platform text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  valid_from date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plaza_rates_platform_for_kind CHECK (
    (rate_kind = 'tag_price' AND platform IS NULL)
    OR (rate_kind = 'platform_refund' AND platform IS NOT NULL)
  )
);

CREATE UNIQUE INDEX toll_plaza_rates_plaza_kind_platform_from_uidx
  ON toll.plaza_rates (plaza_id, rate_kind, coalesce(platform, ''), valid_from);

CREATE OR REPLACE FUNCTION toll.tg_plaza_rates_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING MESSAGE = 'PLAZA_RATES_APPEND_ONLY', ERRCODE = 'P0001',
    DETAIL = jsonb_build_object('op', lower(TG_OP))::text;
END;
$$;

CREATE TRIGGER plaza_rates_append_only
  BEFORE UPDATE OR DELETE ON toll.plaza_rates
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_plaza_rates_append_only();

CREATE OR REPLACE FUNCTION toll_system.plaza_rate(
  p_plaza text,
  p_kind text,
  p_platform text,
  p_on date
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.amount_minor
  FROM toll.plaza_rates r
  WHERE r.plaza_id = p_plaza
    AND r.rate_kind = p_kind
    AND coalesce(r.platform, '') = coalesce(p_platform, '')
    AND r.valid_from <= p_on
  ORDER BY r.valid_from DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION toll_system.plaza_rate(text, text, text, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION toll_system.plaza_rate(text, text, text, date) TO authenticated, service_role;

REVOKE ALL ON toll.plaza_rates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON toll.plaza_rates TO authenticated;
ALTER TABLE toll.plaza_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY plaza_rates_read ON toll.plaza_rates FOR SELECT TO authenticated USING (true);

-- 4. dispute_policy
CREATE TABLE toll.dispute_policy (
  organization_id uuid PRIMARY KEY,
  lost_bearer text NOT NULL DEFAULT 'fleet' CHECK (lost_bearer IN ('fleet', 'driver')),
  expired_bearer text NOT NULL DEFAULT 'driver' CHECK (expired_bearer IN ('fleet', 'driver')),
  changed_by uuid,
  changed_at timestamptz
);

-- 5. dispute_text_templates
CREATE TABLE toll.dispute_text_templates (
  organization_id uuid NOT NULL,
  platform text NOT NULL,
  version int NOT NULL CHECK (version > 0),
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY (organization_id, platform, version)
);

CREATE OR REPLACE FUNCTION toll.tg_dispute_text_template_placeholders()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  m text;
  allowed text[] := ARRAY['trip_date', 'trip_time', 'plaza', 'toll', 'paid', 'owed'];
BEGIN
  FOR m IN SELECT (regexp_matches(NEW.body, '\{([a-z_]+)\}', 'g'))[1] LOOP
    IF NOT (m = ANY (allowed)) THEN
      RAISE EXCEPTION USING MESSAGE = 'DISPUTE_TEMPLATE_BAD_PLACEHOLDER', ERRCODE = 'P0001',
        DETAIL = jsonb_build_object('placeholder', m)::text;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION toll.tg_dispute_text_templates_mutate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_TEMPLATE_APPEND_ONLY', ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - 'retired_at' IS DISTINCT FROM to_jsonb(OLD) - 'retired_at' THEN
      RAISE EXCEPTION USING MESSAGE = 'DISPUTE_TEMPLATE_APPEND_ONLY', ERRCODE = 'P0001';
    END IF;
    IF OLD.retired_at IS NOT NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'DISPUTE_TEMPLATE_RETIRE_TWICE', ERRCODE = 'P0001';
    END IF;
    IF NEW.retired_at IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'DISPUTE_TEMPLATE_APPEND_ONLY', ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispute_text_templates_placeholders
  BEFORE INSERT OR UPDATE ON toll.dispute_text_templates
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_dispute_text_template_placeholders();

CREATE TRIGGER dispute_text_templates_mutate
  BEFORE UPDATE OR DELETE ON toll.dispute_text_templates
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_dispute_text_templates_mutate();

-- 6. disputes
CREATE TABLE toll.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  charge_id uuid NOT NULL,
  charge_week_key date NOT NULL,
  platform text NOT NULL,
  platform_trip_id text NOT NULL,
  driver_id text NOT NULL,
  owed_minor bigint NOT NULL CHECK (owed_minor > 0),
  state text NOT NULL DEFAULT 'to_send' CHECK (
    state IN ('to_send', 'sent', 'won', 'part_won', 'lost', 'expired')
  ),
  close_reason text CHECK (
    close_reason IS NULL OR close_reason IN (
      'refund', 'partial_refund_two_periods', 'platform_said_no', 'no_refund_two_periods',
      'no_report', 'window_closed', 'opened_late', 'undo', 'reversal'
    )
  ),
  opened_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  clock_from timestamptz,
  deadline timestamptz NOT NULL,
  opened_late boolean NOT NULL DEFAULT false,
  text_version int,
  recovered_minor bigint NOT NULL DEFAULT 0 CHECK (recovered_minor >= 0),
  bearer text CHECK (bearer IS NULL OR bearer IN ('fleet', 'driver')),
  posted_in_week_key date,
  reopens_id uuid,
  decision_ids uuid[] NOT NULL DEFAULT '{}',
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT disputes_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT disputes_recovered_lte_owed CHECK (recovered_minor <= owed_minor),
  CONSTRAINT disputes_charge_id_fkey
    FOREIGN KEY (organization_id, charge_id) REFERENCES toll.charges (organization_id, id),
  CONSTRAINT disputes_platform_trip_fkey
    FOREIGN KEY (organization_id, platform, platform_trip_id)
    REFERENCES toll.platform_trips (organization_id, platform, platform_trip_id),
  CONSTRAINT disputes_reopens_id_fkey
    FOREIGN KEY (organization_id, reopens_id) REFERENCES toll.disputes (organization_id, id),
  CONSTRAINT disputes_text_template_fkey
    FOREIGN KEY (organization_id, platform, text_version)
    REFERENCES toll.dispute_text_templates (organization_id, platform, version)
);

CREATE UNIQUE INDEX toll_disputes_one_non_final_per_charge_idx
  ON toll.disputes (organization_id, charge_id)
  WHERE state NOT IN ('won', 'part_won', 'lost');

CREATE INDEX toll_disputes_organization_id_charge_week_key_idx
  ON toll.disputes (organization_id, charge_week_key);

CREATE OR REPLACE FUNCTION toll.tg_disputes_one_non_final()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.state IN ('won', 'part_won', 'lost') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM toll.disputes d
    WHERE d.organization_id = NEW.organization_id
      AND d.charge_id = NEW.charge_id
      AND d.id IS DISTINCT FROM NEW.id
      AND d.state NOT IN ('won', 'part_won', 'lost')
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_SECOND_OPEN', ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('charge_id', NEW.charge_id)::text;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION toll.tg_disputes_mutate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_DELETE_FORBIDDEN', ERRCODE = 'P0001';
  END IF;

  IF OLD.state IN ('won', 'part_won', 'lost') THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_FINAL_LOCKED', ERRCODE = 'P0001';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.charge_id IS DISTINCT FROM OLD.charge_id
    OR NEW.charge_week_key IS DISTINCT FROM OLD.charge_week_key
    OR NEW.platform IS DISTINCT FROM OLD.platform
    OR NEW.platform_trip_id IS DISTINCT FROM OLD.platform_trip_id
    OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
    OR NEW.owed_minor IS DISTINCT FROM OLD.owed_minor
    OR NEW.opened_late IS DISTINCT FROM OLD.opened_late
    OR NEW.deadline IS DISTINCT FROM OLD.deadline
    OR NEW.reopens_id IS DISTINCT FROM OLD.reopens_id
  THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_IDENTITY_IMMUTABLE', ERRCODE = 'P0001';
  END IF;

  IF NEW.recovered_minor < OLD.recovered_minor THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_RECOVERED_DECREASE', ERRCODE = 'P0001';
  END IF;

  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER disputes_one_non_final
  BEFORE INSERT ON toll.disputes
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_disputes_one_non_final();

CREATE TRIGGER disputes_mutate
  BEFORE UPDATE OR DELETE ON toll.disputes
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_disputes_mutate();

-- 7. dispute_links
CREATE TABLE toll.dispute_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispute_id uuid NOT NULL,
  payback_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  decision_id uuid NOT NULL,
  reversed_by uuid,
  CONSTRAINT dispute_links_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT dispute_links_dispute_id_fkey
    FOREIGN KEY (organization_id, dispute_id) REFERENCES toll.disputes (organization_id, id),
  CONSTRAINT dispute_links_payback_id_fkey
    FOREIGN KEY (organization_id, payback_id) REFERENCES toll.paybacks (organization_id, id),
  CONSTRAINT dispute_links_decision_id_fkey
    FOREIGN KEY (organization_id, decision_id) REFERENCES toll.decisions (organization_id, id)
);

CREATE OR REPLACE FUNCTION toll.tg_dispute_links_caps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owed bigint;
  v_sum bigint;
BEGIN
  IF NEW.reversed_by IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT d.owed_minor INTO v_owed
  FROM toll.disputes d
  WHERE d.organization_id = NEW.organization_id AND d.id = NEW.dispute_id;

  SELECT coalesce(sum(l.amount_minor), 0) INTO v_sum
  FROM toll.dispute_links l
  WHERE l.organization_id = NEW.organization_id
    AND l.dispute_id = NEW.dispute_id
    AND l.reversed_by IS NULL
    AND l.id <> NEW.id;  -- AFTER trigger: NEW is already visible; add it once below

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.reversed_by IS NULL) THEN
    v_sum := v_sum + NEW.amount_minor;
  END IF;

  IF v_owed IS NULL OR v_sum > v_owed THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_LINKS_EXCEED_OWED', ERRCODE = 'P0001',
      DETAIL = jsonb_build_object('dispute_id', NEW.dispute_id, 'sum', v_sum, 'owed', v_owed)::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION toll.tg_dispute_links_mutate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING MESSAGE = 'DISPUTE_LINK_APPEND_ONLY', ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - 'reversed_by' IS DISTINCT FROM to_jsonb(OLD) - 'reversed_by' THEN
      RAISE EXCEPTION USING MESSAGE = 'DISPUTE_LINK_APPEND_ONLY', ERRCODE = 'P0001';
    END IF;
    IF OLD.reversed_by IS NOT NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'DISPUTE_LINK_REVERSE_TWICE', ERRCODE = 'P0001';
    END IF;
    IF NEW.reversed_by IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'DISPUTE_LINK_APPEND_ONLY', ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dispute_links_caps
  AFTER INSERT OR UPDATE ON toll.dispute_links
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_dispute_links_caps();

CREATE TRIGGER dispute_links_mutate
  BEFORE UPDATE OR DELETE ON toll.dispute_links
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_dispute_links_mutate();

-- 8. allocations
ALTER TABLE toll.allocations
  ADD COLUMN dispute_id uuid,
  ADD CONSTRAINT allocations_dispute_id_fkey
    FOREIGN KEY (organization_id, dispute_id) REFERENCES toll.disputes (organization_id, id);

ALTER TABLE toll.allocations
  DROP CONSTRAINT allocations_platform_bearer_payback;

ALTER TABLE toll.allocations
  ADD CONSTRAINT allocations_platform_bearer_payback CHECK (
  CASE
    WHEN bearer = 'platform' THEN
      payback_id IS NOT NULL OR (provisional = true AND dispute_id IS NOT NULL)
    ELSE
      payback_id IS NULL
  END
  );

-- 9. carried_facts
ALTER TABLE toll.carried_facts
  DROP CONSTRAINT carried_facts_kind_check;

ALTER TABLE toll.carried_facts
  ADD COLUMN dispute_id uuid,
  ADD CONSTRAINT carried_facts_dispute_id_fkey
    FOREIGN KEY (organization_id, dispute_id) REFERENCES toll.disputes (organization_id, id),
  ADD CONSTRAINT carried_facts_kind_check CHECK (
    kind IN (
      'charge', 'payback', 'take_back', 'correction_up', 'correction_down', 'cash_recovered', 'dispute_result'
    )
  ),
  ADD CONSTRAINT carried_facts_dispute_result_requires_id CHECK (
    (kind = 'dispute_result') = (dispute_id IS NOT NULL)
  );

-- 10. seed_dispute_setup
CREATE OR REPLACE FUNCTION toll_system.seed_dispute_setup(p_company uuid, p_dry_run boolean DEFAULT true)
RETURNS TABLE (
  tbl text,
  row_key text,
  col text,
  current_value text,
  new_value text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uber_body constant text :=
    'Hi, on {trip_date} at {trip_time} I drove through the {plaza} toll during this trip. '
    || 'The toll cost {toll} and I was refunded {paid}, so {owed} is still owed. '
    || 'Please refund the remaining {owed}. Thank you.';
  v_cur record;
  v_field text;
  v_pair record;
BEGIN
  IF p_company IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'TOLL_COMPANY_REQUIRED', ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'uber'
  ) THEN
    FOR v_pair IN
      SELECT * FROM (VALUES
        ('payback_mode', 'per_trip'),
        ('takes_disputes', 'true'),
        ('dispute_window_days', '9'),
        ('refund_periods', '2'),
        ('no_report_fallback_days', '23'),
        ('auto_apply', 'false')
      ) AS v(c, n)
    LOOP
      tbl := 'platform_settings'; row_key := 'uber'; col := v_pair.c;
      current_value := null; new_value := v_pair.n;
      RETURN NEXT;
    END LOOP;
    IF NOT p_dry_run THEN
      INSERT INTO toll.platform_settings (
        organization_id, platform, payback_mode, takes_disputes,
        dispute_window_days, refund_periods, no_report_fallback_days, auto_apply, pays_tolls_back
      ) VALUES (p_company, 'uber', 'per_trip', true, 9, 2, 23, false, true);
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'uber';
    FOREACH v_field IN ARRAY ARRAY[
      'payback_mode', 'takes_disputes', 'dispute_window_days', 'refund_periods',
      'no_report_fallback_days', 'auto_apply'
    ] LOOP
      tbl := 'platform_settings'; row_key := 'uber'; col := v_field;
      current_value := to_jsonb(v_cur) ->> v_field;
      new_value := 'kept';
      RETURN NEXT;
    END LOOP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'indrive'
  ) THEN
    FOR v_pair IN
      SELECT * FROM (VALUES
        ('payback_mode', 'rider_pays_driver'),
        ('takes_disputes', 'false'),
        ('auto_apply', 'false')
      ) AS v(c, n)
    LOOP
      tbl := 'platform_settings'; row_key := 'indrive'; col := v_pair.c;
      current_value := null; new_value := v_pair.n;
      RETURN NEXT;
    END LOOP;
    IF NOT p_dry_run THEN
      INSERT INTO toll.platform_settings (
        organization_id, platform, payback_mode, takes_disputes, auto_apply, pays_tolls_back
      ) VALUES (p_company, 'indrive', 'rider_pays_driver', false, false, false);
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'indrive';
    FOREACH v_field IN ARRAY ARRAY['payback_mode', 'takes_disputes', 'auto_apply'] LOOP
      tbl := 'platform_settings'; row_key := 'indrive'; col := v_field;
      current_value := to_jsonb(v_cur) ->> v_field;
      new_value := 'kept';
      RETURN NEXT;
    END LOOP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'roam'
  ) THEN
    tbl := 'platform_settings'; row_key := 'roam'; col := 'payback_mode';
    current_value := null; new_value := 'native';
    RETURN NEXT;
    IF NOT p_dry_run THEN
      INSERT INTO toll.platform_settings (organization_id, platform, payback_mode, pays_tolls_back)
      VALUES (p_company, 'roam', 'native', true);
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.platform_settings ps
    WHERE ps.organization_id = p_company AND ps.platform = 'roam';
    tbl := 'platform_settings'; row_key := 'roam'; col := 'payback_mode';
    current_value := v_cur.payback_mode;
    new_value := 'kept';
    RETURN NEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM toll.dispute_policy dp WHERE dp.organization_id = p_company) THEN
    tbl := 'dispute_policy'; row_key := p_company::text; col := 'lost_bearer'; current_value := null; new_value := 'fleet';
    RETURN NEXT;
    tbl := 'dispute_policy'; row_key := p_company::text; col := 'expired_bearer'; current_value := null; new_value := 'driver';
    RETURN NEXT;
    IF NOT p_dry_run THEN
      INSERT INTO toll.dispute_policy (organization_id, lost_bearer, expired_bearer)
      VALUES (p_company, 'fleet', 'driver');
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
    FOREACH v_field IN ARRAY ARRAY['lost_bearer', 'expired_bearer'] LOOP
      tbl := 'dispute_policy'; row_key := p_company::text; col := v_field;
      current_value := to_jsonb(v_cur) ->> v_field;
      new_value := 'kept';
      RETURN NEXT;
    END LOOP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM toll.dispute_text_templates t
    WHERE t.organization_id = p_company AND t.platform = 'uber' AND t.version = 1
  ) THEN
    tbl := 'dispute_text_templates'; row_key := 'uber:1'; col := 'body';
    current_value := null; new_value := v_uber_body;
    RETURN NEXT;
    IF NOT p_dry_run THEN
      INSERT INTO toll.dispute_text_templates (organization_id, platform, version, body)
      VALUES (p_company, 'uber', 1, v_uber_body);
    END IF;
  ELSE
    SELECT * INTO v_cur FROM toll.dispute_text_templates t
    WHERE t.organization_id = p_company AND t.platform = 'uber' AND t.version = 1;
    tbl := 'dispute_text_templates'; row_key := 'uber:1'; col := 'body';
    current_value := left(v_cur.body, 80);
    new_value := 'kept';
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION toll_system.seed_dispute_setup(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.seed_dispute_setup(uuid, boolean) TO service_role;

-- 11. RLS on new org-scoped tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dispute_policy', 'dispute_text_templates', 'disputes', 'dispute_links'] LOOP
    EXECUTE format('REVOKE ALL ON toll.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON toll.%I TO authenticated', t);
    EXECUTE format('ALTER TABLE toll.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON toll.%I FOR SELECT TO authenticated USING (organization_id = toll_read.current_company())',
      t || '_company_read',
      t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';