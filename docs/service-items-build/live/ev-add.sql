-- Full-EV jobs (owner-reviewed list: docs/service-items-build/ev-suggestions.md, 15 Nov 2026).
-- Paste ALL into the Supabase SQL editor (live project) and Run. Safe to run again.
-- Adds to "Hybrid & electric": 10 jobs; to HVAC: Electric A/C Compressor + A/C Recharge (all cars).
-- 5 new supplies, 24 supply links, 1 part link. (Rev 3: refrigerant split into R-134a + R-1234yf, and
-- compressor / recharge "don't log both" notes. Rev 2: A/C Recharge + refrigerant,
-- Dielectric Grease on HV cable, charging-port "don't log twice" notes.)
-- Requires: the Fleet tick fix (commit 367dcb07 or later) deployed — it is, as of 15 Nov — and hybrid-add.sql
-- already run (the group). Rules (audit Open list): no part items on real services until part_source ships;
-- no HV service on a real car until the HV lockout checklist ships.

BEGIN;

-- New supplies
INSERT INTO public.maintenance_supply (name, description, unit_id, icon_key)
SELECT v.name, v.description, u.id, v.icon_key
FROM (VALUES
  ('EV Battery Coolant', 'Coolant for the drive-battery thermal management loop on EVs and plug-in hybrids. Use the type the car maker specifies; it is not always the same as the engine or inverter coolant.', 'litre', 'thermometer'),
  ('EV Reduction Gear Oil', 'Oil for the single-speed reduction gearbox behind an EV traction motor. Use the type the car maker specifies.', 'litre', 'oil'),
  ('POE Compressor Oil (Non-Conductive)', 'Non-conductive POE oil for electric A/C compressors. Ordinary PAG oil must never go into an electric compressor.', 'bottle', 'wind'),
  ('A/C Refrigerant R-134a', 'R-134a refrigerant gas, for cars whose bonnet label says R-134a. Never mix with R-1234yf.', 'can', 'wind'),
  ('A/C Refrigerant R-1234yf', 'R-1234yf refrigerant gas, for cars whose bonnet label says R-1234yf (most newer cars). Costs much more than R-134a. Never mix with R-134a.', 'can', 'wind')
) AS v(name, description, unit_code, icon_key)
JOIN public.maintenance_unit u ON u.code = v.unit_code
WHERE NOT EXISTS (SELECT 1 FROM public.maintenance_supply s WHERE lower(s.name) = lower(v.name) AND s.status = 'active');

-- Jobs
INSERT INTO public.maintenance_service_categories (
  code, name, plain_name, description, icon_key, field_schema, quick_job_eligible, sort_order,
  parent_id, kind, op_code, position_aware, is_part, part_type_status, position_scheme, status,
  default_action, default_fit_mode, editor_hint
)
SELECT j.code, j.name, j.name, j.description, j.icon_key,
       CASE WHEN j.is_part
            THEN '{"fields":[{"key":"qty","type":"number","label":"Quantity","required":false},{"key":"unit_price","type":"number","label":"Unit price","required":false},{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb
            ELSE '{"fields":[{"key":"labor","type":"number","label":"Labor","required":false}]}'::jsonb END,
       true, j.sort_order, sys.id, 'component', j.op_code, false, j.is_part, 'active', 'none', 'active',
       j.action, CASE WHEN j.is_part THEN 'specific' END, j.hint
FROM (VALUES
  ('sys_hybrid', 'hv_insulation_inspection', 'HV Cable & Insulation Resistance Inspection', 'HEV-INSUL', 100, false, 'inspect', 'spark', 'Hybrids and EVs. Lockout first.',
   'Checking the orange high-voltage cables and connectors for damage, and testing insulation resistance so no high voltage can leak to the body. Hybrids and EVs. Labor only.'),
  ('sys_hybrid', 'hv_cable', 'HV Cable / Connector Replacement', 'HEV-CABLE', 110, true, 'replace', 'spark', 'High-voltage: lockout first.',
   'Replacing a damaged orange high-voltage cable or connector. High-voltage work: lockout first.'),
  ('sys_hybrid', 'ev_battery_coolant_service', 'Battery Thermal Management Coolant Service', 'HEV-BTMS', 120, false, 'flush', 'thermometer', 'Liquid-cooled packs only.',
   'Draining and refilling the coolant loop that keeps a liquid-cooled drive battery at the right temperature. EVs and plug-in hybrids with liquid-cooled packs. If the battery coolant pump is being replaced, log the coolant on Battery Coolant Pump instead; don''t log both for the same visit.'),
  ('sys_hybrid', 'ev_battery_coolant_pump', 'Battery Coolant Pump', 'HEV-BCP', 130, true, 'replace', 'thermometer', 'Electric pump.',
   'The electric pump that moves coolant through the drive-battery loop. If it fails, the battery overheats and power is cut. The refill coolant is logged here; don''t also log Battery Thermal Management Coolant Service for the same visit.'),
  ('sys_hybrid', 'ev_charging_port', 'Charging Port', 'HEV-PORT', 140, true, 'replace', 'spark', 'Replacement only. Never grease the charging pins.',
   'The socket the charging cable plugs into. Burnt, bent or loose pins cause slow or failed charging. EVs and plug-in hybrids. Log this job for a port replacement only; if the port is replaced during an inspection, tick it as the part on Charging Port Inspection & Cleaning instead. Don''t log both in one visit.'),
  ('sys_hybrid', 'ev_charging_port_cleaning', 'Charging Port Inspection & Cleaning', 'HEV-PORTC', 150, false, 'clean', 'spark', 'Service only. A new port goes in as its part item.',
   'Checking the charging socket for dirt, corrosion and heat damage, and cleaning the pins. EVs and plug-in hybrids. If the port has to be replaced, tick Charging Port as the part item here; don''t also log the Charging Port job.'),
  ('sys_hybrid', 'ev_onboard_charger', 'On-Board Charger', 'HEV-OBC', 160, true, 'replace', 'spark', 'High-voltage: lockout first.',
   'The unit that turns AC from a home or public charger into DC for the drive battery. High-voltage work: lockout first.'),
  ('sys_hybrid', 'ev_dc_dc_converter', 'DC-DC Converter', 'HEV-DCDC', 170, true, 'replace', 'spark', 'High-voltage: lockout first.',
   'The unit that charges the 12V battery from the high-voltage battery. If it fails, the 12V battery goes flat and the car shuts down. High-voltage work: lockout first.'),
  ('sys_hybrid', 'ev_traction_motor', 'Traction Motor', 'HEV-MOTOR', 180, true, 'replace', 'gears', 'High-voltage: lockout first.',
   'The electric motor that drives the wheels. High-voltage work: lockout first.'),
  ('sys_hybrid', 'ev_reduction_gear_oil', 'Reduction Gear Oil Change', 'HEV-RGO', 190, false, 'replace', 'oil', NULL,
   'Draining and refilling the oil in the single-speed gearbox behind an EV motor. EVs only.'),
  ('sys_hvac', 'electric_ac_compressor', 'Electric A/C Compressor', 'HVAC-ECOMP', 120, true, 'replace', 'wind', 'POE oil only. High-voltage: lockout first.',
   'The high-voltage electric A/C compressor on hybrids and EVs. It must only get non-conductive POE oil. High-voltage work: lockout first. When the compressor is replaced, the refrigerant is logged here; don''t also log A/C Recharge for the same visit. New A/C O-rings and a receiver-drier: add them as Other items until the HVAC file adds them as parts.'),
  ('sys_hvac', 'ac_recharge', 'A/C Recharge', 'HVAC-RECH', 130, false, 'top_up', 'wind', 'Tick the refrigerant the bonnet label names.',
   'Recovering, vacuuming and refilling the A/C refrigerant, on any car, when the A/C blows warm or after a leak repair. If a compressor is being replaced, log the refrigerant on Electric A/C Compressor instead; don''t log both for the same visit.')
) AS j(sys_code, code, name, op_code, sort_order, is_part, action, icon_key, hint, description)
JOIN public.maintenance_service_categories sys ON sys.code = j.sys_code
ON CONFLICT (code) DO NOTHING;

-- May-need links
WITH wanted (job_code, supply_name, part_code, need, qty_hint, note, sort_order) AS (VALUES
  ('hv_cable', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, 'Never grease HV connectors unless the car maker says so.', 10),
  ('hv_cable', 'Dielectric Grease', NULL, 'sometimes', 1::numeric, 'Only where the car maker specifies it.', 20),
  ('ev_battery_coolant_service', 'EV Battery Coolant', NULL, 'usually', NULL::numeric, 'Amount depends on the car. Use the type the car maker specifies.', 10),
  ('ev_battery_coolant_service', 'Distilled Water', NULL, 'sometimes', NULL::numeric, 'Only if the coolant is a concentrate.', 20),
  ('ev_battery_coolant_pump', 'EV Battery Coolant', NULL, 'usually', NULL::numeric, 'Refill after the pump is changed.', 10),
  ('ev_battery_coolant_pump', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, NULL, 20),
  ('ev_battery_coolant_pump', 'Dielectric Grease', NULL, 'sometimes', 1::numeric, 'Pump connector (low-voltage) only.', 30),
  ('ev_charging_port', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, 'Never grease the charging pins.', 10),
  ('ev_charging_port_cleaning', 'Electrical Contact Cleaner', NULL, 'usually', 1::numeric, 'Charging pins. Never grease them.', 10),
  ('ev_charging_port_cleaning', NULL, 'ev_charging_port', 'sometimes', 1::numeric, 'If the pins are burnt, bent or loose.', 20),
  ('ev_onboard_charger', 'EV Battery Coolant', NULL, 'sometimes', NULL::numeric, 'If the charger is liquid-cooled.', 10),
  ('ev_onboard_charger', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, NULL, 20),
  ('ev_dc_dc_converter', 'EV Battery Coolant', NULL, 'sometimes', NULL::numeric, 'If the converter is liquid-cooled.', 10),
  ('ev_dc_dc_converter', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, NULL, 20),
  ('ev_traction_motor', 'EV Reduction Gear Oil', NULL, 'sometimes', NULL::numeric, 'If the gearbox is opened.', 10),
  ('ev_traction_motor', 'EV Battery Coolant', NULL, 'sometimes', NULL::numeric, 'If the motor is liquid-cooled.', 20),
  ('ev_traction_motor', 'Electrical Contact Cleaner', NULL, 'sometimes', 1::numeric, NULL, 30),
  ('ev_reduction_gear_oil', 'EV Reduction Gear Oil', NULL, 'usually', NULL::numeric, 'Amount depends on the car.', 10),
  ('electric_ac_compressor', 'POE Compressor Oil (Non-Conductive)', NULL, 'usually', 1::numeric, 'POE only. Never PAG oil in an electric compressor.', 10),
  ('electric_ac_compressor', 'A/C Refrigerant R-134a', NULL, 'usually', NULL::numeric, 'Only if the bonnet label says R-134a. Recharged after the compressor is changed.', 20),
  ('electric_ac_compressor', 'A/C Refrigerant R-1234yf', NULL, 'usually', NULL::numeric, 'Only if the bonnet label says R-1234yf. Recharged after the compressor is changed.', 30),
  ('ac_recharge', 'A/C Refrigerant R-134a', NULL, 'usually', NULL::numeric, 'Only if the bonnet label says R-134a. Amount is on the label.', 10),
  ('ac_recharge', 'A/C Refrigerant R-1234yf', NULL, 'usually', NULL::numeric, 'Only if the bonnet label says R-1234yf. Amount is on the label.', 15),
  ('ac_recharge', 'POE Compressor Oil (Non-Conductive)', NULL, 'sometimes', 1::numeric, 'Electric compressors only.', 20),
  ('ac_recharge', 'UV Leak Detection Dye', NULL, 'sometimes', 1::numeric, 'Only a dye approved for the system; check before using it on an electric compressor.', 30)
)
INSERT INTO public.maintenance_job_item (job_id, supply_id, part_type_id, need, qty_hint, note, sort_order)
SELECT j.id, s.id, p.id, w.need, w.qty_hint, w.note, w.sort_order
FROM wanted w
JOIN public.maintenance_service_categories j ON j.code = w.job_code AND j.kind = 'component'
LEFT JOIN public.maintenance_supply s ON lower(s.name) = lower(w.supply_name) AND s.status = 'active'
LEFT JOIN public.maintenance_service_categories p ON p.code = w.part_code AND p.kind = 'component'
WHERE (s.id IS NOT NULL OR p.id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.maintenance_job_item x
    WHERE x.job_id = j.id AND x.removed_at IS NULL
      AND (x.supply_id = s.id OR x.part_type_id = p.id)
  );

-- Double-log rule on the live hybrid pair (Inverter Coolant Pump / Inverter Coolant Service): when a
-- fluid-carrying part is replaced, the fluid is logged on the part job, not on the separate fluid service.
UPDATE public.maintenance_service_categories
SET description = description || ' If the inverter coolant pump is being replaced, log the coolant on Inverter Coolant Pump instead; don''t log both for the same visit.'
WHERE code = 'inverter_coolant_service' AND description NOT LIKE '%don''t log both%';
UPDATE public.maintenance_service_categories
SET description = description || ' The refill coolant is logged here; don''t also log Inverter Coolant Service for the same visit.'
WHERE code = 'inverter_coolant_pump' AND description NOT LIKE '%don''t also log%';

COMMIT;

-- Check: 12 rows (supplies/part items). Hybrid & electric: 0/0, 2/0, 2/0, 3/0, 1/0, 1/1, 2/0, 2/0, 3/0, 1/0.
-- HVAC: Electric A/C Compressor 3/0, A/C Recharge 4/0.
SELECT j.name AS job, sys.name AS "group", CASE WHEN j.is_part THEN 'part job' ELSE 'service' END AS kind,
  count(x.supply_id) AS supplies, count(x.part_type_id) AS part_items
FROM public.maintenance_service_categories j
JOIN public.maintenance_service_categories sys ON sys.id = j.parent_id
LEFT JOIN public.maintenance_job_item x ON x.job_id = j.id AND x.removed_at IS NULL
WHERE j.code IN ('hv_insulation_inspection','hv_cable','ev_battery_coolant_service','ev_battery_coolant_pump','ev_charging_port',
                 'ev_charging_port_cleaning','ev_onboard_charger','ev_dc_dc_converter','ev_traction_motor','ev_reduction_gear_oil','electric_ac_compressor','ac_recharge')
GROUP BY j.name, sys.name, j.is_part, j.sort_order
ORDER BY sys.name, j.sort_order;
