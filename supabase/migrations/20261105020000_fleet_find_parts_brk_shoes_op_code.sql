-- FP3 overlay: op_code for Brake shoes / drums (fleet-find-parts audit N1)

update public.maintenance_service_categories
set op_code = 'BRK-SHOES',
    updated_at = now()
where code = 'brake_shoes_drums'
  and (op_code is null or btrim(op_code) = '');
