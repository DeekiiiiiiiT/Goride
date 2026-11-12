-- S1 live: the staff alert phones table, all or nothing, with its logbook line.
BEGIN;
-- S1: per-fleet SMS alert numbers — never auth.users.phone (code review 12 Nov).
-- Lives in platform (next to platform.user_roles): the live API exposes platform, not fleet (checked 12 Nov).

CREATE TABLE platform.staff_alert_phones (
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  phone text NOT NULL CHECK (phone ~ '^\+[0-9]{8,15}$'),
  set_by uuid NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE platform.staff_alert_phones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE platform.staff_alert_phones FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE platform.staff_alert_phones TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261112210943', 'staff_alert_phones') ON CONFLICT (version) DO NOTHING;
COMMIT;
SELECT to_regclass('platform.staff_alert_phones') AS table_created, has_table_privilege('authenticated', 'platform.staff_alert_phones', 'SELECT') AS signed_in_users_can_read;
