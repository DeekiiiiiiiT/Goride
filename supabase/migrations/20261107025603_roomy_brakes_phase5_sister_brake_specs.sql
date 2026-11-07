-- Roomy brakes Phase 5, RB-09: brake specs on the Roomy's sister cars.
-- Tank / Thor / Justy are the same M900/M910 body as the Roomy (same pad lists from SB and NiBK),
-- so they get the Roomy rows' values: Ventilated Disc front, Drum rear, 255 mm.
-- Rush J210E is a different car: front Ventilated Disc / rear Drum per Goo-net catalogue and dealer
-- listings (Toyota's own spec sheet is not public); disc size left blank because sources disagree.
-- Only empty cells are filled; nothing already set is overwritten. Safe to run twice.

UPDATE public.vehicle_catalog vc
SET front_brake_type = coalesce(vc.front_brake_type, 'Ventilated Disc'),
    rear_brake_type  = coalesce(vc.rear_brake_type, 'Drum'),
    brake_size_mm    = coalesce(vc.brake_size_mm, 255),
    updated_at = now()
WHERE vc.id IN (
  'a72af492-48f6-420f-92b3-69452f01c186', -- Toyota Tank M900A
  '05d10289-3147-4092-9497-dabb039a08ed', -- Toyota Tank M910A
  '771cb0f3-0842-45e1-9b1b-c6ba3988a59b', -- Daihatsu Thor M900S
  '28866865-dad3-4956-9b29-ca814768ca0c', -- Daihatsu Thor M910S
  '0c9cc8e9-d65f-4672-b554-ff4f06c800b9', -- Subaru Justy M900F
  '5b6e5880-1e2a-4add-82ef-507f143f2165'  -- Subaru Justy M910F
)
AND (vc.front_brake_type IS NULL OR vc.rear_brake_type IS NULL OR vc.brake_size_mm IS NULL);

UPDATE public.vehicle_catalog vc
SET front_brake_type = coalesce(vc.front_brake_type, 'Ventilated Disc'),
    rear_brake_type  = coalesce(vc.rear_brake_type, 'Drum'),
    updated_at = now()
WHERE vc.id = '7b7b602c-d26b-4b35-8f36-30b9f729d857' -- Toyota Rush J210E
  AND (vc.front_brake_type IS NULL OR vc.rear_brake_type IS NULL);

-- Result: every row should show its brake types.
SELECT make, model, chassis_code, front_brake_type, rear_brake_type, brake_size_mm
FROM public.vehicle_catalog
WHERE model IN ('Roomy','Tank','Thor','Justy','Rush')
ORDER BY model, chassis_code, production_start_year;
