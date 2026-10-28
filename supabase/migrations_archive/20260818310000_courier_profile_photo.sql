-- Courier onboarding profile photo (stored in courier-documents/{userId}/avatars)
ALTER TABLE delivery.courier_profiles
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
