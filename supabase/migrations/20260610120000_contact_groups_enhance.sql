-- Contact groups: emoji, color, system defaults, pinning

ALTER TABLE rides.rider_contact_groups
  ADD COLUMN IF NOT EXISTS emoji TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

CREATE OR REPLACE VIEW public.rides_rider_contact_groups AS
  SELECT * FROM rides.rider_contact_groups;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_rider_contact_groups TO service_role;

NOTIFY pgrst, 'reload schema';
