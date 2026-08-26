-- Golden-master capture for the Toll System Remediation program.
-- Produces the same shape as toll-analytics-baseline.json so the two can be diffed.
select json_build_object(
  'ledgerRows', (select count(*) from fleet.toll_ledger),
  'distinctOrgs', (select count(distinct organization_id) from fleet.toll_ledger),
  'nullOrg', (select count(*) from fleet.toll_ledger where organization_id is null),
  'voidedRows', (select count(*) from fleet.toll_ledger where status ilike 'void%'),
  'rowsMissingPlazaId', (
    select count(*) from fleet.toll_ledger
    where coalesce(nullif(plaza_id, ''), payload_json->>'plazaId') is null
  ),
  'dateRange', json_build_object(
    'min', (select min(date)::text from fleet.toll_ledger),
    'max', (select max(date)::text from fleet.toll_ledger)
  ),
  'totalAmount', (select round(sum((payload_json->>'amount')::numeric), 2) from fleet.toll_ledger),
  'byStatus', (
    select json_object_agg(coalesce(status, '(none)'), n)
    from (select status, count(*) n from fleet.toll_ledger group by status) s
  ),
  'byType', (
    select json_object_agg(coalesce(type, '(none)'), n)
    from (select type, count(*) n from fleet.toll_ledger group by type) t
  ),
  'plazaCount', (select count(*) from fleet.toll_plazas),
  'plazasWithRates', (
    select count(*) from fleet.toll_plazas
    where jsonb_array_length(coalesce(payload_json->'rates', '[]'::jsonb)) > 0
  ),
  'verifiedPlazas', (
    select count(*) from fleet.toll_plazas where payload_json->>'status' = 'verified'
  ),
  'byPlaza', (
    select json_agg(x order by x->>'plaza') from (
      select json_build_object(
        'plaza', coalesce(nullif(plaza, ''), '(unattributed)'),
        'passages', count(*),
        'spend', round(sum(abs((payload_json->>'amount')::numeric)), 2)
      ) as x
      from fleet.toll_ledger
      where type = 'usage'
      group by coalesce(nullif(plaza, ''), '(unattributed)')
    ) p
  ),
  'byDriver', (
    select json_agg(y order by y->>'driver') from (
      select json_build_object(
        'driver', coalesce(nullif(driver_id, ''), '(unassigned)'),
        'passages', count(*),
        'spend', round(sum(abs((payload_json->>'amount')::numeric)), 2)
      ) as y
      from fleet.toll_ledger
      where type = 'usage'
      group by coalesce(nullif(driver_id, ''), '(unassigned)')
    ) d
  )
) as baseline;
