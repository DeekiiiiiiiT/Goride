-- V11: public.gct_* mirrors — security_invoker + lock sensitive grants/RLS
-- F3: reset blank-TRN gct_registered merchants; prevent regression

CREATE OR REPLACE VIEW public.gct_supply_classes
  WITH (security_invoker = true) AS
  SELECT * FROM accounting.gct_supply_classes;

CREATE OR REPLACE VIEW public.gct_rates
  WITH (security_invoker = true) AS
  SELECT * FROM accounting.gct_rates;

CREATE OR REPLACE VIEW public.gct_entities
  WITH (security_invoker = true) AS
  SELECT * FROM accounting.gct_entities;

CREATE OR REPLACE VIEW public.gct_periods
  WITH (security_invoker = true) AS
  SELECT * FROM accounting.gct_periods;

CREATE OR REPLACE VIEW public.gct_output_tax
  WITH (security_invoker = true) AS
  SELECT * FROM accounting.gct_output_tax;

CREATE OR REPLACE VIEW public.gct_input_tax
  WITH (security_invoker = true) AS
  SELECT * FROM accounting.gct_input_tax;

CREATE OR REPLACE VIEW public.gct_engine_flags
  WITH (security_invoker = true) AS
  SELECT * FROM accounting.gct_engine_flags;

GRANT SELECT ON public.gct_supply_classes TO authenticated, service_role;
GRANT SELECT ON public.gct_rates TO authenticated, service_role;
GRANT SELECT ON public.gct_periods TO authenticated, service_role;

REVOKE SELECT ON public.gct_entities FROM authenticated;
REVOKE SELECT ON public.gct_output_tax FROM authenticated;
REVOKE SELECT ON public.gct_input_tax FROM authenticated;
REVOKE SELECT ON public.gct_engine_flags FROM authenticated;

GRANT SELECT ON public.gct_entities TO service_role;
GRANT SELECT ON public.gct_output_tax TO service_role;
GRANT SELECT ON public.gct_input_tax TO service_role;
GRANT SELECT ON public.gct_engine_flags TO service_role;

GRANT INSERT, UPDATE, DELETE ON public.gct_rates TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_entities TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_periods TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_output_tax TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_input_tax TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_engine_flags TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_supply_classes TO service_role;

DROP POLICY IF EXISTS gct_entities_auth_select ON accounting.gct_entities;
DROP POLICY IF EXISTS gct_output_auth_select ON accounting.gct_output_tax;
DROP POLICY IF EXISTS gct_input_auth_select ON accounting.gct_input_tax;

-- F3: stop unlawful collection; clear merchant review queue (keep roam_rush)
UPDATE delivery.merchants
SET gct_registered = false
WHERE gct_registered = true
  AND (tax_id IS NULL OR trim(tax_id) = '');

UPDATE accounting.gct_entities
SET
  needs_review = false,
  notes = trim(both ' |' FROM COALESCE(notes, '') || ' | cleared: blank-TRN reset ' || CURRENT_DATE::text),
  updated_at = now()
WHERE entity_type = 'merchant'
  AND needs_review = true
  AND (trn IS NULL OR length(trim(trn)) = 0);

-- Prevent gct_registered without TRN going forward
ALTER TABLE delivery.merchants
  DROP CONSTRAINT IF EXISTS merchants_gct_registered_requires_tax_id;

ALTER TABLE delivery.merchants
  ADD CONSTRAINT merchants_gct_registered_requires_tax_id
  CHECK (
    gct_registered = false
    OR (tax_id IS NOT NULL AND length(trim(tax_id)) > 0)
  );

NOTIFY pgrst, 'reload schema';
