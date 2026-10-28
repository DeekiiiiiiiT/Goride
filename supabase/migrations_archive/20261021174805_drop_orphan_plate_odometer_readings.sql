-- Three check-in readings name plate 5404LK and a driver with no company.
-- No vehicle row exists, so there is no company to attach. Remove only these orphans.

delete from fleet.odometer_readings
where organization_id is null
  and vehicle_id = '5404LK'
  and id in (
    'checkin_87c66664-dab4-4f70-bf3a-07f08726c7fa',
    'checkin_83282ebe-7238-4393-a4a8-eb8e0929434c',
    'checkin_feb1d175-7d77-446c-b79c-639f5e570aa6'
  );
