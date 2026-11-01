-- Mark standard pre-trip inspection lines as safety-critical (DVIR do-not-drive path).
UPDATE public.maintenance_inspection_items
SET safety_critical = true
WHERE safety_critical IS NOT TRUE
  AND (
    label ILIKE '%brake%'
    OR label ILIKE '%steering%'
    OR label ILIKE '%tire%'
    OR label ILIKE '%tyre%'
    OR label ILIKE '%windshield%'
    OR label ILIKE '%wiper%'
    OR label ILIKE '%horn%'
    OR label ILIKE '%light%'
    OR label ILIKE '%mirror%'
    OR label ILIKE '%seat belt%'
    OR label ILIKE '%seatbelt%'
  );
