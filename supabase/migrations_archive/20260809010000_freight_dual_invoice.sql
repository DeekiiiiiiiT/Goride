-- Dual invoice workflow: warehouse packing slip vs customer commercial invoice
ALTER TABLE freight.packages
  ADD COLUMN IF NOT EXISTS warehouse_invoice_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_invoice_file_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_required_from_customer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_unobtainable_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_unobtainable_by UUID,
  ADD COLUMN IF NOT EXISTS invoice_unobtainable_note TEXT;

COMMENT ON COLUMN freight.packages.invoice_storage_path IS 'Customer/commercial invoice (seal gate)';
COMMENT ON COLUMN freight.packages.warehouse_invoice_storage_path IS 'Optional packing slip from US warehouse intake';
COMMENT ON COLUMN freight.packages.invoice_required_from_customer IS 'Warehouse flagged: courier must request invoice from customer';
COMMENT ON COLUMN freight.packages.invoice_unobtainable_at IS 'Courier marked could not obtain customer invoice (allows seal override)';
