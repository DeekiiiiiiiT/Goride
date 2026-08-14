-- Freight-forwarder master company → optional Jamaica/mailbox courier company.
ALTER TABLE public.intake_warehouse_catalog
  ADD COLUMN IF NOT EXISTS linked_courier_catalog_id UUID
    REFERENCES public.intake_courier_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_intake_warehouse_linked_courier
  ON public.intake_warehouse_catalog (linked_courier_catalog_id)
  WHERE linked_courier_catalog_id IS NOT NULL;

COMMENT ON COLUMN public.intake_warehouse_catalog.linked_courier_catalog_id IS
  'Optional courier company this FF operates with in Jamaica (e.g. Complete Sourcing USA → Complete Sourcing JA).';
