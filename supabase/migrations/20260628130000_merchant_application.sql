-- Roam Dash Partner: merchant application fields, documents, notification settings
-- Backward-compatible: all new merchant columns nullable

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS business_registration_number text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS owner_full_name text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS cuisine_types text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS notification_settings jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_owner_id_unique
  ON delivery.merchants(owner_id);

CREATE TABLE IF NOT EXISTS delivery.merchant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES delivery.merchants(id) ON DELETE CASCADE,
  doc_type text NOT NULL
    CHECK (doc_type IN ('id_front', 'id_back', 'proof_of_business')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  file_path text NOT NULL,
  rejection_reason text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_merchant_documents_merchant
  ON delivery.merchant_documents(merchant_id);

ALTER TABLE delivery.merchant_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own documents"
  ON delivery.merchant_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_documents.merchant_id AND m.owner_id = auth.uid()
    )
  );

CREATE POLICY "Merchants can insert own documents"
  ON delivery.merchant_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_documents.merchant_id AND m.owner_id = auth.uid()
    )
  );

CREATE POLICY "Merchants can update own documents"
  ON delivery.merchant_documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants m
      WHERE m.id = merchant_documents.merchant_id AND m.owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access merchant documents"
  ON delivery.merchant_documents FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

GRANT ALL ON delivery.merchant_documents TO authenticated, service_role;

DROP TRIGGER IF EXISTS update_merchant_documents_updated_at ON delivery.merchant_documents;
CREATE TRIGGER update_merchant_documents_updated_at
  BEFORE UPDATE ON delivery.merchant_documents
  FOR EACH ROW EXECUTE FUNCTION delivery.set_updated_at();

COMMENT ON TABLE delivery.merchant_documents IS 'KYC documents for merchant partner applications';

-- Private storage bucket for merchant KYC (configure via Supabase dashboard or storage migration)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'merchant-documents',
  'merchant-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;
