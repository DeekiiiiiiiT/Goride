-- Research engine Rev 5.6 (docs/research-engine-audit.md §21, RE-67): the catalogue's whole version row.
--
-- The browser check shows the row exactly as the catalogue lists it (Model · Engine · Prod period · Grade · Transm),
-- so the owner matches it by eye. Dominion's own values differ from the catalogue's (grade "Custom G" vs "CTMG",
-- build end 08.2020 vs 09.2020), so the catalogue's words are stored with the remembered version.
-- Additive only: four nullable text columns.

ALTER TABLE public.research_car_site_version
  ADD COLUMN IF NOT EXISTS engine text CHECK (engine IS NULL OR length(engine) <= 30),
  ADD COLUMN IF NOT EXISTS prod_period text CHECK (prod_period IS NULL OR length(prod_period) <= 40),
  ADD COLUMN IF NOT EXISTS grade text CHECK (grade IS NULL OR length(grade) <= 30),
  ADD COLUMN IF NOT EXISTS transmission text CHECK (transmission IS NULL OR length(transmission) <= 30);

COMMENT ON COLUMN public.research_car_site_version.prod_period IS
  'RE-67: the version''s build period as the catalogue writes it, e.g. "11.2016 - 09.2020".';
