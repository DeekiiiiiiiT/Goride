#!/usr/bin/env node
/**
 * Suggested May-need supplies per job (owner review list, 15 Nov 2026).
 * One source → docs/service-items-build/may-need-suggestions.md (to review) and
 * docs/service-items-build/live/may-need-suggestions.sql (to run after review).
 *   node scripts/may-need-suggestions.mjs
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const U = 'usually';
const S = 'sometimes';

// [group, job name, job code, [[supply, need, qtyHint|null, note|null], ...]]
const JOBS = [
  ['Engine', 'Engine oil', 'oil', [['Engine Oil', U, null, 'Amount depends on the car.']]],
  ['Engine', 'Spark Plugs', 'spark_plugs', [['Anti-Seize Compound', S, 1, 'Only if the plug maker allows it.'], ['Dielectric Grease', S, 1, 'Inside the coil boots.']]],
  ['Engine', 'Throttle Body Cleaning', 'throttle_body_cleaning', [['Throttle body cleaner', U, 1, null], ['MAF Sensor Cleaner', S, 1, 'If the air flow sensor is cleaned too.']]],
  ['Engine', 'Leak Inspection', 'leak_inspection', [['Degreaser', S, 1, 'Clean the area to find the leak.'], ['UV Leak Detection Dye', S, 1, null]]],
  ['Engine', 'Fuel Injector Cleaning / Induction Service', 'fuel_induction_service', [['Induction / Fuel Injector Cleaner', U, 1, null], ['Throttle body cleaner', S, 1, null], ['MAF Sensor Cleaner', S, 1, null]]],
  ['Engine', 'Spark Plug Wires', 'spark_plug_wires', [['Dielectric Grease', U, 1, null]]],
  ['Engine', 'PCV Valve', 'pcv_valve', [['Brake Cleaner', S, 1, null], ['Thread Sealant', S, 1, null]]],
  ['Engine', 'Timing Belt', 'timing_belt', [['Coolant / Antifreeze', S, null, 'If the cooling system is opened.'], ['Thread-Locking Fluid', S, 1, null]]],
  ['Engine', 'Timing Chain & Tensioner', 'timing_chain', [['Engine Oil', U, null, 'Oil is drained for this job.'], ['Assembly Lube', S, 1, null], ['Thread-Locking Fluid', S, 1, null]]],
  ['Engine', 'Valve Cover Gasket', 'valve_cover_gasket', [['Brake Cleaner', U, 1, 'Clean the sealing surface.'], ['RTV Gasket Sealant', S, 1, 'At the corners and joints.'], ['Degreaser', S, 1, null]]],
  ['Engine', 'Oil Pan Gasket', 'oil_pan_gasket', [['Engine Oil', U, null, 'Oil is drained for this job.'], ['Brake Cleaner', U, 1, 'Clean the sealing surface.'], ['RTV Gasket Sealant', U, 1, null]]],
  ['Engine', 'Intake Manifold Gasket', 'intake_manifold_gasket', [['Brake Cleaner', S, 1, 'Clean the sealing surface.'], ['RTV Gasket Sealant', S, 1, null], ['Throttle body cleaner', S, 1, null]]],
  ['Engine', 'Head Gasket', 'head_gasket', [['Engine Oil', U, null, null], ['Coolant / Antifreeze', U, null, null], ['Brake Cleaner', U, 1, 'Clean the sealing surfaces.'], ['RTV Gasket Sealant', S, 1, 'Cover joints.']]],
  ['Engine', 'Piston Ring Replacement', 'piston_rings', [['Assembly Lube', U, 1, null], ['Engine Oil', U, null, null], ['Coolant / Antifreeze', S, null, null]]],
  ['Engine', 'Engine Overhaul / Rebuild', 'engine_overhaul', [['Assembly Lube', U, 1, null], ['Engine Oil', U, null, null], ['Coolant / Antifreeze', U, null, null], ['Brake Cleaner', U, 2, null], ['RTV Gasket Sealant', U, 1, null], ['Degreaser', S, 1, null], ['Thread-Locking Fluid', S, 1, null]]],
  ['Engine', 'Fuel Injector Replacement', 'fuel_injector', [['Electrical Contact Cleaner', S, 1, null], ['Dielectric Grease', S, 1, 'For the connectors.']]],
  ['Engine', 'Valve Stem Seal Replacement', 'valve_stem_seals', [['Assembly Lube', S, 1, null], ['Engine Oil', S, null, null]]],
  ['Engine', 'Valve Grinding & Seating', 'valve_grinding_seating', [['Valve Grinding Compound', U, 1, null], ['Assembly Lube', S, 1, null]]],
  ['Engine', 'Piston Replacement', 'piston_replacement', [['Assembly Lube', U, 1, null], ['Engine Oil', U, null, null], ['Coolant / Antifreeze', S, null, null]]],
  ['Engine', 'Cylinder Honing / Boring', 'cylinder_honing', [['Assembly Lube', S, 1, null], ['Honing Oil', U, 1, null]]],
  ['Engine', 'Connecting Rod Bearing Replacement', 'rod_bearings', [['Assembly Lube', U, 1, null], ['Engine Oil', U, null, null], ['Plastigauge', S, 1, 'To check bearing clearance.']]],
  ['Engine', 'Main Bearing Replacement', 'main_bearings', [['Assembly Lube', U, 1, null], ['Engine Oil', U, null, null], ['Plastigauge', S, 1, 'To check bearing clearance.']]],
  ['Engine', 'Oxygen sensor', 'oxygen_sensor', [['Anti-Seize Compound', S, 1, 'Only if the new sensor is not pre-coated.'], ['Penetrating Oil', S, 1, 'For a seized old sensor.'], ['Dielectric Grease', S, 1, 'For the connector.'], ['Electrical Contact Cleaner', S, 1, null]]],
  ['Engine', 'Thermostat', 'thermostat', [['Coolant / Antifreeze', U, null, null], ['RTV Gasket Sealant', S, 1, 'If the housing has no gasket.'], ['Brake Cleaner', S, 1, 'Clean the sealing surface.'], ['Thread Sealant', S, 1, 'For a sensor or fitting thread.']]],
  ['Engine', 'Water pump', 'water_pump', [['Coolant / Antifreeze', U, null, null], ['RTV Gasket Sealant', S, 1, 'If the pump has no gasket.'], ['Brake Cleaner', S, 1, 'Clean the sealing surface.'], ['Thread-Locking Fluid', S, 1, null], ['Thread Sealant', S, 1, 'For a sensor or fitting thread.']]],
  ['Engine', 'Ignition coil', 'ignition_coil', [['Dielectric Grease', S, 1, null], ['Electrical Contact Cleaner', S, 1, null]]],
  ['Filters', 'Cabin Air Filter', 'cabin_air_filter', [['Cabin Filter Housing Cleaner', S, 1, null]]],
  ['Filters', 'Engine Air Filter', 'air_filter', [['MAF Sensor Cleaner', S, 1, 'If the air flow sensor is cleaned too.']]],
  ['Filters', 'Oil filter', 'oil_filter', [['Engine Oil', S, null, 'When the oil is not logged as its own job.']]],
  ['Filters', 'Fuel filter', 'fuel_filter', [['Penetrating Oil', S, 1, 'For seized fittings.'], ['Brake Cleaner', S, 1, null]]],
  ['Tires & wheels', 'Tire Change', 'tires', [['Tire Mounting Lube', U, 1, null], ['Tire Valve Stem', S, 1, 'One per tire.'], ['Wheel Weights', S, null, null], ['Tire Valve Core', S, 1, null]]],
  ['Tires & wheels', 'Wheel Alignment', 'wheel_alignment', [['Penetrating Oil', S, 1, 'For seized adjusters.']]],
  ['Tires & wheels', 'Wheel Balancing', 'wheel_balancing', [['Wheel Weights', U, null, null]]],
  ['Tires & wheels', 'Puncture Repair', 'puncture_repair', [['Tire Patch / Plug Kit', U, 1, null], ['Rubber Cement', S, 1, null], ['Tire Valve Core', S, 1, null]]],
  ['Brakes', 'Brake shoes', 'brake_shoes_drums', [['Brake Cleaner', U, 2, null], ['Silicone Brake Grease', U, 1, 'On the backing plate contact points.'], ['Penetrating Oil', S, 1, null]]],
  ['Brakes', 'Brakes', 'brakes', [['Brake Cleaner', U, 2, null], ['Silicone Brake Grease', U, 1, 'Slide pins and pad contact points.'], ['Penetrating Oil', S, 1, null], ['Brake Anti-Squeal Compound', U, 1, 'Back of the pads.'], ['Thread-Locking Fluid', S, 1, 'Caliper bracket bolts.']]],
  ['Brakes', 'Brake Fluid', 'brake_fluid', [['Brake Fluid', U, 1, null]]],
  ['Brakes', 'Brake rotor', 'brake_rotor', [['Brake Cleaner', U, 1, null], ['Penetrating Oil', S, 1, null], ['Anti-Seize Compound', S, 1, 'On the hub face.'], ['Brake Anti-Squeal Compound', S, 1, null]]],
  ['Brakes', 'Brake caliper', 'brake_caliper', [['Brake Fluid', U, 1, null], ['Brake Cleaner', U, 1, null], ['Silicone Brake Grease', U, 1, 'Slide pins.'], ['Penetrating Oil', S, 1, null], ['Brake Anti-Squeal Compound', S, 1, null], ['Thread-Locking Fluid', S, 1, 'Caliper bracket bolts.']]],
  ['Brakes', 'Brake drum', 'brake_drum', [['Brake Cleaner', U, 1, null], ['Silicone Brake Grease', S, 1, null], ['Penetrating Oil', S, 1, null]]],
  ['Brakes', 'Wheel cylinder', 'brake_wheel_cylinder', [['Brake Fluid', U, 1, null], ['Brake Cleaner', U, 1, null], ['Silicone Brake Grease', S, 1, null], ['Penetrating Oil', S, 1, 'For a seized bleeder.']]],
  ['Brakes', 'Brake hose', 'brake_hose', [['Brake Fluid', U, 1, null], ['Penetrating Oil', S, 1, null], ['Brake Cleaner', S, 1, null]]],
  ['Brakes', 'Master cylinder', 'brake_master_cylinder', [['Brake Fluid', U, 1, null], ['Brake Cleaner', S, 1, null], ['Penetrating Oil', S, 1, 'For seized fittings.']]],
  ['Brakes', 'Handbrake cable', 'handbrake_cable', [['Penetrating Oil', S, 1, null], ['White Lithium Grease', S, 1, null]]],
  ['Brakes', 'ABS wheel sensor', 'abs_wheel_sensor', [['Electrical Contact Cleaner', S, 1, null], ['Dielectric Grease', S, 1, null], ['Brake Cleaner', S, 1, 'Clean the mounting area.']]],
  ['Fluids', 'Engine oil', 'engine_oil_part', [['Engine Oil', U, null, 'Amount depends on the car.']]],
  ['Fluids', 'Fluids (Washer / Coolant)', 'fluids', [['Washer Fluid', S, null, null], ['Coolant / Antifreeze', S, null, null]]],
  ['Fluids', 'Coolant', 'coolant_part', [['Coolant / Antifreeze', U, null, null]]],
  ['Fluids', 'Washer fluid', 'washer_fluid_part', [['Washer Fluid', U, null, null]]],
  ['Fluids', 'Radiator Coolant Flush', 'coolant_flush', [['Coolant / Antifreeze', U, null, 'Amount depends on the car.'], ['Radiator Flush', U, 1, null], ['Distilled Water', S, null, null]]],
  ['Lighting & visibility', 'Brake and tail bulb', 'LGT-TAIL', [['Dielectric Grease', S, 1, null]]],
  ['Lighting & visibility', 'Headlight bulb', 'LGT-HEAD', [['Dielectric Grease', S, 1, null]]],
  ['Lighting & visibility', 'Indicator bulb', 'LGT-IND', [['Dielectric Grease', S, 1, null]]],
  ['Lighting & visibility', 'Lights Check', 'lights', [['Dielectric Grease', S, 1, null]]],
  ['Lighting & visibility', 'Fog light bulb', 'fog_light_bulb', [['Dielectric Grease', S, 1, null]]],
  ['Lighting & visibility', 'Wiper Blades', 'wipers', [['Glass Cleaner', S, 1, null]]],
  ['Suspension & steering', 'Front Stabilizer Bar', 'front_stabilizer_bar', [['Penetrating Oil', U, 1, 'For rusted nuts.'], ['Silicone Rubber Grease', S, 1, 'For the bushings.'], ['Thread-Locking Fluid', S, 1, null]]],
  ['Suspension & steering', 'Front Stabilizer Link', 'front_stabilizer_link', [['Penetrating Oil', U, 1, 'For rusted nuts.'], ['Thread-Locking Fluid', S, 1, null]]],
  ['Suspension & steering', 'Rear Stabilizer Bar', 'rear_stabilizer_bar', [['Penetrating Oil', U, 1, 'For rusted nuts.'], ['Silicone Rubber Grease', S, 1, 'For the bushings.'], ['Thread-Locking Fluid', S, 1, null]]],
  ['Suspension & steering', 'Rear Stabilizer Link', 'rear_stabilizer_link', [['Penetrating Oil', U, 1, 'For rusted nuts.'], ['Thread-Locking Fluid', S, 1, null]]],
  ['Suspension & steering', 'Suspension', 'suspension', [['Penetrating Oil', S, 1, null], ['Thread-Locking Fluid', S, 1, null]]],
  ['Suspension & steering', 'Shock absorber', 'shock_absorber', [['Penetrating Oil', S, 1, null], ['Thread-Locking Fluid', S, 1, null]]],
  ['Transmission', 'Transmission Fluid', 'transmission', [['Transmission Fluid', U, null, 'Amount depends on the car.'], ['RTV Gasket Sealant', S, 1, 'If the pan is sealed with sealant.'], ['Thread Sealant', S, 1, 'Drain plug, if needed.']]],
  ['HVAC', 'Cabin A/C Filter', 'cabin_filter', [['Cabin Filter Housing Cleaner', S, 1, null]]],
  ['Battery & electrical', 'Alternator', 'ELEC-ALT', [['Electrical Contact Cleaner', S, 1, null], ['Dielectric Grease', S, 1, null]]],
  ['Battery & electrical', 'Battery', 'ELEC-BATT', [['Electrical Contact Cleaner', S, 1, 'For the terminals.'], ['Battery Terminal Protector', S, 1, null], ['Dielectric Grease', S, 1, 'Protects the terminals.']]],
  ['Battery & electrical', 'Starter motor', 'ELEC-START', [['Penetrating Oil', S, 1, null], ['Electrical Contact Cleaner', S, 1, null], ['Dielectric Grease', S, 1, null]]],
];

const NONE = [
  'Engine service labor', 'Throttle Body Relearn', 'Valve Clearance Adjustment',
  'Cylinder Head Machining / Resurfacing', 'Crankshaft Machining / Polishing',   'Tire Pressure Check', 'Rotate Tires', 'Wheel Straightening & Refurbishing', 'Drive / Serpentine Belt',
  'Inspection / diagnostic fee',
];

const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const links = JOBS.flatMap(([, , code, items]) =>
  items.map(([supply, need, qty, note], i) => ({ code, supply, need, qty, note, sort: (i + 1) * 10 })));

// --- review doc
let md = `# Suggested May-need supplies — for the owner to check (15 Nov 2026)\n\n`;
md += `${JOBS.length} jobs get ${links.length} suggestions. **Usually** = used almost every time; **Sometimes** = only when needed. `;
md += `A blank amount means it depends on the car (your team types it). Nothing is ticked for you in Fleet — these are only offered.\n\n`;
md += `Change anything you like: tell Claude, or edit in Dominion after it's added. Run \`docs/service-items-build/live/may-need-suggestions.sql\` only after you're happy.\n\n`;
let grp = '';
for (const [g, name, , items] of JOBS) {
  if (g !== grp) { md += `\n## ${g}\n\n| Job | Supply | How often | Usual amount | Note |\n|---|---|---|---|---|\n`; grp = g; }
  items.forEach(([supply, need, qty, note], i) => {
    md += `| ${i === 0 ? `**${name}**` : ''} | ${supply} | ${need === U ? 'Usually' : 'Sometimes'} | ${qty ?? '—'} | ${note ?? ''} |\n`;
  });
}
md += `\n## Jobs with no supplies suggested (${NONE.length})\n\n${NONE.join(', ')}.\n\n`;
md += `The new supplies this list needs (RTV Gasket Sealant, Silicone Brake Grease, Brake Anti-Squeal Compound and others) are added first by \`docs/service-items-build/live/supplies-add-2.sql\`.\n`;
writeFileSync(join(root, 'docs/service-items-build/may-need-suggestions.md'), md);

// --- SQL
let sql = `-- Suggested May-need supplies (owner-reviewed list: docs/service-items-build/may-need-suggestions.md).\n`;
sql += `-- Paste ALL into the Supabase SQL editor (live project) and Run. Safe to run again: links that already exist are skipped.\n`;
sql += `-- A job or supply name that isn't found is skipped (shown in the check at the bottom).\n\n`;
sql += `WITH wanted (job_code, supply_name, need, qty_hint, note, sort_order) AS (VALUES\n`;
sql += links.map((l) => `  (${q(l.code)}, ${q(l.supply)}, ${q(l.need)}, ${l.qty == null ? 'NULL::numeric' : `${l.qty}::numeric`}, ${q(l.note)}, ${l.sort})`).join(',\n');
sql += `\n)\nINSERT INTO public.maintenance_job_item (job_id, supply_id, need, qty_hint, note, sort_order)\n`;
sql += `SELECT j.id, s.id, w.need, w.qty_hint, w.note,\n`;
sql += `  w.sort_order + coalesce((SELECT max(x.sort_order) FROM public.maintenance_job_item x WHERE x.job_id = j.id AND x.removed_at IS NULL), 0)\n`;
sql += `FROM wanted w\nJOIN public.maintenance_service_categories j ON j.code = w.job_code AND j.kind = 'component'\n`;
sql += `JOIN public.maintenance_supply s ON lower(s.name) = lower(w.supply_name) AND s.status = 'active'\n`;
sql += `WHERE NOT EXISTS (\n  SELECT 1 FROM public.maintenance_job_item x\n  WHERE x.job_id = j.id AND x.supply_id = s.id AND x.removed_at IS NULL\n);\n\n`;
sql += `-- Check: anything in the list that wasn't found (should be empty).\n`;
sql += `WITH wanted (job_code, supply_name) AS (VALUES\n`;
sql += links.map((l) => `  (${q(l.code)}, ${q(l.supply)})`).join(',\n');
sql += `\n)\nSELECT w.job_code, w.supply_name,\n  (j.id IS NULL) AS job_missing, (s.id IS NULL) AS supply_missing\nFROM wanted w\n`;
sql += `LEFT JOIN public.maintenance_service_categories j ON j.code = w.job_code AND j.kind = 'component'\n`;
sql += `LEFT JOIN public.maintenance_supply s ON lower(s.name) = lower(w.supply_name) AND s.status = 'active'\n`;
sql += `WHERE j.id IS NULL OR s.id IS NULL;\n`;
writeFileSync(join(root, 'docs/service-items-build/live/may-need-suggestions.sql'), sql);

console.log(`${JOBS.length} jobs, ${links.length} links, ${NONE.length} with none`);
