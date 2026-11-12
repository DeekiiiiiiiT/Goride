-- Toll rebuild Phase 0: the 4 toll migrations, all or nothing. Every switch stays OFF (tolls_v2 and toll_seal_before_pay).
-- Paste the WHOLE file into the Supabase SQL editor and run it once.
BEGIN;

-- ===== 20261112183806_toll_v2_foundations =====
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


-- ===== 20261112184544_toll_v2_money_core =====
-- Toll rebuild Phase 0 R2: the money core.
-- Design: docs/toll-architecture.md B5 (postings P1-P20), B0 I1-I3.
--   * toll.posting_rules  : every posting as data (one debit, one credit).
--   * toll_system.ensure_accounts : the company's toll accounts, created with the right class.
--   * toll_system.week_is_sealed  : a week is sealed when its latest toll_week statement is closed.
--   * toll_system.post            : the ONLY way to write a toll ledger row (I1 balance, I2 reference, I3 sealed week).
--   * toll.tg_ledger_entries_guard : refuses any ledger row on a toll account not written by toll_system.post,
--                                    and refuses deleting a toll row (history is permanent).
-- The writer flag (toll.writer) guards against code mistakes; it is not a security boundary
-- (only the service key and the database owner can reach these functions).

-- 1. Posting rules -----------------------------------------------------------------------------
CREATE TABLE toll.posting_rules (
  code          text PRIMARY KEY,
  design_ref    text NOT NULL,
  debit_suffix  text NOT NULL,
  credit_suffix text NOT NULL,
  required_refs text[] NOT NULL,
  description   text NOT NULL,
  CONSTRAINT posting_rules_two_sides CHECK (debit_suffix <> credit_suffix),
  CONSTRAINT posting_rules_has_ref CHECK (cardinality(required_refs) > 0)
);

INSERT INTO toll.posting_rules (code, design_ref, debit_suffix, credit_suffix, required_refs, description) VALUES
  ('P1_tag_topup',          'P1',  'toll:tag_prepaid',              'bank',                          ARRAY['tag_topup_id'],              'Tag top-up'),
  ('P2_tag_crossing',       'P2',  'toll:suspense',                 'toll:tag_prepaid',              ARRAY['charge_id'],                 'Tag crossing recorded'),
  ('P3_cash_verified',      'P3',  'toll:suspense',                 'toll:payable_driver',           ARRAY['charge_id'],                 'Driver cash toll verified'),
  ('P4_payback_fleet',      'P4',  'toll:receivable_platform',      'toll:payback_unallocated',      ARRAY['payback_id'],                'Payback recorded, card / in-app (fleet receives)'),
  ('P5_payback_driver',     'P5',  'toll:recovered_in_driver_cash', 'toll:payback_unallocated',      ARRAY['payback_id'],                'Payback recorded, cash trip (driver receives)'),
  ('P6_allocate_platform',  'P6',  'toll:payback_unallocated',      'toll:suspense',                 ARRAY['charge_id','payback_id'],    'Charge allocated to a payback'),
  ('P7_allocate_driver',    'P7',  'toll:receivable_driver',        'toll:suspense',                 ARRAY['charge_id'],                 'Charge allocated to the driver'),
  ('P8_allocate_fleet',     'P8',  'toll:expense',                  'toll:suspense',                 ARRAY['charge_id'],                 'Charge allocated to the fleet'),
  ('P10_payout_confirmed',  'P10', 'toll:platform_payout_clearing', 'toll:receivable_platform',      ARRAY['payout_ref'],                'Toll part of a confirmed platform payout'),
  ('P11_payout_deposited',  'P11', 'bank',                          'toll:platform_payout_clearing', ARRAY['payout_ref'],                'Payout deposit confirmed'),
  ('P12_settle_cash_in',    'P12', 'bank',                          'toll:recovered_in_driver_cash', ARRAY['settlement_ref'],            'Settlement: cash-trip paybacks inside the driver''s passenger cash'),
  ('P13_settle_pay_driver', 'P13', 'toll:payable_driver',           'bank',                          ARRAY['settlement_ref'],            'Settlement: cash tolls the fleet owes the driver'),
  ('P14_settle_driver_owes','P14', 'bank',                          'toll:receivable_driver',        ARRAY['settlement_ref'],            'Settlement: tolls the driver owes'),
  ('P16_down_tag',          'P16', 'toll:tag_prepaid',              'toll:suspense',                 ARRAY['charge_id'],                 'Amount corrected down, tag charge'),
  ('P16_down_cash',         'P16', 'toll:payable_driver',           'toll:suspense',                 ARRAY['charge_id'],                 'Amount corrected down, cash charge'),
  ('P16_up_tag',            'P16', 'toll:suspense',                 'toll:tag_prepaid',              ARRAY['charge_id'],                 'Amount corrected up, tag charge'),
  ('P16_up_cash',           'P16', 'toll:suspense',                 'toll:payable_driver',           ARRAY['charge_id'],                 'Amount corrected up, cash charge'),
  ('P18a_leftover_fleet',   'P18', 'toll:payback_unallocated',      'toll:receivable_platform',      ARRAY['carried_fact_id'],           'Take-back after settlement: leftover part, card'),
  ('P18a_leftover_driver',  'P18', 'toll:payback_unallocated',      'toll:recovered_in_driver_cash', ARRAY['carried_fact_id'],           'Take-back after settlement: leftover part, cash trip'),
  ('P18b_fleet_card',       'P18', 'toll:expense',                  'toll:receivable_platform',      ARRAY['carried_fact_id'],           'Take-back after settlement: covered part, fleet bears, card'),
  ('P18b_fleet_cash',       'P18', 'toll:expense',                  'toll:recovered_in_driver_cash', ARRAY['carried_fact_id'],           'Take-back after settlement: covered part, fleet bears, cash trip'),
  ('P18b_driver_card',      'P18', 'toll:receivable_driver',        'toll:receivable_platform',      ARRAY['carried_fact_id'],           'Take-back after settlement: covered part, driver bears, card'),
  ('P18b_driver_cash',      'P18', 'toll:receivable_driver',        'toll:recovered_in_driver_cash', ARRAY['carried_fact_id'],           'Take-back after settlement: covered part, driver bears, cash trip'),
  ('P19_tag_driver',        'P19', 'toll:tag_prepaid',              'toll:payable_driver',           ARRAY['carried_fact_id'],           'Down correction after settlement, tag: driver share'),
  ('P19_tag_fleet',         'P19', 'toll:tag_prepaid',              'toll:expense',                  ARRAY['carried_fact_id'],           'Down correction after settlement, tag: fleet share'),
  ('P19_tag_platform',      'P19', 'toll:tag_prepaid',              'toll:payback_unallocated',      ARRAY['carried_fact_id'],           'Down correction after settlement, tag: platform share (undecided leftover)'),
  ('P19_cash_driver',       'P19', 'toll:receivable_driver',        'toll:payable_driver',           ARRAY['carried_fact_id'],           'Down correction after settlement, cash: driver share'),
  ('P19_cash_fleet',        'P19', 'toll:receivable_driver',        'toll:expense',                  ARRAY['carried_fact_id'],           'Down correction after settlement, cash: fleet share'),
  ('P19_cash_platform',     'P19', 'toll:receivable_driver',        'toll:payback_unallocated',      ARRAY['carried_fact_id'],           'Down correction after settlement, cash: platform share (undecided leftover)'),
  ('P20_cash_recovered',    'P20', 'toll:recovered_in_driver_cash', 'toll:expense',                  ARRAY['carried_fact_id'],           'Roam cash settled after a provisional seal');
-- P9 has no posting. P15 and P17 are reversals of the rows above (toll_system.post with p_reverse = true).

REVOKE ALL ON toll.posting_rules FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON toll.posting_rules TO authenticated;
ALTER TABLE toll.posting_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY posting_rules_read ON toll.posting_rules FOR SELECT TO authenticated USING (true);

-- 2. Accounts, with the right class -------------------------------------------------------------
-- ledger._infer_account_meta makes every org: account an 'asset', so toll accounts are created here first.
CREATE OR REPLACE FUNCTION toll_system.ensure_accounts(p_company uuid, p_currency text DEFAULT 'JMD')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
  v_class text;
BEGIN
  IF p_company IS NULL THEN
    RAISE EXCEPTION 'TOLL_COMPANY_REQUIRED';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('toll:tag_prepaid',              'asset'),
      ('toll:suspense',                 'asset'),
      ('toll:payback_unallocated',      'liability'),
      ('toll:receivable_platform',      'asset'),
      ('toll:recovered_in_driver_cash', 'asset'),
      ('toll:receivable_driver',        'asset'),
      ('toll:payable_driver',           'liability'),
      ('toll:expense',                  'expense'),
      ('toll:platform_payout_clearing', 'asset'),
      ('bank',                          'asset')
    ) AS t(suffix, account_class)
  LOOP
    INSERT INTO ledger.accounts (organization_id, account_key, account_class, currency, balance_minor)
    VALUES (p_company, 'org:' || p_company || ':' || r.suffix, r.account_class, p_currency, 0)
    ON CONFLICT (account_key, currency) DO NOTHING;

    SELECT a.account_class INTO v_class
    FROM ledger.accounts a
    WHERE a.account_key = 'org:' || p_company || ':' || r.suffix AND a.currency = p_currency;

    IF v_class IS DISTINCT FROM r.account_class THEN
      RAISE EXCEPTION 'TOLL_ACCOUNT_CLASS_MISMATCH: % is % (expected %)', r.suffix, v_class, r.account_class;
    END IF;
  END LOOP;
END;
$$;

-- 3. Sealed week -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.week_is_sealed(p_company uuid, p_week date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT ws.status = 'closed'
    FROM ledger.week_statements ws
    WHERE ws.organization_id = p_company
      AND ws.kind = 'toll_week'
      AND ws.driver_id = '*'
      AND ws.week_key = p_week
    ORDER BY ws.version DESC
    LIMIT 1
  ), false);
$$;

-- 4. The only toll ledger writer --------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.post(
  p_company      uuid,
  p_rule         text,
  p_amount_minor bigint,
  p_effective_at timestamptz,
  p_command_id   text,
  p_line         int,
  p_refs         jsonb,
  p_reverse      boolean DEFAULT false,
  p_currency     text DEFAULT 'JMD'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rule    toll.posting_rules%ROWTYPE;
  v_refs    jsonb := coalesce(p_refs, '{}'::jsonb);
  v_ref     text;
  v_week    date;
  v_debit   text;
  v_credit  text;
  v_key     text;
  v_hash    text;
  v_meta    jsonb;
  v_ref_id  text;
  v_result  jsonb;
BEGIN
  -- Inputs
  IF p_company IS NULL THEN RAISE EXCEPTION 'TOLL_COMPANY_REQUIRED'; END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN RAISE EXCEPTION 'TOLL_AMOUNT_INVALID'; END IF;
  IF p_effective_at IS NULL THEN RAISE EXCEPTION 'TOLL_EFFECTIVE_AT_REQUIRED'; END IF;
  IF nullif(btrim(p_command_id), '') IS NULL THEN RAISE EXCEPTION 'TOLL_COMMAND_ID_REQUIRED'; END IF;
  IF p_line IS NULL OR p_line < 1 THEN RAISE EXCEPTION 'TOLL_LINE_INVALID'; END IF;

  SELECT * INTO v_rule FROM toll.posting_rules WHERE code = p_rule;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOLL_RULE_UNKNOWN: %', p_rule; END IF;

  -- I2: the references the rule needs are present, and each toll record is live, non-legacy and the company's own
  FOREACH v_ref IN ARRAY v_rule.required_refs LOOP
    IF nullif(v_refs ->> v_ref, '') IS NULL THEN
      RAISE EXCEPTION 'TOLL_REF_REQUIRED: % needs %', p_rule, v_ref;
    END IF;
  END LOOP;

  IF v_refs ? 'charge_id' AND NOT EXISTS (
       SELECT 1 FROM toll.charges c
       WHERE c.organization_id = p_company AND c.id = (v_refs ->> 'charge_id')::uuid AND NOT c.is_legacy) THEN
    RAISE EXCEPTION 'TOLL_REF_NOT_FOUND: charge %', v_refs ->> 'charge_id';
  END IF;
  IF v_refs ? 'payback_id' AND NOT EXISTS (
       SELECT 1 FROM toll.paybacks p
       WHERE p.organization_id = p_company AND p.id = (v_refs ->> 'payback_id')::uuid AND NOT p.is_legacy) THEN
    RAISE EXCEPTION 'TOLL_REF_NOT_FOUND: payback %', v_refs ->> 'payback_id';
  END IF;
  IF v_refs ? 'carried_fact_id' AND NOT EXISTS (
       SELECT 1 FROM toll.carried_facts f
       WHERE f.organization_id = p_company AND f.id = (v_refs ->> 'carried_fact_id')::uuid) THEN
    RAISE EXCEPTION 'TOLL_REF_NOT_FOUND: carried fact %', v_refs ->> 'carried_fact_id';
  END IF;
  IF v_refs ? 'tag_topup_id' AND NOT EXISTS (
       SELECT 1 FROM toll.tag_topups t
       WHERE t.organization_id = p_company AND t.id = (v_refs ->> 'tag_topup_id')::uuid) THEN
    RAISE EXCEPTION 'TOLL_REF_NOT_FOUND: tag top-up %', v_refs ->> 'tag_topup_id';
  END IF;

  -- I3: nothing posts into a sealed week (the week of the row is the week of its effective time, ADR 0007)
  v_week := ledger.jamaica_week_start(p_effective_at);
  IF toll_system.week_is_sealed(p_company, v_week) THEN
    RAISE EXCEPTION 'WEEK_SEALED: %', v_week;
  END IF;

  PERFORM toll_system.ensure_accounts(p_company, p_currency);

  IF p_reverse THEN
    v_debit  := 'org:' || p_company || ':' || v_rule.credit_suffix;
    v_credit := 'org:' || p_company || ':' || v_rule.debit_suffix;
  ELSE
    v_debit  := 'org:' || p_company || ':' || v_rule.debit_suffix;
    v_credit := 'org:' || p_company || ':' || v_rule.credit_suffix;
  END IF;

  v_key  := 'toll:' || p_company || ':' || p_command_id || ':' || p_line;
  v_hash := md5(concat_ws('|', p_rule, p_amount_minor, p_effective_at, v_refs::text, p_reverse, p_currency));
  v_ref_id := coalesce(v_refs ->> 'charge_id', v_refs ->> 'payback_id', v_refs ->> 'carried_fact_id',
                       v_refs ->> 'tag_topup_id', v_refs ->> 'payout_ref', v_refs ->> 'settlement_ref');
  v_meta := (v_refs - 'driver_id')
            || jsonb_build_object('toll_rule', p_rule, 'design_ref', v_rule.design_ref, 'reverse', p_reverse,
                                  'toll_week', v_week)
            || CASE WHEN nullif(v_refs ->> 'driver_id', '') IS NOT NULL
                    THEN jsonb_build_object('driverId', v_refs ->> 'driver_id') ELSE '{}'::jsonb END;

  PERFORM set_config('toll.writer', 'on', true);
  BEGIN
    v_result := ledger.post_entry(
      p_idempotency_key := v_key,
      p_entry_type      := 'toll_v2:' || p_rule || CASE WHEN p_reverse THEN ':reverse' ELSE '' END,
      p_debit_account_key  := v_debit,
      p_credit_account_key := v_credit,
      p_amount_minor    := p_amount_minor,
      p_currency        := p_currency,
      p_request_hash    := v_hash,
      p_organization_id := p_company,
      p_product         := 'roam_fleet',
      p_effective_at    := p_effective_at,
      p_reference_type  := 'toll',
      p_reference_id    := v_ref_id,
      p_metadata        := v_meta
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('toll.writer', 'off', true);
    RAISE;
  END;
  PERFORM set_config('toll.writer', 'off', true);

  IF (v_result ->> 'conflict')::boolean THEN
    RAISE EXCEPTION 'TOLL_POST_CONFLICT: % was already posted with different content', v_key;
  END IF;

  RETURN (v_result ->> 'entry_id')::uuid;
END;
$$;

-- 5. Guard on ledger.entries -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll.tg_ledger_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- fires on EVERY ledger insert: must never fail for a caller who cannot read ledger.accounts
SET search_path = ''
AS $$
DECLARE
  v_row ledger.entries%ROWTYPE;
  v_touches_toll boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM ledger.accounts a
    WHERE a.id IN (v_row.debit_account_id, v_row.credit_account_id)
      AND a.account_key ~ '^org:[0-9a-fA-F-]{36}:toll:'
  ) INTO v_touches_toll;

  IF NOT v_touches_toll THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TOLL_ROWS_PERMANENT: toll ledger rows are never deleted; post a reversal';
  END IF;

  IF coalesce(current_setting('toll.writer', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'TOLL_WRITER_ONLY: toll ledger accounts are written only through toll_system.post';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER toll_ledger_entries_guard
  BEFORE INSERT OR DELETE ON ledger.entries
  FOR EACH ROW
  EXECUTE FUNCTION toll.tg_ledger_entries_guard();

-- 6. Grants: system functions for the service key only -----------------------------------------
REVOKE ALL ON FUNCTION toll_system.ensure_accounts(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.week_is_sealed(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.post(uuid, text, bigint, timestamptz, text, int, jsonb, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.ensure_accounts(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION toll_system.week_is_sealed(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION toll_system.post(uuid, text, bigint, timestamptz, text, int, jsonb, boolean, text)
  TO service_role;
REVOKE ALL ON FUNCTION toll.tg_ledger_entries_guard() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';


-- ===== 20261112185355_toll_v2_command_core =====
-- Toll rebuild Phase 0 R3: the command core, the seal rule (G1) and reopen.
-- Design: docs/toll-architecture.md B3 (contract, transaction order), B6 (seal requires / reopen), B2 (one charge state).
--
--   public.toll_v2_command(intent, body)  : the only entry point. Called with the USER'S token (B7.1).
--   toll_write.command(intent, body)      : runs the B3 transaction order, all or nothing.
--   toll_system.charge_state(...)           : the one closed charge state (B2, G1.1).
--   toll_system.seal_blockers(company, week): what stops a week from sealing (B6, G1).
--
-- Every refusal is an exception with MESSAGE = the code (WEEK_SEALED, VERSION_CHANGED, PENDING_NOT_RESOLVED, ...)
-- and DETAIL = a JSON object; the whole transaction rolls back, so a refusal writes nothing (I7).
-- Phase 0 intents: seal_week, reopen_week. carry_forward checks its refusals and then answers
-- INTENT_NOT_BUILT (built in Phase 2). Every other intent of the closed list answers INTENT_NOT_BUILT.

-- 1. decisions: append-only, except the stored answer may be filled in once ----------------------
CREATE OR REPLACE FUNCTION toll.tg_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'audit_log' THEN
    RAISE EXCEPTION '% is append-only: % not allowed', TG_TABLE_NAME, lower(TG_OP);
  END IF;

  IF TG_TABLE_NAME = 'decisions' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'decisions is append-only: delete not allowed';
    END IF;
    -- R3: the command row is written first (it is the replay lock) and its answer is stored at the end.
    IF OLD.response IS NOT NULL
       OR to_jsonb(NEW) - 'response' - 'response_truncated'
          IS DISTINCT FROM to_jsonb(OLD) - 'response' - 'response_truncated' THEN
      RAISE EXCEPTION 'decisions is append-only: only the stored answer may be set, once';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'suggestions' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'suggestions is append-only: delete not allowed';
    END IF;
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

  RETURN NEW;
END;
$$;

-- 2. Small helpers ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.refuse(p_code text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING MESSAGE = p_code, DETAIL = coalesce(p_detail, '{}'::jsonb)::text, ERRCODE = 'P0001';
END;
$$;

-- Latest toll_week statement version for a week (0 = never sealed or reopened).
CREATE OR REPLACE FUNCTION toll_system.week_version(p_company uuid, p_week date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(max(ws.version), 0)
  FROM ledger.week_statements ws
  WHERE ws.organization_id = p_company AND ws.kind = 'toll_week' AND ws.driver_id = '*' AND ws.week_key = p_week;
$$;

-- The week a charge counts in: its carried_facts to_week when carried, else its own week_key (B2, G1.8).
CREATE OR REPLACE FUNCTION toll_system.charge_counted_week(p_company uuid, p_charge_id uuid, p_week_key date)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT f.to_week FROM toll.carried_facts f
    WHERE f.organization_id = p_company AND f.original_id = p_charge_id AND f.kind IN ('charge', 'correction_up')
    ORDER BY f.created_at DESC LIMIT 1
  ), p_week_key);
$$;

-- The one closed charge state, checked in the B2 order.
CREATE OR REPLACE FUNCTION toll_system.charge_state(p_company uuid, p_charge_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN c.duplicate_of IS NOT NULL                 THEN 'duplicate'
    WHEN c.evidence_status = 'rejected'             THEN 'rejected'
    WHEN c.evidence_status = 'unverified'           THEN 'unverified'
    WHEN c.awaiting_cash                            THEN 'awaiting_cash'
    WHEN coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL), 0)
         >= c.amount_minor                          THEN 'decided'
    ELSE 'pending'
  END
  FROM toll.charges c
  WHERE c.organization_id = p_company AND c.id = p_charge_id;
$$;

-- What stops a week from sealing (B6, G1). One row per blocking record; reason = the record's one state.
CREATE OR REPLACE FUNCTION toll_system.seal_blockers(p_company uuid, p_week date)
RETURNS TABLE (kind text, id uuid, amount_minor bigint, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH week_charges AS (
    SELECT c.id, c.amount_minor, toll_system.charge_state(p_company, c.id) AS state
    FROM toll.charges c
    WHERE c.organization_id = p_company
      AND NOT c.is_legacy AND NOT c.after_seal
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week
  ),
  week_paybacks AS (
    SELECT p.id, (p.amount_minor
         - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)
         - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                     WHERE u.organization_id = p_company AND u.payback_id = p.id AND u.reversed_by IS NULL), 0)
           )::bigint AS unallocated
    FROM toll.paybacks p
    WHERE p.organization_id = p_company
      AND p.week_key = p_week
      AND NOT p.is_legacy AND NOT p.after_seal
      AND p.reversal_of IS NULL                                   -- a reversing payback has no state of its own
      AND NOT EXISTS (SELECT 1 FROM toll.paybacks r             -- a reversed payback is final
                      WHERE r.organization_id = p_company AND r.reversal_of = p.id)
  )
  SELECT 'charge'::text, wc.id, wc.amount_minor, wc.state
  FROM week_charges wc WHERE wc.state IN ('pending', 'unverified')
  UNION ALL
  SELECT 'review_pair'::text, d.id, NULL::bigint, 'review_pair'::text
  FROM toll.duplicate_reviews d
  WHERE d.organization_id = p_company AND d.status = 'open'
    AND (d.charge_a IN (SELECT id FROM week_charges) OR d.charge_b IN (SELECT id FROM week_charges))
  UNION ALL
  SELECT 'payback'::text, wp.id, wp.unallocated, 'unallocated_payback'::text
  FROM week_paybacks wp WHERE wp.unallocated > 0;
$$;

-- Who may manage tolls for a company (step 2 of B3). The Fleet permission catalog is in code
-- (packages/auth-client/src/permissions.ts: 'toll.manage' = platform_owner, fleet_owner, fleet_manager) and the
-- role comes from _fleet-server/access_resolution.ts. This mirrors the part that grants toll.manage inside one
-- company, from the same tables, and refuses when unsure:
--   * the user owns the company (organizations.owner_id, fleet product line), or
--   * the user has an ACTIVE, unexpired organization seat in that company as fleet_owner or fleet_manager.
-- Platform staff acting for a company come later, through toll.staff_company_access (B7.5); refused in Phase 0.
-- A drift test (R6) fails if the catalog's toll.manage roles change.
CREATE OR REPLACE FUNCTION toll_system.user_can_manage_tolls(p_user uuid, p_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user IS NOT NULL AND p_company IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_company AND o.owner_id = p_user AND coalesce(o.product_line, 'fleet') = 'fleet'
    )
    OR EXISTS (
      SELECT 1
      FROM platform.user_roles ur
      JOIN platform.roles r ON r.id = ur.role_id
      WHERE ur.user_id = p_user
        AND ur.scope_type = 'organization'
        AND ur.scope_id = p_company
        AND ur.status = 'active'
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
        AND r.name IN ('fleet_owner', 'fleet_manager')
    )
  );
$$;

REVOKE ALL ON FUNCTION toll_system.user_can_manage_tolls(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 3. Intent: seal_week --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_seal_week(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_week      date := (p_body ->> 'week_key')::date;
  v_expected  integer := (p_body ->> 'expected_week_version')::integer;
  v_current   integer;
  v_blockers  jsonb;
  v_line      integer := 0;
  v_awaiting  record;
  v_new_ver   integer;
  v_hash      text;
  v_counts    jsonb;
BEGIN
  IF v_week IS NULL OR v_expected IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('week_key', 'expected_week_version')));
  END IF;
  IF v_week <> date_trunc('week', v_week)::date THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('week_key', 'must be a Monday (ADR 0007)'));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('toll_week:' || p_company || ':' || v_week, 0));

  v_current := toll_system.week_version(p_company, v_week);
  IF v_current <> v_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('week_key', v_week, 'week_version', v_current));
  END IF;
  IF toll_system.week_is_sealed(p_company, v_week) THEN
    PERFORM toll_write.refuse('WEEK_SEALED', jsonb_build_object('sealed_weeks', jsonb_build_array(v_week)));
  END IF;

  -- G1: everything decided
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'id', b.id, 'amountMinor', b.amount_minor, 'reason', b.reason)
                            ORDER BY b.kind, b.id), '[]'::jsonb)
  INTO v_blockers
  FROM toll_system.seal_blockers(p_company, v_week) b;
  IF jsonb_array_length(v_blockers) > 0 THEN
    PERFORM toll_write.refuse('PENDING_NOT_RESOLVED', jsonb_build_object('week_key', v_week, 'blocking', v_blockers));
  END IF;

  -- G1.2: Roam cash rides still awaiting cash are decided provisionally as the fleet's, inside the seal
  FOR v_awaiting IN
    SELECT c.id, c.amount_minor, c.occurred_at, c.driver_id,
           (c.amount_minor - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                                       WHERE a.organization_id = p_company AND a.charge_id = c.id AND a.reversed_by IS NULL), 0)
           )::bigint AS open_minor
    FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = v_week
      AND toll_system.charge_state(p_company, c.id) = 'awaiting_cash'
  LOOP
    CONTINUE WHEN v_awaiting.open_minor <= 0;
    v_line := v_line + 1;
    INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, provisional, decision_id)
    VALUES (p_company, v_awaiting.id, 'fleet', v_awaiting.open_minor, 'awaiting_cash_at_seal', true, p_decision_id);
    PERFORM toll_system.post(p_company, 'P8_allocate_fleet', v_awaiting.open_minor, v_awaiting.occurred_at,
                             p_command_id, v_line,
                             jsonb_build_object('charge_id', v_awaiting.id, 'driver_id', v_awaiting.driver_id));
  END LOOP;

  -- The sealed statement (Phase 0 summary; Phase 1 stores the full TollWeekResultV1 here)
  SELECT jsonb_build_object(
           'charges',  (SELECT count(*) FROM toll.charges c WHERE c.organization_id = p_company AND NOT c.is_legacy
                          AND NOT c.after_seal AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = v_week),
           'paybacks', (SELECT count(*) FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy
                          AND NOT p.after_seal AND p.week_key = v_week),
           'provisional', v_line)
  INTO v_counts;
  v_hash := md5(v_counts::text || ':' || v_week);
  v_new_ver := v_current + 1;

  INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status,
                                      amounts_minor, source_row_ids, source_hash, engine_version,
                                      closed_at, closed_by, close_reason)
  VALUES ('toll_week', p_company, '*', v_week, v_new_ver, 'closed',
          v_counts, '[]'::jsonb, v_hash, 'toll_v2_phase0', now(), auth.uid()::text, 'seal_week');

  RETURN jsonb_build_object(
    'decision_id', p_decision_id,
    'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                  'delta', jsonb_build_object('sealed', true, 'provisional', v_line))));
END;
$$;

-- 4. Intent: reopen_week ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_reopen_week(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_week     date := (p_body ->> 'week_key')::date;
  v_expected integer := (p_body ->> 'expected_week_version')::integer;
  v_reason   text := nullif(btrim(p_body ->> 'reason'), '');
  v_current  integer;
  v_new_ver  integer;
BEGIN
  IF v_week IS NULL OR v_expected IS NULL OR v_reason IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('week_key', 'expected_week_version', 'reason')));
  END IF;

  -- Exclusive week lock: an import arriving now waits, then sees the reopened state (B3 "WEEK_REOPENING")
  PERFORM pg_advisory_xact_lock(hashtextextended('toll_week:' || p_company || ':' || v_week, 0));

  v_current := toll_system.week_version(p_company, v_week);
  IF v_current <> v_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('week_key', v_week, 'week_version', v_current));
  END IF;
  IF NOT toll_system.week_is_sealed(p_company, v_week) THEN
    PERFORM toll_write.refuse('WEEK_NOT_SEALED', jsonb_build_object('week_key', v_week));
  END IF;

  -- B6: refused once any driver of that week has been paid (a late fact then uses carry_forward)
  IF EXISTS (SELECT 1 FROM ledger.settlement_movements m
             WHERE m.organization_id = p_company AND m.period_anchor = v_week
               AND m.kind IN ('pay', 'write_off') AND m.status = 'posted') THEN
    PERFORM toll_write.refuse('DRIVERS_ALREADY_PAID', jsonb_build_object('week_key', v_week, 'use', 'carry_forward'));
  END IF;

  v_new_ver := v_current + 1;
  INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status,
                                      amounts_minor, source_row_ids, engine_version, close_reason)
  VALUES ('toll_week', p_company, '*', v_week, v_new_ver, 'draft',
          '{}'::jsonb, '[]'::jsonb, 'toll_v2_phase0', 'reopen: ' || v_reason);

  INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, new_row, actor_user_id)
  VALUES (p_company, 'ledger.week_statements', 'toll_week:' || v_week, 'reopen',
          jsonb_build_object('week_version', v_new_ver, 'reason', v_reason, 'decision_id', p_decision_id), auth.uid());

  RETURN jsonb_build_object(
    'decision_id', p_decision_id,
    'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                  'delta', jsonb_build_object('sealed', false))));
END;
$$;

-- 5. Intent: carry_forward (Phase 0: refusals only) --------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.intent_carry_forward(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_week date := (p_body ->> 'from_week')::date;
BEGIN
  IF v_from_week IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('from_week')));
  END IF;
  IF NOT toll_system.week_is_sealed(p_company, v_from_week) THEN
    PERFORM toll_write.refuse('WEEK_NOT_SEALED', jsonb_build_object('week_key', v_from_week));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ledger.settlement_movements m
                 WHERE m.organization_id = p_company AND m.period_anchor = v_from_week
                   AND m.kind IN ('pay', 'write_off') AND m.status = 'posted') THEN
    PERFORM toll_write.refuse('REOPEN_INSTEAD', jsonb_build_object('week_key', v_from_week));
  END IF;
  PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', 'carry_forward', 'phase', 2));
  RETURN NULL;
END;
$$;

-- 6. The command (B3 transaction order) ---------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_write.command(p_intent text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company    uuid;
  v_user       uuid := auth.uid();
  v_command_id text := nullif(btrim(p_body ->> 'command_id'), '');
  v_permission text;
  v_decision   uuid;
  v_stored     jsonb;
  v_response   jsonb;
  v_text       text;
BEGIN
  -- 1. Company from the user's own token only (B7)
  v_company := toll_read.current_company();
  IF v_company IS NULL OR v_user IS NULL THEN
    PERFORM toll_write.refuse('NO_COMPANY');
  END IF;
  IF p_body ? 'organization_id' OR p_body ? 'organizationId' OR p_body ? 'company_id' THEN
    PERFORM toll_write.refuse('COMPANY_NOT_ACCEPTED');           -- no company parameter, ever
  END IF;

  -- 2. Permission (closed list of intents)
  v_permission := CASE p_intent
    WHEN 'seal_week'   THEN 'toll.manage'
    WHEN 'reopen_week' THEN 'toll.manage'
    WHEN 'carry_forward' THEN 'toll.manage'
    WHEN 'link_payback' THEN 'toll.manage'   WHEN 'driver_pays' THEN 'toll.manage'
    WHEN 'fleet_absorbs' THEN 'toll.manage'  WHEN 'leave_payback_unlinked' THEN 'toll.manage'
    WHEN 'undo_decision' THEN 'toll.manage'  WHEN 'reverse_payback' THEN 'toll.manage'
    WHEN 'correct_charge_amount' THEN 'toll.manage' WHEN 'correct_charge_week' THEN 'toll.manage'
    WHEN 'confirm_duplicate' THEN 'toll.manage' WHEN 'release_duplicate' THEN 'toll.manage'
    WHEN 'verify_cash_receipt' THEN 'toll.manage' WHEN 'reject_cash_receipt' THEN 'toll.manage'
    WHEN 'apply_suggestion' THEN 'toll.manage' WHEN 'import_batch' THEN 'toll.manage'
    ELSE NULL
  END;
  IF v_permission IS NULL THEN
    PERFORM toll_write.refuse('UNKNOWN_INTENT', jsonb_build_object('intent', p_intent));
  END IF;
  IF NOT toll_system.user_can_manage_tolls(v_user, v_company) THEN
    PERFORM toll_write.refuse('FORBIDDEN', jsonb_build_object('permission', v_permission));
  END IF;
  IF v_command_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('command_id')));
  END IF;

  -- 3. Replay: the command row is the lock. A second call with the same id waits here, then gets the first answer.
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id, reason_code, note, targets)
  VALUES (v_company, v_command_id, p_intent, 'user', v_user, p_body ->> 'reason_code', p_body ->> 'note', p_body)
  ON CONFLICT (organization_id, command_id) DO NOTHING
  RETURNING id INTO v_decision;

  IF v_decision IS NULL THEN
    SELECT d.response, d.intent INTO v_stored, v_text
    FROM toll.decisions d WHERE d.organization_id = v_company AND d.command_id = v_command_id;
    IF v_text IS DISTINCT FROM p_intent THEN
      PERFORM toll_write.refuse('COMMAND_ID_REUSED', jsonb_build_object('command_id', v_command_id));
    END IF;
    RETURN coalesce(v_stored, '{}'::jsonb) || jsonb_build_object('replay', true);
  END IF;

  -- 4-8. Locks, versions, week state, the decision, the ledger: inside each intent
  v_response := CASE p_intent
    WHEN 'seal_week'     THEN toll_write.intent_seal_week(v_company, v_decision, v_command_id, p_body)
    WHEN 'reopen_week'   THEN toll_write.intent_reopen_week(v_company, v_decision, v_command_id, p_body)
    WHEN 'carry_forward' THEN toll_write.intent_carry_forward(v_company, v_decision, v_command_id, p_body)
    ELSE NULL
  END;
  IF v_response IS NULL THEN
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', p_intent));
  END IF;

  -- 9. Store the answer (at most 64 KB; a larger one keeps decision, versions and per-week deltas only)
  IF octet_length(v_response::text) > 65536 THEN
    v_response := jsonb_build_object('decision_id', v_decision, 'weeks', v_response -> 'weeks', 'truncated', true);
    UPDATE toll.decisions SET response = v_response, response_truncated = true WHERE id = v_decision;
  ELSE
    UPDATE toll.decisions SET response = v_response WHERE id = v_decision;
  END IF;

  RETURN v_response;
END;
$$;

-- 7. The public entry point (PostgREST exposes public; it runs as the calling user) --------------
CREATE OR REPLACE FUNCTION public.toll_v2_command(p_intent text, p_body jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT toll_write.command(p_intent, p_body); $$;

-- Is tolls v2 switched on for the caller's company? (B11: every toll request checks this first, on the server,
-- with the user's token; the service key has no access to toll tables.)
CREATE OR REPLACE FUNCTION public.toll_v2_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT s.tolls_v2 FROM toll.switch_state s
                   WHERE s.organization_id = toll_read.current_company()), false);
$$;

REVOKE ALL ON FUNCTION public.toll_v2_enabled() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toll_v2_enabled() TO authenticated;

-- 8. Grants: users only, never anon, never the service key (B7.3) -------------------------------
REVOKE ALL ON FUNCTION public.toll_v2_command(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.toll_v2_command(text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION toll_write.command(text, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION toll_write.command(text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION toll_write.refuse(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_seal_week(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_reopen_week(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_carry_forward(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION toll_system.week_version(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.week_version(uuid, date) TO service_role;

-- Internal helpers take a company id, so they live in toll_system and nobody calls them directly (B7.2).
REVOKE ALL ON FUNCTION toll_system.charge_counted_week(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.charge_state(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.seal_blockers(uuid, date) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';


-- ===== 20261112191942_toll_v2_nightly_and_payouts =====
-- Toll rebuild Phase 0 R5: alerts, the week summary, nightly checks 1-7, the payout trigger, plaza rules.
-- Design: docs/toll-architecture.md B5 (nightly checks, payout trigger), B6 (seal snapshot), B2 (plaza rules), B12.
--
-- Clarification found while building (recorded in Part F): events that happen AFTER a seal by design
-- (platform payout P10/P11, driver settlement P12-P14) are dated when they happen, in the open week.
-- Dating them in the sealed week would be refused by I3.

-- 1. Alerts (same shape as recon.alerts: one OPEN alert per company + dedupe key) -----------------
CREATE TABLE toll.alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL CHECK (kind IN ('nightly_check', 'aging', 'payout_trigger')),
  severity        text NOT NULL CHECK (severity IN ('watch', 'page')),
  dedupe_key      text NOT NULL,
  title           text NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at     timestamptz
);
CREATE UNIQUE INDEX toll_alerts_open_uidx ON toll.alerts (organization_id, dedupe_key) WHERE resolved_at IS NULL;

CREATE TABLE toll.nightly_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  run_id          uuid NOT NULL,
  check_no        int NOT NULL CHECK (check_no BETWEEN 1 AND 7),
  name            text NOT NULL,
  ok              boolean NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX toll_nightly_results_org_run_idx ON toll.nightly_results (organization_id, created_at DESC);

-- What has been posted for each bank confirmation record (P10 + P11), so changes and deletes can be reversed.
CREATE TABLE toll.payout_postings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  source_ref      text NOT NULL,      -- the fleet_bank_confirm:org:<co>:<week>:<platform> key
  source_version  text NOT NULL,      -- md5 of the record's value
  week_key        date NOT NULL,
  platform        text NOT NULL,
  amount_minor    bigint NOT NULL CHECK (amount_minor >= 0),
  command_id      text NOT NULL,
  reversed_at     timestamptz,
  CONSTRAINT payout_postings_org_cmd_key UNIQUE (organization_id, command_id)
);
CREATE UNIQUE INDEX toll_payout_postings_active_uidx
  ON toll.payout_postings (organization_id, source_ref) WHERE reversed_at IS NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alerts', 'nightly_results', 'payout_postings'] LOOP
    EXECUTE format('REVOKE ALL ON toll.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON toll.%I TO authenticated', t);
    EXECUTE format('ALTER TABLE toll.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON toll.%I FOR SELECT TO authenticated USING (organization_id = toll_read.current_company())',
                   t || '_company_read', t);
  END LOOP;
END $$;

-- nightly_results is strictly append-only:
CREATE OR REPLACE FUNCTION toll.tg_nightly_results_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'nightly_results is append-only: % not allowed', lower(TG_OP);
END $$;
CREATE TRIGGER nightly_results_append_only
  BEFORE UPDATE OR DELETE ON toll.nightly_results FOR EACH ROW EXECUTE FUNCTION toll.tg_nightly_results_append_only();

-- Raise or refresh an alert; resolve it when the condition is gone.
CREATE OR REPLACE FUNCTION toll_system.raise_alert(p_company uuid, p_kind text, p_severity text, p_key text,
                                                   p_title text, p_detail jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- clock_timestamp(), not now(): the nightly run resolves alerts "not seen since the run started",
  -- and now() is the transaction start, which is earlier than the run start.
  UPDATE toll.alerts SET last_seen_at = clock_timestamp(), detail = p_detail,
         severity = CASE WHEN p_severity = 'page' THEN 'page' ELSE severity END
  WHERE organization_id = p_company AND dedupe_key = p_key AND resolved_at IS NULL;
  IF NOT FOUND THEN
    INSERT INTO toll.alerts (organization_id, kind, severity, dedupe_key, title, detail, last_seen_at)
    VALUES (p_company, p_kind, p_severity, p_key, p_title, p_detail, clock_timestamp());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION toll_system.resolve_alerts_not_seen(p_company uuid, p_kind text, p_since timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE toll.alerts SET resolved_at = now()
  WHERE organization_id = p_company AND kind = p_kind AND resolved_at IS NULL AND last_seen_at < p_since;
$$;

-- 2. Small money helpers ------------------------------------------------------------------------
-- Natural balance: assets and expenses are debit-positive, liabilities credit-positive
-- (ledger.post_entry lowers the debit account's balance_minor and raises the credit account's).
CREATE OR REPLACE FUNCTION toll_system.natural_balance(p_company uuid, p_suffix text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((
    SELECT CASE WHEN a.account_class IN ('asset', 'expense') THEN -a.balance_minor ELSE a.balance_minor END
    FROM ledger.accounts a
    WHERE a.account_key = 'org:' || p_company || ':' || p_suffix AND a.currency = 'JMD'), 0);
$$;

-- Net amount posted under rules matching a pattern (a reversal counts negative), optionally for one record.
CREATE OR REPLACE FUNCTION toll_system.rule_net(p_company uuid, p_rule_like text,
                                                p_ref_key text DEFAULT NULL, p_ref_id text DEFAULT NULL)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(sum(CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -e.amount_minor ELSE e.amount_minor END), 0)::bigint
  FROM ledger.entries e
  WHERE e.organization_id = p_company
    AND e.reference_type = 'toll'
    AND e.metadata ->> 'toll_rule' LIKE p_rule_like
    AND (p_ref_key IS NULL OR e.metadata ->> p_ref_key = p_ref_id);
$$;

-- Active (non-legacy, not after-seal, posted) charges: not duplicate / rejected / unverified.
CREATE OR REPLACE VIEW toll.v_live_charges WITH (security_invoker = true) AS
  SELECT c.*,
         toll_system.charge_state(c.organization_id, c.id) AS state,
         coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL), 0)::bigint
           AS allocated_minor
  FROM toll.charges c
  WHERE NOT c.is_legacy AND NOT c.after_seal;
REVOKE ALL ON toll.v_live_charges FROM PUBLIC, anon, authenticated, service_role;

-- Active paybacks: not legacy, not after-seal, not a reversing row, not reversed.
CREATE OR REPLACE VIEW toll.v_active_paybacks WITH (security_invoker = true) AS
  SELECT p.*,
         coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = p.organization_id AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)::bigint
           AS allocated_minor
  FROM toll.paybacks p
  WHERE NOT p.is_legacy AND NOT p.after_seal AND p.reversal_of IS NULL
    AND NOT EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p.organization_id AND r.reversal_of = p.id);
REVOKE ALL ON toll.v_active_paybacks FROM PUBLIC, anon, authenticated, service_role;

-- 3. The week summary: what a seal freezes, and what check 4 recomputes ----------------------------
-- Phase 0 summary. Phase 1 replaces it with the full TollWeekResultV1 (B8) behind the same name.
CREATE OR REPLACE FUNCTION toll_system.week_summary(p_company uuid, p_week date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'charges', (SELECT count(*) FROM toll.v_live_charges c WHERE c.organization_id = p_company
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week),
    'charge_minor', (SELECT coalesce(sum(c.amount_minor), 0) FROM toll.v_live_charges c WHERE c.organization_id = p_company
                  AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week),
    'paybacks', (SELECT count(*) FROM toll.v_active_paybacks p WHERE p.organization_id = p_company AND p.week_key = p_week),
    'payback_minor', (SELECT coalesce(sum(p.amount_minor), 0) FROM toll.v_active_paybacks p
                  WHERE p.organization_id = p_company AND p.week_key = p_week),
    'provisional', (SELECT count(*) FROM toll.allocations a JOIN toll.charges c
                      ON c.organization_id = a.organization_id AND c.id = a.charge_id
                    WHERE a.organization_id = p_company AND a.provisional AND a.reversed_by IS NULL
                      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = p_week));
$$;

CREATE OR REPLACE FUNCTION toll_system.week_hash(p_company uuid, p_week date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT md5(toll_system.week_summary(p_company, p_week)::text || ':' || p_week);
$$;

-- seal_week now freezes week_summary / week_hash (replaces the inline counts of R3).
CREATE OR REPLACE FUNCTION toll_write.intent_seal_week(p_company uuid, p_decision_id uuid, p_command_id text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_week      date := (p_body ->> 'week_key')::date;
  v_expected  integer := (p_body ->> 'expected_week_version')::integer;
  v_current   integer;
  v_blockers  jsonb;
  v_line      integer := 0;
  v_awaiting  record;
  v_new_ver   integer;
BEGIN
  IF v_week IS NULL OR v_expected IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('week_key', 'expected_week_version')));
  END IF;
  IF v_week <> date_trunc('week', v_week)::date THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('week_key', 'must be a Monday (ADR 0007)'));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('toll_week:' || p_company || ':' || v_week, 0));

  v_current := toll_system.week_version(p_company, v_week);
  IF v_current <> v_expected THEN
    PERFORM toll_write.refuse('VERSION_CHANGED', jsonb_build_object('week_key', v_week, 'week_version', v_current));
  END IF;
  IF toll_system.week_is_sealed(p_company, v_week) THEN
    PERFORM toll_write.refuse('WEEK_SEALED', jsonb_build_object('sealed_weeks', jsonb_build_array(v_week)));
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'id', b.id, 'amountMinor', b.amount_minor, 'reason', b.reason)
                            ORDER BY b.kind, b.id), '[]'::jsonb)
  INTO v_blockers
  FROM toll_system.seal_blockers(p_company, v_week) b;
  IF jsonb_array_length(v_blockers) > 0 THEN
    PERFORM toll_write.refuse('PENDING_NOT_RESOLVED', jsonb_build_object('week_key', v_week, 'blocking', v_blockers));
  END IF;

  FOR v_awaiting IN
    SELECT c.id, c.occurred_at, c.driver_id, (c.amount_minor - c.allocated_minor)::bigint AS open_minor
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company AND c.state = 'awaiting_cash'
      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = v_week
  LOOP
    CONTINUE WHEN v_awaiting.open_minor <= 0;
    v_line := v_line + 1;
    INSERT INTO toll.allocations (organization_id, charge_id, bearer, amount_minor, reason, provisional, decision_id)
    VALUES (p_company, v_awaiting.id, 'fleet', v_awaiting.open_minor, 'awaiting_cash_at_seal', true, p_decision_id);
    PERFORM toll_system.post(p_company, 'P8_allocate_fleet', v_awaiting.open_minor, v_awaiting.occurred_at,
                             p_command_id, v_line,
                             jsonb_build_object('charge_id', v_awaiting.id, 'driver_id', v_awaiting.driver_id));
  END LOOP;

  v_new_ver := v_current + 1;
  INSERT INTO ledger.week_statements (kind, organization_id, driver_id, week_key, version, status,
                                      amounts_minor, source_row_ids, source_hash, engine_version,
                                      closed_at, closed_by, close_reason)
  VALUES ('toll_week', p_company, '*', v_week, v_new_ver, 'closed',
          toll_system.week_summary(p_company, v_week), '[]'::jsonb, toll_system.week_hash(p_company, v_week),
          'toll_v2_phase0', now(), auth.uid()::text, 'seal_week');

  RETURN jsonb_build_object(
    'decision_id', p_decision_id,
    'weeks', jsonb_build_array(jsonb_build_object('week_key', v_week, 'week_version', v_new_ver,
                                                  'delta', jsonb_build_object('sealed', true, 'provisional', v_line))));
END;
$$;

-- 4. Nightly checks ----------------------------------------------------------------------------
-- One row per check line. ok = false is an alert, never a repair (B5).
CREATE OR REPLACE FUNCTION toll_system.nightly_checks(p_company uuid)
RETURNS TABLE (check_no int, name text, ok boolean, detail jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_expected bigint;
  v_actual   bigint;
  r          record;
BEGIN
  -- Check 1: each toll account equals what its records say (B5 account table).
  -- suspense: the undecided part of posted live charges
  SELECT coalesce(sum(c.amount_minor - c.allocated_minor), 0) INTO v_expected
  FROM toll.v_live_charges c
  WHERE c.organization_id = p_company AND c.state NOT IN ('duplicate', 'rejected', 'unverified');
  v_actual := toll_system.natural_balance(p_company, 'toll:suspense');
  check_no := 1; name := 'account:toll:suspense'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- payback_unallocated: the unallocated part of active paybacks (incl. left-unlinked) + carried P19 platform shares - P18a
  SELECT coalesce(sum(p.amount_minor - p.allocated_minor), 0) INTO v_expected
  FROM toll.v_active_paybacks p WHERE p.organization_id = p_company;
  v_expected := v_expected + toll_system.rule_net(p_company, 'P19\_%\_platform') - toll_system.rule_net(p_company, 'P18a\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:payback_unallocated');
  check_no := 1; name := 'account:toll:payback_unallocated'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- expense: active fleet allocations + P18b fleet - P19 fleet shares - P20
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_expected
  FROM toll.allocations a
  JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE a.organization_id = p_company AND a.bearer = 'fleet' AND a.reversed_by IS NULL AND NOT c.is_legacy;
  v_expected := v_expected + toll_system.rule_net(p_company, 'P18b\_fleet\_%')
              - toll_system.rule_net(p_company, 'P19\_%\_fleet') - toll_system.rule_net(p_company, 'P20\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:expense');
  check_no := 1; name := 'account:toll:expense'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- receivable_driver: active driver allocations + P18b driver + P19 cash debits - P14 settled
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_expected
  FROM toll.allocations a
  JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE a.organization_id = p_company AND a.bearer = 'driver' AND a.reversed_by IS NULL AND NOT c.is_legacy;
  v_expected := v_expected + toll_system.rule_net(p_company, 'P18b\_driver\_%')
              + toll_system.rule_net(p_company, 'P19\_cash\_%') - toll_system.rule_net(p_company, 'P14\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:receivable_driver');
  check_no := 1; name := 'account:toll:receivable_driver'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- payable_driver: verified live cash charges + P19 driver shares - P13 settled
  SELECT coalesce(sum(c.amount_minor), 0) INTO v_expected
  FROM toll.v_live_charges c
  WHERE c.organization_id = p_company AND c.paid_by = 'cash' AND c.state NOT IN ('duplicate', 'rejected', 'unverified');
  v_expected := v_expected + toll_system.rule_net(p_company, 'P19\_%\_driver') - toll_system.rule_net(p_company, 'P13\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:payable_driver');
  check_no := 1; name := 'account:toll:payable_driver'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- tag_prepaid: top-ups - live tag charges + P19 tag refunds
  SELECT coalesce((SELECT sum(t.amount_minor) FROM toll.tag_topups t WHERE t.organization_id = p_company), 0)
       - coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                   WHERE c.organization_id = p_company AND c.paid_by = 'tag'
                     AND c.state NOT IN ('duplicate', 'rejected', 'unverified')), 0)
       + toll_system.rule_net(p_company, 'P19\_tag\_%')
  INTO v_expected;
  v_actual := toll_system.natural_balance(p_company, 'toll:tag_prepaid');
  check_no := 1; name := 'account:toll:tag_prepaid'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- receivable_platform: active fleet-received paybacks - P10 payouts - take-backs (P18a/P18b card)
  SELECT coalesce(sum(p.amount_minor), 0) INTO v_expected
  FROM toll.v_active_paybacks p WHERE p.organization_id = p_company AND p.received_by = 'fleet';
  v_expected := v_expected - toll_system.rule_net(p_company, 'P10\_%')
              - toll_system.rule_net(p_company, 'P18a\_leftover\_fleet') - toll_system.rule_net(p_company, 'P18b\_%\_card');
  v_actual := toll_system.natural_balance(p_company, 'toll:receivable_platform');
  check_no := 1; name := 'account:toll:receivable_platform'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- recovered_in_driver_cash: active driver-received paybacks - P12 settled - cash take-backs + P20
  SELECT coalesce(sum(p.amount_minor), 0) INTO v_expected
  FROM toll.v_active_paybacks p WHERE p.organization_id = p_company AND p.received_by = 'driver';
  v_expected := v_expected - toll_system.rule_net(p_company, 'P12\_%')
              - toll_system.rule_net(p_company, 'P18a\_leftover\_driver') - toll_system.rule_net(p_company, 'P18b\_%\_cash')
              + toll_system.rule_net(p_company, 'P20\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:recovered_in_driver_cash');
  check_no := 1; name := 'account:toll:recovered_in_driver_cash'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- platform_payout_clearing: always 0 today (P10 and P11 post together, A13 / O3)
  v_actual := toll_system.natural_balance(p_company, 'toll:platform_payout_clearing');
  check_no := 1; name := 'account:toll:platform_payout_clearing'; ok := v_actual = 0;
  detail := jsonb_build_object('ledger', v_actual, 'records', 0); RETURN NEXT;

  -- Check 2: every record's money is on the ledger, and every toll row points at a live record.
  -- 2a. each posted live charge: net P2/P3/P16 = its amount
  FOR r IN
    SELECT c.id, c.amount_minor,
           toll_system.rule_net(p_company, 'P2\_%', 'charge_id', c.id::text)
         + toll_system.rule_net(p_company, 'P3\_%', 'charge_id', c.id::text)
         + toll_system.rule_net(p_company, 'P16\_up\_%', 'charge_id', c.id::text)
         - toll_system.rule_net(p_company, 'P16\_down\_%', 'charge_id', c.id::text) AS posted
    FROM toll.v_live_charges c
    WHERE c.organization_id = p_company AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
  LOOP
    IF r.posted <> r.amount_minor THEN
      check_no := 2; name := 'charge_posted'; ok := false;
      detail := jsonb_build_object('charge_id', r.id, 'amount', r.amount_minor, 'posted', r.posted); RETURN NEXT;
    END IF;
  END LOOP;
  -- 2b. each charge's active allocations by bearer = net P6/P7/P8 for it
  FOR r IN
    SELECT c.id,
           coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'platform'), 0) AS plat,
           coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'driver'), 0)   AS drv,
           coalesce(sum(a.amount_minor) FILTER (WHERE a.bearer = 'fleet'), 0)    AS flt
    FROM toll.charges c
    LEFT JOIN toll.allocations a ON a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL
    WHERE c.organization_id = p_company AND NOT c.is_legacy
    GROUP BY c.id
  LOOP
    IF r.plat <> toll_system.rule_net(p_company, 'P6\_%', 'charge_id', r.id::text)
       OR r.drv <> toll_system.rule_net(p_company, 'P7\_%', 'charge_id', r.id::text)
       OR r.flt <> toll_system.rule_net(p_company, 'P8\_%', 'charge_id', r.id::text) THEN
      check_no := 2; name := 'allocations_posted'; ok := false;
      detail := jsonb_build_object('charge_id', r.id, 'platform', r.plat, 'driver', r.drv, 'fleet', r.flt); RETURN NEXT;
    END IF;
  END LOOP;
  -- 2c. each payback: net P4/P5 = its amount if active, 0 if reversed
  FOR r IN
    SELECT p.id, p.amount_minor,
           (EXISTS (SELECT 1 FROM toll.paybacks x WHERE x.organization_id = p.organization_id AND x.reversal_of = p.id)) AS reversed,
           toll_system.rule_net(p_company, 'P4\_%', 'payback_id', p.id::text)
         + toll_system.rule_net(p_company, 'P5\_%', 'payback_id', p.id::text) AS posted
    FROM toll.paybacks p
    WHERE p.organization_id = p_company AND NOT p.is_legacy AND NOT p.after_seal AND p.reversal_of IS NULL
  LOOP
    IF r.posted <> (CASE WHEN r.reversed THEN 0 ELSE r.amount_minor END) THEN
      check_no := 2; name := 'payback_posted'; ok := false;
      detail := jsonb_build_object('payback_id', r.id, 'amount', r.amount_minor, 'reversed', r.reversed, 'posted', r.posted);
      RETURN NEXT;
    END IF;
  END LOOP;
  -- 2d. no toll ledger row points at a missing or legacy record
  FOR r IN
    SELECT e.id, e.metadata
    FROM ledger.entries e
    WHERE e.organization_id = p_company AND e.reference_type = 'toll'
      AND ((e.metadata ? 'charge_id' AND NOT EXISTS (SELECT 1 FROM toll.charges c WHERE c.organization_id = p_company
               AND c.id = (e.metadata ->> 'charge_id')::uuid AND NOT c.is_legacy))
        OR (e.metadata ? 'payback_id' AND NOT EXISTS (SELECT 1 FROM toll.paybacks p WHERE p.organization_id = p_company
               AND p.id = (e.metadata ->> 'payback_id')::uuid AND NOT p.is_legacy)))
  LOOP
    check_no := 2; name := 'row_without_record'; ok := false;
    detail := jsonb_build_object('entry_id', r.id); RETURN NEXT;
  END LOOP;
  check_no := 2; name := 'records_vs_ledger'; ok := true; detail := '{}'::jsonb; RETURN NEXT;

  -- Check 3: per open week, the flow counted in the week of its record equals the week's answer (EC1).
  -- Phase 0 covers suspense (charge week), expense (charge week) and payback_unallocated (payback week);
  -- Phase 1 adds the rest against TollWeekResultV1.
  FOR r IN
    WITH legs AS (
      SELECT CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -e.amount_minor ELSE e.amount_minor END AS amt,
             e.metadata ->> 'toll_rule' AS rule,
             (e.metadata ->> 'charge_id')::uuid AS charge_id,
             -- P17 rows carry the original payback_id AND reversing_payback_id; they count in the reversing payback's week
             coalesce((e.metadata ->> 'reversing_payback_id')::uuid, (e.metadata ->> 'payback_id')::uuid) AS payback_id
      FROM ledger.entries e
      WHERE e.organization_id = p_company AND e.reference_type = 'toll'
    ),
    weeks AS (
      SELECT DISTINCT toll_system.charge_counted_week(p_company, c.id, c.week_key) AS wk
      FROM toll.charges c WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
      UNION
      SELECT p.week_key FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy AND NOT p.after_seal
    )
    SELECT w.wk,
      -- suspense flow of the week's charges: +P2 +P3 +P16up -P16down -P6 -P7 -P8
      coalesce((SELECT sum(CASE WHEN l.rule LIKE 'P2\_%' OR l.rule LIKE 'P3\_%' OR l.rule LIKE 'P16\_up\_%' THEN l.amt
                                WHEN l.rule LIKE 'P16\_down\_%' OR l.rule LIKE 'P6\_%' OR l.rule LIKE 'P7\_%'
                                  OR l.rule LIKE 'P8\_%' THEN -l.amt ELSE 0 END)
                FROM legs l JOIN toll.charges c ON c.organization_id = p_company AND c.id = l.charge_id
                WHERE toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS suspense_flow,
      coalesce((SELECT sum(c.amount_minor - c.allocated_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS suspense_expected,
      -- payback_unallocated flow of the week's paybacks: +P4 +P5 -P6 (P17 legs are reversals of these, signed)
      coalesce((SELECT sum(CASE WHEN l.rule LIKE 'P4\_%' OR l.rule LIKE 'P5\_%' THEN l.amt
                                WHEN l.rule LIKE 'P6\_%' THEN -l.amt ELSE 0 END)
                FROM legs l JOIN toll.paybacks p ON p.organization_id = p_company AND p.id = l.payback_id
                WHERE p.week_key = w.wk), 0) AS unalloc_flow,
      coalesce((SELECT sum(p.amount_minor - p.allocated_minor) FROM toll.v_active_paybacks p
                WHERE p.organization_id = p_company AND p.week_key = w.wk), 0) AS unalloc_expected,
      toll_system.week_is_sealed(p_company, w.wk) AS sealed
    FROM weeks w
  LOOP
    CONTINUE WHEN r.sealed;
    check_no := 3; name := 'week_flow:' || r.wk;
    ok := r.suspense_flow = r.suspense_expected AND r.unalloc_flow = r.unalloc_expected;
    detail := jsonb_build_object('week', r.wk, 'suspense_flow', r.suspense_flow, 'suspense_expected', r.suspense_expected,
                                 'unallocated_flow', r.unalloc_flow, 'unallocated_expected', r.unalloc_expected);
    RETURN NEXT;
  END LOOP;

  -- Check 4: every sealed week still recomputes to its frozen hash (I10).
  FOR r IN
    SELECT DISTINCT ON (ws.week_key) ws.week_key, ws.status, ws.source_hash
    FROM ledger.week_statements ws
    WHERE ws.organization_id = p_company AND ws.kind = 'toll_week' AND ws.driver_id = '*'
    ORDER BY ws.week_key, ws.version DESC
  LOOP
    CONTINUE WHEN r.status <> 'closed';
    check_no := 4; name := 'sealed_week:' || r.week_key;
    ok := r.source_hash = toll_system.week_hash(p_company, r.week_key);
    detail := jsonb_build_object('week', r.week_key, 'frozen', r.source_hash, 'now', toll_system.week_hash(p_company, r.week_key));
    RETURN NEXT;
  END LOOP;

  -- Check 5: after_seal facts are never posted, and each belongs to a sealed week (count + sum per week).
  FOR r IN
    SELECT x.wk, count(*) AS n, sum(x.amount_minor) AS total,
           bool_and(toll_system.week_is_sealed(p_company, x.wk)) AS all_sealed,
           sum(CASE WHEN x.posted THEN 1 ELSE 0 END) AS posted_n
    FROM (
      SELECT c.week_key AS wk, c.amount_minor,
             EXISTS (SELECT 1 FROM ledger.entries e WHERE e.organization_id = p_company AND e.reference_type = 'toll'
                       AND e.metadata ->> 'charge_id' = c.id::text) AS posted
      FROM toll.charges c WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy
      UNION ALL
      SELECT p.week_key, p.amount_minor,
             EXISTS (SELECT 1 FROM ledger.entries e WHERE e.organization_id = p_company AND e.reference_type = 'toll'
                       AND e.metadata ->> 'payback_id' = p.id::text)
      FROM toll.paybacks p WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy
    ) x
    GROUP BY x.wk
  LOOP
    check_no := 5; name := 'after_seal:' || r.wk;
    ok := r.all_sealed AND r.posted_n = 0;
    detail := jsonb_build_object('week', r.wk, 'count', r.n, 'sum', r.total, 'week_sealed', r.all_sealed, 'posted', r.posted_n);
    RETURN NEXT;
  END LOOP;

  -- Check 7: every bank confirmation (tolls v2 companies) is posted at its current version (the sweep heals).
  FOR r IN
    SELECT k.key, md5(k.value::text) AS ver,
           (SELECT pp.source_version FROM toll.payout_postings pp
            WHERE pp.organization_id = p_company AND pp.source_ref = k.key AND pp.reversed_at IS NULL) AS posted_ver
    FROM public.kv_store_37f42386 k
    WHERE k.key ~ ('^fleet_bank_confirm:org:' || p_company || ':\d{4}-\d{2}-\d{2}:(uber|indrive|roam)$')
  LOOP
    check_no := 7; name := 'payout:' || r.key; ok := r.posted_ver IS NOT DISTINCT FROM r.ver;
    detail := jsonb_build_object('key', r.key, 'version', r.ver, 'posted_version', r.posted_ver); RETURN NEXT;
  END LOOP;
  FOR r IN
    SELECT pp.source_ref FROM toll.payout_postings pp
    WHERE pp.organization_id = p_company AND pp.reversed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.kv_store_37f42386 k WHERE k.key = pp.source_ref)
  LOOP
    check_no := 7; name := 'payout_deleted:' || r.source_ref; ok := false;
    detail := jsonb_build_object('key', r.source_ref); RETURN NEXT;
  END LOOP;
END;
$$;

-- Check 6 (aging) is computed by the nightly run, which raises 'aging' alerts.
CREATE OR REPLACE FUNCTION toll_system.aging_alerts(p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.id, c.state, c.created_at FROM toll.v_live_charges c
    WHERE c.organization_id = p_company
      AND ((c.state = 'pending' AND c.created_at < now() - interval '14 days')
        OR (c.state = 'unverified' AND c.created_at < now() - interval '7 days'))
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', 'watch', 'aging:charge:' || r.id,
      CASE r.state WHEN 'pending' THEN 'Toll undecided for over 14 days' ELSE 'Cash receipt unchecked for over 7 days' END,
      jsonb_build_object('charge_id', r.id, 'state', r.state, 'since', r.created_at));
  END LOOP;

  FOR r IN
    SELECT p.id, p.created_at, (p.amount_minor - p.allocated_minor) AS open_minor FROM toll.v_active_paybacks p
    WHERE p.organization_id = p_company AND p.amount_minor > p.allocated_minor
      AND NOT EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                        AND u.payback_id = p.id AND u.reversed_by IS NULL)
      AND p.created_at < now() - interval '14 days'
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', 'watch', 'aging:payback:' || r.id,
      'Payback money not given to a toll for over 14 days', jsonb_build_object('payback_id', r.id, 'open_minor', r.open_minor));
  END LOOP;

  FOR r IN
    SELECT 'charge' AS kind, c.id, c.created_at, false AS is_reversal FROM toll.charges c
    WHERE c.organization_id = p_company AND c.after_seal AND NOT c.is_legacy AND c.created_at < now() - interval '14 days'
    UNION ALL
    SELECT 'payback', p.id, p.created_at, p.reversal_of IS NOT NULL FROM toll.paybacks p
    WHERE p.organization_id = p_company AND p.after_seal AND NOT p.is_legacy
      AND p.created_at < now() - CASE WHEN p.reversal_of IS NOT NULL THEN interval '7 days' ELSE interval '14 days' END
  LOOP
    PERFORM toll_system.raise_alert(p_company, 'aging', CASE WHEN r.is_reversal THEN 'page' ELSE 'watch' END,
      'aging:after_seal:' || r.id,
      CASE WHEN r.is_reversal THEN 'A platform took money back from a sealed week over 7 days ago'
           ELSE 'New data after seal waiting over 14 days' END,
      jsonb_build_object('kind', r.kind, 'id', r.id, 'since', r.created_at));
  END LOOP;

  -- O1: receivable_platform in credit. Raised as 'watch'; becomes 'page' once the alert is 30 days old.
  IF toll_system.natural_balance(p_company, 'toll:receivable_platform') < 0 THEN
    PERFORM toll_system.raise_alert(p_company, 'aging',
      CASE WHEN EXISTS (SELECT 1 FROM toll.alerts a WHERE a.organization_id = p_company
                          AND a.dedupe_key = 'aging:receivable_platform_credit' AND a.resolved_at IS NULL
                          AND a.created_at < now() - interval '30 days') THEN 'page' ELSE 'watch' END,
      'aging:receivable_platform_credit', 'A platform take-back has not been netted from a payout',
      jsonb_build_object('balance', toll_system.natural_balance(p_company, 'toll:receivable_platform')));
  END IF;
END;
$$;

-- 5. The payout trigger (B5, decoupled from its source) ------------------------------------------
-- toll_system.payout_received is the only way P10/P11 post. Today its callers are the trigger on the
-- key-value store and the nightly sweep. When Business Finance moves to the ledger, only the caller changes.
CREATE OR REPLACE FUNCTION toll_system.payout_received(p_key text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m          text[];
  v_key_co   uuid;
  v_company  uuid;
  v_week     date;
  v_platform text;
  v_version  text;
  v_amount   bigint;
  v_prev     toll.payout_postings%ROWTYPE;
  v_cmd      text;
  v_enabled  boolean;
  v_has_prev boolean;
BEGIN
  m := regexp_match(p_key, '^fleet_bank_confirm:org:([0-9a-fA-F-]{36}):(\d{4}-\d{2}-\d{2}):(uber|indrive|roam)$');
  IF m IS NULL THEN RETURN; END IF;                       -- not a company + week + platform record (legacy keys skipped)
  v_key_co := m[1]::uuid; v_week := m[2]::date; v_platform := m[3];

  -- The company is the record's stamped organizationId, never the key's (A13).
  IF p_value IS NOT NULL THEN
    v_company := nullif(p_value ->> 'organizationId', '')::uuid;
    IF v_company IS DISTINCT FROM v_key_co THEN
      PERFORM toll_system.raise_alert(v_key_co, 'payout_trigger', 'page', 'payout_key_mismatch:' || p_key,
        'A bank confirmation names a different company than its key', jsonb_build_object('key', p_key,
        'stamped', p_value ->> 'organizationId'));
      RETURN;
    END IF;
  ELSE
    v_company := v_key_co;                                  -- a delete: reverse what was posted for this key
  END IF;

  SELECT coalesce((SELECT s.tolls_v2 FROM toll.switch_state s WHERE s.organization_id = v_company), false) INTO v_enabled;
  IF NOT v_enabled THEN RETURN; END IF;

  SELECT * INTO v_prev FROM toll.payout_postings
  WHERE organization_id = v_company AND source_ref = p_key AND reversed_at IS NULL;
  v_has_prev := FOUND;

  v_version := CASE WHEN p_value IS NULL THEN NULL ELSE md5(p_value::text) END;
  IF v_has_prev AND v_prev.source_version IS NOT DISTINCT FROM v_version THEN
    RETURN;                                                 -- already posted at this version
  END IF;

  -- Reverse the old posting (changed or deleted record)
  IF v_has_prev THEN
    IF v_prev.amount_minor > 0 THEN
      v_cmd := 'payout-reverse:' || v_prev.id;
      PERFORM toll_system.post(v_company, 'P11_payout_deposited', v_prev.amount_minor, now(), v_cmd, 1,
                               jsonb_build_object('payout_ref', p_key), true);
      PERFORM toll_system.post(v_company, 'P10_payout_confirmed', v_prev.amount_minor, now(), v_cmd, 2,
                               jsonb_build_object('payout_ref', p_key), true);
    END IF;
    UPDATE toll.payout_postings SET reversed_at = now() WHERE id = v_prev.id;
  END IF;

  IF p_value IS NULL THEN RETURN; END IF;

  -- The toll part of this payout: active fleet-received paybacks of that platform and week
  SELECT coalesce(sum(p.amount_minor), 0) INTO v_amount
  FROM toll.v_active_paybacks p
  WHERE p.organization_id = v_company AND p.week_key = v_week AND p.platform = v_platform AND p.received_by = 'fleet';

  v_cmd := 'payout:' || md5(p_key || ':' || v_version);
  INSERT INTO toll.payout_postings (organization_id, source_ref, source_version, week_key, platform, amount_minor, command_id)
  VALUES (v_company, p_key, v_version, v_week, v_platform, v_amount, v_cmd);

  IF v_amount > 0 THEN
    PERFORM toll_system.post(v_company, 'P10_payout_confirmed', v_amount, now(), v_cmd, 1,
                             jsonb_build_object('payout_ref', p_key, 'payout_week', v_week, 'platform', v_platform));
    PERFORM toll_system.post(v_company, 'P11_payout_deposited', v_amount, now(), v_cmd, 2,
                             jsonb_build_object('payout_ref', p_key, 'payout_week', v_week, 'platform', v_platform));
  END IF;
END;
$$;

-- The trigger: Business Finance's save or delete must never fail because of tolls.
CREATE OR REPLACE FUNCTION toll.tg_kv_bank_confirm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_key text := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
  v_co  uuid;
BEGIN
  BEGIN
    PERFORM toll_system.payout_received(v_key, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.value END);
  EXCEPTION WHEN OTHERS THEN
    v_co := nullif(substring(v_key FROM '^fleet_bank_confirm:org:([0-9a-fA-F-]{36}):'), '')::uuid;
    IF v_co IS NOT NULL THEN
      PERFORM toll_system.raise_alert(v_co, 'payout_trigger', 'watch', 'payout_trigger_failed:' || v_key,
        'A bank confirmation could not be posted to tolls; the nightly sweep will retry',
        jsonb_build_object('key', v_key, 'error', SQLERRM));
    END IF;
  END;
  RETURN NULL;
END;
$$;

CREATE TRIGGER toll_kv_bank_confirm_upsert
  AFTER INSERT OR UPDATE ON public.kv_store_37f42386
  FOR EACH ROW
  WHEN (NEW.key LIKE 'fleet_bank_confirm:org:%')
  EXECUTE FUNCTION toll.tg_kv_bank_confirm();

CREATE TRIGGER toll_kv_bank_confirm_delete
  AFTER DELETE ON public.kv_store_37f42386
  FOR EACH ROW
  WHEN (OLD.key LIKE 'fleet_bank_confirm:org:%')
  EXECUTE FUNCTION toll.tg_kv_bank_confirm();

-- 6. Plaza rules: set only by a platform owner, with an audit row (B2) ----------------------------
CREATE OR REPLACE FUNCTION toll_system.set_plaza_rule(p_plaza_id text, p_auto_minutes int, p_review_window text,
                                                     p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_actor
                                      AND u.raw_app_meta_data ->> 'role' = 'platform_owner') THEN
    RAISE EXCEPTION 'FORBIDDEN: only a platform owner sets plaza rules';
  END IF;
  IF p_auto_minutes IS NULL OR p_auto_minutes < 0 OR p_review_window NOT IN ('same_day') THEN
    RAISE EXCEPTION 'BAD_REQUEST: auto window must be >= 0 minutes; review window must be same_day';
  END IF;
  SELECT to_jsonb(r) INTO v_old FROM toll.plaza_rules r WHERE r.plaza_id = p_plaza_id;
  INSERT INTO toll.plaza_rules (plaza_id, auto_duplicate_window_minutes, review_duplicate_window, changed_by, changed_at)
  VALUES (p_plaza_id, p_auto_minutes, p_review_window, p_actor, now())
  ON CONFLICT (plaza_id) DO UPDATE SET auto_duplicate_window_minutes = excluded.auto_duplicate_window_minutes,
    review_duplicate_window = excluded.review_duplicate_window, changed_by = excluded.changed_by, changed_at = now();
  INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row, actor_user_id)
  VALUES (NULL, 'toll.plaza_rules', p_plaza_id, CASE WHEN v_old IS NULL THEN 'insert' ELSE 'update' END, v_old,
          (SELECT to_jsonb(r) FROM toll.plaza_rules r WHERE r.plaza_id = p_plaza_id), p_actor);
END;
$$;

-- 7. The nightly run (pg_cron) ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION toll_system.nightly_run()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_company uuid;
  v_run     uuid;
  v_start   timestamptz;
  k         record;
  c         record;
BEGIN
  FOR v_company IN
    SELECT s.organization_id FROM toll.switch_state s WHERE s.tolls_v2
    UNION SELECT DISTINCT organization_id FROM toll.charges
    UNION SELECT DISTINCT organization_id FROM toll.paybacks
  LOOP
    v_run := gen_random_uuid();
    v_start := clock_timestamp();
    BEGIN
      -- Check 7 heal first: re-run the trigger for every bank record not posted at its current version
      FOR k IN
        SELECT kv.key, kv.value FROM public.kv_store_37f42386 kv
        WHERE kv.key ~ ('^fleet_bank_confirm:org:' || v_company || ':\d{4}-\d{2}-\d{2}:(uber|indrive|roam)$')
          AND NOT EXISTS (SELECT 1 FROM toll.payout_postings pp WHERE pp.organization_id = v_company
                            AND pp.source_ref = kv.key AND pp.reversed_at IS NULL AND pp.source_version = md5(kv.value::text))
        UNION ALL
        SELECT pp.source_ref, NULL::jsonb FROM toll.payout_postings pp
        WHERE pp.organization_id = v_company AND pp.reversed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.kv_store_37f42386 kv WHERE kv.key = pp.source_ref)
      LOOP
        PERFORM toll_system.payout_received(k.key, k.value);
        PERFORM toll_system.raise_alert(v_company, 'payout_trigger', 'watch', 'payout_healed:' || k.key,
          'The nightly sweep posted a bank confirmation the trigger had missed', jsonb_build_object('key', k.key));
      END LOOP;

      FOR c IN SELECT * FROM toll_system.nightly_checks(v_company) LOOP
        INSERT INTO toll.nightly_results (organization_id, run_id, check_no, name, ok, detail)
        VALUES (v_company, v_run, c.check_no, c.name, c.ok, c.detail);
        IF NOT c.ok THEN
          PERFORM toll_system.raise_alert(v_company, 'nightly_check', 'page', 'check' || c.check_no || ':' || c.name,
            'Nightly toll check failed: ' || c.name, c.detail);
        END IF;
      END LOOP;
      PERFORM toll_system.resolve_alerts_not_seen(v_company, 'nightly_check', v_start);

      PERFORM toll_system.aging_alerts(v_company);
      PERFORM toll_system.resolve_alerts_not_seen(v_company, 'aging', v_start);
    EXCEPTION WHEN OTHERS THEN
      PERFORM toll_system.raise_alert(v_company, 'nightly_check', 'page', 'nightly_run_failed',
        'The nightly toll check could not run', jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;
END;
$$;

-- 8. Grants -------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION toll_system.raise_alert(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.resolve_alerts_not_seen(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.natural_balance(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.rule_net(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_summary(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.week_hash(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.nightly_checks(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.aging_alerts(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.payout_received(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.set_plaza_rule(text, int, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.nightly_run() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll.tg_kv_bank_confirm() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION toll_system.nightly_checks(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION toll_system.set_plaza_rule(text, int, text, uuid) TO service_role;

SELECT cron.schedule('toll-v2-nightly', '25 4 * * *', 'SELECT toll_system.nightly_run();');

NOTIFY pgrst, 'reload schema';


-- Migration logbook (so CI's version check stays green)
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261112183806', 'toll_v2_foundations') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261112184544', 'toll_v2_money_core') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261112185355', 'toll_v2_command_core') ON CONFLICT (version) DO NOTHING;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261112191942', 'toll_v2_nightly_and_payouts') ON CONFLICT (version) DO NOTHING;
COMMIT;
