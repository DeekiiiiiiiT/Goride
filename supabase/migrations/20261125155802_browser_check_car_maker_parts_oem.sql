-- Owner 25 Nov 2026 (research audit §3): a number the owner confirmed in a browser check on the car maker's own
-- catalogue is the car maker's part (OEM). The save copied the engine's earlier guess instead, so 17801-21060 (Roomy
-- engine air filter) and 48530-B9165 (Roomy rear shock from 2018) were saved as "aftermarket". parts_for_vehicle puts
-- aftermarket parts in tier 4 and readiness counts tiers 1–3, so the air filter showed as missing. The server now
-- saves these as OEM (confirmedPartKind); this corrects the parts already saved.

WITH fixed AS (
  SELECT DISTINCT p.id AS proposal_id, p.promoted_part_id
  FROM public.catalog_part_proposal p
  JOIN public.catalog_research_job j ON j.id = p.job_id
  JOIN public.vehicle_catalog vc ON vc.id = j.vehicle_catalog_id
  JOIN public.trusted_source ts
    ON ts.domain = p.sources->0->>'domain'
   AND ts.kind = 'car_maker'
   AND lower(ts.maker_norm) = lower(vc.make)
  WHERE p.status = 'promoted'
    AND p.trust_route = 'owner_browser'
    AND p.match_kind IS DISTINCT FROM 'oem'
), proposals AS (
  UPDATE public.catalog_part_proposal p
  SET match_kind = 'oem'
  FROM fixed f
  WHERE p.id = f.proposal_id
  RETURNING p.id
)
UPDATE public.part_master pm
SET part_kind = 'oem'
FROM fixed f
WHERE pm.id = f.promoted_part_id
  AND pm.part_kind IS DISTINCT FROM 'oem';

-- Readiness picks this up on its next background rebuild.
SELECT public.refresh_variant_parts_readiness();
