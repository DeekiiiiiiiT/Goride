-- Play Store launch tracker (Roam Rides admin).

CREATE TABLE IF NOT EXISTS rides.play_store_launch (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_safety_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

COMMENT ON TABLE rides.play_store_launch IS 'Singleton Play Console checklist state for Roam Rides.';

INSERT INTO rides.play_store_launch (id, checklist)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE rides.play_store_launch ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS rides.play_store_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name TEXT NOT NULL,
  version_code INTEGER NOT NULL CHECK (version_code >= 1),
  track TEXT NOT NULL CHECK (track IN ('internal', 'closed', 'open', 'production')),
  uploaded_at DATE NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE rides.play_store_releases IS 'Manual log of AAB uploads for Roam Rides Play Console.';

CREATE INDEX IF NOT EXISTS idx_rides_play_store_releases_uploaded
  ON rides.play_store_releases (uploaded_at DESC, created_at DESC);

ALTER TABLE rides.play_store_releases ENABLE ROW LEVEL SECURITY;

DROP VIEW IF EXISTS public.rides_play_store_launch;
CREATE VIEW public.rides_play_store_launch AS
  SELECT * FROM rides.play_store_launch;

DROP VIEW IF EXISTS public.rides_play_store_releases;
CREATE VIEW public.rides_play_store_releases AS
  SELECT * FROM rides.play_store_releases;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_play_store_launch TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_play_store_releases TO service_role;

NOTIFY pgrst, 'reload schema';
