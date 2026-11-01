-- Revert unsourced Stitch sample values seeded on Roomy catalog row (fleet-find-parts audit D1).
update public.vehicle_catalog
set abs_channels = null, handbrake_type = null
where id = '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid
  and (
    abs_channels is not distinct from '4-wheel Bosch'
    or handbrake_type is not distinct from 'Rear drum cable'
  );
