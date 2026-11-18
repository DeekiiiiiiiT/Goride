-- Toll Round S1b: four-eyes approvals, settings owner, matcher refuse, P25 toll income (docs/toll-build/cursor-S1b-four-eyes-settings-income.md).

-- 1. decisions approval columns ------------------------------------------------------------------
ALTER TABLE toll.decisions
  ADD COLUMN IF NOT EXISTS approval_id uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS self_approval_reason text;

ALTER TABLE toll.decisions DROP CONSTRAINT IF EXISTS decisions_self_approval_reason;
ALTER TABLE toll.decisions
  ADD CONSTRAINT decisions_self_approval_reason CHECK (
    NOT self_approved OR char_length(btrim(coalesce(self_approval_reason, ''))) >= 8
  );

ALTER TABLE toll.decisions DROP CONSTRAINT IF EXISTS decisions_approved_by_not_actor;
ALTER TABLE toll.decisions
  ADD CONSTRAINT decisions_approved_by_not_actor CHECK (
    approved_by IS NULL OR approved_by IS DISTINCT FROM actor_user_id
  );

CREATE TABLE toll.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  intent text NOT NULL,
  body jsonb NOT NULL,
  amount_minor bigint,
  prepared_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  decided_by uuid,
  decided_at timestamptz,
  executed_decision_id uuid,
  note text
);

CREATE INDEX toll_approval_requests_org_status_idx ON toll.approval_requests (organization_id, status, created_at);

CREATE OR REPLACE FUNCTION toll.tg_approval_requests_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approval_requests is append-only: delete not allowed';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - 'status' - 'decided_by' - 'decided_at' - 'executed_decision_id'
       IS DISTINCT FROM to_jsonb(OLD) - 'status' - 'decided_by' - 'decided_at' - 'executed_decision_id' THEN
      RAISE EXCEPTION 'approval_requests: only status/decision fields may change';
    END IF;
    IF OLD.status <> 'pending' OR NEW.status NOT IN ('approved', 'rejected', 'withdrawn') THEN
      RAISE EXCEPTION 'approval_requests: disallowed status transition % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER approval_requests_append_only
  BEFORE UPDATE OR DELETE ON toll.approval_requests
  FOR EACH ROW EXECUTE FUNCTION toll.tg_approval_requests_append_only();

REVOKE ALL ON toll.approval_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON toll.approval_requests TO authenticated;
ALTER TABLE toll.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_requests_company_read ON toll.approval_requests FOR SELECT TO authenticated
  USING (organization_id = toll_read.current_company() AND toll_system.user_can_manage_tolls(auth.uid(), organization_id));

CREATE OR REPLACE VIEW toll.self_approvals
WITH (security_invoker = true)
AS
  SELECT d.*
  FROM toll.decisions d
  WHERE d.self_approved = true;
GRANT SELECT ON toll.self_approvals TO authenticated;

CREATE TABLE toll.legacy_carve_outs (
  organization_id uuid NOT NULL,
  account_suffix text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  decision_id uuid,
  PRIMARY KEY (organization_id, account_suffix)
);

CREATE OR REPLACE FUNCTION toll.tg_legacy_carve_outs_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'legacy_carve_outs is append-only: % not allowed', lower(TG_OP);
END;
$$;

CREATE TRIGGER legacy_carve_outs_append_only
  BEFORE UPDATE OR DELETE ON toll.legacy_carve_outs
  FOR EACH ROW EXECUTE FUNCTION toll.tg_legacy_carve_outs_append_only();

REVOKE ALL ON toll.legacy_carve_outs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON toll.legacy_carve_outs TO authenticated;
ALTER TABLE toll.legacy_carve_outs ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_carve_outs_company_read ON toll.legacy_carve_outs FOR SELECT TO authenticated
  USING (organization_id = toll_read.current_company());

INSERT INTO toll.posting_rules (code, design_ref, debit_suffix, credit_suffix, required_refs, description) VALUES
  ('P25_kept_to_income', 'P25', 'toll:payback_unallocated', 'toll:other_income', ARRAY['payback_id'],
   'Kept payback / carried share moves to toll income when toll_disputes is on')
ON CONFLICT (code) DO NOTHING;




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
  IF p_company IS NULL THEN RAISE EXCEPTION 'TOLL_COMPANY_REQUIRED'; END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('toll:tag_prepaid',              'asset'),
      ('toll:suspense',                 'asset'),
      ('toll:payback_unallocated',      'liability'),
      ('toll:receivable_platform',      'asset'),
      ('toll:receivable_platform_dispute', 'asset'),
      ('toll:recovered_in_driver_cash', 'asset'),
      ('toll:receivable_driver',        'asset'),
      ('toll:payable_driver',           'liability'),
      ('toll:expense',                  'expense'),
      ('toll:platform_payout_clearing', 'asset'),
      ('toll:other_income',               'revenue'),
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
  IF p_rule = 'P25_kept_to_income' THEN
    IF nullif(v_refs ->> 'payback_id', '') IS NULL AND nullif(v_refs ->> 'carried_fact_id', '') IS NULL THEN
      RAISE EXCEPTION 'TOLL_REF_REQUIRED: P25 needs payback_id or carried_fact_id';
    END IF;
    IF nullif(v_refs ->> 'payback_id', '') IS NOT NULL AND nullif(v_refs ->> 'carried_fact_id', '') IS NOT NULL THEN
      RAISE EXCEPTION 'TOLL_REF_REQUIRED: P25 needs exactly one ref';
    END IF;
  ELSE
    FOREACH v_ref IN ARRAY v_rule.required_refs LOOP
      IF nullif(v_refs ->> v_ref, '') IS NULL THEN
        RAISE EXCEPTION 'TOLL_REF_REQUIRED: % needs %', p_rule, v_ref;
      END IF;
    END LOOP;
  END IF;

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

CREATE OR REPLACE FUNCTION toll_system.manage_seat_count(p_company uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(DISTINCT u)::int
  FROM (
    SELECT o.owner_id AS u
    FROM public.organizations o
    WHERE o.id = p_company AND o.owner_id IS NOT NULL
      AND coalesce(o.product_line, 'fleet') = 'fleet'
    UNION
    SELECT ur.user_id
    FROM platform.user_roles ur
    JOIN platform.roles r ON r.id = ur.role_id
    WHERE ur.scope_type = 'organization'
      AND ur.scope_id = p_company
      AND ur.status = 'active'
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND r.name IN ('fleet_owner', 'fleet_manager')
  ) s
  WHERE toll_system.user_can_manage_tolls(s.u, p_company);
$$;

CREATE OR REPLACE FUNCTION toll_system.legacy_carve_amount(p_company uuid, p_suffix text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.amount_minor FROM toll.legacy_carve_outs c
  WHERE c.organization_id = p_company AND c.account_suffix = p_suffix;
$$;

-- Keyed by the keep decision, not the payback: one payback can have a pre-switch keep (no P25) and a
-- later keep (P25). Every P25 posting and its reversal carry the keep's decision_id.
CREATE OR REPLACE FUNCTION toll_system.unlinked_has_p25(p_company uuid, p_decision uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_decision IS NOT NULL
     AND toll_system.rule_net(p_company, 'P25\_%', 'decision_id', p_decision::text) <> 0;
$$;

CREATE OR REPLACE FUNCTION toll_system.unlinked_p25_minor(p_company uuid, p_week date)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(u.amount_minor), 0)::bigint
  FROM toll.payback_unlinked_decisions u
  LEFT JOIN toll.paybacks p ON p.organization_id = u.organization_id AND p.id = u.payback_id
  LEFT JOIN toll.carried_facts f ON f.organization_id = u.organization_id AND f.id = u.carried_fact_id
  WHERE u.organization_id = p_company AND u.reversed_by IS NULL
    AND toll_system.unlinked_has_p25(p_company, u.decision_id)
    AND (p_week IS NULL OR coalesce(p.week_key, f.to_week) = p_week);
$$;

CREATE OR REPLACE FUNCTION toll_write.approval_amount(p_company uuid, p_intent text, p_body jsonb)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target uuid;
  v_charge uuid;
  v_dispute uuid;
  v_amt bigint;
  v_new bigint;
  v_old bigint;
BEGIN
  IF p_intent IN ('change_toll_settings', 'approve_settings_seed', 'reopen_week') THEN
    RETURN -1;
  END IF;
  IF p_intent = 'undo_decision' THEN
    v_target := nullif(p_body ->> 'decision_id', '')::uuid;
    IF v_target IS NULL THEN RETURN NULL; END IF;
    SELECT coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.decision_id = v_target AND a.reversed_by IS NULL), 0)
                 + coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                     WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.reversed_by IS NULL), 0)
                 -- a dispute result in a sealed charge week moves money by net postings, not allocations;
                 -- its dispute_result carried fact holds the amount
                 + coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                     WHERE f.organization_id = p_company AND f.decision_id = v_target AND f.kind = 'dispute_result'), 0)
    INTO v_amt;
    RETURN v_amt;
  ELSIF p_intent = 'correct_charge_amount' THEN
    v_charge := nullif(p_body ->> 'charge_id', '')::uuid;
    v_new := toll_write.body_amount(p_body);
    IF v_charge IS NULL OR v_new IS NULL THEN RETURN NULL; END IF;
    SELECT amount_minor INTO v_old FROM toll.charges c WHERE c.organization_id = p_company AND c.id = v_charge;
    IF v_old IS NULL THEN RETURN NULL; END IF;
    RETURN abs(v_new - v_old);
  ELSIF p_intent = 'correct_charge_week' THEN
    v_charge := nullif(p_body ->> 'charge_id', '')::uuid;
    IF v_charge IS NULL THEN RETURN NULL; END IF;
    SELECT amount_minor INTO v_amt FROM toll.charges c WHERE c.organization_id = p_company AND c.id = v_charge;
    RETURN v_amt;
  ELSIF p_intent = 'close_dispute_lost' THEN
    v_dispute := nullif(p_body ->> 'dispute_id', '')::uuid;
    IF v_dispute IS NULL THEN RETURN NULL; END IF;
    SELECT (d.owed_minor - d.recovered_minor)::bigint INTO v_amt
    FROM toll.disputes d WHERE d.organization_id = p_company AND d.id = v_dispute;
    RETURN v_amt;
  ELSIF p_intent = 'settle_dispute' THEN
    IF coalesce((p_body ->> 'system')::boolean, false) THEN RETURN NULL; END IF;
    v_dispute := nullif(p_body ->> 'dispute_id', '')::uuid;
    IF v_dispute IS NULL THEN RETURN NULL; END IF;
  RETURN coalesce(toll_write.body_amount(p_body),
    least(toll_system.payback_open_minor(p_company, nullif(p_body ->> 'payback_id', '')::uuid),
          (SELECT d.owed_minor - coalesce((SELECT sum(l.amount_minor) FROM toll.dispute_links l
              WHERE l.organization_id = p_company AND l.dispute_id = d.id AND l.reversed_by IS NULL), 0)
           FROM toll.disputes d WHERE d.organization_id = p_company AND d.id = v_dispute)));
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.approval_requires_four_eyes(p_company uuid, p_intent text, p_body jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_on boolean;
  v_amt bigint;
BEGIN
  IF p_intent IN ('change_toll_settings', 'approve_settings_seed') THEN
    RETURN true;
  END IF;
  v_on := coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false);
  IF NOT v_on THEN RETURN false; END IF;
  v_amt := toll_write.approval_amount(p_company, p_intent, p_body);
  IF v_amt IS NULL THEN RETURN false; END IF;
  IF v_amt = -1 THEN RETURN true; END IF;
  RETURN v_amt > 500000;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.run_approval_gate(
  p_company uuid, p_intent text, p_body jsonb, p_skip boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amt bigint;
  v_reason text := nullif(btrim(p_body ->> 'self_approval_reason'), '');
  v_seats int;
BEGIN
  IF p_skip OR NOT toll_write.approval_requires_four_eyes(p_company, p_intent, p_body) THEN
    RETURN;
  END IF;
  v_amt := toll_write.approval_amount(p_company, p_intent, p_body);
  -- Every gated intent, reopen_week included, follows the same rule: a sole manager may self-approve
  -- with a reason (S15); with two or more seats it needs request_approval / approve_request.
  IF v_reason IS NULL THEN
    PERFORM toll_write.refuse('NEEDS_APPROVAL', jsonb_build_object(
      'intent', p_intent,
      'amount_minor', CASE WHEN v_amt = -1 THEN NULL ELSE v_amt END,
      'threshold_minor', 500000,
      'sole_manager', toll_system.manage_seat_count(p_company) = 1));
  END IF;
  IF char_length(v_reason) < 8 THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('field', 'self_approval_reason', 'min', 8));
  END IF;
  v_seats := toll_system.manage_seat_count(p_company);
  IF v_seats <> 1 THEN
    PERFORM toll_write.refuse('SELF_APPROVAL_NOT_ALLOWED', jsonb_build_object('manager_seats', v_seats));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.dispatch(
  p_company uuid, p_intent text, p_decision uuid, p_command_id text, p_body jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN CASE p_intent
    WHEN 'seal_week'     THEN toll_write.intent_seal_week(p_company, p_decision, p_command_id, p_body)
    WHEN 'reopen_week'   THEN toll_write.intent_reopen_week(p_company, p_decision, p_command_id, p_body)
    WHEN 'carry_forward' THEN toll_write.intent_carry_forward(p_company, p_decision, p_command_id, p_body)
    WHEN 'import_batch'  THEN toll_write.intent_import_batch(p_company, p_decision, p_command_id, p_body)
    WHEN 'link_payback'  THEN toll_write.intent_link_payback(p_company, p_decision, p_command_id, p_body)
    WHEN 'apply_suggestion' THEN toll_write.intent_apply_suggestion(p_company, p_decision, p_command_id, p_body)
    WHEN 'driver_pays'   THEN toll_write.do_bear(p_company, p_decision, p_command_id, p_body, 'driver')
    WHEN 'fleet_absorbs' THEN toll_write.do_bear(p_company, p_decision, p_command_id, p_body, 'fleet')
    WHEN 'leave_payback_unlinked' THEN toll_write.intent_leave_payback_unlinked(p_company, p_decision, p_command_id, p_body)
    WHEN 'undo_decision' THEN toll_write.intent_undo_decision(p_company, p_decision, p_command_id, p_body)
    WHEN 'verify_cash_receipt' THEN toll_write.do_receipt(p_company, p_decision, p_command_id, p_body, true)
    WHEN 'reject_cash_receipt' THEN toll_write.do_receipt(p_company, p_decision, p_command_id, p_body, false)
    WHEN 'confirm_duplicate' THEN toll_write.do_duplicate(p_company, p_decision, p_command_id, p_body, true)
    WHEN 'release_duplicate' THEN toll_write.do_duplicate(p_company, p_decision, p_command_id, p_body, false)
    WHEN 'reverse_payback' THEN toll_write.intent_reverse_payback(p_company, p_decision, p_command_id, p_body)
    WHEN 'correct_charge_amount' THEN toll_write.intent_correct_charge_amount(p_company, p_decision, p_command_id, p_body)
    WHEN 'correct_charge_week' THEN toll_write.intent_correct_charge_week(p_company, p_decision, p_command_id, p_body)
    WHEN 'open_dispute' THEN toll_write.intent_open_dispute(p_company, p_decision, p_command_id, p_body)
    WHEN 'mark_dispute_sent' THEN toll_write.intent_mark_dispute_sent(p_company, p_decision, p_command_id, p_body)
    WHEN 'settle_dispute' THEN toll_write.intent_settle_dispute(p_company, p_decision, p_command_id, p_body, false)
    WHEN 'close_dispute_lost' THEN toll_write.intent_close_dispute_lost(p_company, p_decision, p_command_id, p_body)
    WHEN 'change_toll_settings' THEN toll_write.intent_change_toll_settings(p_company, p_decision, p_command_id, p_body)
    WHEN 'approve_settings_seed' THEN toll_write.intent_approve_settings_seed(p_company, p_decision, p_command_id, p_body)
    WHEN 'request_approval' THEN toll_write.intent_request_approval(p_company, p_decision, p_command_id, p_body)
    WHEN 'approve_request' THEN toll_write.intent_approve_request(p_company, p_decision, p_command_id, p_body)
    WHEN 'reject_request' THEN toll_write.intent_reject_request(p_company, p_decision, p_command_id, p_body)
    WHEN 'withdraw_request' THEN toll_write.intent_withdraw_request(p_company, p_decision, p_command_id, p_body)
    ELSE NULL
  END;
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_request_approval(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_intent text := nullif(p_body ->> 'intent', '');
  v_inner  jsonb := coalesce(p_body -> 'body', '{}'::jsonb);
  v_note   text := p_body ->> 'note';
  v_amt    bigint;
  v_id     uuid;
BEGIN
  IF v_intent IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('intent', 'body')));
  END IF;
  IF NOT toll_write.approval_requires_four_eyes(p_company, v_intent, v_inner) THEN
    PERFORM toll_write.refuse('NOT_NEEDED', jsonb_build_object('intent', v_intent));
  END IF;
  v_amt := toll_write.approval_amount(p_company, v_intent, v_inner);
  INSERT INTO toll.approval_requests (organization_id, intent, body, amount_minor, prepared_by, note)
  VALUES (p_company, v_intent, v_inner, CASE WHEN v_amt = -1 THEN NULL ELSE v_amt END, auth.uid(), v_note)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('decision_id', p_decision, 'request_id', v_id, 'intent', v_intent, 'amount_minor', v_amt);
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_reject_request(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req toll.approval_requests%ROWTYPE;
  v_id uuid := nullif(p_body ->> 'request_id', '')::uuid;
BEGIN
  SELECT * INTO req FROM toll.approval_requests r WHERE r.organization_id = p_company AND r.id = v_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('request_id', v_id)); END IF;
  IF req.status <> 'pending' THEN PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('status', req.status)); END IF;
  IF req.prepared_by = auth.uid() THEN PERFORM toll_write.refuse('SAME_PERSON', jsonb_build_object('request_id', v_id)); END IF;
  UPDATE toll.approval_requests SET status = 'rejected', decided_by = auth.uid(), decided_at = now()
  WHERE organization_id = p_company AND id = v_id;
  RETURN jsonb_build_object('decision_id', p_decision, 'request_id', v_id, 'status', 'rejected');
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_withdraw_request(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req toll.approval_requests%ROWTYPE;
  v_id uuid := nullif(p_body ->> 'request_id', '')::uuid;
BEGIN
  SELECT * INTO req FROM toll.approval_requests r WHERE r.organization_id = p_company AND r.id = v_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('request_id', v_id)); END IF;
  IF req.status <> 'pending' THEN PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('status', req.status)); END IF;
  IF req.prepared_by IS DISTINCT FROM auth.uid() THEN PERFORM toll_write.refuse('FORBIDDEN', jsonb_build_object('request_id', v_id)); END IF;
  UPDATE toll.approval_requests SET status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
  WHERE organization_id = p_company AND id = v_id;
  RETURN jsonb_build_object('decision_id', p_decision, 'request_id', v_id, 'status', 'withdrawn');
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_approve_request(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req           toll.approval_requests%ROWTYPE;
  v_id          uuid := nullif(p_body ->> 'request_id', '')::uuid;
  v_exec        uuid;
  v_cmd         text;
  v_resp        jsonb;
  v_self        boolean := false;
  v_reason      text := null;
BEGIN
  SELECT * INTO req FROM toll.approval_requests r WHERE r.organization_id = p_company AND r.id = v_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('request_id', v_id)); END IF;
  IF req.status <> 'pending' THEN PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('status', req.status)); END IF;
  IF req.prepared_by = auth.uid() THEN PERFORM toll_write.refuse('SAME_PERSON', jsonb_build_object('request_id', v_id)); END IF;

  v_cmd := 'approval:' || v_id::text;
  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id, reason_code, note, targets,
                              approval_id, approved_by, self_approved, self_approval_reason)
  VALUES (p_company, v_cmd, req.intent, 'user', req.prepared_by, req.body ->> 'reason_code', req.body ->> 'note', req.body,
          v_id, auth.uid(), false, null)
  RETURNING id INTO v_exec;
  v_resp := toll_write.dispatch(p_company, req.intent, v_exec, v_cmd, req.body);
  IF v_resp IS NULL THEN
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', req.intent));
  END IF;

  IF octet_length(v_resp::text) > 65536 THEN
    v_resp := jsonb_build_object('decision_id', v_exec, 'weeks', v_resp -> 'weeks', 'truncated', true);
    UPDATE toll.decisions SET response = v_resp, response_truncated = true WHERE id = v_exec;
  ELSE
    UPDATE toll.decisions SET response = v_resp WHERE id = v_exec;
  END IF;

  UPDATE toll.approval_requests SET status = 'approved', decided_by = auth.uid(), decided_at = now(), executed_decision_id = v_exec
  WHERE organization_id = p_company AND id = v_id;

  RETURN jsonb_build_object('decision_id', p_decision, 'request_id', v_id, 'executed_decision_id', v_exec,
                           'response', v_resp);
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_approve_settings_seed(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF nullif(btrim(p_body ->> 'reason_code'), '') IS NULL AND nullif(btrim(p_body ->> 'note'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code or note')));
  END IF;
  FOR r IN SELECT * FROM toll_system.seed_dispute_setup(p_company, true) LOOP
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('tbl', r.tbl, 'row_key', r.row_key, 'col', r.col,
      'current_value', r.current_value, 'new_value', r.new_value));
  END LOOP;
  PERFORM toll_system.seed_dispute_setup(p_company, false);
  RETURN jsonb_build_object('decision_id', p_decision, 'dry_run', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_change_toll_settings(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k text;
  v_plat text;
  v_obj jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_row record;
  v_allowed_plat text[] := ARRAY['uber', 'indrive', 'roam'];
  v_field text;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  IF nullif(btrim(p_body ->> 'reason_code'), '') IS NULL AND nullif(btrim(p_body ->> 'note'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code or note')));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_body) AS key
    WHERE key NOT IN ('reason_code', 'note', 'command_id', 'self_approval_reason')) THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', 'at least one settings key'));
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_body) LOOP
    CONTINUE WHEN k IN ('reason_code', 'note', 'command_id', 'self_approval_reason');
    IF k NOT IN ('platform_settings', 'dispute_policy', 'plaza_rates_add') THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('unknown_key', k));
    END IF;
  END LOOP;

  IF p_body ? 'platform_settings' THEN
    v_obj := p_body -> 'platform_settings';
    IF jsonb_typeof(v_obj) <> 'object' THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('platform_settings', 'must be object'));
    END IF;
    FOR v_plat IN SELECT jsonb_object_keys(v_obj) LOOP
      IF NOT (v_plat = ANY (v_allowed_plat)) THEN
        PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('unknown_platform', v_plat));
      END IF;
      FOR v_field IN SELECT jsonb_object_keys(v_obj -> v_plat) LOOP
        IF v_field NOT IN ('pays_tolls_back','payback_mode','takes_disputes','dispute_window_days','refund_periods','no_report_fallback_days','auto_apply') THEN
          PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('field', v_field));
        END IF;
      END LOOP;
      IF NOT EXISTS (SELECT 1 FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = v_plat) THEN
        INSERT INTO toll.platform_settings (organization_id, platform) VALUES (p_company, v_plat);
      END IF;
      SELECT to_jsonb(ps) INTO v_before FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = v_plat;
      UPDATE toll.platform_settings ps SET
        pays_tolls_back = CASE WHEN (v_obj -> v_plat) ? 'pays_tolls_back' THEN (v_obj -> v_plat ->> 'pays_tolls_back')::boolean ELSE ps.pays_tolls_back END,
        payback_mode = CASE WHEN (v_obj -> v_plat) ? 'payback_mode' THEN (v_obj -> v_plat ->> 'payback_mode') ELSE ps.payback_mode END,
        takes_disputes = CASE WHEN (v_obj -> v_plat) ? 'takes_disputes' THEN (v_obj -> v_plat ->> 'takes_disputes')::boolean ELSE ps.takes_disputes END,
        dispute_window_days = CASE WHEN (v_obj -> v_plat) ? 'dispute_window_days' THEN nullif(v_obj -> v_plat ->> 'dispute_window_days','')::int ELSE ps.dispute_window_days END,
        refund_periods = CASE WHEN (v_obj -> v_plat) ? 'refund_periods' THEN nullif(v_obj -> v_plat ->> 'refund_periods','')::int ELSE ps.refund_periods END,
        no_report_fallback_days = CASE WHEN (v_obj -> v_plat) ? 'no_report_fallback_days' THEN nullif(v_obj -> v_plat ->> 'no_report_fallback_days','')::int ELSE ps.no_report_fallback_days END,
        auto_apply = CASE WHEN (v_obj -> v_plat) ? 'auto_apply' THEN (v_obj -> v_plat ->> 'auto_apply')::boolean ELSE ps.auto_apply END,
        updated_at = now()
      WHERE ps.organization_id = p_company AND ps.platform = v_plat;
      SELECT to_jsonb(ps) INTO v_after FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = v_plat;
      INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row, actor_user_id)
      VALUES (p_company, 'toll.platform_settings', v_plat, 'update', v_before, v_after, auth.uid());
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'table', 'toll.platform_settings', 'row_key', v_plat, 'before', v_before, 'after', v_after));
    END LOOP;
  END IF;

  IF p_body ? 'dispute_policy' THEN
    v_obj := p_body -> 'dispute_policy';
    IF jsonb_typeof(v_obj) <> 'object' THEN PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('dispute_policy', 'object')); END IF;
    IF NOT EXISTS (SELECT 1 FROM toll.dispute_policy dp WHERE dp.organization_id = p_company) THEN
      INSERT INTO toll.dispute_policy (organization_id) VALUES (p_company);
    END IF;
    SELECT to_jsonb(dp) INTO v_before FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
    UPDATE toll.dispute_policy dp SET
      lost_bearer = CASE WHEN v_obj ? 'lost_bearer' THEN v_obj ->> 'lost_bearer' ELSE dp.lost_bearer END,
      expired_bearer = CASE WHEN v_obj ? 'expired_bearer' THEN v_obj ->> 'expired_bearer' ELSE dp.expired_bearer END,
      changed_by = auth.uid(), changed_at = now()
    WHERE dp.organization_id = p_company;
    SELECT to_jsonb(dp) INTO v_after FROM toll.dispute_policy dp WHERE dp.organization_id = p_company;
    INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, old_row, new_row, actor_user_id)
    VALUES (p_company, 'toll.dispute_policy', p_company::text, 'update', v_before, v_after, auth.uid());
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'table', 'toll.dispute_policy', 'row_key', p_company::text, 'before', v_before, 'after', v_after));
  END IF;

  IF p_body ? 'plaza_rates_add' THEN
    IF jsonb_typeof(p_body -> 'plaza_rates_add') <> 'array' THEN
      PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('plaza_rates_add', 'array'));
    END IF;
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_body -> 'plaza_rates_add') LOOP
      INSERT INTO toll.plaza_rates (plaza_id, rate_kind, platform, amount_minor, valid_from, created_by)
      VALUES (v_row.value ->> 'plaza_id', 'platform_refund', v_row.value ->> 'platform',
              (v_row.value ->> 'rate_minor')::bigint, (v_row.value ->> 'effective_from')::date, auth.uid());
      INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, new_row, actor_user_id)
      VALUES (p_company, 'toll.plaza_rates', (v_row.value ->> 'plaza_id') || ':' || (v_row.value ->> 'platform'), 'insert', v_row.value, auth.uid());
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'table', 'toll.plaza_rates', 'row_key', (v_row.value ->> 'plaza_id') || ':' || (v_row.value ->> 'platform'),
        'before', NULL, 'after', v_row.value));
    END LOOP;
  END IF;

  RETURN jsonb_build_object('decision_id', p_decision, 'changed', jsonb_array_length(v_changes) > 0,
                            'changes', v_changes);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.record_legacy_kept(p_company uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_amt bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM toll.legacy_carve_outs c WHERE c.organization_id = p_company AND c.account_suffix = 'toll:payback_unallocated') THEN
    PERFORM toll_write.refuse('ALREADY_RECORDED', jsonb_build_object('account', 'toll:payback_unallocated'));
  END IF;
  SELECT coalesce(sum(u.amount_minor), 0) INTO v_amt
  FROM toll.payback_unlinked_decisions u
  WHERE u.organization_id = p_company AND u.reversed_by IS NULL
    AND NOT toll_system.unlinked_has_p25(p_company, u.decision_id);
  INSERT INTO toll.legacy_carve_outs (organization_id, account_suffix, amount_minor, decision_id)
  VALUES (p_company, 'toll:payback_unallocated', v_amt, NULL);
  RETURN jsonb_build_object('amount_minor', v_amt);
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.match_refuse_missing_settings(p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_missing jsonb := '[]'::jsonb;
  v_plat text;
  v_plaza text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM toll.dispute_policy dp WHERE dp.organization_id = p_company) THEN
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'dispute_policy'));
  END IF;
  FOR v_plat IN
    SELECT DISTINCT x.platform FROM (
      SELECT p.platform FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy
      UNION
      SELECT t.platform FROM toll.platform_trips t WHERE t.organization_id = p_company AND NOT t.is_legacy
    ) x
  LOOP
    IF NOT EXISTS (SELECT 1 FROM toll.platform_settings ps WHERE ps.organization_id = p_company AND ps.platform = v_plat) THEN
      v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'platform_settings', 'platform', v_plat));
    END IF;
  END LOOP;
  FOR v_plaza IN SELECT DISTINCT c.plaza_id FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND c.plaza_id IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM toll.plaza_rules pr WHERE pr.plaza_id = v_plaza) THEN
      v_missing := v_missing || jsonb_build_array(jsonb_build_object('kind', 'plaza_rules', 'plaza_id', v_plaza));
    END IF;
  END LOOP;
  IF jsonb_array_length(v_missing) > 0 THEN
    PERFORM toll_write.refuse('SETTINGS_MISSING', jsonb_build_object('missing', v_missing));
  END IF;
END;
$$;



CREATE OR REPLACE FUNCTION toll_write.intent_leave_payback_unlinked(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p      toll.paybacks%ROWTYPE;
  f      toll.carried_facts%ROWTYPE;
  v_id   uuid := nullif(p_body ->> 'payback_id', '')::uuid;
  v_fid  uuid := nullif(p_body ->> 'carried_fact_id', '')::uuid;
  v_pw   date;
  v_open bigint;
  v_take bigint;
  v_pv   bigint;
  v_dis  boolean;
  v_eff  timestamptz;
  v_line int := 0;
BEGIN
  IF nullif(btrim(p_body ->> 'reason_code'), '') IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('reason_code')));
  END IF;

  IF v_fid IS NOT NULL THEN     -- a P19 platform share, decided on its carried row in the open week (B3)
    SELECT x.to_week INTO v_pw FROM toll.carried_facts x WHERE x.organization_id = p_company AND x.id = v_fid;
    PERFORM toll_write.lock_weeks(p_company, ARRAY[v_pw]);
    f := toll_write.lock_carried(p_company, v_fid, (p_body ->> 'expected_carried_version')::bigint);
    IF f.kind <> 'correction_down' OR f.bearer IS NOT NULL THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('carried_fact_id', f.id, 'state', 'not_a_platform_share'));
    END IF;
    PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_pw]);
    v_open := toll_system.carried_open_minor(p_company, f.id);
    IF v_open <= 0 THEN
      PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('carried_fact_id', f.id, 'state', 'nothing_left'));
    END IF;
    v_take := coalesce(toll_write.body_amount(p_body), v_open);
    IF v_take > v_open THEN
      PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take, 'carried_open_minor', v_open));
    END IF;
    INSERT INTO toll.payback_unlinked_decisions (organization_id, carried_fact_id, amount_minor, reason, decision_id)
    VALUES (p_company, f.id, v_take, p_body ->> 'reason_code', p_decision);
    v_dis := coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false)
             OR toll_system.legacy_carve_amount(p_company, 'toll:payback_unallocated') IS NOT NULL;
    IF v_dis THEN
      v_eff := (v_pw + time '12:00') AT TIME ZONE 'America/Jamaica';
      v_line := 1;
      PERFORM toll_system.post(p_company, 'P25_kept_to_income', v_take, v_eff, p_cmd, v_line,
        jsonb_build_object('carried_fact_id', f.id, 'decision_id', p_decision));
    END IF;
    UPDATE toll.carried_facts SET version = version + 1 WHERE organization_id = p_company AND id = f.id RETURNING version INTO v_pv;
    RETURN jsonb_build_object('decision_id', p_decision, 'carried_version', v_pv, 'amount_minor', v_take,
      'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_pw,
                 jsonb_build_object('left_unlinked_minor', v_take))));
  END IF;

  SELECT x.week_key INTO v_pw FROM toll.paybacks x WHERE x.organization_id = p_company AND x.id = v_id;
  PERFORM toll_write.lock_weeks(p_company, ARRAY[v_pw]);
  p := toll_write.lock_payback(p_company, v_id, (p_body ->> 'expected_payback_version')::bigint);
  PERFORM toll_write.require_payback_usable(p_company, p);
  PERFORM toll_write.refuse_if_sealed(p_company, ARRAY[v_pw]);

  v_open := toll_system.payback_open_minor(p_company, p.id);
  IF v_open <= 0 THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('payback_id', p.id, 'state', 'nothing_left', 'open_minor', v_open));
  END IF;
  v_take := coalesce(toll_write.body_amount(p_body), v_open);
  IF v_take > v_open THEN
    PERFORM toll_write.refuse('AMOUNT_TOO_LARGE', jsonb_build_object('amount_minor', v_take, 'payback_open_minor', v_open));
  END IF;

  INSERT INTO toll.payback_unlinked_decisions (organization_id, payback_id, amount_minor, reason, decision_id)
  VALUES (p_company, p.id, v_take, p_body ->> 'reason_code', p_decision);
  v_dis := coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false)
           OR toll_system.legacy_carve_amount(p_company, 'toll:payback_unallocated') IS NOT NULL;
  IF v_dis THEN
    v_eff := (v_pw + time '12:00') AT TIME ZONE 'America/Jamaica';
    v_line := 1;
    PERFORM toll_system.post(p_company, 'P25_kept_to_income', v_take, v_eff, p_cmd, v_line,
      jsonb_build_object('payback_id', p.id, 'decision_id', p_decision));
  END IF;
  UPDATE toll.paybacks SET version = version + 1, updated_at = now()
  WHERE organization_id = p_company AND id = p.id RETURNING version INTO v_pv;

  RETURN jsonb_build_object('decision_id', p_decision, 'payback_version', v_pv, 'amount_minor', v_take,
    'weeks', toll_write.weeks_answer(p_company, toll_write.add_delta('{}'::jsonb, v_pw,
               jsonb_build_object('left_unlinked_minor', v_take))));
END;
$$;

CREATE OR REPLACE FUNCTION toll_write.intent_undo_decision(p_company uuid, p_decision uuid, p_cmd text, p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d          toll.decisions%ROWTYPE;
  v_target   uuid := nullif(p_body ->> 'decision_id', '')::uuid;
  v_exp      jsonb := coalesce(p_body -> 'expected_versions', '{}'::jsonb);
  v_charges  uuid[];
  v_paybacks uuid[];
  v_facts    uuid[];
  v_weeks    date[];
  v_id       uuid;
  v_line     int := 0;
  v_eff      timestamptz;
  v_amt      bigint;
  v_deltas   jsonb := '{}'::jsonb;
  v_versions jsonb := '{}'::jsonb;
  v_ver      bigint;
  r          record;
  c          toll.charges%ROWTYPE;
  p          toll.paybacks%ROWTYPE;
  f          toll.carried_facts%ROWTYPE;
  v_dispute  jsonb;
  v_dis_on   boolean;
  v_no_p25   boolean;
  v_carve    bigint;
BEGIN
  IF v_target IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('decision_id')));
  END IF;
  SELECT * INTO d FROM toll.decisions x WHERE x.organization_id = p_company AND x.id = v_target;
  IF NOT FOUND THEN
    PERFORM toll_write.refuse('NOT_FOUND', jsonb_build_object('decision_id', v_target));
  END IF;

  IF d.intent IN ('settle_dispute', 'close_dispute_lost', 'dispute_expire') THEN
    v_dispute := toll_write.intent_undo_dispute_result(p_company, v_target, p_decision, p_cmd);
    RETURN v_dispute || jsonb_build_object('undone_decision_id', v_target);
  END IF;

  -- Once the carve-out is recorded it is fixed, whatever the switch says later: an active keep with no
  -- P25 posting (a pre-switch keep) can't be undone.
  IF d.intent = 'leave_payback_unlinked' THEN
    v_carve := toll_system.legacy_carve_amount(p_company, 'toll:payback_unallocated');
    IF v_carve IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM toll.payback_unlinked_decisions u
        WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.reversed_by IS NULL
          AND NOT toll_system.unlinked_has_p25(p_company, u.decision_id))
      INTO v_no_p25;
      IF v_no_p25 THEN
        PERFORM toll_write.refuse('LEGACY_KEEP_FINAL', jsonb_build_object('decision_id', v_target, 'carve_out_minor', v_carve));
      END IF;
    END IF;
  END IF;

  IF d.intent NOT IN ('link_payback', 'driver_pays', 'fleet_absorbs', 'leave_payback_unlinked', 'apply_suggestion') THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('decision_id', v_target, 'intent', d.intent,
      'state', 'not_undoable',
      'use', CASE d.intent WHEN 'confirm_duplicate' THEN 'release_duplicate'
                           WHEN 'verify_cash_receipt' THEN 'correct_charge_amount or a new decision'
                           WHEN 'seal_week' THEN 'reopen_week' ELSE NULL END));
  END IF;

  v_charges := array(SELECT DISTINCT a.charge_id FROM toll.allocations a
                     WHERE a.organization_id = p_company AND a.decision_id = v_target ORDER BY 1);
  v_paybacks := array(SELECT DISTINCT x FROM (
                        SELECT a.payback_id AS x FROM toll.allocations a
                        WHERE a.organization_id = p_company AND a.decision_id = v_target AND a.payback_id IS NOT NULL
                        UNION
                        SELECT u.payback_id FROM toll.payback_unlinked_decisions u
                        WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.payback_id IS NOT NULL) y
                      ORDER BY 1);
  v_facts := array(SELECT DISTINCT u.carried_fact_id FROM toll.payback_unlinked_decisions u
                   WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.carried_fact_id IS NOT NULL ORDER BY 1);
  IF NOT EXISTS (SELECT 1 FROM toll.allocations a WHERE a.organization_id = p_company AND a.decision_id = v_target
                   AND a.reversed_by IS NULL)
     AND NOT EXISTS (SELECT 1 FROM toll.payback_unlinked_decisions u WHERE u.organization_id = p_company
                       AND u.decision_id = v_target AND u.reversed_by IS NULL) THEN
    PERFORM toll_write.refuse('WRONG_STATE', jsonb_build_object('decision_id', v_target, 'state', 'already_undone'));
  END IF;

  v_weeks := array(SELECT toll_system.charge_counted_week(p_company, x.id, x.week_key) FROM toll.charges x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_charges)
                   UNION SELECT x.week_key FROM toll.paybacks x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_paybacks)
                   UNION SELECT x.to_week FROM toll.carried_facts x
                   WHERE x.organization_id = p_company AND x.id = ANY (v_facts));
  PERFORM toll_write.lock_weeks(p_company, v_weeks);

  FOREACH v_id IN ARRAY v_paybacks LOOP
    p := toll_write.lock_payback(p_company, v_id, (v_exp ->> v_id::text)::bigint, 'expected_versions.' || v_id);
  END LOOP;
  FOREACH v_id IN ARRAY v_facts LOOP
    f := toll_write.lock_carried(p_company, v_id, (v_exp ->> v_id::text)::bigint, 'expected_versions.' || v_id);
  END LOOP;
  FOREACH v_id IN ARRAY v_charges LOOP
    c := toll_write.lock_charge(p_company, v_id, (v_exp ->> v_id::text)::bigint, 'expected_versions.' || v_id);
  END LOOP;
  PERFORM toll_write.refuse_if_sealed(p_company, v_weeks);

  FOR r IN
    SELECT a.id, a.amount_minor, a.payback_id,
           toll_system.charge_counted_week(p_company, ch.id, ch.week_key) AS cw
    FROM toll.allocations a JOIN toll.charges ch ON ch.organization_id = a.organization_id AND ch.id = a.charge_id
    WHERE a.organization_id = p_company AND a.decision_id = v_target AND a.reversed_by IS NULL
    ORDER BY a.created_at, a.id
  LOOP
    v_line := v_line + 1;
    v_amt := toll_system.reverse_allocation(p_company, r.id, p_decision, p_cmd, v_line);
    v_deltas := toll_write.add_delta(v_deltas, r.cw, jsonb_build_object(
                  'undone_minor', coalesce((v_deltas -> (r.cw::text) ->> 'undone_minor')::bigint, 0) + v_amt));
  END LOOP;

  FOR r IN
    SELECT u.id, u.amount_minor, u.payback_id, u.carried_fact_id, coalesce(pb.week_key, cf.to_week) AS week_key
    FROM toll.payback_unlinked_decisions u
    LEFT JOIN toll.paybacks pb ON pb.organization_id = u.organization_id AND pb.id = u.payback_id
    LEFT JOIN toll.carried_facts cf ON cf.organization_id = u.organization_id AND cf.id = u.carried_fact_id
    WHERE u.organization_id = p_company AND u.decision_id = v_target AND u.reversed_by IS NULL
  LOOP
  v_eff := (r.week_key + time '12:00') AT TIME ZONE 'America/Jamaica';
    IF toll_system.unlinked_has_p25(p_company, v_target) THEN
      v_line := v_line + 1;
      PERFORM toll_system.post(p_company, 'P25_kept_to_income', r.amount_minor, v_eff, p_cmd, v_line,
        jsonb_build_object('decision_id', v_target)
          || CASE WHEN r.payback_id IS NOT NULL THEN jsonb_build_object('payback_id', r.payback_id)
                  ELSE jsonb_build_object('carried_fact_id', r.carried_fact_id) END,
        true);
    END IF;
    UPDATE toll.payback_unlinked_decisions SET reversed_by = p_decision WHERE organization_id = p_company AND id = r.id;
    v_deltas := toll_write.add_delta(v_deltas, r.week_key, jsonb_build_object(
                  'unlinked_undone_minor', coalesce((v_deltas -> (r.week_key::text) ->> 'unlinked_undone_minor')::bigint, 0)
                                           + r.amount_minor));
  END LOOP;

  FOREACH v_id IN ARRAY v_paybacks LOOP
    UPDATE toll.paybacks SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = v_id RETURNING version INTO v_ver;
    v_versions := v_versions || jsonb_build_object(v_id::text, v_ver);
  END LOOP;
  FOREACH v_id IN ARRAY v_facts LOOP
    UPDATE toll.carried_facts SET version = version + 1 WHERE organization_id = p_company AND id = v_id RETURNING version INTO v_ver;
    v_versions := v_versions || jsonb_build_object(v_id::text, v_ver);
  END LOOP;
  FOREACH v_id IN ARRAY v_charges LOOP
    UPDATE toll.charges SET version = version + 1, updated_at = now()
    WHERE organization_id = p_company AND id = v_id RETURNING version INTO v_ver;
    v_versions := v_versions || jsonb_build_object(v_id::text, v_ver);
  END LOOP;

  RETURN jsonb_build_object('decision_id', p_decision, 'undone_decision_id', v_target, 'versions', v_versions,
                            'weeks', toll_write.weeks_answer(p_company, v_deltas));
END;
$$;

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

  FOR v_pair IN
    SELECT DISTINCT c.plaza_id AS pid
    FROM toll.charges c
    WHERE c.organization_id = p_company AND NOT c.is_legacy AND c.plaza_id IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM toll.plaza_rules pr WHERE pr.plaza_id = v_pair.pid) THEN
      tbl := 'plaza_rules'; row_key := v_pair.pid;
      col := 'auto_duplicate_window_minutes'; current_value := null; new_value := '10';
      RETURN NEXT;
      tbl := 'plaza_rules'; row_key := v_pair.pid;
      col := 'review_duplicate_window'; current_value := null; new_value := 'same_day';
      RETURN NEXT;
      IF NOT p_dry_run THEN
        INSERT INTO toll.plaza_rules (plaza_id, auto_duplicate_window_minutes, review_duplicate_window)
        VALUES (v_pair.pid, 10, 'same_day')
        ON CONFLICT (plaza_id) DO NOTHING;
        INSERT INTO toll.audit_log (organization_id, table_name, row_key, action, new_row, actor_user_id)
        VALUES (p_company, 'toll.plaza_rules', v_pair.pid, 'insert',
                (SELECT to_jsonb(pr) FROM toll.plaza_rules pr WHERE pr.plaza_id = v_pair.pid), NULL);
      END IF;
    ELSE
      tbl := 'plaza_rules'; row_key := v_pair.pid; col := 'auto_duplicate_window_minutes';
      current_value := (SELECT pr.auto_duplicate_window_minutes::text FROM toll.plaza_rules pr WHERE pr.plaza_id = v_pair.pid);
      new_value := 'kept'; RETURN NEXT;
      tbl := 'plaza_rules'; row_key := v_pair.pid; col := 'review_duplicate_window';
      current_value := (SELECT pr.review_duplicate_window FROM toll.plaza_rules pr WHERE pr.plaza_id = v_pair.pid);
      new_value := 'kept'; RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.match_claim(p_company uuid, p_limit int DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim uuid := gen_random_uuid();
  v_n     int;
  v_fc    uuid[];
  v_fp    uuid[];
  v_c0    uuid[];
  v_p0    uuid[];
  v_c     uuid[];
  v_p     uuid[];
BEGIN
  IF p_company IS NULL THEN RAISE EXCEPTION 'BAD_REQUEST: company required'; END IF;

  IF coalesce((SELECT s.toll_disputes FROM toll.switch_state s WHERE s.organization_id = p_company), false) THEN
    PERFORM toll_system.match_refuse_missing_settings(p_company);
  END IF;

  UPDATE toll.match_queue q SET claim_id = v_claim, claimed_at = now()
  WHERE (q.organization_id, q.record_kind, q.record_id) IN (
    SELECT x.organization_id, x.record_kind, x.record_id
    FROM toll.match_queue x
    WHERE x.organization_id = p_company
      AND (x.claim_id IS NULL OR x.claimed_at < now() - interval '10 minutes')
    ORDER BY x.enqueued_at, x.record_kind, x.record_id
    LIMIT greatest(1, least(coalesce(p_limit, 500), 2000))
    FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('claim_id', NULL);
  END IF;

  -- Scope (re-scored), then their partners, then the partners' competitors, so every scoped pair's
  -- competitor counts are complete.
  SELECT f.charge_ids, f.payback_ids INTO v_fc, v_fp FROM toll_system.match_scope(p_company, v_claim) f;
  v_c0 := array(SELECT unnest(v_fc) UNION SELECT toll_system.match_charges_near(p_company, v_fp));
  v_p0 := array(SELECT unnest(v_fp) UNION SELECT toll_system.match_paybacks_near(p_company, v_fc));
  v_c  := array(SELECT unnest(v_c0) UNION SELECT toll_system.match_charges_near(p_company, v_p0));
  v_p  := array(SELECT unnest(v_p0) UNION SELECT toll_system.match_paybacks_near(p_company, v_c0));

  RETURN jsonb_build_object(
    'claim_id', v_claim,
    'queued', v_n,
    'focal', jsonb_build_object('charge_ids', to_jsonb(v_fc), 'payback_ids', to_jsonb(v_fp)),
    'charges', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'source', c.source, 'vehicle_id', c.vehicle_id, 'driver_id', c.driver_id,
               'plaza_id', c.plaza_id, 'occurred_at', c.occurred_at, 'time_precision', c.time_precision,
               'amount_minor', c.amount_minor,
               'remaining_minor', c.amount_minor - coalesce((
                  SELECT sum(a.amount_minor) FROM toll.allocations a
                  WHERE a.organization_id = c.organization_id AND a.charge_id = c.id AND a.reversed_by IS NULL), 0),
               'evidence_status', c.evidence_status, 'duplicate_of', c.duplicate_of, 'after_seal', c.after_seal,
               'is_legacy', c.is_legacy, 'week_sealed', toll_system.week_is_sealed(p_company, c.week_key))
             ORDER BY c.id), '[]'::jsonb)
      FROM toll.charges c WHERE c.organization_id = p_company AND c.id = ANY (v_c)),
    'paybacks', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'platform', p.platform, 'kind', p.kind, 'platform_trip_id', p.platform_trip_id,
               'driver_id', p.driver_id, 'paid_on', p.paid_on, 'amount_minor', p.amount_minor,
               'remaining_minor', p.amount_minor
                  - coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a
                              WHERE a.organization_id = p.organization_id AND a.payback_id = p.id AND a.reversed_by IS NULL), 0)
                  - coalesce((SELECT sum(u.amount_minor) FROM toll.payback_unlinked_decisions u
                              WHERE u.organization_id = p.organization_id AND u.payback_id = p.id AND u.reversed_by IS NULL), 0),
               'received_by', p.received_by, 'reversal_of', p.reversal_of,
               'reversed', EXISTS (SELECT 1 FROM toll.paybacks r WHERE r.organization_id = p.organization_id AND r.reversal_of = p.id),
               'after_seal', p.after_seal, 'is_legacy', p.is_legacy,
               'week_sealed', toll_system.week_is_sealed(p_company, p.week_key))
             ORDER BY p.id), '[]'::jsonb)
      FROM toll.paybacks p WHERE p.organization_id = p_company AND p.id = ANY (v_p)),
    'trips', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'platform', t.platform, 'platform_trip_id', t.platform_trip_id, 'vehicle_id', t.vehicle_id,
               'driver_id', t.driver_id, 'request_at', t.request_at, 'pickup_at', t.pickup_at, 'dropoff_at', t.dropoff_at,
               'time_precision', t.time_precision, 'payment_method', t.payment_method, 'is_legacy', t.is_legacy)
             ORDER BY t.platform, t.platform_trip_id), '[]'::jsonb)
      FROM toll.platform_trips t
      WHERE t.organization_id = p_company
        AND EXISTS (SELECT 1 FROM toll.paybacks p WHERE p.organization_id = t.organization_id AND p.id = ANY (v_p)
                      AND p.platform = t.platform AND p.platform_trip_id = t.platform_trip_id)),
    'settings', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('platform', s.platform, 'auto_apply', s.auto_apply,
                                                   'payback_mode', s.payback_mode) ORDER BY s.platform), '[]'::jsonb)
      FROM toll.platform_settings s WHERE s.organization_id = p_company));
END;
$$;

CREATE OR REPLACE FUNCTION toll_system.nightly_checks(p_company uuid)
RETURNS TABLE (check_no int, name text, ok boolean, detail jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_expected bigint;
  v_actual   bigint;
  v_link     bigint;
  v_rule224  bigint;
  v_unlnk25  bigint;
  v_carve    bigint;
  v_legacy   bigint;
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

  -- payback_unallocated: active unallocated paybacks + P19 − P18a − P22 − P24.
  -- Open-week dispute refunds use a firm allocation (counted in allocated_minor); sealed-week refunds
  -- post P22 / P24 only, which debit this account, so their net (reversals negative) is subtracted.
  SELECT coalesce(sum(p.amount_minor - p.allocated_minor), 0) INTO v_expected
  FROM toll.v_active_paybacks p WHERE p.organization_id = p_company;
  v_link := 0;
  v_rule224 := toll_system.rule_net(p_company, 'P22\_%') + toll_system.rule_net(p_company, 'P24\_%');
  v_unlnk25 := toll_system.unlinked_p25_minor(p_company, NULL);
  v_carve := coalesce(toll_system.legacy_carve_amount(p_company, 'toll:payback_unallocated'), 0);
  SELECT coalesce(sum(u.amount_minor), 0) INTO v_legacy
  FROM toll.payback_unlinked_decisions u
  WHERE u.organization_id = p_company AND u.reversed_by IS NULL
    AND NOT toll_system.unlinked_has_p25(p_company, u.decision_id);
  v_expected := v_expected
              + toll_system.rule_net(p_company, 'P19\_%\_platform') - toll_system.rule_net(p_company, 'P18a\_%')
              - v_rule224 - v_unlnk25;
  IF v_carve > 0 THEN
    v_expected := v_expected - v_legacy + v_carve;
  END IF;
  v_actual := toll_system.natural_balance(p_company, 'toll:payback_unallocated');
  check_no := 1; name := 'account:toll:payback_unallocated'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected, 'carve_out', v_carve, 'unlinked_p25', v_unlnk25);
  RETURN NEXT;

  v_expected := toll_system.rule_net(p_company, 'P25\_%');
  v_actual := toll_system.natural_balance(p_company, 'toll:other_income');
  check_no := 1; name := 'account:toll:other_income'; ok := v_actual = v_expected;
  detail := jsonb_build_object('ledger', v_actual, 'records', v_expected); RETURN NEXT;

  -- expense: active fleet allocations + P18b fleet - P19 fleet shares - P20
  SELECT coalesce(sum(a.amount_minor), 0) INTO v_expected
  FROM toll.allocations a
  JOIN toll.charges c ON c.organization_id = a.organization_id AND c.id = a.charge_id
  WHERE a.organization_id = p_company AND a.bearer = 'fleet' AND a.reversed_by IS NULL AND NOT c.is_legacy;
  v_expected := v_expected + toll_system.rule_net(p_company, 'P18b\_fleet\_%')
              + toll_system.rule_net(p_company, 'P23\_dispute\_to\_fleet%')
              - toll_system.rule_net(p_company, 'P24\_expired\_refund\_fleet%')  -- P24 fleet credits expense
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
              + toll_system.rule_net(p_company, 'P23\_dispute\_to\_driver%')
              - toll_system.rule_net(p_company, 'P24\_expired\_refund\_driver%')
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

  -- receivable_platform_dispute: open disputes (C4.5)
  SELECT coalesce(sum(d.owed_minor - d.recovered_minor), 0) INTO v_expected
  FROM toll.disputes d
  WHERE d.organization_id = p_company AND d.state IN ('to_send', 'sent');
  v_actual := toll_system.natural_balance(p_company, 'toll:receivable_platform_dispute');
  check_no := 1; name := 'account:toll:receivable_platform_dispute'; ok := v_actual = v_expected;
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
           + toll_system.rule_net(p_company, 'P21\_%', 'charge_id', r.id::text)
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
  -- P1-R4: every account Phase 1 posts to. Charge legs count in the charge's week; payback legs in the payback's
  -- (the reversing payback's for a take-back); top-ups in the top-up's week; carried legs (P20) in the carried-to week.
  -- P2-R4c: P18 / P19 legs count in their carried row's to_week, against toll_system.carried_sum.
  FOR r IN
    WITH legs AS (
      SELECT CASE WHEN (e.metadata ->> 'reverse')::boolean THEN -e.amount_minor ELSE e.amount_minor END AS amt,
             e.metadata ->> 'toll_rule' AS rule,
             (e.metadata ->> 'charge_id')::uuid AS charge_id,
             -- P17 rows carry the original payback_id AND reversing_payback_id; they count in the reversing payback's week
             coalesce((e.metadata ->> 'reversing_payback_id')::uuid, (e.metadata ->> 'payback_id')::uuid) AS payback_id,
             (e.metadata ->> 'tag_topup_id')::uuid AS topup_id,
             (e.metadata ->> 'carried_fact_id')::uuid AS fact_id
      FROM ledger.entries e
      WHERE e.organization_id = p_company AND e.reference_type = 'toll'
    ),
    cl AS (                                   -- charge legs with the charge's counted week
      SELECT l.*, toll_system.charge_counted_week(p_company, c.id, c.week_key) AS wk
      FROM legs l JOIN toll.charges c ON c.organization_id = p_company AND c.id = l.charge_id
    ),
    pl AS (                                   -- payback legs with the payback's week
      SELECT l.*, p.week_key AS wk FROM legs l JOIN toll.paybacks p ON p.organization_id = p_company AND p.id = l.payback_id
    ),
    tl AS (                                   -- top-up legs with the top-up's week
      SELECT l.*, t.week_key AS wk FROM legs l JOIN toll.tag_topups t ON t.organization_id = p_company AND t.id = l.topup_id
    ),
    fl AS (                                   -- carried legs with the carried-to week
      SELECT l.*, f.to_week AS wk FROM legs l JOIN toll.carried_facts f ON f.organization_id = p_company AND f.id = l.fact_id
    ),
    weeks AS (
      SELECT wk FROM cl UNION SELECT wk FROM pl UNION SELECT wk FROM tl UNION SELECT wk FROM fl
      UNION SELECT toll_system.charge_counted_week(p_company, c.id, c.week_key) FROM toll.charges c
            WHERE c.organization_id = p_company AND NOT c.is_legacy AND NOT c.after_seal
      UNION SELECT p.week_key FROM toll.paybacks p WHERE p.organization_id = p_company AND NOT p.is_legacy AND NOT p.after_seal
    )
    SELECT w.wk,
      toll_system.week_is_sealed(p_company, w.wk) AS sealed,
      -- suspense: +P2 +P3 +P16up −P16down −P6 −P7 −P8 −P21 (charge week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P2_|P3_|P16_up_)' THEN amt
                                WHEN rule ~ '^(P16_down_|P6_|P7_|P8_|P21_)' THEN -amt ELSE 0 END) FROM cl WHERE cl.wk = w.wk), 0) AS suspense_flow,
      coalesce((SELECT sum(c.amount_minor - c.allocated_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0) AS suspense_expected,
      -- payback_unallocated: +P4 +P5 −P6 −P25 (payback week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P4_|P5_)' THEN amt WHEN rule ~ '^(P6_|P25_)' THEN -amt ELSE 0 END)
                FROM pl WHERE pl.wk = w.wk), 0)
        + coalesce((SELECT sum(CASE WHEN rule ~ '^P19_.*_platform$' THEN amt
                                   WHEN rule ~ '^(P18a_|P25_)' THEN -amt ELSE 0 END)
                    FROM fl WHERE fl.wk = w.wk), 0) AS unalloc_flow,
      (coalesce((SELECT sum(p.amount_minor - coalesce((
                   SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = p.organization_id AND a.payback_id = p.id
                     AND (a.reversed_by IS NULL OR a.reversed_by IN (
                       SELECT t.id FROM toll.paybacks t WHERE t.organization_id = p.organization_id AND t.reversal_of = p.id))), 0))
                FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.week_key = w.wk AND NOT p.is_legacy AND NOT p.after_seal
                  AND p.reversal_of IS NULL), 0)
       - coalesce((SELECT sum(o.amount_minor - coalesce((
                   SELECT sum(a.amount_minor) FROM toll.allocations a
                   WHERE a.organization_id = o.organization_id AND a.payback_id = o.id AND a.reversed_by = t.id), 0))
                FROM toll.paybacks t JOIN toll.paybacks o ON o.organization_id = t.organization_id AND o.id = t.reversal_of
                WHERE t.organization_id = p_company AND t.week_key = w.wk AND NOT t.is_legacy AND NOT t.after_seal), 0)

        + toll_system.carried_sum(p_company, w.wk, 'cd_platform')
        - toll_system.carried_sum(p_company, w.wk, 'tb_leftover')
        - toll_system.unlinked_p25_minor(p_company, w.wk)
      ) AS unalloc_expected,
      -- expense: +P8 (charge week) −P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P8_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P18b_fleet_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P19_.*_fleet$'), 0) AS expense_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'fleet' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        - coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'tb_fleet')
        - toll_system.carried_sum(p_company, w.wk, 'cd_fleet') AS expense_expected,
      -- receivable_driver: +P7 (charge week)
      coalesce((SELECT sum(amt) FROM cl WHERE cl.wk = w.wk AND rule ~ '^P7_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^(P18b_driver_|P19_cash_)'), 0) AS rd_flow,
      coalesce((SELECT sum(a.amount_minor) FROM toll.allocations a JOIN toll.v_live_charges c
                  ON c.organization_id = a.organization_id AND c.id = a.charge_id
                WHERE a.organization_id = p_company AND a.bearer = 'driver' AND a.reversed_by IS NULL
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'tb_driver')
        + toll_system.carried_sum(p_company, w.wk, 'cd_cash') AS rd_expected,
      -- payable_driver: +P3 +P16up_cash −P16down_cash (charge week)
      coalesce((SELECT sum(CASE WHEN rule ~ '^(P3_|P16_up_cash)' THEN amt WHEN rule ~ '^P16_down_cash' THEN -amt ELSE 0 END)
                FROM cl WHERE cl.wk = w.wk), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P19_.*_driver$'), 0) AS pd_flow,
      coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                WHERE c.organization_id = p_company AND c.paid_by = 'cash' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                  AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'cd_driver') AS pd_expected,
      -- tag_prepaid: +P1 (top-up week) −P2 −P16up_tag +P16down_tag (charge week)
      coalesce((SELECT sum(amt) FROM tl WHERE tl.wk = w.wk AND rule ~ '^P1_'), 0)
        - coalesce((SELECT sum(CASE WHEN rule ~ '^(P2_|P16_up_tag)' THEN amt WHEN rule ~ '^P16_down_tag' THEN -amt ELSE 0 END)
                    FROM cl WHERE cl.wk = w.wk), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P19_tag_'), 0) AS tag_flow,
      coalesce((SELECT sum(t.amount_minor) FROM toll.tag_topups t WHERE t.organization_id = p_company AND t.week_key = w.wk), 0)
        - coalesce((SELECT sum(c.amount_minor) FROM toll.v_live_charges c
                    WHERE c.organization_id = p_company AND c.paid_by = 'tag' AND c.state NOT IN ('duplicate', 'rejected', 'unverified')
                      AND toll_system.charge_counted_week(p_company, c.id, c.week_key) = w.wk), 0)
        + toll_system.carried_sum(p_company, w.wk, 'cd_tag') AS tag_expected,
      -- receivable_platform: +P4 (payback week); recovered_in_driver_cash: +P5 (payback week) +P20 (carried-to week)
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P4_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^(P18a_leftover_fleet|P18b_.*_card)$'), 0) AS rp_flow,
      -- every recorded payback counts + in its week, every take-back − in the take-back's week (P17 reverses P4/P5)
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'fleet' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0)
        - toll_system.carried_sum(p_company, w.wk, 'tb_card') AS rp_expected,
      coalesce((SELECT sum(amt) FROM pl WHERE pl.wk = w.wk AND rule ~ '^P5_'), 0)
        + coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^P20_'), 0)
        - coalesce((SELECT sum(amt) FROM fl WHERE fl.wk = w.wk AND rule ~ '^(P18a_leftover_driver|P18b_.*_cash)$'), 0) AS rc_flow,
      coalesce((SELECT sum(CASE WHEN p.reversal_of IS NULL THEN p.amount_minor ELSE -p.amount_minor END) FROM toll.paybacks p
                WHERE p.organization_id = p_company AND p.received_by = 'driver' AND p.week_key = w.wk
                  AND NOT p.is_legacy AND NOT p.after_seal), 0)
        + coalesce((SELECT sum(f.amount_minor) FROM toll.carried_facts f
                    WHERE f.organization_id = p_company AND f.kind = 'cash_recovered' AND f.to_week = w.wk), 0)
        - toll_system.carried_sum(p_company, w.wk, 'tb_cash') AS rc_expected
    FROM weeks w
    WHERE w.wk IS NOT NULL
  LOOP
    CONTINUE WHEN r.sealed;
    check_no := 3; name := 'week_flow:' || r.wk;
    ok := r.suspense_flow = r.suspense_expected AND r.unalloc_flow = r.unalloc_expected
      AND r.expense_flow = r.expense_expected AND r.rd_flow = r.rd_expected AND r.pd_flow = r.pd_expected
      AND r.tag_flow = r.tag_expected AND r.rp_flow = r.rp_expected AND r.rc_flow = r.rc_expected;
    detail := jsonb_build_object('week', r.wk,
      'suspense_flow', r.suspense_flow, 'suspense_expected', r.suspense_expected,
      'unallocated_flow', r.unalloc_flow, 'unallocated_expected', r.unalloc_expected,
      'expense_flow', r.expense_flow, 'expense_expected', r.expense_expected,
      'receivable_driver_flow', r.rd_flow, 'receivable_driver_expected', r.rd_expected,
      'payable_driver_flow', r.pd_flow, 'payable_driver_expected', r.pd_expected,
      'tag_prepaid_flow', r.tag_flow, 'tag_prepaid_expected', r.tag_expected,
      'receivable_platform_flow', r.rp_flow, 'receivable_platform_expected', r.rp_expected,
      'recovered_in_driver_cash_flow', r.rc_flow, 'recovered_in_driver_cash_expected', r.rc_expected);
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
  v_self       boolean := false;
  v_reason     text := nullif(btrim(p_body ->> 'self_approval_reason'), '');
BEGIN
  v_company := toll_read.current_company();
  IF v_company IS NULL OR v_user IS NULL THEN
    PERFORM toll_write.refuse('NO_COMPANY');
  END IF;
  IF p_body ? 'organization_id' OR p_body ? 'organizationId' OR p_body ? 'company_id' THEN
    PERFORM toll_write.refuse('COMPANY_NOT_ACCEPTED');
  END IF;

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
    WHEN 'open_dispute' THEN 'toll.manage'
    WHEN 'mark_dispute_sent' THEN 'toll.manage'
    WHEN 'settle_dispute' THEN 'toll.manage'
    WHEN 'close_dispute_lost' THEN 'toll.manage'
    WHEN 'change_toll_settings' THEN 'toll.manage'
    WHEN 'approve_settings_seed' THEN 'toll.manage'
    WHEN 'request_approval' THEN 'toll.manage'
    WHEN 'approve_request' THEN 'toll.manage'
    WHEN 'reject_request' THEN 'toll.manage'
    WHEN 'withdraw_request' THEN 'toll.manage'
    ELSE NULL
  END;
  IF v_permission IS NULL THEN
    PERFORM toll_write.refuse('UNKNOWN_INTENT', jsonb_build_object('intent', p_intent));
  END IF;

  IF p_intent <> 'mark_dispute_sent' AND NOT toll_system.user_can_manage_tolls(v_user, v_company) THEN
    PERFORM toll_write.refuse('FORBIDDEN', jsonb_build_object('permission', v_permission));
  END IF;

  IF v_command_id IS NULL THEN
    PERFORM toll_write.refuse('BAD_REQUEST', jsonb_build_object('need', jsonb_build_array('command_id')));
  END IF;

  PERFORM toll_write.run_approval_gate(v_company, p_intent, p_body, p_intent IN ('request_approval','approve_request','reject_request','withdraw_request'));

  IF p_intent NOT IN ('request_approval','approve_request','reject_request','withdraw_request')
     AND toll_write.approval_requires_four_eyes(v_company, p_intent, p_body) AND v_reason IS NOT NULL
     AND toll_system.manage_seat_count(v_company) = 1 THEN
    v_self := true;
  END IF;

  INSERT INTO toll.decisions (organization_id, command_id, intent, actor, actor_user_id, reason_code, note, targets,
                              self_approved, self_approval_reason)
  VALUES (v_company, v_command_id, p_intent, 'user', v_user, p_body ->> 'reason_code', p_body ->> 'note', p_body,
          v_self, CASE WHEN v_self THEN v_reason ELSE NULL END)
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

  v_response := toll_write.dispatch(v_company, p_intent, v_decision, v_command_id, p_body);
  IF v_response IS NULL THEN
    PERFORM toll_write.refuse('INTENT_NOT_BUILT', jsonb_build_object('intent', p_intent));
  END IF;

  IF octet_length(v_response::text) > 65536 THEN
    v_response := jsonb_build_object('decision_id', v_decision, 'weeks', v_response -> 'weeks', 'truncated', true,
                                     'batch_hash', v_response -> 'batch_hash', 'counts', v_response -> 'counts');
    UPDATE toll.decisions SET response = v_response, response_truncated = true WHERE id = v_decision;
  ELSE
    UPDATE toll.decisions SET response = v_response WHERE id = v_decision;
  END IF;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION toll_system.manage_seat_count(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.legacy_carve_amount(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.unlinked_has_p25(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.unlinked_p25_minor(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.approval_amount(uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.approval_requires_four_eyes(uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.run_approval_gate(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.dispatch(uuid, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_system.record_legacy_kept(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION toll_system.match_refuse_missing_settings(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION toll_system.record_legacy_kept(uuid) TO service_role;

REVOKE ALL ON FUNCTION toll_write.intent_request_approval(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_approve_request(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_reject_request(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_withdraw_request(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_change_toll_settings(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION toll_write.intent_approve_settings_seed(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
