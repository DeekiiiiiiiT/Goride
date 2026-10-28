-- Storage audit Waves 0–2: version buckets + lock merchant-assets + Haul readiness
-- Wave 0 policies already applied on prod; this migration is idempotent for all envs.

-- Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('merchant-assets', 'merchant-assets', true, 5242880,
   ARRAY['image/jpeg','image/png','image/webp']),
  ('merchant-documents', 'merchant-documents', false, 10485760,
   ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('make-37f42386-docs', 'make-37f42386-docs', false, 10485760, NULL),
  ('make-37f42386-vehicles', 'make-37f42386-vehicles', false, 10485760, NULL),
  ('driver-photos', 'driver-photos', false, 5242880,
   ARRAY['image/jpeg','image/png','image/webp']),
  ('driver-documents', 'driver-documents', false, 10485760,
   ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('ephemeral-evidence', 'ephemeral-evidence', false, 5242880,
   ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop legacy loose merchant-assets policies (names from Dashboard auto-create)
DROP POLICY IF EXISTS "Authenticated users can delete pfrh9k_0" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete pfrh9k_1" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update pfrh9k_0" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update pfrh9k_1" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload pfrh9k_0" ON storage.objects;

-- merchant-assets: public read only (writes via Edge Function + service_role)
DROP POLICY IF EXISTS "merchant_assets_public_read" ON storage.objects;
CREATE POLICY "merchant_assets_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'merchant-assets');

-- driver-photos: own folder only
DROP POLICY IF EXISTS "driver_photos_own_select" ON storage.objects;
DROP POLICY IF EXISTS "driver_photos_own_insert" ON storage.objects;
DROP POLICY IF EXISTS "driver_photos_own_update" ON storage.objects;
DROP POLICY IF EXISTS "driver_photos_own_delete" ON storage.objects;

CREATE POLICY "driver_photos_own_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'driver-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "driver_photos_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'driver-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "driver_photos_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'driver-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "driver_photos_own_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'driver-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- driver-documents: own folder only
DROP POLICY IF EXISTS "driver_documents_own_select" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_own_insert" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_own_update" ON storage.objects;
DROP POLICY IF EXISTS "driver_documents_own_delete" ON storage.objects;

CREATE POLICY "driver_documents_own_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "driver_documents_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "driver_documents_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "driver_documents_own_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
