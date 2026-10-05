-- Phases 2–6 tables: attempts, payouts, chargebacks, risk, recon.

ALTER TABLE delivery.courier_remittance_settlements DROP CONSTRAINT IF EXISTS courier_remittance_settlements_status_check;
ALTER TABLE delivery.courier_remittance_settlements
  ADD CONSTRAINT courier_remittance_settlements_status_check
  CHECK (status IN ('pending', 'pending_confirmation', 'posted', 'reversed', 'void'));
ALTER TABLE delivery.courier_remittance_settlements ALTER COLUMN balance_before_minor DROP NOT NULL;

CREATE TABLE IF NOT EXISTS delivery.delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE RESTRICT,
  courier_id uuid,
  attempt_type text NOT NULL CHECK (attempt_type IN ('call','sms','knock','wait','photo')),
  at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  wait_seconds integer,
  photo_url text
);

ALTER TABLE delivery.delivery_attempts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery.delivery_attempts TO service_role;

CREATE TABLE IF NOT EXISTS rush_money.payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type text NOT NULL CHECK (party_type IN ('merchant','courier')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','approved','exported','paid','returned')),
  rail text,
  total_minor bigint NOT NULL DEFAULT 0,
  bank_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rush_money.payout_approvals (
  batch_id uuid NOT NULL REFERENCES rush_money.payout_batches(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, actor_id)
);

CREATE TABLE IF NOT EXISTS rush_money.payout_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES rush_money.payout_batches(id) ON DELETE RESTRICT,
  party_id uuid NOT NULL,
  amount_minor bigint NOT NULL,
  reason text NOT NULL,
  order_id uuid
);

CREATE OR REPLACE FUNCTION rush_money.enforce_two_person_payout()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_approvers int;
BEGIN
  IF NEW.status IN ('approved','exported','paid') AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT count(DISTINCT actor_id) INTO v_approvers
    FROM rush_money.payout_approvals
    WHERE batch_id = NEW.id;
    IF v_approvers < 2 THEN
      RAISE EXCEPTION 'payout_two_person_required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payout_two_person ON rush_money.payout_batches;
CREATE TRIGGER payout_two_person
  BEFORE UPDATE ON rush_money.payout_batches
  FOR EACH ROW EXECUTE FUNCTION rush_money.enforce_two_person_payout();

CREATE TABLE IF NOT EXISTS rush_money.chargebacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES delivery.orders(id) ON DELETE RESTRICT,
  provider_ref text,
  reason_code text,
  amount_minor bigint NOT NULL,
  deadline date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fighting','won','lost')),
  outcome text,
  evidence_pack jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rush_money.recon_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  reference text NOT NULL,
  detail text NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, reference)
);

CREATE SCHEMA IF NOT EXISTS risk;

CREATE TABLE IF NOT EXISTS risk.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type text NOT NULL,
  party_id uuid NOT NULL,
  signal text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type text NOT NULL,
  party_id uuid NOT NULL,
  score numeric NOT NULL,
  version text NOT NULL,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type text NOT NULL,
  party_id uuid NOT NULL,
  reason_code text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','restricted','lifted','banned')),
  owner_id uuid,
  appeal_by date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk.restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type text NOT NULL,
  party_id uuid NOT NULL,
  control text NOT NULL,
  reason_code text NOT NULL,
  expires_at timestamptz,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rush_money.payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_money.payout_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_money.payout_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_money.chargebacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rush_money.recon_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk.restrictions ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA risk TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA rush_money TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA risk TO service_role;

CREATE OR REPLACE FUNCTION delivery.add_merchant_fault_balance(
  p_merchant uuid,
  p_period date,
  p_amount numeric
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = delivery, public
AS $$
  INSERT INTO delivery.merchant_performance_snapshots (merchant_id, period_start, chargeback_balance)
  VALUES (p_merchant, p_period, p_amount)
  ON CONFLICT (merchant_id, period_start)
  DO UPDATE SET
    chargeback_balance = delivery.merchant_performance_snapshots.chargeback_balance + EXCLUDED.chargeback_balance,
    updated_at = now();
$$;

REVOKE ALL ON FUNCTION delivery.add_merchant_fault_balance(uuid, date, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delivery.add_merchant_fault_balance(uuid, date, numeric) TO service_role;

CREATE OR REPLACE VIEW rush_money.v_provider_recon_exceptions AS
SELECT id, source, reference, detail, created_at
FROM rush_money.recon_exceptions
WHERE resolved_at IS NULL;

GRANT SELECT ON rush_money.v_provider_recon_exceptions TO service_role;

ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money, risk';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
