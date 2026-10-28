-- In-House procurement: staffed desk, card-only, no merchant payout.

CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_feature_flags (name, enabled)
VALUES ('IN_HOUSE_ENABLED', false)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS procurement_mode text NOT NULL DEFAULT 'partner',
  ADD COLUMN IF NOT EXISTS in_house_live boolean NOT NULL DEFAULT false;

ALTER TABLE delivery.merchants DROP CONSTRAINT IF EXISTS merchants_procurement_mode_check;
ALTER TABLE delivery.merchants
  ADD CONSTRAINT merchants_procurement_mode_check
  CHECK (procurement_mode IN ('partner', 'in_house'));

CREATE TABLE IF NOT EXISTS delivery.in_house_stores (
  merchant_id uuid PRIMARY KEY REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  source_brand text,
  source_location_label text,
  order_channel text NOT NULL DEFAULT 'web'
    CHECK (order_channel IN ('web', 'phone', 'whatsapp', 'email', 'walk_in', 'api')),
  order_url text,
  order_phone text,
  pickup_instructions text,
  default_prep_minutes int NOT NULL DEFAULT 25,
  markup_bps int NOT NULL DEFAULT 1500,
  price_tolerance_bps int NOT NULL DEFAULT 300,
  max_order_minor bigint,
  automation_level text NOT NULL DEFAULT 'L0'
    CHECK (automation_level IN ('L0', 'L1', 'L2', 'L3')),
  adapter_key text NOT NULL DEFAULT 'manual',
  tos_reviewed_at timestamptz,
  tos_allows_automation boolean NOT NULL DEFAULT false,
  legal_disclaimer text,
  partnership_status text NOT NULL DEFAULT 'none'
    CHECK (partnership_status IN ('none', 'pitched', 'negotiating', 'converted', 'declined')),
  offer_start_minute int NOT NULL DEFAULT 660,
  offer_end_minute int NOT NULL DEFAULT 1260,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.in_house_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  last4 text NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  holder_user_id uuid,
  daily_limit_minor bigint NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery.procurement_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES delivery.orders(id) ON DELETE RESTRICT,
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id),
  state text NOT NULL DEFAULT 'queued',
  claimed_by uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  pickup_code text NOT NULL,
  expected_cost_minor bigint NOT NULL,
  actual_total_minor bigint,
  variance_minor bigint GENERATED ALWAYS AS (actual_total_minor - expected_cost_minor) STORED,
  external_order_ref text,
  external_ready_eta timestamptz,
  dispatch_at timestamptz,
  card_id uuid REFERENCES delivery.in_house_cards(id),
  receipt_path text,
  receipt_gct_minor bigint,
  placed_at timestamptz,
  picked_up_at timestamptz,
  exception_code text,
  exception_note text,
  sla_due_at timestamptz NOT NULL DEFAULT (now() + interval '7 minutes'),
  attempt int NOT NULL DEFAULT 1,
  second_approved_by uuid,
  second_approved_at timestamptz,
  customer_price_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procurement_tasks_state_check CHECK (state IN (
    'queued', 'claimed', 'placing', 'placed_external', 'ready_for_pickup',
    'picked_up', 'closed', 'exception', 'awaiting_customer', 'abandoned'
  )),
  CONSTRAINT procurement_tasks_exception_check CHECK (
    exception_code IS NULL OR exception_code IN (
      'item_unavailable', 'price_increase_over_tolerance', 'store_closed', 'site_down',
      'card_declined', 'min_order_not_met', 'not_ready_at_pickup', 'wrong_order',
      'store_cancelled', 'other'
    )
  ),
  CONSTRAINT placed_requires_evidence CHECK (
    state NOT IN ('placed_external', 'ready_for_pickup', 'picked_up', 'closed')
    OR (
      external_order_ref IS NOT NULL
      AND actual_total_minor IS NOT NULL
      AND receipt_path IS NOT NULL
      AND card_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS procurement_tasks_pickup_day_uidx
  ON delivery.procurement_tasks (pickup_code, ((created_at AT TIME ZONE 'America/Jamaica')::date));

CREATE INDEX IF NOT EXISTS procurement_tasks_state_idx ON delivery.procurement_tasks (state, sla_due_at);

CREATE TABLE IF NOT EXISTS delivery.procurement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES delivery.procurement_tasks(id) ON DELETE RESTRICT,
  from_state text,
  to_state text NOT NULL,
  actor_id uuid,
  actor_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION delivery.reject_procurement_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'procurement_events_append_only';
END;
$$;

DROP TRIGGER IF EXISTS procurement_events_append_only ON delivery.procurement_events;
CREATE TRIGGER procurement_events_append_only
  BEFORE UPDATE OR DELETE ON delivery.procurement_events
  FOR EACH ROW EXECUTE FUNCTION delivery.reject_procurement_event_mutation();

CREATE TABLE IF NOT EXISTS delivery.in_house_card_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES delivery.in_house_cards(id),
  posted_on date NOT NULL,
  amount_minor bigint NOT NULL,
  merchant_text text NOT NULL DEFAULT '',
  task_id uuid REFERENCES delivery.procurement_tasks(id),
  matched_by uuid,
  matched_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, posted_on, amount_minor, merchant_text)
);

CREATE TABLE IF NOT EXISTS delivery.in_house_desk_presence (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery.menu_items
  ADD COLUMN IF NOT EXISTS source_sku text,
  ADD COLUMN IF NOT EXISTS source_price_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_url text;

CREATE OR REPLACE FUNCTION delivery.sync_in_house_menu_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bps int;
BEGIN
  SELECT s.markup_bps INTO bps
  FROM delivery.in_house_stores s
  JOIN delivery.merchants m ON m.id = s.merchant_id
  WHERE s.merchant_id = NEW.merchant_id
    AND m.procurement_mode = 'in_house';
  IF bps IS NULL OR NEW.in_store_price IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.marketplace_price := ceil((NEW.in_store_price * (1 + (bps::numeric / 10000))) / 10) * 10;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_in_house_menu_price ON delivery.menu_items;
CREATE TRIGGER trg_in_house_menu_price
  BEFORE INSERT OR UPDATE OF in_store_price, merchant_id ON delivery.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION delivery.sync_in_house_menu_price();

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'rush_money'
      AND rel.relname = 'accounts'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%merchant_payable%'
  LOOP
    EXECUTE format('ALTER TABLE rush_money.accounts DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE rush_money.accounts
  ADD CONSTRAINT accounts_kind_check CHECK (kind IN (
    'gateway_clearing','order_clearing','merchant_payable','merchant_receivable',
    'courier_earnings','courier_cash_earned','customer_wallet','platform_revenue',
    'platform_cost','marketing_goodwill','gct_output_payable','refunds_in_flight',
    'chargeback_reserve','payouts_in_flight','bank','cod_clearing',
    'vendor_prepaid','procurement_card_payable'
  ));

CREATE OR REPLACE FUNCTION rush_money.reject_in_house_merchant_payable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind text;
  v_party uuid;
  v_party_type text;
BEGIN
  SELECT kind, party_id, party_type INTO v_kind, v_party, v_party_type
  FROM rush_money.accounts
  WHERE id = NEW.account_id;
  IF v_kind = 'merchant_payable' AND v_party_type = 'merchant' AND v_party IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM delivery.merchants
      WHERE id = v_party AND procurement_mode = 'in_house'
    ) THEN
      RAISE EXCEPTION 'in_house_merchant_payable_forbidden';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_in_house_merchant_payable ON rush_money.lines;
CREATE TRIGGER reject_in_house_merchant_payable
  BEFORE INSERT ON rush_money.lines
  FOR EACH ROW EXECUTE FUNCTION rush_money.reject_in_house_merchant_payable();

CREATE OR REPLACE VIEW delivery.v_in_house_placed_without_purchase_journal AS
SELECT t.id AS task_id, t.order_id
FROM delivery.procurement_tasks t
WHERE t.state IN ('placed_external', 'ready_for_pickup', 'picked_up', 'closed')
  AND NOT EXISTS (
    SELECT 1 FROM rush_money.journals j
    WHERE j.idempotency_key = 'procure:' || t.id::text
  );

CREATE OR REPLACE VIEW delivery.v_in_house_vendor_prepaid_open AS
SELECT a.party_id AS order_id, a.balance_minor
FROM rush_money.accounts a
JOIN delivery.orders o ON o.id = a.party_id
WHERE a.kind = 'vendor_prepaid'
  AND a.balance_minor <> 0
  AND o.status IN ('delivered', 'completed', 'cancelled');

CREATE OR REPLACE VIEW delivery.v_in_house_card_unmatched_7d AS
SELECT 'statement'::text AS side, s.id::text AS ref
FROM delivery.in_house_card_statement_lines s
WHERE s.task_id IS NULL
  AND s.imported_at < now() - interval '7 days'
UNION ALL
SELECT 'task'::text, t.id::text
FROM delivery.procurement_tasks t
WHERE t.state IN ('placed_external', 'ready_for_pickup', 'picked_up', 'closed')
  AND t.placed_at < now() - interval '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM delivery.in_house_card_statement_lines s WHERE s.task_id = t.id
  );

CREATE OR REPLACE VIEW delivery.v_in_house_merchant_payable AS
SELECT l.journal_id, a.party_id AS merchant_id, l.amount_minor
FROM rush_money.lines l
JOIN rush_money.accounts a ON a.id = l.account_id
JOIN delivery.merchants m ON m.id = a.party_id
WHERE a.kind = 'merchant_payable'
  AND m.procurement_mode = 'in_house';

CREATE OR REPLACE VIEW delivery.v_in_house_variance_outliers AS
SELECT t.id AS task_id, t.order_id, t.variance_minor
FROM delivery.procurement_tasks t
JOIN delivery.in_house_stores s ON s.merchant_id = t.merchant_id
WHERE t.actual_total_minor IS NOT NULL
  AND t.expected_cost_minor > 0
  AND abs(t.variance_minor) * 10000 > t.expected_cost_minor * s.price_tolerance_bps
  AND t.customer_price_approved_at IS NULL;

ALTER TABLE delivery.in_house_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.in_house_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.procurement_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.procurement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.in_house_card_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.in_house_desk_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procurement_tasks_staff_select ON delivery.procurement_tasks;
CREATE POLICY procurement_tasks_staff_select ON delivery.procurement_tasks
  FOR SELECT TO authenticated
  USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN (
      'dash_concierge', 'dash_ops', 'dash_admin',
      'platform_owner', 'platform_support', 'platform_analyst', 'superadmin'
    )
    OR COALESCE(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb) ?| ARRAY[
      'dash_concierge', 'dash_ops', 'dash_admin',
      'platform_owner', 'platform_support', 'platform_analyst', 'superadmin'
    ]
  );

GRANT SELECT ON delivery.procurement_tasks TO authenticated;
GRANT ALL ON delivery.in_house_stores TO service_role;
GRANT ALL ON delivery.in_house_cards TO service_role;
GRANT ALL ON delivery.procurement_tasks TO service_role;
GRANT ALL ON delivery.procurement_events TO service_role;
GRANT ALL ON delivery.in_house_card_statement_lines TO service_role;
GRANT ALL ON delivery.in_house_desk_presence TO service_role;
GRANT SELECT ON delivery.v_in_house_placed_without_purchase_journal TO service_role;
GRANT SELECT ON delivery.v_in_house_vendor_prepaid_open TO service_role;
GRANT SELECT ON delivery.v_in_house_card_unmatched_7d TO service_role;
GRANT SELECT ON delivery.v_in_house_merchant_payable TO service_role;
GRANT SELECT ON delivery.v_in_house_variance_outliers TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'in-house-receipts',
  'in-house-receipts',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE delivery.procurement_tasks;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system)
VALUES (
  'dash_concierge',
  'In-House Buyer',
  'Place In-House orders. Cannot refund, edit prices, cards, or markup.',
  500,
  'dash',
  TRUE
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO platform.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform.roles r
JOIN platform.permissions p ON p.key IN ('dash.portal.access')
WHERE r.name = 'dash_concierge'
ON CONFLICT DO NOTHING;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('rush-in-house-sweep'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule(
      'rush-in-house-sweep',
      '* * * * *',
      $job$SELECT private.invoke_rush_delivery('/internal/in-house/sweep');$job$
    );
  END IF;
END;
$cron$;
