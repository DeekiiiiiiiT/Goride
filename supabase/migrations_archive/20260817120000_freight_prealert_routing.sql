-- Stage 1 pre-alerts: route expected packages to a Roam warehouse + retailer label
ALTER TABLE freight.packages
  ADD COLUMN IF NOT EXISTS intended_facility_id UUID
    REFERENCES freight.facilities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retailer TEXT;

CREATE INDEX IF NOT EXISTS idx_freight_packages_intended_facility
  ON freight.packages (organization_id, intended_facility_id, status)
  WHERE intended_facility_id IS NOT NULL;

COMMENT ON COLUMN freight.packages.intended_facility_id IS
  'Roam warehouse facility this pre-alert is assigned to; null = external / CSV handoff';
COMMENT ON COLUMN freight.packages.retailer IS
  'Retailer / marketplace label (Amazon, Shein, etc.) for warehouse matching';
