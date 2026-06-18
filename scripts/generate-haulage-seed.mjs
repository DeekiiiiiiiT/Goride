#!/usr/bin/env node
/**
 * Generates supabase/migrations/20260619150000_haulage_catalog_seed.sql
 * Run: node scripts/generate-haulage-seed.mjs
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Tier defaults (weight kg, L x W x H cm, body slug)
const TIERS = {
  compact: { w: 25, l: 50, wd: 40, h: 40, body: 'sedan' },
  standard: { w: 60, l: 80, wd: 60, h: 100, body: 'pickup' },
  large: { w: 120, l: 120, wd: 80, h: 150, body: 'cargo-van' },
  commercial: { w: 200, l: 180, wd: 100, h: 180, body: 'box-truck' },
};

const SPEC_OVERRIDES = {
  'refrigerator:french_door': { w: 136, l: 91, wd: 89, h: 178, body: 'cargo-van', upright: true, gear: ['dolly', 'straps', 'blankets'] },
  'refrigerator:side_by_side': { w: 136, l: 91, wd: 89, h: 178, body: 'cargo-van', upright: true, gear: ['dolly', 'straps', 'blankets'] },
  'refrigerator:compact': { w: 27, l: 51, wd: 51, h: 84, body: 'suv', upright: true },
  'refrigerator:commercial': { w: 250, l: 100, wd: 90, h: 180, body: 'box-truck', upright: true },
  'microwave:compact': { w: 12, l: 50, wd: 35, h: 28, body: 'sedan' },
  'microwave:standard': { w: 16, l: 61, wd: 41, h: 30, body: 'sedan', fragile: true },
  'microwave:large': { w: 27, l: 76, wd: 41, h: 41, body: 'suv' },
  'microwave:commercial': { w: 40, l: 80, wd: 50, h: 45, body: 'pickup' },
  'bed_frame:twin': { w: 20, l: 97, wd: 38, h: 25, body: 'suv' },
  'bed_frame:queen': { w: 32, l: 203, wd: 60, h: 30, body: 'pickup' },
  'bed_frame:king': { w: 41, l: 203, wd: 76, h: 30, body: 'cargo-van' },
  'bed_frame:bunk': { w: 55, l: 200, wd: 100, h: 160, body: 'cargo-van', disassembly: true },
};

const categories = [
  { id: 'appliances', title: 'Appliances', description: 'Kitchen, laundry, and home appliances', icon: 'kitchen', sort: 10 },
  { id: 'furniture', title: 'Furniture', description: 'Sofas, beds, and office furniture', icon: 'weekend', sort: 20 },
  { id: 'electronics', title: 'Electronics', description: 'TVs and equipment', icon: 'tv', sort: 30 },
  { id: 'other', title: 'Other', description: 'Custom freight and mixed loads', icon: 'inventory_2', sort: 40 },
];

const subgroups = [
  { id: 'major_kitchen', category_id: 'appliances', title: 'Major kitchen', sort: 10 },
  { id: 'laundry', category_id: 'appliances', title: 'Laundry', sort: 20 },
  { id: 'mid_sized', category_id: 'appliances', title: 'Mid-sized', sort: 30 },
  { id: 'climate_control', category_id: 'appliances', title: 'Climate control', sort: 40 },
  { id: 'utility_outdoor', category_id: 'appliances', title: 'Utility & outdoor', sort: 50 },
  { id: 'small_appliances', category_id: 'appliances', title: 'Small appliances', sort: 60 },
];

const STANDARD = ['standard', 'compact', 'large', 'commercial'];
const STANDARD_LABELS = { standard: 'Standard', compact: 'Compact', large: 'Large', commercial: 'Commercial' };

const items = [
  { id: 'refrigerator', cat: 'appliances', sub: 'major_kitchen', title: 'Refrigerator', subtitle: 'Full-size or compact fridge', icon: 'refrigerator', emoji: '❄️', sort: 10,
    variants: [{ id: 'french_door', label: 'French door' }, { id: 'side_by_side', label: 'Side-by-side' }, { id: 'compact', label: 'Compact / mini' }, { id: 'commercial', label: 'Commercial' }] },
  { id: 'freezer', cat: 'appliances', sub: 'major_kitchen', title: 'Freezer', subtitle: 'Standalone freezer', icon: 'severe_cold', emoji: '🧊', sort: 20,
    variants: [{ id: 'upright', label: 'Upright' }, { id: 'chest', label: 'Chest' }, { id: 'compact', label: 'Compact' }, { id: 'commercial', label: 'Commercial' }] },
  { id: 'stove', cat: 'appliances', sub: 'major_kitchen', title: 'Stove / range', subtitle: 'Freestanding cooker', icon: 'skillet', emoji: '🍳', sort: 30,
    variants: [{ id: 'gas', label: 'Gas' }, { id: 'electric', label: 'Electric' }, { id: 'dual', label: 'Dual fuel' }, { id: 'professional', label: 'Professional' }] },
  { id: 'wall_oven', cat: 'appliances', sub: 'major_kitchen', title: 'Wall oven', subtitle: 'Built-in oven', icon: 'oven', emoji: '🥘', sort: 40,
    variants: [{ id: 'single', label: 'Single' }, { id: 'double', label: 'Double' }, { id: 'compact', label: 'Compact' }, { id: 'commercial', label: 'Commercial' }] },
  { id: 'dishwasher', cat: 'appliances', sub: 'major_kitchen', title: 'Dishwasher', subtitle: 'Built-in or portable', icon: 'flatware', emoji: '🍽️', sort: 50,
    variants: [{ id: 'standard_24', label: '24" standard' }, { id: 'compact_18', label: '18" compact' }, { id: 'drawer', label: 'Drawer' }, { id: 'portable', label: 'Portable' }] },
  { id: 'washing_machine', cat: 'appliances', sub: 'laundry', title: 'Washing machine', subtitle: 'Front or top load', icon: 'local_laundry_service', emoji: '🧺', sort: 60,
    variants: [{ id: 'front_load', label: 'Front load' }, { id: 'top_load', label: 'Top load' }, { id: 'combo', label: 'Combo' }, { id: 'stackable', label: 'Stackable' }] },
  { id: 'dryer', cat: 'appliances', sub: 'laundry', title: 'Dryer', subtitle: 'Electric or gas dryer', icon: 'dry', emoji: '💨', sort: 70,
    variants: [{ id: 'electric', label: 'Electric' }, { id: 'gas', label: 'Gas' }, { id: 'compact', label: 'Compact' }, { id: 'commercial', label: 'Commercial' }] },
  { id: 'stacked_combo', cat: 'appliances', sub: 'laundry', title: 'Stacked washer/dryer', subtitle: 'Laundry tower', icon: 'view_column', emoji: '🧱', sort: 80,
    variants: STANDARD.map((id) => ({ id, label: STANDARD_LABELS[id] })) },
  { id: 'microwave', cat: 'appliances', sub: 'mid_sized', title: 'Microwave', subtitle: 'Countertop or built-in', icon: 'microwave', emoji: '🍿', sort: 90,
    variants: STANDARD.map((id) => ({ id, label: STANDARD_LABELS[id] })) },
  { id: 'wine_cooler', cat: 'appliances', sub: 'mid_sized', title: 'Wine cooler', subtitle: 'Beverage cooler', icon: 'wine_bar', emoji: '🍷', sort: 100,
    variants: STANDARD.map((id) => ({ id, label: STANDARD_LABELS[id] })) },
  { id: 'water_cooler', cat: 'appliances', sub: 'mid_sized', title: 'Water cooler', subtitle: 'Dispenser unit', icon: 'water_drop', emoji: '🚰', sort: 110,
    variants: STANDARD.map((id) => ({ id, label: STANDARD_LABELS[id] })) },
  { id: 'air_conditioner', cat: 'appliances', sub: 'climate_control', title: 'Air conditioner', subtitle: 'Window or portable AC', icon: 'ac_unit', emoji: '🌡️', sort: 120,
    variants: [{ id: 'window', label: 'Window' }, { id: 'portable', label: 'Portable' }, { id: 'split', label: 'Split unit' }, { id: 'commercial', label: 'Commercial' }] },
  { id: 'dehumidifier', cat: 'appliances', sub: 'climate_control', title: 'Dehumidifier', subtitle: 'Portable unit', icon: 'humidity_low', emoji: '☁️', sort: 130,
    variants: STANDARD.map((id) => ({ id, label: STANDARD_LABELS[id] })) },
  { id: 'water_heater', cat: 'appliances', sub: 'utility_outdoor', title: 'Water heater', subtitle: 'Tank or tankless', icon: 'water_heater', emoji: '🔥', sort: 140,
    variants: [{ id: 'tank', label: 'Tank' }, { id: 'tankless', label: 'Tankless' }, { id: 'hybrid', label: 'Hybrid' }, { id: 'commercial', label: 'Commercial' }] },
  { id: 'bbq_grill', cat: 'appliances', sub: 'utility_outdoor', title: 'BBQ grill', subtitle: 'Outdoor grill', icon: 'outdoor_grill', emoji: '🍖', sort: 150,
    variants: [{ id: 'gas', label: 'Gas' }, { id: 'charcoal', label: 'Charcoal' }, { id: 'pellet', label: 'Pellet' }, { id: 'built_in', label: 'Built-in' }] },
  { id: 'countertop_bundle', cat: 'appliances', sub: 'small_appliances', title: 'Countertop bundle', subtitle: 'Small appliances box', icon: 'blender', emoji: '🥤', sort: 160,
    variants: [{ id: 'small', label: 'Small' }, { id: 'medium', label: 'Medium' }, { id: 'large', label: 'Large' }, { id: 'mixed', label: 'Mixed' }] },
  { id: 'vacuum_cleaner', cat: 'appliances', sub: 'small_appliances', title: 'Vacuum cleaner', subtitle: 'Upright or canister', icon: 'cleaning_services', emoji: '🧹', sort: 170,
    variants: STANDARD.map((id) => ({ id, label: STANDARD_LABELS[id] })) },
  { id: 'sofa', cat: 'furniture', sub: null, title: 'Sofa', subtitle: 'Living room seating', icon: 'weekend', emoji: null, sort: 10,
    variants: [{ id: 'two_seater', label: 'Two seater' }, { id: 'three_seater', label: 'Three seater' }, { id: 'sectional', label: 'Sectional' }, { id: 'recliner', label: 'Recliner' }] },
  { id: 'bed_frame', cat: 'furniture', sub: null, title: 'Bed / mattress', subtitle: 'Mattress or bed frame', icon: 'bed', emoji: null, sort: 20,
    variants: [{ id: 'twin', label: 'Twin / single' }, { id: 'queen', label: 'Queen' }, { id: 'king', label: 'King' }, { id: 'bunk', label: 'Bunk' }] },
  { id: 'office_set', cat: 'furniture', sub: null, title: 'Office set', subtitle: 'Desk and chair', icon: 'chair', emoji: null, sort: 30,
    variants: [{ id: 'desk', label: 'Desk' }, { id: 'chair', label: 'Chair' }, { id: 'cabinet', label: 'Cabinet' }, { id: 'full_set', label: 'Full set' }] },
  { id: 'tv', cat: 'electronics', sub: null, title: 'Television', subtitle: 'Flat panel TV', icon: 'tv', emoji: null, sort: 10,
    variants: [{ id: 'under_50', label: 'Under 50"' }, { id: 'inch_50_65', label: '50–65"' }, { id: 'over_65', label: 'Over 65"' }, { id: 'commercial_display', label: 'Commercial display' }] },
  { id: 'server_rack', cat: 'electronics', sub: null, title: 'Server rack', subtitle: 'IT equipment', icon: 'dns', emoji: null, sort: 20,
    variants: [{ id: 'single', label: 'Single unit' }, { id: 'half_rack', label: 'Half rack' }, { id: 'full_rack', label: 'Full rack' }, { id: 'custom', label: 'Custom' }] },
  { id: 'custom_freight', cat: 'other', sub: null, title: 'Custom freight', subtitle: 'Crates, pallets, machinery', icon: 'inventory_2', emoji: null, sort: 10, manual: true,
    variants: [{ id: 'crate', label: 'Crate' }, { id: 'pallet', label: 'Pallet' }, { id: 'machinery', label: 'Machinery' }, { id: 'mixed', label: 'Mixed load' }] },
];

function resolveSpec(itemId, variantId) {
  const key = `${itemId}:${variantId}`;
  if (SPEC_OVERRIDES[key]) return SPEC_OVERRIDES[key];
  const tierKey = STANDARD.includes(variantId) ? variantId : 'standard';
  const t = TIERS[tierKey] || TIERS.standard;
  return { w: t.w, l: t.l, wd: t.wd, h: t.h, body: t.body };
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function sqlArray(arr) {
  if (!arr?.length) return 'ARRAY[]::text[]';
  return `ARRAY[${arr.map((x) => sqlStr(x)).join(', ')}]`;
}

const lines = [];
lines.push('-- Seed haulage body types, catalog, and service links.');
lines.push('-- Expected: 4 categories, 6 subgroups, 23 items, ~92 variants.');
lines.push('--');
lines.push('-- Requires: 20260619120000_haulage_catalog.sql, 20260619130000_haulage_bookings.sql');
lines.push('-- Body capacity columns are ensured below (same as 20260619140000_haulage_body_capacity.sql).');
lines.push('');
lines.push(`ALTER TABLE rides.vehicle_types
  ADD COLUMN IF NOT EXISTS max_payload_kg NUMERIC(8, 2)
    CHECK (max_payload_kg IS NULL OR max_payload_kg > 0),
  ADD COLUMN IF NOT EXISTS cargo_length_cm NUMERIC(8, 2)
    CHECK (cargo_length_cm IS NULL OR cargo_length_cm > 0),
  ADD COLUMN IF NOT EXISTS cargo_width_cm NUMERIC(8, 2)
    CHECK (cargo_width_cm IS NULL OR cargo_width_cm > 0),
  ADD COLUMN IF NOT EXISTS cargo_height_cm NUMERIC(8, 2)
    CHECK (cargo_height_cm IS NULL OR cargo_height_cm > 0),
  ADD COLUMN IF NOT EXISTS supports_upright_load BOOLEAN NOT NULL DEFAULT FALSE;`);
lines.push('');
lines.push('DROP VIEW IF EXISTS public.rides_vehicle_types;');
lines.push('CREATE VIEW public.rides_vehicle_types AS');
lines.push('  SELECT * FROM rides.vehicle_types;');
lines.push('');
lines.push('GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_vehicle_types TO service_role;');
lines.push('');
lines.push("NOTIFY pgrst, 'reload schema';");
lines.push('');
lines.push(`ALTER TABLE rides.vehicle_types
  ADD COLUMN IF NOT EXISTS service_category TEXT
  CHECK (
    service_category IS NULL
    OR service_category IN ('rideshare', 'courier', 'event', 'haulage')
  );`);
lines.push('');
lines.push(`INSERT INTO rides.vehicle_types (slug, label, description, seats, capacity_label, sort_order, is_active, solution_kind, service_category)
VALUES
  ('haulage', 'Haulage', 'Move large items and heavy loads', 0, 'Variable', 60, TRUE, 'service', 'haulage')
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  capacity_label = EXCLUDED.capacity_label,
  solution_kind = 'service',
  service_category = EXCLUDED.service_category;`);
lines.push('');

lines.push(`INSERT INTO rides.vehicle_types (slug, label, description, seats, sort_order, is_active, solution_kind, commando_body_type, max_payload_kg, cargo_length_cm, cargo_width_cm, cargo_height_cm, supports_upright_load)
VALUES
  ('sedan', 'Sedan', 'Standard sedan for light freight', 4, 100, TRUE, 'vehicle', 'Sedan', 150, 120, 90, 80, FALSE),
  ('suv', 'SUV', 'SUV for medium freight', 6, 110, TRUE, 'vehicle', 'SUV', 250, 150, 110, 100, FALSE),
  ('pickup', 'Pickup', 'Pickup truck with open bed', 2, 120, TRUE, 'vehicle', 'Pickup', 450, 200, 150, 120, TRUE),
  ('cargo-van', 'Cargo van', 'Enclosed cargo van', 2, 130, TRUE, 'vehicle', 'Van', 900, 280, 170, 180, TRUE),
  ('box-truck', 'Box truck', 'Large box truck', 2, 140, TRUE, 'vehicle', 'Truck', 2000, 400, 220, 220, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  solution_kind = 'vehicle',
  max_payload_kg = EXCLUDED.max_payload_kg,
  cargo_length_cm = EXCLUDED.cargo_length_cm,
  cargo_width_cm = EXCLUDED.cargo_width_cm,
  cargo_height_cm = EXCLUDED.cargo_height_cm,
  supports_upright_load = EXCLUDED.supports_upright_load;`);
lines.push('');

lines.push(`INSERT INTO rides.service_body_types (service_slug, body_type_slug, priority) VALUES
  ('haulage', 'sedan', 10),
  ('haulage', 'suv', 20),
  ('haulage', 'pickup', 30),
  ('haulage', 'cargo-van', 40),
  ('haulage', 'box-truck', 50)
ON CONFLICT (service_slug, body_type_slug) DO UPDATE SET priority = EXCLUDED.priority;`);
lines.push('');

for (const c of categories) {
  lines.push(`INSERT INTO rides.haulage_categories (id, title, description, icon, sort_order) VALUES (${sqlStr(c.id)}, ${sqlStr(c.title)}, ${sqlStr(c.description)}, ${sqlStr(c.icon)}, ${c.sort}) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;`);
}
lines.push('');

for (const s of subgroups) {
  lines.push(`INSERT INTO rides.haulage_item_subgroups (id, category_id, title, sort_order) VALUES (${sqlStr(s.id)}, ${sqlStr(s.category_id)}, ${sqlStr(s.title)}, ${s.sort}) ON CONFLICT (category_id, id) DO UPDATE SET title = EXCLUDED.title, sort_order = EXCLUDED.sort_order;`);
}
lines.push('');

let variantCount = 0;
for (const item of items) {
  const sub = item.sub ? sqlStr(item.sub) : 'NULL';
  const emoji = item.emoji ? sqlStr(item.emoji) : 'NULL';
  const manual = item.manual ? 'TRUE' : 'FALSE';
  lines.push(`INSERT INTO rides.haulage_items (id, category_id, subgroup_id, title, subtitle, icon, emoji, sort_order, requires_manual_specs) VALUES (${sqlStr(item.id)}, ${sqlStr(item.cat)}, ${sub}, ${sqlStr(item.title)}, ${sqlStr(item.subtitle)}, ${sqlStr(item.icon)}, ${emoji}, ${item.sort}, ${manual}) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, requires_manual_specs = EXCLUDED.requires_manual_specs;`);
  let vs = 0;
  for (const v of item.variants) {
    const spec = resolveSpec(item.id, v.id);
    const upright = spec.upright ? 'TRUE' : 'FALSE';
    const fragile = spec.fragile ? 'TRUE' : 'FALSE';
    const disassembly = spec.disassembly ? 'TRUE' : 'FALSE';
    const gear = sqlArray(spec.gear || (spec.w > 80 ? ['dolly', 'straps'] : []));
    const dims = item.manual ? 'NULL, NULL, NULL' : `${spec.l}, ${spec.wd}, ${spec.h}`;
    const weight = item.manual ? '50' : spec.w;
    const body = item.manual ? 'NULL' : sqlStr(spec.body);
    lines.push(`INSERT INTO rides.haulage_item_variants (item_id, id, label, sort_order, weight_kg, length_cm, width_cm, height_cm, min_body_type_slug, upright_only, fragile_default, requires_disassembly_default, gear_tags) VALUES (${sqlStr(item.id)}, ${sqlStr(v.id)}, ${sqlStr(v.label)}, ${vs * 10 + 10}, ${weight}, ${dims}, ${body}, ${upright}, ${fragile}, ${disassembly}, ${gear}) ON CONFLICT (item_id, id) DO UPDATE SET label = EXCLUDED.label, weight_kg = EXCLUDED.weight_kg, length_cm = EXCLUDED.length_cm, width_cm = EXCLUDED.width_cm, height_cm = EXCLUDED.height_cm, min_body_type_slug = EXCLUDED.min_body_type_slug, upright_only = EXCLUDED.upright_only;`);
    vs++;
    variantCount++;
  }
}

lines.push('');
lines.push(`-- Seed complete: ${categories.length} categories, ${subgroups.length} subgroups, ${items.length} items, ${variantCount} variants.`);

const outPath = join(root, 'supabase/migrations/20260619150000_haulage_catalog_seed.sql');
writeFileSync(outPath, lines.join('\n'));
console.log('Wrote', outPath, `(${variantCount} variants)`);
