-- V8b: idempotent expense → gct_input_tax source keys + reversal support

ALTER TABLE accounting.gct_input_tax
  ADD COLUMN IF NOT EXISTS source_doc_type TEXT,
  ADD COLUMN IF NOT EXISTS source_doc_id TEXT,
  ADD COLUMN IF NOT EXISTS reversal_of_id UUID REFERENCES accounting.gct_input_tax(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gct_input_tax_source_doc_uidx
  ON accounting.gct_input_tax (source_doc_type, source_doc_id)
  WHERE source_doc_id IS NOT NULL AND reversal_of_id IS NULL;

CREATE OR REPLACE VIEW public.gct_input_tax
  WITH (security_invoker = true) AS
  SELECT * FROM accounting.gct_input_tax;

GRANT SELECT ON public.gct_input_tax TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_input_tax TO service_role;
REVOKE SELECT ON public.gct_input_tax FROM authenticated;

NOTIFY pgrst, 'reload schema';
