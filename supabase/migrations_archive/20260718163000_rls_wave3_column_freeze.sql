-- RLS Wave 3: freeze admin-only columns on owner INSERT/UPDATE

-- Ensure driver suspend columns exist (may be missing if prior migration unapplied)
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_reason TEXT,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- public.driver_profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Drivers can insert own profile" ON public.driver_profiles;
CREATE POLICY "Drivers can insert own profile"
  ON public.driver_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND COALESCE(onboarding_complete, FALSE) = FALSE
    AND background_check_status IS NULL
    AND suspended_at IS NULL
    AND deactivated_at IS NULL
  );

DROP POLICY IF EXISTS "Drivers can update own profile" ON public.driver_profiles;
CREATE POLICY "Drivers can update own profile"
  ON public.driver_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status IS NOT DISTINCT FROM (SELECT p.status FROM public.driver_profiles p WHERE p.id = driver_profiles.id)
    AND fleet_id IS NOT DISTINCT FROM (SELECT p.fleet_id FROM public.driver_profiles p WHERE p.id = driver_profiles.id)
    AND background_check_status IS NOT DISTINCT FROM (SELECT p.background_check_status FROM public.driver_profiles p WHERE p.id = driver_profiles.id)
    AND suspended_at IS NOT DISTINCT FROM (SELECT p.suspended_at FROM public.driver_profiles p WHERE p.id = driver_profiles.id)
    AND deactivated_at IS NOT DISTINCT FROM (SELECT p.deactivated_at FROM public.driver_profiles p WHERE p.id = driver_profiles.id)
  );

-- ---------------------------------------------------------------------------
-- delivery.courier_profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Couriers can insert own profile" ON delivery.courier_profiles;
CREATE POLICY "Couriers can insert own profile"
  ON delivery.courier_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND onboarding_complete = FALSE
    AND background_check_status IS NULL
    AND approved_at IS NULL
    AND suspended_at IS NULL
    AND deactivated_at IS NULL
  );

DROP POLICY IF EXISTS "Couriers can update own profile" ON delivery.courier_profiles;
CREATE POLICY "Couriers can update own profile"
  ON delivery.courier_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status IS NOT DISTINCT FROM (SELECT c.status FROM delivery.courier_profiles c WHERE c.user_id = courier_profiles.user_id)
    AND background_check_status IS NOT DISTINCT FROM (SELECT c.background_check_status FROM delivery.courier_profiles c WHERE c.user_id = courier_profiles.user_id)
    AND approved_at IS NOT DISTINCT FROM (SELECT c.approved_at FROM delivery.courier_profiles c WHERE c.user_id = courier_profiles.user_id)
    AND suspended_at IS NOT DISTINCT FROM (SELECT c.suspended_at FROM delivery.courier_profiles c WHERE c.user_id = courier_profiles.user_id)
    AND deactivated_at IS NOT DISTINCT FROM (SELECT c.deactivated_at FROM delivery.courier_profiles c WHERE c.user_id = courier_profiles.user_id)
  );

-- ---------------------------------------------------------------------------
-- delivery.merchants — split FOR ALL into insert + update with freezes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Merchants editable by owner" ON delivery.merchants;

CREATE POLICY "Merchants insert own row"
  ON delivery.merchants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Merchants update own editable fields"
  ON delivery.merchants
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND verification_status IS NOT DISTINCT FROM (SELECT m2.verification_status FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND operational_status IS NOT DISTINCT FROM (SELECT m2.operational_status FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND commission_rate IS NOT DISTINCT FROM (SELECT m2.commission_rate FROM delivery.merchants m2 WHERE m2.id = merchants.id)
    AND suspended_at IS NOT DISTINCT FROM (SELECT m2.suspended_at FROM delivery.merchants m2 WHERE m2.id = merchants.id)
  );

CREATE POLICY "Merchants delete own row"
  ON delivery.merchants
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- Keep SELECT policy "Merchants viewable by all" unchanged.

-- ---------------------------------------------------------------------------
-- delivery.customers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers own data" ON delivery.customers;

CREATE POLICY "Customers select own data"
  ON delivery.customers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Customers insert own row"
  ON delivery.customers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Customers update own editable fields"
  ON delivery.customers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND account_status IS NOT DISTINCT FROM (SELECT c2.account_status FROM delivery.customers c2 WHERE c2.id = customers.id)
    AND suspended_at IS NOT DISTINCT FROM (SELECT c2.suspended_at FROM delivery.customers c2 WHERE c2.id = customers.id)
  );

CREATE POLICY "Customers delete own row"
  ON delivery.customers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- delivery.merchant_documents — force pending / unverified on client writes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Merchants can insert own documents" ON delivery.merchant_documents;
CREATE POLICY "Merchants can insert own documents"
  ON delivery.merchant_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_documents.merchant_id AND m.owner_id = auth.uid()
    )
    AND status = 'pending'
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

DROP POLICY IF EXISTS "Merchants can update own documents" ON delivery.merchant_documents;
CREATE POLICY "Merchants can update own documents"
  ON delivery.merchant_documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_documents.merchant_id AND m.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    status = 'pending'
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- delivery.orders — freeze money fields on team/owner update
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Team members update orders" ON delivery.orders;
CREATE POLICY "Team members update order status"
  ON delivery.orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = orders.merchant_id AND m.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM delivery.merchant_team_members tm
      WHERE tm.merchant_id = orders.merchant_id
        AND tm.user_id = auth.uid()
        AND 'orders' = ANY(tm.permissions)
    )
  )
  WITH CHECK (
    total IS NOT DISTINCT FROM (SELECT o2.total FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND subtotal IS NOT DISTINCT FROM (SELECT o2.subtotal FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND tax IS NOT DISTINCT FROM (SELECT o2.tax FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND tip IS NOT DISTINCT FROM (SELECT o2.tip FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND discount IS NOT DISTINCT FROM (SELECT o2.discount FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND platform_fee IS NOT DISTINCT FROM (SELECT o2.platform_fee FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND delivery_fee IS NOT DISTINCT FROM (SELECT o2.delivery_fee FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND payment_status IS NOT DISTINCT FROM (SELECT o2.payment_status FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND merchant_id IS NOT DISTINCT FROM (SELECT o2.merchant_id FROM delivery.orders o2 WHERE o2.id = orders.id)
    AND customer_id IS NOT DISTINCT FROM (SELECT o2.customer_id FROM delivery.orders o2 WHERE o2.id = orders.id)
  );

-- ---------------------------------------------------------------------------
-- rides.rider_profiles — column grants + freeze admin fields
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON rides.rider_profiles FROM authenticated;
GRANT UPDATE (
  display_name,
  phone,
  updated_at,
  default_sharing_preference,
  share_all_trips,
  night_trips_only
) ON rides.rider_profiles TO authenticated;

DROP POLICY IF EXISTS rides_rider_profiles_own_update ON rides.rider_profiles;
CREATE POLICY rides_rider_profiles_own_update ON rides.rider_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND account_status IS NOT DISTINCT FROM (SELECT r.account_status FROM rides.rider_profiles r WHERE r.user_id = rider_profiles.user_id)
    AND suspended_at IS NOT DISTINCT FROM (SELECT r.suspended_at FROM rides.rider_profiles r WHERE r.user_id = rider_profiles.user_id)
    AND suspended_by IS NOT DISTINCT FROM (SELECT r.suspended_by FROM rides.rider_profiles r WHERE r.user_id = rider_profiles.user_id)
    AND suspended_reason IS NOT DISTINCT FROM (SELECT r.suspended_reason FROM rides.rider_profiles r WHERE r.user_id = rider_profiles.user_id)
  );

NOTIFY pgrst, 'reload schema';
