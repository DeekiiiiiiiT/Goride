/**
 * P-01 D12 e2e fixture: open rule conflict + retired rule for maintenance master states test.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PART_OVERLAP = "e2000003-0000-4000-8000-000000000077";
const RULE_A = "e2000010-0000-4000-8000-000000000030";
const RULE_B = "e2000010-0000-4000-8000-000000000031";
const RULE_RETIRED = "e2000010-0000-4000-8000-000000000005";

export function resetMmP01D12Fixture() {
  const sql = [
    `INSERT INTO public.maintenance_service_categories (
      id, code, name, kind, op_code, icon_key, sort_order, is_part, position_aware
    ) VALUES (
      '${PART_OVERLAP}'::uuid, 'fx-ol-part', 'Fx overlap part', 'component', 'FX-OL', 'wrench', 9997, true, false
    ) ON CONFLICT (id) DO NOTHING;`,
    `INSERT INTO public.maintenance_task_templates (
      id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
      status, source_type, confidence, applicable_vehicle_classes
    ) VALUES (
      '${RULE_A}'::uuid, 'Fx glob A', 'fx-ga', 'global', '${PART_OVERLAP}'::uuid,
      5000, 3, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
    ) ON CONFLICT (id) DO UPDATE SET status = 'active', component_id = EXCLUDED.component_id, interval_km = 5000;`,
    `INSERT INTO public.maintenance_task_templates (
      id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
      status, source_type, confidence, applicable_vehicle_classes
    ) VALUES (
      '${RULE_B}'::uuid, 'Fx glob B', 'fx-gb', 'global', '${PART_OVERLAP}'::uuid,
      6000, 3, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
    ) ON CONFLICT (id) DO UPDATE SET status = 'active', component_id = EXCLUDED.component_id, interval_km = 6000;`,
    `UPDATE public.maintenance_task_templates SET status = 'needs_checking' WHERE id = '${RULE_B}'::uuid;`,
    `UPDATE public.maintenance_task_templates SET status = 'retired' WHERE id = '${RULE_RETIRED}'::uuid;`,
  ].join("\n");

  const file = join(tmpdir(), `mm-p01-d12-${Date.now()}.sql`);
  writeFileSync(file, sql, "utf8");
  try {
    const payload = readFileSync(file);
    execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1`, {
      input: payload,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } finally {
    unlinkSync(file);
  }
}
