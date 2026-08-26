-- One-time seed of assignmentHistory for tags that are currently assigned but
-- have an empty history array. This used to happen as a silent write every time
-- someone opened the Tag Detail page; it now runs once at the database layer.

update fleet.toll_tags t
set
  payload_json = jsonb_set(
    coalesce(t.payload_json, '{}'::jsonb),
    '{assignmentHistory}',
    jsonb_build_array(
      jsonb_build_object(
        'vehicleId', coalesce(t.vehicle_id, t.payload_json ->> 'assignedVehicleId'),
        'vehicleName', coalesce(t.payload_json ->> 'assignedVehicleName', 'Unknown Vehicle'),
        'assignedAt', coalesce(
          t.payload_json ->> 'createdAt',
          t.created_at::text,
          now()::text
        )
      )
    ),
    true
  ),
  updated_at = now()
where coalesce(t.vehicle_id, t.payload_json ->> 'assignedVehicleId') is not null
  and coalesce(t.vehicle_id, t.payload_json ->> 'assignedVehicleId') <> ''
  and (
    t.payload_json -> 'assignmentHistory' is null
    or jsonb_typeof(t.payload_json -> 'assignmentHistory') <> 'array'
    or jsonb_array_length(t.payload_json -> 'assignmentHistory') = 0
  );
