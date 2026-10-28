-- Wallet architecture: ride fleet attribution, Start Trip flag, org payout flag, fee config hook.
-- See docs/passenger-rides/MONEY_LEDGER_RULES.md

-- Layer A attribution on passenger-app rides (reporting only until fleet_org_payout_enabled).
ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS fleet_id UUID,
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS attribution_mode TEXT;

ALTER TABLE rides.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_attribution_mode_check;
ALTER TABLE rides.ride_requests
  ADD CONSTRAINT ride_requests_attribution_mode_check
  CHECK (attribution_mode IS NULL OR attribution_mode IN ('independent', 'fleet'));

COMMENT ON COLUMN rides.ride_requests.fleet_id IS
  'Fleet org from driver_profiles at assign/complete (nullable for independent).';
COMMENT ON COLUMN rides.ride_requests.organization_id IS
  'Org stamped for fleet books / future org payout (usually same as fleet_id).';
COMMENT ON COLUMN rides.ride_requests.attribution_mode IS
  'independent | fleet — money destination policy key; journal branch uses org payout flag.';

CREATE INDEX IF NOT EXISTS idx_ride_requests_organization_id
  ON rides.ride_requests (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ride_requests_fleet_id
  ON rides.ride_requests (fleet_id)
  WHERE fleet_id IS NOT NULL;

-- Refresh public view so new columns are visible via PostgREST.
DROP VIEW IF EXISTS public.rides_ride_requests;
CREATE VIEW public.rides_ride_requests
  WITH (security_invoker = true)
  AS SELECT * FROM rides.ride_requests;
GRANT SELECT ON public.rides_ride_requests TO service_role;
GRANT SELECT ON public.rides_ride_requests TO authenticated;

-- Temporary Start Trip bridge (Layer B only). Default ON for fleet drivers.
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS manual_start_trip_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.driver_profiles.manual_start_trip_enabled IS
  'When FALSE, hide Start Trip. Temporary until passenger app is widely available. Layer B only — never writes rides.ride_requests.';

-- Freeze: drivers must not flip their own Start Trip / org payout flags.
CREATE OR REPLACE FUNCTION public.driver_profiles_freeze_wallet_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IN ('authenticated', 'anon') THEN
    IF NEW.manual_start_trip_enabled IS DISTINCT FROM OLD.manual_start_trip_enabled THEN
      NEW.manual_start_trip_enabled := OLD.manual_start_trip_enabled;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_profiles_freeze_wallet_flags ON public.driver_profiles;
CREATE TRIGGER trg_driver_profiles_freeze_wallet_flags
  BEFORE UPDATE ON public.driver_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.driver_profiles_freeze_wallet_flags();

-- Uber-style: Roam fare credits fleet org when enabled (default OFF).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fleet_org_payout_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.organizations.fleet_org_payout_enabled IS
  'When TRUE, matched Roam trip fares credit org payment accounts (tips stay with driver). Default OFF — pilot per org.';

-- Layer C: platform fee rate in basis points (0 = 0%). Global default via env still wins if unset.
ALTER TABLE rides.dispatch_settings
  ADD COLUMN IF NOT EXISTS roam_platform_fee_bps INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN rides.dispatch_settings.roam_platform_fee_bps IS
  'Roam take-rate in basis points (100 = 1%). Tips excluded. Default 0.';

DROP VIEW IF EXISTS public.rides_dispatch_settings;
CREATE VIEW public.rides_dispatch_settings AS
  SELECT * FROM rides.dispatch_settings;
GRANT SELECT, UPDATE ON public.rides_dispatch_settings TO service_role;

-- Org role on rides payment accounts (Layer A org wallets).
ALTER TABLE rides.payment_accounts
  DROP CONSTRAINT IF EXISTS payment_accounts_role_check;
ALTER TABLE rides.payment_accounts
  ADD CONSTRAINT payment_accounts_role_check
  CHECK (role IN ('rider', 'driver', 'system', 'org'));

ALTER TABLE rides.payment_accounts
  ADD COLUMN IF NOT EXISTS organization_id UUID;

CREATE INDEX IF NOT EXISTS idx_payment_accounts_organization_id
  ON rides.payment_accounts (organization_id)
  WHERE organization_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Allow org wallet keys in journal posting RPC.
CREATE OR REPLACE FUNCTION rides._resolve_payment_account_id(
  p_account_key TEXT,
  p_currency TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  v_id UUID;
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  IF p_account_key IN ('platform:receivable', 'platform:clearing') THEN
    RETURN rides._ensure_payment_account(NULL, 'system', p_account_key, p_currency);
  END IF;

  IF p_account_key ~ '^org:[0-9a-fA-F-]{36}:(digital|cash)$' THEN
    v_org_id := (regexp_match(p_account_key, '^org:([0-9a-fA-F-]{36}):'))[1]::UUID;
    v_id := rides._ensure_payment_account(NULL, 'org', p_account_key, p_currency);
    UPDATE rides.payment_accounts
      SET organization_id = v_org_id
      WHERE id = v_id AND organization_id IS NULL;
    RETURN v_id;
  END IF;

  IF p_account_key ~ '^user:[0-9a-fA-F-]{36}:driver:(digital|cash|debt)$' THEN
    v_user_id := (regexp_match(p_account_key, '^user:([0-9a-fA-F-]{36}):driver:'))[1]::UUID;
    RETURN rides._ensure_payment_account(v_user_id, 'driver', p_account_key, p_currency);
  END IF;

  IF p_account_key ~ '^user:[0-9a-fA-F-]{36}:rider$' THEN
    v_user_id := (regexp_match(p_account_key, '^user:([0-9a-fA-F-]{36}):rider$'))[1]::UUID;
    RETURN rides._ensure_payment_account(v_user_id, 'rider', p_account_key, p_currency);
  END IF;

  IF p_account_key ~ '^user:[0-9a-fA-F-]{36}:driver$' THEN
    v_user_id := (regexp_match(p_account_key, '^user:([0-9a-fA-F-]{36}):driver$'))[1]::UUID;
    RETURN rides._ensure_payment_account(v_user_id, 'driver', p_account_key, p_currency);
  END IF;

  SELECT id INTO v_id
  FROM rides.payment_accounts
  WHERE account_key = p_account_key
    AND currency = p_currency;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'account_not_found:%', p_account_key;
  END IF;

  RETURN v_id;
END;
$$;
