-- Courier profiles and compliance tables for Roam Dash Courier admin

CREATE TABLE IF NOT EXISTS delivery.courier_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'deactivated')),
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  vehicle_type TEXT,
  background_check_status TEXT
    CHECK (background_check_status IN ('pending', 'approved', 'rejected', 'expired')),
  documents_verified_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating NUMERIC DEFAULT 0,
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  acceptance_rate_pct NUMERIC,
  completion_rate_pct NUMERIC,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deactivated_at TIMESTAMPTZ,
  deactivated_reason TEXT,
  deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery.courier_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES delivery.courier_profiles(user_id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('drivers_license', 'insurance', 'background_check', 'other')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  file_url TEXT,
  expiry_date DATE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery.courier_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES delivery.courier_profiles(user_id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER CHECK (year >= 1990 AND year <= 2100),
  color TEXT,
  license_plate TEXT NOT NULL,
  vehicle_type TEXT,
  insurance_expiry DATE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'maintenance', 'decommissioned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery.courier_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_profiles_status ON delivery.courier_profiles(status);
CREATE INDEX IF NOT EXISTS idx_courier_documents_user ON delivery.courier_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_courier_documents_type ON delivery.courier_documents(user_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_courier_vehicles_user ON delivery.courier_vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_courier_audit_courier ON delivery.courier_audit_events(courier_user_id);
CREATE INDEX IF NOT EXISTS idx_courier_audit_created ON delivery.courier_audit_events(created_at DESC);

ALTER TABLE delivery.courier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.courier_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.courier_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.courier_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couriers can view own profile"
  ON delivery.courier_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Couriers can update own profile"
  ON delivery.courier_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Couriers can insert own profile"
  ON delivery.courier_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access courier profiles"
  ON delivery.courier_profiles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Couriers can view own documents"
  ON delivery.courier_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Couriers can manage own documents"
  ON delivery.courier_documents FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access courier documents"
  ON delivery.courier_documents FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Couriers can view own vehicles"
  ON delivery.courier_vehicles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Couriers can manage own vehicles"
  ON delivery.courier_vehicles FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access courier vehicles"
  ON delivery.courier_vehicles FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access courier audit"
  ON delivery.courier_audit_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON delivery.courier_profiles TO authenticated, service_role;
GRANT ALL ON delivery.courier_documents TO authenticated, service_role;
GRANT ALL ON delivery.courier_vehicles TO authenticated, service_role;
GRANT ALL ON delivery.courier_audit_events TO authenticated, service_role;

DROP TRIGGER IF EXISTS update_courier_profiles_updated_at ON delivery.courier_profiles;
CREATE TRIGGER update_courier_profiles_updated_at
  BEFORE UPDATE ON delivery.courier_profiles
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

DROP TRIGGER IF EXISTS update_courier_documents_updated_at ON delivery.courier_documents;
CREATE TRIGGER update_courier_documents_updated_at
  BEFORE UPDATE ON delivery.courier_documents
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

DROP TRIGGER IF EXISTS update_courier_vehicles_updated_at ON delivery.courier_vehicles;
CREATE TRIGGER update_courier_vehicles_updated_at
  BEFORE UPDATE ON delivery.courier_vehicles
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

COMMENT ON TABLE delivery.courier_profiles IS 'Courier workforce profiles for Roam Dash delivery';
COMMENT ON TABLE delivery.courier_documents IS 'Compliance documents (license, insurance) for couriers';
COMMENT ON TABLE delivery.courier_vehicles IS 'Registered delivery vehicles for couriers';
COMMENT ON TABLE delivery.courier_audit_events IS 'Admin audit trail for courier lifecycle actions';
