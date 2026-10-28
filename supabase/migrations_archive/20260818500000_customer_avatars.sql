-- Customer profile photos: public read, writes via delivery Edge Function + service_role.

ALTER TABLE delivery.customers
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS avatar_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-avatars',
  'customer-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "customer_avatars_public_read" ON storage.objects;
CREATE POLICY "customer_avatars_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'customer-avatars');
