-- Plain-English "what is this for" text for every Log service card (groups + jobs).
-- Shown as the card tooltip in Fleet → Log service. Fills blanks only; never overwrites an existing description.

UPDATE public.maintenance_service_categories AS c
SET description = v.description
FROM (VALUES
  -- Groups
  ('sys_engine',       'Work on the engine itself: oil, spark plugs, sensors, cooling parts and ignition.'),
  ('sys_filters',      'Filters that keep dirt out of the engine''s air and fuel.'),
  ('sys_tires',        'Tires and rims: changing, checking, rotating, aligning, balancing and repairing.'),
  ('sys_brakes',       'Everything that slows and stops the car: pads, discs, shoes, drums, fluid and lines.'),
  ('sys_fluids',       'Topping up or changing the car''s fluids: oil, coolant and washer fluid.'),
  ('sys_belts',        'Rubber belts and hoses that drive engine parts and carry coolant.'),
  ('sys_lighting',     'Bulbs, light checks and wiper blades so the driver can see and be seen.'),
  ('sys_suspension',   'Parts that keep the ride smooth and the car steering straight.'),
  ('sys_transmission', 'The gearbox that sends engine power to the wheels.'),
  ('sys_hvac',         'Air conditioning and the air coming into the cabin.'),
  ('sys_electrical',   'Battery, charging and starting: what gets the car started and keeps power flowing.'),
  -- Battery & electrical
  ('ELEC-BATT',  'The 12-volt battery that starts the car and powers the electrics when the engine is off.'),
  ('ELEC-ALT',   'Charges the battery and powers the electrics while the engine is running.'),
  ('ELEC-START', 'The small motor that turns the engine over when you start the car.'),
  -- Belts & hoses
  ('belt', 'The rubber belt that drives the alternator, A/C and other engine parts. Replace when cracked or squealing.'),
  -- Engine
  ('oil',           'Draining old engine oil, fitting a new oil filter and refilling with fresh oil.'),
  ('spark_plugs',   'The plugs that spark to burn the fuel in each cylinder. Worn plugs cause misfires and poor fuel use.'),
  ('oxygen_sensor', 'The exhaust sensor that tells the engine how rich or lean it is running. A bad one raises fuel use.'),
  ('thermostat',    'The valve that controls coolant flow so the engine warms up and doesn''t overheat.'),
  ('water_pump',    'Pumps coolant around the engine and radiator. A leaking pump can cause overheating.'),
  ('ignition_coil', 'Turns battery power into the high voltage the spark plugs need.'),
  -- Filters
  ('air_filter',  'Stops dust and dirt getting into the engine. A clogged one cuts power and raises fuel use.'),
  ('fuel_filter', 'Catches dirt in the fuel before it reaches the engine.'),
  -- Fluids
  ('fluids',            'Topping up windscreen washer fluid and engine coolant.'),
  ('engine_oil_part',   'The engine oil itself, when topped up or bought on its own.'),
  ('coolant_part',      'The coolant (antifreeze) that keeps the engine from overheating.'),
  ('washer_fluid_part', 'The fluid that sprays onto the windscreen to clean it.'),
  ('coolant_flush',     'Draining all the old coolant from the radiator and engine and refilling with fresh coolant.'),
  -- HVAC
  ('cabin_filter', 'Cleans the air blown into the cabin by the A/C. A dirty one gives weak airflow and smells.'),
  -- Lighting & visibility
  ('LGT-IND',        'The flashing bulb used for turn signals and hazards.'),
  ('LGT-HEAD',       'The main bulb for the headlights (low and high beam).'),
  ('LGT-TAIL',       'The rear bulb that lights up when braking and at night.'),
  ('lights',         'Walking around the car to check every light works: headlights, indicators, brake and tail lights.'),
  ('fog_light_bulb', 'The bulb in the low front fog lights.'),
  ('wipers',         'The rubber blades that clear the windscreen. Replace when they streak or judder.'),
  -- Suspension & steering
  ('suspension',     'Suspension parts such as bushes, links and joints that keep the car stable over bumps.'),
  ('shock_absorber', 'Dampers that stop the car bouncing after bumps. Worn ones make the car float and wear tires faster.'),
  -- Tires & wheels
  ('tires',           'Fitting new or used tires on one or more wheels.'),
  ('tire_pressure',   'Checking and setting each tire to the right air pressure.'),
  ('rotate_tires',    'Moving tires between wheel positions so they wear evenly and last longer.'),
  ('wheel_alignment', 'Adjusting the wheel angles so the car drives straight and the tires don''t wear unevenly.'),
  ('wheel_balancing', 'Adding small weights to each wheel so it spins smoothly without shaking at speed.'),
  -- Transmission
  ('transmission', 'Changing or topping up the gearbox fluid so gears shift smoothly.')
) AS v(code, description)
WHERE c.code = v.code
  AND (c.description IS NULL OR btrim(c.description) = '');
