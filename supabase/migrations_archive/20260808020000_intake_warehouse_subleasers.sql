-- Individual sub-leasers linked to a master Florida lease holder (not free-text notes).
CREATE TABLE IF NOT EXISTS public.intake_warehouse_subleasers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES public.intake_warehouse_catalog(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intake_warehouse_subleasers_catalog_name_unique UNIQUE (catalog_id, name)
);

CREATE INDEX IF NOT EXISTS idx_intake_warehouse_subleasers_catalog
  ON public.intake_warehouse_subleasers (catalog_id, sort_order, name);

COMMENT ON TABLE public.intake_warehouse_subleasers IS
  'Named couriers / consolidators that share a master lease holder terminal.';

ALTER TABLE public.intake_warehouse_subleasers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intake_warehouse_subleasers_no_direct_access" ON public.intake_warehouse_subleasers;
CREATE POLICY "intake_warehouse_subleasers_no_direct_access"
  ON public.intake_warehouse_subleasers FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Keep catalog.known_subleasers in sync for simple display consumers
CREATE OR REPLACE FUNCTION public.sync_intake_catalog_subleaser_notes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
BEGIN
  target_id := COALESCE(NEW.catalog_id, OLD.catalog_id);
  UPDATE public.intake_warehouse_catalog c
  SET
    known_subleasers = (
      SELECT string_agg(s.name, ', ' ORDER BY s.sort_order, s.name)
      FROM public.intake_warehouse_subleasers s
      WHERE s.catalog_id = target_id AND s.status = 'active'
    ),
    updated_at = now()
  WHERE c.id = target_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_intake_catalog_subleaser_notes ON public.intake_warehouse_subleasers;
CREATE TRIGGER trg_sync_intake_catalog_subleaser_notes
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_warehouse_subleasers
  FOR EACH ROW EXECUTE FUNCTION public.sync_intake_catalog_subleaser_notes();

-- Seed linked rows from the known four terminals (idempotent by unique name per catalog)
INSERT INTO public.intake_warehouse_subleasers (catalog_id, name, sort_order)
SELECT c.id, v.name, v.sort_order
FROM public.intake_warehouse_catalog c
JOIN (
  VALUES
    ('COMPLETE_SOURCING', 'Complete Sourcing', 1),
    ('COMPLETE_SOURCING', 'BShip''D Couriers', 2),
    ('COMPLETE_SOURCING', 'Sueños Shipping', 3),
    ('RELIABLE_COURIER', 'Reliable Courier', 1),
    ('RELIABLE_COURIER', 'Rocketship Courier Services', 2),
    ('MD_COURIER', 'MD Courier', 1),
    ('MD_COURIER', 'Independent small-scale cargo agents', 2),
    ('ALL_THINGS_JA', 'All Things Ja', 1),
    ('ALL_THINGS_JA', 'Boutique barrel/e-commerce consolidators', 2)
) AS v(code, name, sort_order) ON c.code = v.code
ON CONFLICT (catalog_id, name) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Refresh denormalized notes from linked rows
UPDATE public.intake_warehouse_catalog c
SET known_subleasers = (
  SELECT string_agg(s.name, ', ' ORDER BY s.sort_order, s.name)
  FROM public.intake_warehouse_subleasers s
  WHERE s.catalog_id = c.id AND s.status = 'active'
),
updated_at = now();
