-- F5: Brake pads vs brake shoes components; re-home Roomy shoe kits (1 Nov 2026)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.maintenance_service_categories
             WHERE id = 'b1000000-0000-4000-8000-000000000004') THEN
    insert into public.maintenance_service_categories (
      id,
      code,
      name,
      plain_name,
      parent_id,
      icon_key,
      position_aware,
      sort_order
    )
    values
      (
        'f5a10001-0000-4000-8000-000000000001',
        'brake_pads',
        'Brake pads',
        'Brake pads',
        'b1000000-0000-4000-8000-000000000004',
        'disc_full',
        true,
        10
      ),
      (
        'f5a10001-0000-4000-8000-000000000002',
        'brake_shoes_drums',
        'Brake shoes / drums',
        'Brake shoes / drums',
        'b1000000-0000-4000-8000-000000000004',
        'disc_full',
        true,
        11
      )
    on conflict (code) do update set
      name = excluded.name,
      plain_name = excluded.plain_name,
      parent_id = excluded.parent_id,
      position_aware = excluded.position_aware,
      sort_order = excluded.sort_order;
  END IF;
END $$;

-- Front pad listings → Brake pads
update public.part_master
set maintenance_component_id = 'f5a10001-0000-4000-8000-000000000001'
where upper(oem_part_number) in (
  '04465-B1190',
  'PN5562',
  'BP25562',
  'AN-754WK'
);

-- Rear shoe kits → Brake shoes / drums
update public.part_master
set maintenance_component_id = 'f5a10001-0000-4000-8000-000000000002'
where upper(oem_part_number) in ('04495-B2400', 'ADT34155');
