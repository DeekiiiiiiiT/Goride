-- Research engine Rev 5.5 (docs/research-engine-audit.md §21, RE-63): remember which catalogue version is this car.
--
-- When the owner confirms a browser check, the catalogue's own name for the car's version (e.g. Amayama
-- "M900A-AGBVE") and that version's page are saved for the car + site. The next browser check for the same car says
-- "click M900A-AGBVE" and its link opens that version directly. Dominion's own model codes can't be used for this:
-- the Roomy rows carry "GBME" (Toyota's X grade) while the Custom G is "AGBVE".
-- Additive only: one new table, deny-all like the other research tables.

CREATE TABLE IF NOT EXISTS public.research_car_site_version (
  vehicle_catalog_id uuid NOT NULL REFERENCES public.vehicle_catalog (id) ON DELETE CASCADE,
  domain text NOT NULL REFERENCES public.trusted_site (domain) ON UPDATE CASCADE ON DELETE CASCADE,
  version_code text NOT NULL CHECK (btrim(version_code) <> '' AND length(version_code) <= 60),
  version_url text CHECK (version_url IS NULL OR version_url ~ '^https://'),
  confirmed_by uuid,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_catalog_id, domain)
);

COMMENT ON TABLE public.research_car_site_version IS
  'RE-63: the catalogue''s own name (and page) for this car''s version on a trusted site, learned from a confirmed browser check.';

ALTER TABLE public.research_car_site_version ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_car_site_version_deny_all ON public.research_car_site_version;
CREATE POLICY research_car_site_version_deny_all ON public.research_car_site_version
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.research_car_site_version FROM anon;
REVOKE ALL ON TABLE public.research_car_site_version FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.research_car_site_version TO service_role;
