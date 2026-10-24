-- Plug role is stamped once, at account creation. Later edits to user_metadata.app do nothing.
-- Push subscriptions and pin receipts stay in the Plug account. The place directory stores neither.

CREATE TABLE IF NOT EXISTS explorer.signup_intent (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer.push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS explorer.pin_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES explorer.profile(user_id) ON DELETE CASCADE,
  place_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, place_id)
);

CREATE INDEX IF NOT EXISTS explorer_pin_receipt_place_idx ON explorer.pin_receipt (place_id);

ALTER TABLE explorer.signup_intent ENABLE ROW LEVEL SECURITY;
ALTER TABLE explorer.push_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE explorer.pin_receipt ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON explorer.signup_intent, explorer.push_subscription, explorer.pin_receipt FROM PUBLIC, anon, authenticated;
GRANT ALL ON explorer.signup_intent, explorer.push_subscription, explorer.pin_receipt TO service_role;

CREATE OR REPLACE FUNCTION explorer.stamp_plug_signup_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = explorer, auth, public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM explorer.signup_intent WHERE user_id = NEW.id) THEN
    IF COALESCE(NEW.raw_app_meta_data->>'role', '') = '' THEN
      NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', 'explorer_user');
    END IF;
    DELETE FROM explorer.signup_intent WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION explorer.stamp_plug_signup_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_plug_signup_role ON auth.users;
CREATE TRIGGER stamp_plug_signup_role
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION explorer.stamp_plug_signup_role();

-- Accounts that already signed up as Plug, and still have no server role, get explorer_user.
-- Never copy platform_owner out of editable profile data.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'explorer_user')
WHERE COALESCE(raw_app_meta_data->>'role', '') = ''
  AND raw_user_meta_data->>'app' = 'plug';
