-- Build step 6b follow-up (DOC-11): the three part types added on 27 Nov were created without a fit mode,
-- so the add-a-part check AS-05 fails and Add a part can't tell how they fit a car. Same fit mode as their
-- neighbours: fluids by spec (like Transmission Fluid), the filter by exact part (like Engine Air Filter).

UPDATE public.maintenance_service_categories
SET default_fit_mode = 'spec'
WHERE op_code IN ('DRV-DIFF', 'DRV-TRANSFER')
  AND is_part IS TRUE
  AND kind = 'component'
  AND default_fit_mode IS NULL;

UPDATE public.maintenance_service_categories
SET default_fit_mode = 'specific'
WHERE op_code = 'FILT-ACL-ELEM'
  AND is_part IS TRUE
  AND kind = 'component'
  AND default_fit_mode IS NULL;
