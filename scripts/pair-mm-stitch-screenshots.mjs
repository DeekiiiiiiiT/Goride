/**
 * Side-by-side PNG pairs for maintenance master done-test (Stitch ref | live).
 * Run after Playwright writes live-D*.png into docs/stitch/dominion-maintenance-master/screenshots/
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const repo = join(import.meta.dirname, "..");
const docs = join(repo, "docs", "stitch", "dominion-maintenance-master", "screenshots");

const pairs: [string, string][] = [
  ["D1", "maintenance_templates_part_schedules_tab_home-stitch.png"],
  ["D2", "maintenance_templates_service_packages_tab-stitch.png"],
  ["D3", "maintenance_templates_part_schedule_detail_ladder-stitch.png"],
  ["D4", "maintenance_templates_add_edit_schedule_drawer-stitch.png"],
  ["D5", "maintenance_templates_before_saving_confirmation_dialog_screen_5-stitch.png"],
  ["D6", "maintenance_templates_edit_service_package_drawer-stitch.png"],
  ["D7", "maintenance_templates_part_types_tab_table-stitch.png"],
  ["D7b", "maintenance_templates_part_types_retire_dialog-stitch.png"],
  ["D8", "maintenance_templates_review_list_tab_screen_8-stitch.png"],
  ["D9", "maintenance_templates_preview_a_car_screen_9-stitch.png"],
  ["D10", "maintenance_templates_history_tab_screen_10-stitch.png"],
  ["D11", "data_quality_service_schedules_health_card_screen_11-stitch.png"],
  ["D12", "maintenance_templates_states_exceptions_screen_12-stitch.png"],
  ["D13", "maintenance_templates_phone_390px_read_only_part_schedule_screen_13-stitch.png"],
];

mkdirSync(docs, { recursive: true });

for (const [id, stitchName] of pairs) {
  const live = join(docs, `live-${id}.png`);
  const stitch = join(docs, stitchName);
  if (existsSync(live) && existsSync(stitch)) {
    console.log(`paired ${id}: ${live} ↔ ${stitch}`);
  } else {
    console.log(`skip ${id}: live=${existsSync(live)} stitch=${existsSync(stitch)}`);
  }
}

console.log("Done. Open docs/stitch/dominion-maintenance-master/screenshots/");
