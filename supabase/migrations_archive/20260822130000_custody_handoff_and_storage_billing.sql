-- Custody release (box leaves the floor) + warehouse→courier storage invoices.
-- Accrue storage days via freight.accrue_storage_days(); pg_cron when available.

-- ---------------------------------------------------------------------------
-- Package status: handed_off
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'freight'
      AND t.relname = 'packages'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE freight.packages DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE freight.packages
  ADD CONSTRAINT packages_status_check
  CHECK (status IN (
    'expected',
    'received_at_warehouse',
    'handed_off',
    'manifested',
    'in_transit_intl',
    'customs_hold',
    'customs_cleared',
    'received_hub',
    'ready_for_fulfillment',
    'out_for_delivery',
    'awaiting_pickup',
    'delivered',
    'collected',
    'exception'
  ));

-- ---------------------------------------------------------------------------
-- Scan event: handoff
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'freight'
      AND t.relname = 'package_scan_events'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE freight.package_scan_events DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE freight.package_scan_events
  ADD CONSTRAINT package_scan_events_event_type_check
  CHECK (event_type IN (
    'pre_alert',
    'received_at_warehouse',
    'handoff',
    'manifested',
    'shipped',
    'arrived_ja',
    'customs_hold',
    'customs_cleared',
    'hub_inbound',
    'sorted',
    'ready_fulfillment',
    'loaded_vehicle',
    'out_for_delivery',
    'delivered',
    'picked_up',
    'exception',
    'note'
  ));

-- ---------------------------------------------------------------------------
-- Storage invoices (warehouse bills courier; paid offline — no gateway)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS freight.warehouse_storage_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  courier_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft', 'issued', 'paid_offline', 'void')),
  currency TEXT NOT NULL DEFAULT 'USD',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_minor BIGINT NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_org_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_freight_wsi_warehouse
  ON freight.warehouse_storage_invoices (warehouse_org_id, status, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_freight_wsi_courier
  ON freight.warehouse_storage_invoices (courier_org_id, status, issued_at DESC);

CREATE TABLE IF NOT EXISTS freight.warehouse_storage_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES freight.warehouse_storage_invoices(id) ON DELETE CASCADE,
  ledger_id UUID REFERENCES freight.warehouse_storage_ledger(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1,
  amount_minor BIGINT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_freight_wsil_invoice
  ON freight.warehouse_storage_invoice_lines (invoice_id, sort_order);

ALTER TABLE freight.warehouse_storage_ledger
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES freight.warehouse_storage_invoices(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_freight_wsl_storage_day_once
  ON freight.warehouse_storage_ledger (package_id, occurred_on)
  WHERE event_type = 'storage_day' AND package_id IS NOT NULL;

COMMENT ON TABLE freight.warehouse_storage_invoices IS
  'Warehouse→courier storage invoices. Status paid_offline until a payment gateway exists.';

ALTER TABLE freight.warehouse_storage_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight.warehouse_storage_invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS freight_warehouse_storage_invoices_select ON freight.warehouse_storage_invoices;
CREATE POLICY freight_warehouse_storage_invoices_select
  ON freight.warehouse_storage_invoices
  FOR SELECT TO authenticated
  USING (
    freight.user_owns_org(warehouse_org_id)
    OR freight.user_owns_org(courier_org_id)
  );

DROP POLICY IF EXISTS freight_warehouse_storage_invoices_no_write ON freight.warehouse_storage_invoices;
CREATE POLICY freight_warehouse_storage_invoices_no_write
  ON freight.warehouse_storage_invoices
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS freight_warehouse_storage_invoice_lines_select ON freight.warehouse_storage_invoice_lines;
CREATE POLICY freight_warehouse_storage_invoice_lines_select
  ON freight.warehouse_storage_invoice_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM freight.warehouse_storage_invoices i
      WHERE i.id = invoice_id
        AND (
          freight.user_owns_org(i.warehouse_org_id)
          OR freight.user_owns_org(i.courier_org_id)
        )
    )
  );

DROP POLICY IF EXISTS freight_warehouse_storage_invoice_lines_no_write ON freight.warehouse_storage_invoice_lines;
CREATE POLICY freight_warehouse_storage_invoice_lines_no_write
  ON freight.warehouse_storage_invoice_lines
  FOR INSERT TO authenticated WITH CHECK (false);

GRANT SELECT ON freight.warehouse_storage_invoices TO authenticated;
GRANT SELECT ON freight.warehouse_storage_invoice_lines TO authenticated;
GRANT ALL ON freight.warehouse_storage_invoices TO service_role;
GRANT ALL ON freight.warehouse_storage_invoice_lines TO service_role;

-- ---------------------------------------------------------------------------
-- Daily storage accrual
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION freight.accrue_storage_days(p_on DATE DEFAULT CURRENT_DATE)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, freight
AS $$
DECLARE
  inserted INT := 0;
BEGIN
  INSERT INTO freight.warehouse_storage_ledger (
    warehouse_org_id,
    courier_org_id,
    package_id,
    event_type,
    quantity,
    unit_amount_minor,
    currency,
    occurred_on
  )
  SELECT
    p.operating_warehouse_org_id,
    p.owner_org_id,
    p.id,
    'storage_day',
    1,
    COALESCE((l.terms->>'per_day_minor')::bigint, 0),
    COALESCE(NULLIF(l.terms->>'currency', ''), 'USD'),
    p_on
  FROM freight.packages p
  JOIN freight.warehouse_courier_links l
    ON l.warehouse_org_id = p.operating_warehouse_org_id
   AND l.courier_org_id = p.owner_org_id
   AND l.status = 'active'
  WHERE p.operating_warehouse_org_id IS NOT NULL
    AND p.status = 'received_at_warehouse'
    AND COALESCE((l.terms->>'per_day_minor')::bigint, 0) > 0
    AND p_on > (
      COALESCE(
        (
          SELECT MIN(s.occurred_on)
          FROM freight.warehouse_storage_ledger s
          WHERE s.package_id = p.id AND s.event_type = 'receive'
        ),
        p.created_at::date
      ) + COALESCE((l.terms->>'free_days')::int, 0)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM freight.warehouse_storage_ledger d
      WHERE d.package_id = p.id
        AND d.event_type = 'storage_day'
        AND d.occurred_on = p_on
    );

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION freight.accrue_storage_days(DATE) TO service_role;

CREATE OR REPLACE FUNCTION public.accrue_storage_days(p_on DATE DEFAULT CURRENT_DATE)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, freight
AS $$
  SELECT freight.accrue_storage_days(p_on);
$$;

GRANT EXECUTE ON FUNCTION public.accrue_storage_days(DATE) TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('freight-accrue-storage-days');
    PERFORM cron.schedule(
      'freight-accrue-storage-days',
      '15 6 * * *',
      $$SELECT freight.accrue_storage_days(CURRENT_DATE);$$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available; run SELECT freight.accrue_storage_days(); manually.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule freight-accrue-storage-days: %', SQLERRM;
END;
$cron$;

NOTIFY pgrst, 'reload schema';
