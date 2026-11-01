ALTER TABLE public.interchange_fitment_rule DROP CONSTRAINT IF EXISTS interchange_fitment_rule_source_check;
ALTER TABLE public.interchange_fitment_rule ADD CONSTRAINT interchange_fitment_rule_source_check CHECK (source IN ('manual', 'oem_catalog', 'supplier', 'install_confirmed', 'import', 'listing'));
CREATE TABLE IF NOT EXISTS public.part_listing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interchange_group_id uuid NOT NULL REFERENCES public.part_interchange_group(id) ON DELETE CASCADE,
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  position text,
  year_from integer,
  year_to integer,
  evidence_url text NOT NULL,
  note text,
  verified_by uuid,
  verified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_listing_evidence_check CHECK (btrim(evidence_url) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS part_listing_variant_position ON public.part_listing (interchange_group_id, vehicle_catalog_id, COALESCE(position, ''));
CREATE INDEX IF NOT EXISTS part_listing_variant_idx ON public.part_listing (vehicle_catalog_id);
CREATE TABLE IF NOT EXISTS public.part_listing_exclusion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interchange_group_id uuid NOT NULL REFERENCES public.part_interchange_group(id) ON DELETE CASCADE,
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog(id) ON DELETE CASCADE,
  reason text NOT NULL,
  evidence_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_listing_exclusion_evidence_check CHECK (btrim(evidence_url) <> ''),
  UNIQUE (interchange_group_id, vehicle_catalog_id)
);
ALTER TABLE public.part_listing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_listing_exclusion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS part_listing_no_direct_access ON public.part_listing;
CREATE POLICY part_listing_no_direct_access ON public.part_listing USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS part_listing_exclusion_no_direct_access ON public.part_listing_exclusion;
CREATE POLICY part_listing_exclusion_no_direct_access ON public.part_listing_exclusion USING (false) WITH CHECK (false);
GRANT ALL ON TABLE public.part_listing TO service_role;
GRANT ALL ON TABLE public.part_listing_exclusion TO service_role;
REVOKE ALL ON TABLE public.part_listing FROM anon, authenticated;
REVOKE ALL ON TABLE public.part_listing_exclusion FROM anon, authenticated;
