-- RoamFleet × Roam Rush Phase 0: plural service lines per organization

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS service_lines text[] NOT NULL DEFAULT ARRAY['rideshare'];

COMMENT ON COLUMN public.organizations.service_lines IS
  'Operational service lines: rideshare, rush_delivery. Primary business_type kept for backward compat.';

-- Backfill from business_type where still default-only
UPDATE public.organizations o
SET service_lines = CASE
  WHEN o.business_type = 'delivery' THEN ARRAY['rush_delivery']::text[]
  WHEN o.business_type IN ('rideshare', 'taxi') THEN ARRAY['rideshare']::text[]
  ELSE ARRAY['rideshare']::text[]
END
WHERE o.service_lines = ARRAY['rideshare']::text[]
  AND o.business_type IS NOT NULL
  AND o.business_type <> 'rideshare';

CREATE INDEX IF NOT EXISTS idx_organizations_service_lines
  ON public.organizations USING gin (service_lines);
