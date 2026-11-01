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

update public.part_master
set maintenance_component_id = 'f5a10001-0000-4000-8000-000000000001'
where upper(oem_part_number) in (
  '04465-B1190',
  'PN5562',
  'BP25562',
  'AN-754WK'
);

update public.part_master
set maintenance_component_id = 'f5a10001-0000-4000-8000-000000000002'
where upper(oem_part_number) in ('04495-B2400', 'ADT34155');;
