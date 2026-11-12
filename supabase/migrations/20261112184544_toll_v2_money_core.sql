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
