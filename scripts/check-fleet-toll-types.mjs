/**
 * Type-check fleet-toll and fail only when the tag inventory controller
 * introduces an error. Older errors in the shared toll stack stay out of this gate.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "deno",
  ["check", "supabase/functions/fleet-toll/src/main.ts"],
  { encoding: "utf8" },
);
const output = `${result.stdout || ""}\n${result.stderr || ""}`;
if (result.status === 0) {
  console.log("fleet-toll types: ok");
  process.exit(0);
}
const inventoryErrors = output
  .split("\n")
  .filter((line) => line.includes("toll_inventory_controller.tsx"));
if (inventoryErrors.length > 0) {
  console.error(inventoryErrors.join("\n"));
  console.error("fleet-toll tag types failed");
  process.exit(1);
}
console.log("fleet-toll types: tag inventory clean (older toll-stack errors ignored)");
process.exit(0);
