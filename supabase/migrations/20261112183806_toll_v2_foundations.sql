-- Toll rebuild Phase 0 R1: schemas, tables, RLS, append-only, toll_week statement kind.

-- 1. Schemas and company helper
CREATE SCHEMA IF NOT EXISTS toll_read;
CREATE SCHEMA IF NOT EXISTS toll_write;
CREATE SCHEMA IF NOT EXISTS toll_system;

REVOKE ALL ON SCHEMA toll_read, toll_write, toll_system FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA toll_read, toll_write TO authenticated;
GRANT USAGE ON SCHEMA toll_system TO service_role;

CREATE OR REPLACE FUNCTION toll_read.current_company()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(
    nullif(auth.jwt()->'app_metadata'->>'organizationId', ''),
    nullif(auth.jwt()->'app_metadata'->>'organization_id', '')
  )::uuid;
$$;

REVOKE ALL ON FUNCTION toll_read.current_company() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION toll_read.current_company() TO authenticated;

-- 2. Tables (FK-safe order)
CREATE TABLE toll.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  command_id text NOT NULL,
  intent text NOT NULL,
  actor text NOT NULL CHECK (actor IN ('user', 'system', 'staff')),
  actor_user_id uuid,
  actor_job text,
  acting_company uuid,
  reason_code text,
  note text,
  targets jsonb NOT NULL DEFAULT '{}'::jsonb,
  versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  engine_version text,
  response jsonb,
  response_truncated boolean NOT NULL DEFAULT false,
  CONSTRAINT decisions_organization_id_command_id_key UNIQUE (organization_id, command_id),
  CONSTRAINT decisions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT decisions_actor_system_requires_job CHECK (actor <> 'system' OR actor_job IS NOT NULL),
  CONSTRAINT decisions_response_size CHECK (response IS NULL OR octet_length(response::text) <= 65536)
);

CREATE TABLE toll.charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  vehicle_id text,
  driver_id text,
  plaza_id text,
  occurred_at timestamptz NOT NULL,
  week_key date NOT NULL,
  time_precision text NOT NULL CHECK (time_precision IN ('exact', 'minute', 'date_only')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'JMD',
  paid_by text NOT NULL CHECK (paid_by IN ('tag', 'cash')),
  source text NOT NULL CHECK (source IN ('tag_statement', 'driver_cash', 'roam_ride', 'manual', 'legacy')),
  source_ref text NOT NULL,
  evidence_status text NOT NULL DEFAULT 'verified'
    CHECK (evidence_status IN ('unverified', 'verified', 'rejected')),
  duplicate_of uuid,
  awaiting_cash boolean NOT NULL DEFAULT false,
  native_ride_id text,
  after_seal boolean NOT NULL DEFAULT false,
  adjusts_charge_id uuid,
  is_legacy boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charges_organization_id_source_source_ref_key UNIQUE (organization_id, source, source_ref),
  CONSTRAINT charges_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT charges_duplicate_of_fkey
    FOREIGN KEY (organization_id, duplicate_of) REFERENCES toll.charges (organization_id, id),
  CONSTRAINT charges_adjusts_charge_id_fkey
    FOREIGN KEY (organization_id, adjusts_charge_id) REFERENCES toll.charges (organization_id, id)
);

CREATE INDEX toll_charges_organization_id_week_key_idx ON toll.charges (organization_id, week_key);

CREATE TABLE toll.charge_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  charge_id uuid NOT NULL,
  field text NOT NULL CHECK (field IN ('amount_minor', 'week_key')),
  old_value text,
  new_value text,
  pending boolean NOT NULL DEFAULT false,
  decision_id uuid,
  CONSTRAINT charge_changes_charge_id_fkey
    FOREIGN KEY (organization_id, charge_id) REFERENCES toll.charges (organization_id, id),
  CONSTRAINT charge_changes_decision_id_fkey
    FOREIGN KEY (organization_id, decision_id) REFERENCES toll.decisions (organization_id, id)
);

CREATE TABLE toll.platform_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL,
  platform_trip_id text NOT NULL,
  driver_id text,
  vehicle_id text,
  request_at timestamptz,
  pickup_at timestamptz,
  dropoff_at timestamptz,
  time_precision text NOT NULL CHECK (time_precision IN ('exact', 'minute', 'date_only')),
  payment_method text NOT NULL CHECK (payment_method IN ('card', 'cash', 'in_app', 'unknown')),
  is_legacy boolean NOT NULL DEFAULT false,
  CONSTRAINT platform_trips_organization_id_platform_platform_trip_id_key
    UNIQUE (organization_id, platform, platform_trip_id)
);

CREATE TABLE toll.paybacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('trip_line', 'adjustment', 'native')),
  platform_trip_id text,
  reference text NOT NULL,
  driver_id text,
  paid_on date NOT NULL,
  week_key date NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'JMD',
  reversal_of uuid,
  received_by text NOT NULL CHECK (received_by IN ('fleet', 'driver')),
  after_seal boolean NOT NULL DEFAULT false,
  is_legacy boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paybacks_organization_id_platform_reference_key UNIQUE (organization_id, platform, reference),
  CONSTRAINT paybacks_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT paybacks_reversal_of_fkey
    FOREIGN KEY (organization_id, reversal_of) REFERENCES toll.paybacks (organization_id, id)
);

CREATE INDEX toll_paybacks_organization_id_week_key_idx ON toll.paybacks (organization_id, week_key);

CREATE TABLE toll.tag_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL,
  account_ref text NOT NULL,
  vehicle_id text,
  currency text NOT NULL DEFAULT 'JMD',
  CONSTRAINT tag_accounts_organization_id_provider_account_ref_key
    UNIQUE (organization_id, provider, account_ref),
  CONSTRAINT tag_accounts_organization_id_id_key UNIQUE (organization_id, id)
);

CREATE TABLE toll.tag_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  tag_account_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  topped_up_on date NOT NULL,
  week_key date NOT NULL,
  source_ref text NOT NULL,
  CONSTRAINT tag_topups_organization_id_source_ref_key UNIQUE (organization_id, source_ref),
  CONSTRAINT tag_topups_tag_account_id_fkey
    FOREIGN KEY (organization_id, tag_account_id) REFERENCES toll.tag_accounts (organization_id, id)
);

CREATE TABLE toll.carried_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN (
    'charge', 'payback', 'take_back', 'correction_up', 'correction_down', 'cash_recovered'
  )),
  original_id uuid NOT NULL,
  from_week date NOT NULL,
  to_week date NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  bearer text CHECK (bearer IS NULL OR bearer IN ('fleet', 'driver')),
  version bigint NOT NULL DEFAULT 1,
  decision_id uuid NOT NULL,
  CONSTRAINT carried_facts_to_week_gt_from_week CHECK (to_week > from_week),
  CONSTRAINT carried_facts_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT carried_facts_decision_id_fkey
    FOREIGN KEY (organization_id, decision_id) REFERENCES toll.decisions (organization_id, id)
);

CREATE INDEX toll_carried_facts_organization_id_to_week_idx ON toll.carried_facts (organization_id, to_week);

CREATE TABLE toll.allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  charge_id uuid NOT NULL,
  bearer text NOT NULL CHECK (bearer IN ('platform', 'driver', 'fleet')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  payback_id uuid,
  reason text,
  provisional boolean NOT NULL DEFAULT false,
  decision_id uuid NOT NULL,
  reversed_by uuid,
  CONSTRAINT allocations_platform_bearer_payback CHECK ((bearer = 'platform') = (payback_id IS NOT NULL)),
  CONSTRAINT allocations_charge_id_fkey
    FOREIGN KEY (organization_id, charge_id) REFERENCES toll.charges (organization_id, id),
  CONSTRAINT allocations_payback_id_fkey
    FOREIGN KEY (organization_id, payback_id) REFERENCES toll.paybacks (organization_id, id),
  CONSTRAINT allocations_decision_id_fkey
    FOREIGN KEY (organization_id, decision_id) REFERENCES toll.decisions (organization_id, id)
);

CREATE INDEX toll_allocations_organization_id_charge_id_idx ON toll.allocations (organization_id, charge_id);
CREATE INDEX toll_allocations_organization_id_payback_id_idx ON toll.allocations (organization_id, payback_id);

CREATE TABLE toll.payback_unlinked_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  payback_id uuid,
  carried_fact_id uuid,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  reason text NOT NULL,
  decision_id uuid NOT NULL,
  reversed_by uuid,
  CONSTRAINT payback_unlinked_decisions_one_target CHECK (
    (payback_id IS NOT NULL)::int + (carried_fact_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT payback_unlinked_decisions_payback_id_fkey
    FOREIGN KEY (organization_id, payback_id) REFERENCES toll.paybacks (organization_id, id),
  CONSTRAINT payback_unlinked_decisions_carried_fact_id_fkey
    FOREIGN KEY (organization_id, carried_fact_id) REFERENCES toll.carried_facts (organization_id, id),
  CONSTRAINT payback_unlinked_decisions_decision_id_fkey
    FOREIGN KEY (organization_id, decision_id) REFERENCES toll.decisions (organization_id, id)
);

CREATE TABLE toll.duplicate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  charge_a uuid NOT NULL,
  charge_b uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'released')),
  decision_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duplicate_reviews_charge_a_lt_charge_b CHECK (charge_a < charge_b),
  CONSTRAINT duplicate_reviews_organization_id_charge_a_charge_b_key
    UNIQUE (organization_id, charge_a, charge_b),
  CONSTRAINT duplicate_reviews_charge_a_fkey
    FOREIGN KEY (organization_id, charge_a) REFERENCES toll.charges (organization_id, id),
  CONSTRAINT duplicate_reviews_charge_b_fkey
    FOREIGN KEY (organization_id, charge_b) REFERENCES toll.charges (organization_id, id),
  CONSTRAINT duplicate_reviews_decision_id_fkey
    FOREIGN KEY (organization_id, decision_id) REFERENCES toll.decisions (organization_id, id)
);

CREATE TABLE toll.suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  charge_id uuid NOT NULL,
  payback_id uuid NOT NULL,
  score_parts jsonb NOT NULL,
  rules_fired text[] NOT NULL,
  engine_version text NOT NULL,
  inputs jsonb NOT NULL,
  inputs_hash text NOT NULL,
  superseded_by uuid,
  CONSTRAINT suggestions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT suggestions_charge_id_fkey
    FOREIGN KEY (organization_id, charge_id) REFERENCES toll.charges (organization_id, id),
  CONSTRAINT suggestions_payback_id_fkey
    FOREIGN KEY (organization_id, payback_id) REFERENCES toll.paybacks (organization_id, id),
  CONSTRAINT suggestions_superseded_by_fkey
    FOREIGN KEY (organization_id, superseded_by) REFERENCES toll.suggestions (organization_id, id)
);

CREATE TABLE toll.platform_settings (
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL,
  pays_tolls_back boolean NOT NULL DEFAULT true,
  payback_mode text NOT NULL CHECK (payback_mode IN ('per_trip', 'adjustments', 'none', 'native')),
  matching_window_seconds int NOT NULL DEFAULT 600,
  auto_apply boolean NOT NULL DEFAULT false,
  adapter_version text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, platform)
);

CREATE TABLE toll.plaza_rules (
  plaza_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  auto_duplicate_window_minutes int NOT NULL DEFAULT 10,
  review_duplicate_window text NOT NULL DEFAULT 'same_day',
  changed_by uuid,
  changed_at timestamptz
);

CREATE TABLE toll.staff_company_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  staff_user_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid,
  revoked_at timestamptz
);

CREATE UNIQUE INDEX toll_staff_company_access_org_staff_active_idx
  ON toll.staff_company_access (organization_id, staff_user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE toll.switch_state (
  organization_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  tolls_v2 boolean NOT NULL DEFAULT false,
  changed_by uuid,
  changed_at timestamptz
);

CREATE TABLE toll.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  table_name text NOT NULL,
  row_key text NOT NULL,
  action text NOT NULL,
  old_row jsonb,
  new_row jsonb,
  actor_user_id uuid
);

-- 3. Append-only
CREATE OR REPLACE FUNCTION toll.tg_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'decisions' OR TG_TABLE_NAME = 'audit_log' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION '% is append-only: delete not allowed', TG_TABLE_NAME;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION '% is append-only: update not allowed', TG_TABLE_NAME;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'suggestions' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'suggestions is append-only: delete not allowed';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF to_jsonb(NEW) - 'superseded_by' IS DISTINCT FROM to_jsonb(OLD) - 'superseded_by' THEN
        RAISE EXCEPTION 'suggestions: only superseded_by may be updated';
      END IF;
      IF OLD.superseded_by IS NOT NULL THEN
        RAISE EXCEPTION 'suggestions: superseded_by already set';
      END IF;
      IF NEW.superseded_by IS NULL THEN
        RAISE EXCEPTION 'suggestions: superseded_by must be set on update';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER decisions_append_only
  BEFORE UPDATE OR DELETE ON toll.decisions
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_append_only();

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON toll.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_append_only();

CREATE TRIGGER suggestions_append_only
  BEFORE UPDATE OR DELETE ON toll.suggestions
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_append_only();

-- 4. Grants and RLS
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'charges', 'charge_changes', 'platform_trips', 'paybacks', 'allocations',
    'carried_facts', 'payback_unlinked_decisions', 'duplicate_reviews', 'decisions',
    'suggestions', 'tag_accounts', 'tag_topups', 'platform_settings',
    'staff_company_access', 'switch_state', 'audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('REVOKE ALL ON toll.%I FROM PUBLIC, anon, authenticated, service_role', t);
    IF t <> 'audit_log' THEN
      EXECUTE format('GRANT SELECT ON toll.%I TO authenticated', t);
    END IF;
    EXECUTE format('ALTER TABLE toll.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON toll.%I FOR SELECT TO authenticated USING (organization_id = toll_read.current_company())',
      t || '_company_read',
      t
    );
  END LOOP;
END;
$$;

REVOKE ALL ON toll.plaza_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON toll.plaza_rules TO authenticated;
ALTER TABLE toll.plaza_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY plaza_rules_read ON toll.plaza_rules FOR SELECT TO authenticated USING (true);

-- 5. ledger.week_statements toll_week
ALTER TABLE ledger.week_statements
  DROP CONSTRAINT IF EXISTS week_statements_kind_check;

ALTER TABLE ledger.week_statements
  ADD CONSTRAINT week_statements_kind_check CHECK (
    kind IN ('fuel', 'toll', 'toll_week', 'earnings', 'courier_earnings', 'settlement')
  );

ALTER TABLE ledger.week_statements
  DROP CONSTRAINT IF EXISTS week_statements_toll_week_driver;

ALTER TABLE ledger.week_statements
  ADD CONSTRAINT week_statements_toll_week_driver CHECK (
    (kind = 'toll_week') = (driver_id = '*')
  );

NOTIFY pgrst, 'reload schema';
