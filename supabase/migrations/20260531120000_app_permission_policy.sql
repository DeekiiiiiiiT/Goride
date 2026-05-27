-- App permission policy (admin toggles for rider/driver permission UX).

CREATE TABLE IF NOT EXISTS rides.app_permission_policy (
  surface TEXT NOT NULL CHECK (surface IN ('rider', 'driver')),
  permission_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  prompt_onboarding BOOLEAN NOT NULL DEFAULT FALSE,
  block_until_granted BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  PRIMARY KEY (surface, permission_key)
);

COMMENT ON TABLE rides.app_permission_policy IS
  'Global permission UX policy (Enabled / Prompt / Block). Does not grant OS permissions on devices.';

-- Rider defaults
INSERT INTO rides.app_permission_policy (surface, permission_key, enabled, prompt_onboarding, block_until_granted)
VALUES
  ('rider', 'location_precise_while_using', TRUE, TRUE, FALSE),
  ('rider', 'location_always', TRUE, FALSE, FALSE),
  ('rider', 'notifications', TRUE, TRUE, FALSE),
  ('rider', 'location_bluetooth_assist', TRUE, FALSE, FALSE),
  ('rider', 'microphone_in_app_call', TRUE, FALSE, FALSE),
  ('rider', 'phone_in_app_call', TRUE, FALSE, FALSE),
  ('rider', 'camera_profile', TRUE, FALSE, FALSE),
  ('rider', 'contacts_split_fare', TRUE, FALSE, FALSE),
  ('rider', 'motion_activity', TRUE, FALSE, FALSE),
  ('rider', 'app_tracking', TRUE, FALSE, FALSE)
ON CONFLICT (surface, permission_key) DO NOTHING;

-- Driver defaults
INSERT INTO rides.app_permission_policy (surface, permission_key, enabled, prompt_onboarding, block_until_granted)
VALUES
  ('driver', 'location_precise_while_using', TRUE, TRUE, TRUE),
  ('driver', 'location_background_always', TRUE, TRUE, FALSE),
  ('driver', 'notifications', TRUE, TRUE, TRUE),
  ('driver', 'foreground_service_location', TRUE, TRUE, FALSE),
  ('driver', 'battery_optimization_exempt', TRUE, TRUE, FALSE),
  ('driver', 'full_screen_intent_offers', TRUE, TRUE, FALSE),
  ('driver', 'microphone_in_app_call', TRUE, FALSE, FALSE),
  ('driver', 'phone_in_app_call', TRUE, FALSE, FALSE),
  ('driver', 'camera_documents', TRUE, FALSE, FALSE),
  ('driver', 'storage_cache_maps', TRUE, FALSE, FALSE),
  ('driver', 'activity_recognition', TRUE, FALSE, FALSE),
  ('driver', 'bluetooth_headset', TRUE, FALSE, FALSE)
ON CONFLICT (surface, permission_key) DO NOTHING;

ALTER TABLE rides.app_permission_policy ENABLE ROW LEVEL SECURITY;

DROP VIEW IF EXISTS public.rides_app_permission_policy;
CREATE OR REPLACE VIEW public.rides_app_permission_policy AS
  SELECT * FROM rides.app_permission_policy;

GRANT SELECT, INSERT, UPDATE ON public.rides_app_permission_policy TO service_role;

NOTIFY pgrst, 'reload schema';
