-- Phase 0. Distinct names for the five stations that shared a trading name,
-- and retire four learnt-location ids that no longer have a row.
-- Station ids are unchanged. Names follow Brand, Locality.

update fleet.stations
set
  name = case id
    when 'st_7c102c55' then 'Texaco, East Queen Street'
    when 'st_753e2953' then 'Texaco, Old Hope Road'
    when 'd6efa591-eb95-48ae-a4df-9f24a846c951' then 'Texaco, Half Way Tree'
    when '8cbe8d0e-06a7-471b-b19b-39435cfbd331' then 'Jampet, Willowdene'
    when 'st_3e970342' then 'Jampet, Brunswick Avenue'
  end,
  payload_json = jsonb_set(
    payload_json,
    '{name}',
    to_jsonb(
      case id
        when 'st_7c102c55' then 'Texaco, East Queen Street'
        when 'st_753e2953' then 'Texaco, Old Hope Road'
        when 'd6efa591-eb95-48ae-a4df-9f24a846c951' then 'Texaco, Half Way Tree'
        when '8cbe8d0e-06a7-471b-b19b-39435cfbd331' then 'Jampet, Willowdene'
        when 'st_3e970342' then 'Jampet, Brunswick Avenue'
      end
    )
  ),
  updated_at = now()
where id in (
  'st_7c102c55',
  'st_753e2953',
  'd6efa591-eb95-48ae-a4df-9f24a846c951',
  '8cbe8d0e-06a7-471b-b19b-39435cfbd331',
  'st_3e970342'
);

update fleet.fuel_entries
set
  payload_json = jsonb_set(
    payload_json,
    '{metadata}',
    (coalesce(payload_json->'metadata', '{}'::jsonb) - 'learntLocationId')
      || jsonb_build_object(
        'learntLocationIdRetired',
        payload_json #>> '{metadata,learntLocationId}'
      )
  ),
  updated_at = now()
where id in (
  '1b4ed81c-a729-4c48-9638-17def8c26211',
  '67b49ed8-4939-49bd-bbc3-998ccc2ef935',
  'b87b4bb4-736f-4c00-85f6-84406b9599f0',
  '8d8acbf0-dee7-4e60-9d9c-e4ea165f8b1f'
)
  and payload_json #>> '{metadata,learntLocationId}' is not null
  and not exists (
    select 1
    from fleet.stations s
    where s.id = fleet.fuel_entries.payload_json #>> '{metadata,learntLocationId}'
       or s.legacy_kv_id = 'learnt_location:' || (fleet.fuel_entries.payload_json #>> '{metadata,learntLocationId}')
  );
