-- Supplies, round 2 (from the reviewed May-need list, 15 Nov 2026). Paste ALL into the Supabase SQL
-- editor (live project) and Run. Safe to run again: a name that already exists is skipped.

INSERT INTO public.maintenance_supply (name, description, unit_id, icon_key)
SELECT v.name, v.description, u.id, v.icon_key
FROM (VALUES
  ('RTV Gasket Sealant', 'Silicone sealant used on gasket and pan sealing surfaces (formed-in-place gaskets).', 'tube', 'wrench'),
  ('Silicone Brake Grease', 'High-temperature brake lubricant for caliper slide pins, pad contact points and drum-brake backing plates.', 'tube', 'brakes'),
  ('Brake Anti-Squeal Compound', 'Applied to the back of brake pads (or shims) to stop squeal; not the same as slide-pin grease.', 'tube', 'brakes'),
  ('MAF Sensor Cleaner', 'Residue-free spray made only for the mass air flow sensor.', 'can', 'wind'),
  ('UV Leak Detection Dye', 'Added to oil or coolant so a UV lamp shows where a leak is.', 'bottle', 'droplet'),
  ('Thread Sealant', 'Seals threaded fittings, sensors and plugs against leaks; not the same as thread-locker.', 'tube', 'wrench'),
  ('Honing Oil', 'Lubricant used while honing or boring cylinders.', 'litre', 'oil'),
  ('Tire Valve Core', 'Replacement core for a tire valve stem.', 'piece', 'tires'),
  ('Washer Fluid', 'Windscreen washer fluid for top-ups.', 'litre', 'wipers'),
  ('Induction / Fuel Injector Cleaner', 'Cleaner made for intake and fuel injector service (induction service).', 'can', 'wind'),
  ('Valve Grinding Compound', 'Abrasive paste used to lap valves into their seats.', 'tube', 'gears'),
  ('Radiator Flush', 'Chemical cleaner run through the cooling system before new coolant goes in.', 'bottle', 'thermometer'),
  ('Distilled Water', 'For flushing the cooling system and mixing concentrated coolant.', 'litre', 'droplet'),
  ('Plastigauge', 'Measuring strip used to check bearing clearances.', 'pack', 'gauge'),
  ('Battery Terminal Protector', 'Spray that coats battery terminals to stop corrosion.', 'can', 'spark'),
  ('Tire Mounting Lube', 'Lubricant for seating tire beads when mounting tires.', 'bottle', 'tires'),
  ('Tire Valve Stem', 'Replacement rubber valve stem fitted when a tire is changed.', 'piece', 'tires'),
  ('Wheel Weights', 'Balancing weights fitted to the rim.', 'piece', 'tires'),
  ('Tire Patch / Plug Kit', 'Patches or plugs for repairing a punctured tire.', 'kit', 'tires'),
  ('Rubber Cement', 'Vulcanising cement used with tire patches and plugs.', 'tube', 'tires')
) AS v(name, description, unit_code, icon_key)
JOIN public.maintenance_unit u ON u.code = v.unit_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.maintenance_supply s
  WHERE lower(s.name) = lower(v.name) AND s.status = 'active'
);

SELECT s.code, s.name, u.label_one AS unit
FROM public.maintenance_supply s
JOIN public.maintenance_unit u ON u.id = s.unit_id
WHERE s.status = 'active'
ORDER BY s.code;
