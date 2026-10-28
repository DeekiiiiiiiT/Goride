-- Dash Courier soft-launch: orders courier RLS, assigned status, offers, storage, proofs, FKs

-- ---------------------------------------------------------------------------
-- 1) Order status: add `assigned` (courier claimed, not yet picked up)
-- ---------------------------------------------------------------------------
ALTER TABLE delivery.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE delivery.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'placed', 'accepted', 'preparing', 'ready', 'assigned',
    'picked_up', 'in_transit', 'delivered', 'completed', 'cancelled', 'paid'
  ));

ALTER TABLE delivery.orders
  ADD COLUMN IF NOT EXISTS age_verify_photo_url text,
  ADD COLUMN IF NOT EXISTS pickup_photo_url text,
  ADD COLUMN IF NOT EXISTS delivery_photo_url text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2) Courier RLS on delivery.orders (SELECT pool + assigned; UPDATE with money freeze)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS orders_courier_select ON delivery.orders;
CREATE POLICY orders_courier_select ON delivery.orders
  FOR SELECT TO authenticated
  USING (
    courier_id = (SELECT auth.uid())
    OR (
      status = 'ready'
      AND courier_id IS NULL
      AND EXISTS (
        SELECT 1 FROM delivery.courier_profiles cp
        WHERE cp.user_id = (SELECT auth.uid())
          AND cp.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS orders_courier_update ON delivery.orders;
CREATE POLICY orders_courier_update ON delivery.orders
  FOR UPDATE TO authenticated
  USING (
    courier_id = (SELECT auth.uid())
    OR (
      status = 'ready'
      AND courier_id IS NULL
      AND EXISTS (
        SELECT 1 FROM delivery.courier_profiles cp
        WHERE cp.user_id = (SELECT auth.uid())
          AND cp.status = 'active'
      )
    )
  )
  WITH CHECK (
    courier_id = (SELECT auth.uid())
    AND total IS NOT DISTINCT FROM (SELECT o2.total FROM delivery.orders o2 WHERE o2.id = orders.id)
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

-- Couriers may insert order_events for their assigned orders
DROP POLICY IF EXISTS order_events_courier_insert ON delivery.order_events;
CREATE POLICY order_events_courier_insert ON delivery.order_events
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_type = 'courier'
    AND actor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM delivery.orders o
      WHERE o.id = order_events.order_id
        AND o.courier_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS order_events_courier_select ON delivery.order_events;
CREATE POLICY order_events_courier_select ON delivery.order_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM delivery.orders o
      WHERE o.id = order_events.order_id
        AND o.courier_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3) courier_offers (rides driver_offers pattern)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery.courier_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  courier_user_id uuid NOT NULL REFERENCES delivery.courier_profiles(user_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'declined', 'expired', 'superseded'
  )),
  wave integer NOT NULL DEFAULT 1,
  rank_score numeric(14, 6),
  distance_km numeric(14, 6),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, courier_user_id, wave)
);

CREATE INDEX IF NOT EXISTS idx_courier_offers_order ON delivery.courier_offers(order_id);
CREATE INDEX IF NOT EXISTS idx_courier_offers_courier_pending
  ON delivery.courier_offers(courier_user_id, status)
  WHERE status = 'pending';

ALTER TABLE delivery.courier_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courier_offers_select_own ON delivery.courier_offers;
CREATE POLICY courier_offers_select_own ON delivery.courier_offers
  FOR SELECT TO authenticated
  USING (courier_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS courier_offers_update_own ON delivery.courier_offers;
CREATE POLICY courier_offers_update_own ON delivery.courier_offers
  FOR UPDATE TO authenticated
  USING (courier_user_id = (SELECT auth.uid()))
  WITH CHECK (courier_user_id = (SELECT auth.uid()));

GRANT SELECT, UPDATE ON delivery.courier_offers TO authenticated;
GRANT ALL ON delivery.courier_offers TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE delivery.courier_offers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Delivery issues / proof tickets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery.courier_delivery_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES delivery.orders(id) ON DELETE CASCADE,
  courier_user_id uuid NOT NULL REFERENCES delivery.courier_profiles(user_id) ON DELETE CASCADE,
  issue_type text NOT NULL,
  notes text,
  photo_url text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_courier_delivery_issues_order
  ON delivery.courier_delivery_issues(order_id);
CREATE INDEX IF NOT EXISTS idx_courier_delivery_issues_courier
  ON delivery.courier_delivery_issues(courier_user_id);

ALTER TABLE delivery.courier_delivery_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courier_delivery_issues_select_own ON delivery.courier_delivery_issues;
CREATE POLICY courier_delivery_issues_select_own ON delivery.courier_delivery_issues
  FOR SELECT TO authenticated
  USING (courier_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS courier_delivery_issues_insert_own ON delivery.courier_delivery_issues;
CREATE POLICY courier_delivery_issues_insert_own ON delivery.courier_delivery_issues
  FOR INSERT TO authenticated
  WITH CHECK (
    courier_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM delivery.orders o
      WHERE o.id = courier_delivery_issues.order_id
        AND o.courier_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT ON delivery.courier_delivery_issues TO authenticated;
GRANT ALL ON delivery.courier_delivery_issues TO service_role;

-- ---------------------------------------------------------------------------
-- 5) courier-documents storage bucket (own folder)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'courier-documents',
  'courier-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS courier_documents_own_select ON storage.objects;
DROP POLICY IF EXISTS courier_documents_own_insert ON storage.objects;
DROP POLICY IF EXISTS courier_documents_own_update ON storage.objects;
DROP POLICY IF EXISTS courier_documents_own_delete ON storage.objects;

CREATE POLICY courier_documents_own_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'courier-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY courier_documents_own_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'courier-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY courier_documents_own_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'courier-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY courier_documents_own_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'courier-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 6) Identity FKs (best-effort; skip if orphan rows block)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_courier_id_fkey'
  ) THEN
    ALTER TABLE delivery.orders
      ADD CONSTRAINT orders_courier_id_fkey
      FOREIGN KEY (courier_id) REFERENCES delivery.courier_profiles(user_id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courier_availability_driver_id_fkey'
  ) THEN
    ALTER TABLE delivery.courier_availability
      ADD CONSTRAINT courier_availability_driver_id_fkey
      FOREIGN KEY (driver_id) REFERENCES delivery.courier_profiles(user_id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courier_payouts_courier_id_fkey'
  ) THEN
    ALTER TABLE payments.courier_payouts
      ADD CONSTRAINT courier_payouts_courier_id_fkey
      FOREIGN KEY (courier_id) REFERENCES delivery.courier_profiles(user_id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 7) Realtime: courier_availability for admin/customer live presence (optional)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE delivery.courier_availability;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
