import { execSync } from "node:child_process";

const out = execSync(
  'rg -o "API_ENDPOINTS\\.fuel\\}/[a-zA-Z0-9_.-]+" apps packages -g !node_modules --no-filename',
  { encoding: "utf8" },
);
const segs = [
  ...new Set(
    out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.split("fuel}/")[1].split(/[/?]/)[0]),
  ),
].sort();
const server = new Set([
  "admin",
  "analytics",
  "cycles",
  "finalized-reports",
  "fuel",
  "fuel-audit",
  "fuel-cards",
  "fuel-entries",
  "fuel-pnl-offset-backfill",
  "fuel-reconciliation",
  "geo",
  "jaa",
  "jaa-csv-imports",
  "jaa-programs",
  "jaa-unmatched",
  "learnt-locations",
  "migrations",
  "mileage-adjustments",
  "parent-companies",
  "stations",
  "transactions",
]);
const bad = segs.filter((s) => s !== ".." && s !== "reconciliation" && !server.has(s));
console.log("NOT on fleet-fuel (excl reconciliation/..):", bad.join(", ") || "(none)");
console.log("All .fuel segments:", segs.join(", "));
if (bad.length) process.exitCode = 1;
