-- One-off fix for live (6 Nov 2026): Phase 3a only gave the NiBK link to the 3 factory-number
-- rows added in Phase 1. SB and NiBK both list 04465-B1190 for every Tank / Roomy / Thor / Justy
-- row, so the other 7 rows get the same second source and become Confirmed.
-- Safe to run more than once. The migration file now does the same for fresh setups.

UPDATE public.vehicle_oe_number von
SET
  evidence_url_2 = 'https://jnbk-brakes.com/catalogue/cars/brake/723409/PN5562',
  note = 'SB and NiBK catalogues both list this factory number for this car.'
WHERE von.evidence_url = 'https://www.sbparts.jp/catalogue/723410'
  AND von.oe_number_norm = '04465B1190'
  AND von.evidence_url_2 IS NULL;

SELECT public.trust_recompute_auto();

-- Result: every 04465-B1190 row should now say confirmed.
SELECT
  count(*) AS rows_04465b1190,
  count(*) FILTER (WHERE trust = 'confirmed') AS confirmed,
  count(*) FILTER (WHERE trust IS DISTINCT FROM 'confirmed') AS not_confirmed
FROM public.vehicle_oe_number
WHERE oe_number_norm = '04465B1190';
