-- Phase 2. The owner's groups, categories, place types, facilities, and brands.
-- Nothing in use is deleted later. A row is retired with active = false.

insert into places.category_group (code, slug, label, colour, sort) values
  ('1', 'road_auto', 'Road & Automotive', '#ffe6cc', 1),
  ('2', 'food_drink', 'Food, Drink & Social', '#d5e8d4', 2),
  ('3', 'retail', 'Retail & Daily Supplies', '#fff2cc', 3),
  ('4', 'services', 'Services & Emergency', '#f8cecc', 4),
  ('5', 'travel_nature', 'Travel, Infrastructure & Nature', '#e1d5e7', 5);

insert into places.category (code, group_code, slug, label, sort) values
  ('1.1', '1', 'fuel_energy', 'Fuel & Energy', 11),
  ('1.2', '1', 'vehicle_maintenance', 'Vehicle Maintenance', 12),
  ('1.3', '1', 'roadside_emergency', 'Roadside Emergency & Recovery', 13),
  ('1.4', '1', 'driver_facilities', 'Driver Facilities', 14),
  ('2.1', '2', 'quick_bites', 'Quick Bites', 21),
  ('2.2', '2', 'dining', 'Dining', 22),
  ('2.3', '2', 'social', 'Social', 23),
  ('3.1', '3', 'convenience_groceries', 'Convenience & Groceries', 31),
  ('3.2', '3', 'markets_produce', 'Markets & Produce', 32),
  ('3.3', '3', 'specialty_hardware_pharmacy', 'Specialty, Hardware & Pharmacy', 33),
  ('4.1', '4', 'emergency_public_safety', 'Emergency & Public Safety', 41),
  ('4.2', '4', 'financial', 'Financial', 42),
  ('4.3', '4', 'admin_postal_civic', 'Administrative, Postal & Civic', 43),
  ('5.1', '5', 'attractions_nature', 'Attractions & Nature', 51),
  ('5.2', '5', 'accommodation', 'Accommodation', 52),
  ('5.3', '5', 'transit_hubs_tolls', 'Transit Hubs & Tolls', 53);

insert into places.facility_type (slug, category_code, label, attribute_schema) values
  ('fuel_pump', '1.1', 'Fuel', null),
  ('ev_charger', '1.1', 'EV Charger', '{"type":"object","properties":{"connector_type":{"type":"string","title":"Connector"}}}'::jsonb),
  ('air_water', '1.1', 'Air / Water', null),
  ('wheel_alignment', '1.2', 'Wheel Alignment', null),
  ('battery_service', '1.2', 'Battery Testing', null),
  ('diagnostics', '1.2', 'Diagnostics', null),
  ('auto_parts', '1.2', 'Auto Parts On-Site', null),
  ('restroom', '1.4', 'Restroom', null),
  ('changing_room', '1.4', 'Changing Room', null),
  ('food', '2.1', 'Food', null),
  ('drive_through', '2.1', 'Drive-Through', null),
  ('walk_up_window', '2.1', 'Walk-Up Window', null),
  ('dine_in', '2.1', 'Dine-In Seating', null),
  ('restaurant', '2.2', 'Restaurant', null),
  ('bar', '2.3', 'Bar', null),
  ('convenience_store', '3.1', 'Convenience Store', null),
  ('fresh_produce', '3.1', 'Fresh Produce', null),
  ('frozen_chilled', '3.1', 'Frozen / Chilled', null),
  ('liquor', '3.1', 'Liquor / Wine', null),
  ('lottery', '3.1', 'Lottery Sales', null),
  ('pharmacy', '3.3', 'Pharmacy', null),
  ('prescription', '3.3', 'Prescription', null),
  ('cosmetics', '3.3', 'Cosmetics', null),
  ('mobile_topup', '3.3', 'Mobile Top-Up', null),
  ('tool_rental', '3.3', 'Tool Rental', null),
  ('locksmith', '3.3', 'Locksmith', null),
  ('building_supplies', '3.3', 'Building Supplies', null),
  ('emergency_dept', '4.1', 'Emergency Dept', null),
  ('ambulance_bay', '4.1', 'Ambulance Bay', null),
  ('lab_diagnostics', '4.1', 'Lab / Diagnostics', null),
  ('first_aid', '4.1', 'First Aid', null),
  ('reports_desk', '4.1', 'Reports Desk', null),
  ('emergency_phone', '4.1', 'Emergency Phone', null),
  ('emergency_shelter', '4.1', 'Emergency Shelter', null),
  ('lifeguard', '4.1', 'Lifeguard', null),
  ('atm', '4.2', 'ATM', null),
  ('bill_payment', '4.2', 'Bill Payment', null),
  ('pool', '5.2', 'Pool', null),
  ('wifi', '5.2', 'Wi-Fi', null),
  ('parking', '5.3', 'Parking', '{"type":"object","properties":{"is_free":{"type":"boolean","title":"Free parking"}}}'::jsonb),
  ('airport_shuttle', '5.3', 'Airport Shuttle', null),
  ('taxi_stand', '5.3', 'Taxi Stand', null),
  ('ttag_topup', '5.3', 'T-Tag Top-Up', null),
  ('toll_booth', '5.3', 'Toll Booth', null);

insert into places.place_type (
  slug, category_code, label, default_geofence_m, default_facilities, match_profile, search_as_facility, attribute_schema
) values
  ('gas_station', '1.1', 'Gas station', 150, array['fuel_pump','air_water','restroom','convenience_store'], 'fuel', 'fuel_pump',
    '{"type":"object","properties":{"hours":{"type":"string","title":"Hours"}}}'::jsonb),
  ('fast_food', '2.1', 'Fast food restaurant', 50, array['dine_in','restroom','parking'], 'none', null,
    '{"type":"object","properties":{"hours":{"type":"string","title":"Hours"}}}'::jsonb),
  ('supermarket', '3.1', 'Supermarket', 80, array['parking','atm'], 'none', null, null),
  ('hospital', '4.1', 'Hospital / medical centre', 150, array['emergency_dept','parking','pharmacy'], 'none', null,
    '{"type":"object","properties":{"beds":{"type":"integer","title":"Beds"}}}'::jsonb),
  ('beach', '5.1', 'Beach', 300, array['parking','restroom'], 'none', null,
    '{"type":"object","properties":{"entrance_fee":{"type":"string","title":"Entrance fee"}}}'::jsonb),
  ('toll_plaza', '5.3', 'Toll plaza', 200, array['toll_booth','ttag_topup'], 'toll', null,
    '{"type":"object","properties":{"highway":{"type":"string","title":"Highway"},"direction":{"type":"string","title":"Direction"},"lanes":{"type":"integer","title":"Lanes"},"payment":{"type":"array","items":{"type":"string"},"title":"Payment"}}}'::jsonb),
  ('hotel', '5.2', 'Hotel / resort', 150, array['restaurant','wifi','parking'], 'none', null,
    '{"type":"object","properties":{"stars":{"type":"number","title":"Stars"}}}'::jsonb),
  ('hardware_store', '3.3', 'Hardware store', 60, array['building_supplies','parking'], 'none', null, null),
  ('police_station', '4.1', 'Police station', 60, array['reports_desk'], 'none', null, null),
  ('bus_terminal', '5.3', 'Bus terminal', 120, array['taxi_stand','restroom'], 'none', null, null),
  ('mechanic_garage', '1.2', 'Mechanic garage', 50, array['diagnostics'], 'none', 'diagnostics', null),
  ('pharmacy', '3.3', 'Pharmacy / chemist', 50, array['prescription','parking'], 'none', 'pharmacy',
    '{"type":"object","properties":{"hours":{"type":"string","title":"Hours"},"insurance_accepted":{"type":"array","items":{"type":"string"},"title":"Insurance accepted"},"delivery":{"type":"boolean","title":"Delivery"}}}'::jsonb),
  ('parts_store', '1.2', 'Parts store', 50, array['auto_parts'], 'none', null, null),
  ('car_wash', '1.2', 'Car wash', 50, '{}', 'none', null, null),
  ('tyre_shop', '1.2', 'Tyre shop', 50, array['air_water'], 'none', null, null),
  ('roadside_assistance', '1.3', 'Roadside assistance', 50, '{}', 'none', null, null),
  ('public_restroom', '1.4', 'Public restroom', 50, '{}', 'none', 'restroom', null);

insert into places.brand (slug, name, aliases) values
  ('totalenergies', 'TotalEnergies', array['TotalEnergies','Total']),
  ('cool_oasis', 'Cool Oasis', array['Cool Oasis','CoolOasis']),
  ('texaco', 'Texaco', array['Texaco']),
  ('fesco', 'FESCO', array['FESCO','Fesco']),
  ('petcom', 'Petcom', array['Petcom']),
  ('unipet', 'Unipet', array['Unipet']),
  ('rubis', 'Rubis', array['Rubis','RUBIS']);

do $$
declare
  facilities int;
  dangling int;
begin
  select count(*) into facilities from places.facility_type;
  if facilities <> 44 then
    raise exception 'expected 44 facility types, found %', facilities;
  end if;
  select count(*) into dangling
  from places.place_type t
  where t.category_code not in (select code from places.category)
     or (t.search_as_facility is not null and t.search_as_facility not in (select slug from places.facility_type));
  if dangling <> 0 then
    raise exception 'taxonomy links are broken';
  end if;
  select count(*) into dangling
  from places.facility_type f
  where f.category_code not in (select code from places.category);
  if dangling <> 0 then
    raise exception 'facility categories are broken';
  end if;
end $$;
