/**
 * Port Stitch inventory/car-kit code.html → React TSX (main + dialog/aside).
 * Strips fixed app chrome; keeps page markup with className parity.
 *
 *   node scripts/port-inventory-stitch.mjs [--fleet] [--driver] [--report]
 */
import fs from "node:fs";
import path from "node:path";

const repo = path.join(import.meta.dirname, "..");

const FLEET_SCREENS = {
  In1Overview: "inventory_asset_management_overview",
  In2Stock: "inventory_asset_management_stock",
  In3ItemDrawer: "inventory_asset_management_item_details_drawer",
  In4ReceiveDialog: "inventory_asset_management_receive_dialog",
  In5IssueDialog: "inventory_asset_management_issue_dialog",
  In6VehicleKits: "inventory_asset_management_vehicle_kits_tab",
  In7KitTemplateEditor: "inventory_asset_management_kit_template_editor",
  In8Assets: "inventory_asset_management_assets_tab",
  In9AssetPage: "inventory_asset_management_asset_page",
  In10Movements: "inventory_asset_management_movements_tab",
  In11Purchasing: "inventory_asset_management_purchasing_tab",
  In12Counts: "inventory_asset_management_counts_tab",
  In13Alerts: "inventory_asset_management_alerts_tab",
  In14CustodyDialog: "inventory_asset_management_transfer_return_write_off_dialog",
  In15VehicleKitCard: "vehicle_detail_kit_equipment_panel_5179kz",
  In16FirstTimeSetup: "inventory_asset_management_first_time_setup",
  In17States: "inventory_asset_management_states_edge_cases",
  In18Phone: "inventory_asset_management_phone_390px_mobile_view",
};

const DRIVER_SCREENS = {
  Dk1MyCarKit: "my_car_kit_vehicle_checklist",
  Dk2ReportSheet: "report_a_problem_bottom_sheet",
  Dk3ReportSent: "report_sent_offline_queued",
  Dk4MyReports: "my_reports_history_fleet_replies",
  Dk5KitStep: "weekly_check_in_kit_step",
  Dk6States: "my_car_kit_states_errors",
};

function extractRegions(html) {
  const cleaned = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const mainMatch = cleaned.match(/<main[\s\S]*<\/main>/i);
  let main = mainMatch ? mainMatch[0] : cleaned;
  main = main.replace(/^<main[^>]*>/i, '<div className="inventory-stitch-main">');
  main = main.replace(/<\/main>$/i, "</div>");
  main = main.replace(/\spt-32\b/g, "");
  main = main.replace(/min-h-\[calc\(100vh-80px\)\]/g, "min-h-0");

  let extra = "";
  for (const m of cleaned.matchAll(/<(dialog|aside)[^>]*>[\s\S]*?<\/\1>/gi)) {
    if (!main.includes(m[0])) extra += m[0];
  }
  return main + extra;
}

function fixJsxTextEscapes(jsx) {
  return jsx
    .replace(/Needs approval \(>J\$ 20k\)/g, "Needs approval ({'>'}J$ 20k)")
    .replace(/Pre-approved \(<J\$ 20k\)/g, "Pre-approved ({'<'}{'J$ 20k'})")
    .replace(/Target threshold: < 0\.15%/g, "Target threshold: {'<'}{' 0.15%'}");
}

function htmlToJsx(fragment) {
  let s = fragment.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/\sclass=/g, " className=");
  s = s.replace(/\sfor=/g, " htmlFor=");
  s = s.replace(/\stabindex=/g, " tabIndex=");
  s = s.replace(/\sreadonly/g, " readOnly");
  s = s.replace(/\sautocomplete=/g, " autoComplete=");
  s = s.replace(/<input([^>]*?)(?<!\/)>/gi, "<input$1 />");
  s = s.replace(/<img([^>]*?)(?<!\/)>/gi, "<img$1 />");
  s = s.replace(/<br\s*>/gi, "<br />");
  s = s.replace(/<hr\s*>/gi, "<hr />");
  s = s.replace(/<button(\s)/gi, '<button type="button"$1');
  s = s.replace(/type="button"\s+type="button"/g, 'type="button"');
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&nbsp;/g, "\u00a0");
  s = s.replace(/&apos;/g, "'");
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&quot;/g, '"');
  return fixJsxTextEscapes(s);
}

function componentTemplate(exportName, jsxBody, scopeClass) {
  return `/** Ported from Stitch — do not simplify layout (audit §0.4). */
export function ${exportName}() {
  return (
    <div className="${scopeClass} inventory-stitch-root">
${jsxBody.split("\n").map((line) => (line.trim() ? `      ${line}` : "")).join("\n")}
    </div>
  );
}
`;
}

function portFleet() {
  const outDir = path.join(repo, "apps/fleet/src/components/inventory/screens");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, folder] of Object.entries(FLEET_SCREENS)) {
    const htmlPath = path.join(
      repo,
      "docs/stitch/roam-fleet-app/inventory",
      folder,
      "code.html",
    );
    if (!fs.existsSync(htmlPath)) {
      console.warn("missing", htmlPath);
      continue;
    }
    const html = fs.readFileSync(htmlPath, "utf8");
    const regions = extractRegions(html);
    const jsx = htmlToJsx(regions);
    const file = path.join(outDir, `${name}.tsx`);
    fs.writeFileSync(file, componentTemplate(name, jsx, "fleet-inventory-stitch"));
    console.log("fleet", name, jsx.length);
  }
}

function portDriver() {
  const outDir = path.join(repo, "apps/driver/src/components/car-kit/screens");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, folder] of Object.entries(DRIVER_SCREENS)) {
    const htmlPath = path.join(
      repo,
      "docs/stitch/roam-driver-app/car-kit",
      folder,
      "code.html",
    );
    if (!fs.existsSync(htmlPath)) {
      console.warn("missing", htmlPath);
      continue;
    }
    const html = fs.readFileSync(htmlPath, "utf8");
    const regions = extractRegions(html);
    const jsx = htmlToJsx(regions);
    const file = path.join(outDir, `${name}.tsx`);
    fs.writeFileSync(file, componentTemplate(name, jsx, "driver-car-kit-stitch"));
    console.log("driver", name, jsx.length);
  }
}

const args = process.argv.slice(2);
if (args.includes("--driver") || args.length === 0) portDriver();
if (args.includes("--fleet") || args.length === 0) portFleet();
