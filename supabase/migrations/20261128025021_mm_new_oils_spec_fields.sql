-- Follow-up to 20261128024614: Differential oil and Transfer oil fit by spec, and a spec-mode part type needs
-- at least one spec field (add-a-part check AP-07). One required grade field each, the same pattern as
-- Transmission Fluid ("Fluid spec"). The spec keys already exist (DOC-09).

INSERT INTO public.part_type_spec_field (part_type_id, spec_key, label, unit, data_type, options, required, example, sort_order)
SELECT c.id, v.spec_key, v.label, NULL, 'text', NULL, true, v.example, 1
FROM (VALUES
  ('DRV-DIFF', 'differential_oil_grade', 'Oil grade', '75W-85 GL-5'),
  ('DRV-TRANSFER', 'transfer_oil_grade', 'Oil grade', '75W-90 GL-5')
) AS v(op_code, spec_key, label, example)
JOIN public.maintenance_service_categories c
  ON c.op_code = v.op_code AND c.is_part IS TRUE AND c.kind = 'component'
WHERE EXISTS (SELECT 1 FROM public.spec_key sk WHERE sk.key = v.spec_key)
  AND NOT EXISTS (
    SELECT 1 FROM public.part_type_spec_field f WHERE f.part_type_id = c.id AND f.spec_key = v.spec_key
  );
