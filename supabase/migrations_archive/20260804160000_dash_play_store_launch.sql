-- Play Store launch trackers for Roam Rush (customer) and Roam Rush Courier.

CREATE TABLE IF NOT EXISTS public.dash_courier_play_store_launch (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_safety_notes TEXT,
  data_safety_rows JSONB,
  data_safety_imported_at TIMESTAMPTZ,
  data_safety_source_hash TEXT,
  data_safety_template_version TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

INSERT INTO public.dash_courier_play_store_launch (id, checklist)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.dash_courier_play_store_launch ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dash_courier_play_store_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name TEXT NOT NULL,
  version_code INTEGER NOT NULL CHECK (version_code >= 1),
  track TEXT NOT NULL CHECK (track IN ('internal', 'closed', 'open', 'production')),
  uploaded_at DATE NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dash_courier_play_store_releases_uploaded
  ON public.dash_courier_play_store_releases (uploaded_at DESC, created_at DESC);

ALTER TABLE public.dash_courier_play_store_releases ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dash_courier_play_store_launch TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dash_courier_play_store_releases TO service_role;

CREATE TABLE IF NOT EXISTS public.dash_customer_play_store_launch (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_safety_notes TEXT,
  data_safety_rows JSONB,
  data_safety_imported_at TIMESTAMPTZ,
  data_safety_source_hash TEXT,
  data_safety_template_version TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

INSERT INTO public.dash_customer_play_store_launch (id, checklist)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.dash_customer_play_store_launch ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dash_customer_play_store_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name TEXT NOT NULL,
  version_code INTEGER NOT NULL CHECK (version_code >= 1),
  track TEXT NOT NULL CHECK (track IN ('internal', 'closed', 'open', 'production')),
  uploaded_at DATE NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dash_customer_play_store_releases_uploaded
  ON public.dash_customer_play_store_releases (uploaded_at DESC, created_at DESC);

ALTER TABLE public.dash_customer_play_store_releases ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dash_customer_play_store_launch TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dash_customer_play_store_releases TO service_role;

NOTIFY pgrst, 'reload schema';
