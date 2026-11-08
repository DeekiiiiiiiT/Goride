-- V-15 done-test: Roomy brake pads verified via part_listing.trust (read-only; skip if car missing)
BEGIN;

DO $test$
DECLARE
  v_roomy constant uuid := '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid;
  v_ready int;
  v_brk_pads text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = v_roomy) THEN
    RAISE NOTICE 'SKIP readiness_uses_listing_trust_checks: Roomy % not on file', v_roomy;
    RETURN;
  END IF;

  SELECT r.components_ready, r.cells->>'BRK-PADS'
  INTO v_ready, v_brk_pads
  FROM public.variant_parts_readiness r
  WHERE r.variant_id = v_roomy;

  IF v_ready IS DISTINCT FROM 4 OR v_brk_pads IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'V-15 failed for Roomy %: expected components_ready=4 and BRK-PADS=verified, got components_ready=% BRK-PADS=%',
      v_roomy, v_ready, v_brk_pads;
  END IF;
END;
$test$;

ROLLBACK;
