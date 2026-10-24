/**
 * Same ban as the Deno test, for CI that runs node.
 * Usage: node scripts/guard-customer-portal-auth.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions", "_fleet-server");
const files = [
  "team_staff_routes.ts",
  "team_staff_service.ts",
  "workforce_lifecycle_routes.ts",
  "workforce_membership.ts",
  "workforce_link.ts",
];

let failed = false;
for (const name of files) {
  const text = readFileSync(join(root, name), "utf8");
  if (text.includes("deleteUser") || /password\s*:/.test(text)) {
    console.error(`${name} must not delete accounts or set passwords`);
    failed = true;
  }
}

const monolith = readFileSync(join(root, "register_residual_monolith_routes.tsx"), "utf8");
if (monolith.includes("/delete-user")) {
  console.error("register_residual_monolith_routes.tsx still exposes /delete-user");
  failed = true;
}
const updateAt = monolith.indexOf('"/make-server-37f42386/update-user"');
const updateSlice = updateAt >= 0 ? monolith.slice(updateAt, updateAt + 1800) : "";
if (!updateSlice.includes("hasPlatformOwnerAccess")) {
  console.error("update-user must require hasPlatformOwnerAccess before a role write");
  failed = true;
}
if (failed) process.exit(1);
console.log("customer portal auth guard ok");
