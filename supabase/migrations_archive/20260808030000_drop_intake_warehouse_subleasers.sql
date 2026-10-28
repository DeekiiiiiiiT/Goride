-- Remove Dominion-managed sub-leaser rows; Enterprise orgs claim lease holders themselves.
DROP TRIGGER IF EXISTS trg_sync_intake_catalog_subleaser_notes ON public.intake_warehouse_subleasers;
DROP FUNCTION IF EXISTS public.sync_intake_catalog_subleaser_notes();
DROP TABLE IF EXISTS public.intake_warehouse_subleasers;

ALTER TABLE public.intake_warehouse_catalog
  DROP COLUMN IF EXISTS known_subleasers;
