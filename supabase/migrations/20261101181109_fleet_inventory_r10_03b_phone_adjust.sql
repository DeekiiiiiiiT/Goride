SELECT fleet.inv_adjust('8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823', '5129bef3-8bab-4793-b84d-fa62f9557c5e'::uuid, 'b62780a6-c9b8-4de3-8bff-3ce1e55faea3'::uuid, NULL, -1, 0, 'R10-03 retire legacy Phone holder at vehicle', 'r10-03-adj-phone-holder-5179');
UPDATE fleet.inv_item SET archived_at = coalesce(archived_at, now()), updated_at = now() WHERE id = '5129bef3-8bab-4793-b84d-fa62f9557c5e';;
