-- Supplies starter list (owner's list, 15 Nov 2026). Paste ALL of this into the Supabase SQL editor
-- (live project) and press Run. Safe to run more than once: a name that already exists is skipped.
-- Units and icons can be changed later in Dominion → Maintenance templates → Supplies → Edit.

INSERT INTO public.maintenance_supply (name, description, unit_id, icon_key)
SELECT v.name, v.description, u.id, v.icon_key
FROM (VALUES
  -- Cleaners & solvents
  ('Brake Cleaner', 'A fast-evaporating solvent used to blast away brake dust, grease and oil from brake components. A staple in every shop.', 'can', 'brakes'),
  ('Carburetor Cleaner', 'Like throttle body cleaner, but made for the internal passages and deposits in carburetors.', 'can', 'wind'),
  ('Electrical Contact Cleaner', 'Cleans electrical connections, sensors and connectors without damaging plastic or leaving residue.', 'can', 'spark'),
  ('Degreaser', 'Heavier-duty cleaner for a parts washer or sprayed on engine bays to remove thick, caked-on grease and grime.', 'can', 'droplet'),
  ('Penetrating Oil', 'Loosens rusted, corroded or seized nuts and bolts; creeps into tight spaces (e.g. WD-40, PB Blaster).', 'can', 'oil'),
  ('Starting Fluid', 'Ether-based spray, used sparingly to help start stubborn engines or, in diagnostics, to check for vacuum leaks.', 'can', 'gauge'),
  ('Wax & Grease Remover', 'Prep solvent used before painting or applying adhesives so the surface is perfectly clean.', 'bottle', 'droplet'),
  ('Glass Cleaner', 'For automotive glass and mirrors.', 'can', 'wipers'),
  ('Cabin Filter Housing Cleaner', 'Cleaner for the air intake area of the heating and air-conditioning system.', 'can', 'filter'),
  -- Lubricants, greases & sealers
  ('Penetrating & Light Lubricating Spray', 'General-purpose light oil for displacing moisture and light lubrication (e.g. WD-40).', 'can', 'oil'),
  ('White Lithium Grease', 'Sprayable, plastic-safe grease for door hinges, latches and linkages.', 'can', 'gears'),
  ('Dielectric Grease', 'Silicone grease for electrical connectors; keeps out corrosion and moisture.', 'tube', 'spark'),
  ('High-Temp Bearing Grease', 'Heavy-duty grease for wheel bearings and other high-heat parts.', 'tube', 'gears'),
  ('Thread-Locking Fluid', 'Hardens on threads so bolts don''t vibrate loose (e.g. Loctite).', 'bottle', 'wrench'),
  ('Anti-Seize Compound', 'Applied to threads (spark plugs, exhaust bolts) so they come off easily later.', 'tube', 'wrench'),
  ('Assembly Lube', 'Thick, sticky lubricant that protects engine parts during assembly until oil pressure builds.', 'tube', 'gears'),
  ('Silicone Rubber Grease', 'Lubricates rubber seals, bushings and weatherstripping without harming them.', 'tube', 'suspension'),
  -- Essential fluids
  ('Engine Oil', 'For oil changes and top-ups.', 'litre', 'oil'),
  ('Coolant / Antifreeze', 'For cooling system service and top-ups.', 'litre', 'thermometer'),
  ('Brake Fluid', 'For brake system maintenance and bleeding.', 'bottle', 'brakes'),
  ('Transmission Fluid', 'Automatic transmission fluid (ATF) and manual gear oil for drivetrain service.', 'litre', 'gears'),
  ('Power Steering Fluid', 'For hydraulic power steering systems.', 'bottle', 'rotate'),
  ('AdBlue (Diesel Exhaust Fluid)', 'For modern diesel vehicles, to reduce emissions.', 'litre', 'droplet')
) AS v(name, description, unit_code, icon_key)
JOIN public.maintenance_unit u ON u.code = v.unit_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_supply s
  WHERE lower(s.name) = lower(v.name) AND s.status = 'active'
);

-- Show the full list afterwards.
SELECT s.code, s.name, u.label_one AS unit, s.icon_key
FROM public.maintenance_supply s
JOIN public.maintenance_unit u ON u.id = s.unit_id
WHERE s.status = 'active'
ORDER BY s.code;
