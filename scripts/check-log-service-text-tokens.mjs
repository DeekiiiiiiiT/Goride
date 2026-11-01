/**
 * Fleet log-service wizard must use text-stitch-secondary, not shadcn text-secondary (invisible on surfaces).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const dir = path.join(
  ROOT,
  "apps/fleet/src/components/vehicles/maintenance-logging/log-service",
);

let failed = false;
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith(".tsx")) continue;
  const file = path.join(dir, name);
  const text = fs.readFileSync(file, "utf8");
  if (/\btext-secondary\b/.test(text)) {
    console.error(`check-log-service-text-tokens: ${name} still contains text-secondary`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("check-log-service-text-tokens: ok");
