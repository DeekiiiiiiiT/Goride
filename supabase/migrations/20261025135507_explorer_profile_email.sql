-- Google sign-in has an email and a name, and often no phone.

ALTER TABLE explorer.profile ADD COLUMN IF NOT EXISTS email text;
