-- D3: fleet.fuel_entries.source CHECK (rolled back).

BEGIN;

DO $$
BEGIN
  BEGIN
    INSERT INTO fleet.fuel_entries (
      id, organization_id, legacy_kv_id, source
    ) VALUES ('fuel-d3-bad', 'org-x', 'legacy-d3-bad', 'receipt_photo');
    RAISE EXCEPTION 'expected CHECK failure on bad source';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  INSERT INTO fleet.fuel_entries (
    id, organization_id, legacy_kv_id, source
  ) VALUES ('fuel-d3-null', 'org-x', 'legacy-d3-null', NULL);

  INSERT INTO fleet.fuel_entries (
    id, organization_id, legacy_kv_id, source
  ) VALUES ('fuel-d3-scan', 'org-x', 'legacy-d3-scan', 'scan');
END;
$$;

ROLLBACK;