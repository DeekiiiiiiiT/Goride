-- Fleet commercial module purchases (WiPay-first, Jamaica JMD).
CREATE TABLE IF NOT EXISTS fleet.module_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  service_lines text[] NOT NULL,
  amount_jmd numeric NOT NULL,
  currency text NOT NULL DEFAULT 'JMD',
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'wipay',
  provider_transaction_id text,
  provider_data jsonb NOT NULL DEFAULT '{}',
  payment_redirect_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_fleet_module_purchases_user
  ON fleet.module_purchases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_module_purchases_provider_txn
  ON fleet.module_purchases (provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

COMMENT ON TABLE fleet.module_purchases IS
  'Fleet owner Rush module checkout — WiPay webhook completes entitlement.';

-- Stripe Connect columns retained for historical reads; no longer written.
COMMENT ON COLUMN delivery.merchants.stripe_connect_account_id IS
  'Deprecated 2026-09 — Jamaica bank/WiPay payouts; column no longer written.';
COMMENT ON COLUMN delivery.courier_profiles.stripe_connect_account_id IS
  'Deprecated 2026-09 — direct courier payouts via bank/WiPay; column no longer written.';
