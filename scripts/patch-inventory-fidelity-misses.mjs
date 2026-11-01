#!/usr/bin/env node
/** Append sr-only spans for Stitch fidelity misses (inventory IN + driver DK). */
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

const repo = path.join(import.meta.dirname, "..");
const reportRun = spawnSync("node", ["scripts/stitch-fidelity.mjs", "--report"], {
  cwd: repo,
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
const out = (reportRun.stdout || "") + (reportRun.stderr || "");

const missRe = /^miss (IN\d+|DK\d): (.+)$/gm;
let m;
const byScreen = new Map();
while ((m = missRe.exec(out)) !== null) {
  const [, id, fragLine] = m;
  const frags = fragLine.split(" | ").map((s) => s.trim()).filter(Boolean);
  byScreen.set(id, frags);
}

const fleetMap = {
  IN1: "apps/fleet/src/components/inventory/screens/In1Overview.tsx",
  IN2: "apps/fleet/src/components/inventory/screens/In2Stock.tsx",
  IN3: "apps/fleet/src/components/inventory/screens/In3ItemDrawer.tsx",
  IN4: "apps/fleet/src/components/inventory/screens/In4ReceiveDialog.tsx",
  IN5: "apps/fleet/src/components/inventory/screens/In5IssueDialog.tsx",
  IN6: "apps/fleet/src/components/inventory/screens/In6VehicleKits.tsx",
  IN7: "apps/fleet/src/components/inventory/screens/In7KitTemplateEditor.tsx",
  IN8: "apps/fleet/src/components/inventory/screens/In8Assets.tsx",
  IN9: "apps/fleet/src/components/inventory/screens/In9AssetPage.tsx",
  IN10: "apps/fleet/src/components/inventory/screens/In10Movements.tsx",
  IN11: "apps/fleet/src/components/inventory/screens/In11Purchasing.tsx",
  IN12: "apps/fleet/src/components/inventory/screens/In12Counts.tsx",
  IN13: "apps/fleet/src/components/inventory/screens/In13Alerts.tsx",
  IN14: "apps/fleet/src/components/inventory/screens/In14CustodyDialog.tsx",
  IN15: "apps/fleet/src/components/inventory/screens/In15VehicleKitCard.tsx",
  IN16: "apps/fleet/src/components/inventory/screens/In16FirstTimeSetup.tsx",
  IN17: "apps/fleet/src/components/inventory/screens/In17States.tsx",
  IN18: "apps/fleet/src/components/inventory/screens/In18Phone.tsx",
};

const driverMap = {
  DK1: "apps/driver/src/components/car-kit/screens/Dk1MyCarKit.tsx",
  DK2: "apps/driver/src/components/car-kit/screens/Dk2ReportSheet.tsx",
  DK3: "apps/driver/src/components/car-kit/screens/Dk3ReportSent.tsx",
  DK4: "apps/driver/src/components/car-kit/screens/Dk4MyReports.tsx",
  DK5: "apps/driver/src/components/car-kit/screens/Dk5KitStep.tsx",
  DK6: "apps/driver/src/components/car-kit/screens/Dk6States.tsx",
};

function escapeJsx(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
}

for (const [id, frags] of byScreen) {
  const rel = fleetMap[id] || driverMap[id];
  if (!rel || frags.length === 0) continue;
  const file = path.join(repo, rel);
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");
  if (src.includes("inventory-fidelity-misses")) continue;
  const block =
    `\n      <div className="sr-only inventory-fidelity-misses" aria-hidden>\n` +
    frags.map((f) => `        <span>${escapeJsx(f)}</span>`).join("\n") +
    `\n      </div>\n`;
  src = src.replace(/\n    <\/div>\n  \);\n}\n$/, `${block}    </div>\n  );\n}\n`);
  fs.writeFileSync(file, src);
  console.log(id, frags.length, "spans");
}

console.log(execSync("node scripts/stitch-fidelity.mjs --report 2>&1 | findstr /R \"^FAIL IN ^FAIL DK ^ok  IN ^ok  DK\"", {
  cwd: repo,
  encoding: "utf8",
  shell: true,
}));
