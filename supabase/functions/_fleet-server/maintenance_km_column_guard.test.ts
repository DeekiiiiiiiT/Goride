import { assertEquals } from "jsr:@std/assert@1";
import { walk } from "jsr:@std/fs@1/walk";
import { relative } from "jsr:@std/path@1/relative";
import { fromFileUrl } from "jsr:@std/path@1/from-file-url";

const ROOT = fromFileUrl(new URL("../../../", import.meta.url));

const FORBIDDEN = [
  "next_due_miles_max",
  "next_due_miles",
  "last_performed_miles",
  "interval_miles",
  "default_interval_miles",
] as const;

const SCAN_ROOTS = [
  new URL("./", import.meta.url),
  new URL("../../../packages/", import.meta.url),
  new URL("../../../apps/fleet/src/", import.meta.url),
  new URL("../../../apps/admin/src/", import.meta.url),
];

const PACKAGE_SCHEDULE_FILES = [
  "maintenance_routes.ts",
  "maintenance_log_service_context.ts",
];

const EXT = /\.(ts|tsx)$/;

function isPackageScheduleMilesToken(filePath: string, token: string): boolean {
  if (!PACKAGE_SCHEDULE_FILES.some((f) => filePath.endsWith(f))) return false;
  return (
    token === "next_due_miles" ||
    token === "next_due_miles_max" ||
    token === "last_performed_miles"
  );
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function isAllowed(line: string, prevLine: string): boolean {
  if (line.includes("vehicle_maintenance_schedule")) return true;
  if (prevLine.includes("vehicle_maintenance_schedule")) return true;
  if (line.includes("VehicleMaintenanceScheduleRowApi")) return true;
  if (line.includes("next_due_miles: adv.next_due_km")) return true;
  if (line.includes("next_due_miles_max: adv.next_due_km_max")) return true;
  if (line.includes("last_performed_miles: args.performedMiles")) return true;
  return false;
}

Deno.test("forbidden mile column names removed except vehicle_maintenance_schedule", async () => {
  const hits: string[] = [];
  for (const base of SCAN_ROOTS) {
    const basePath = fromFileUrl(base);
    for await (const entry of walk(basePath, {
      exts: ["ts", "tsx"],
      skip: [/node_modules/, /\.test\.ts$/],
    })) {
      if (entry.path.endsWith("maintenance_km_column_guard.test.ts")) continue;
      if (!EXT.test(entry.path)) continue;
      const raw = await Deno.readTextFile(entry.path);
      const text = stripComments(raw);
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const prevLine = i > 0 ? lines[i - 1] : "";
        if (isAllowed(line, prevLine)) continue;
        for (const token of FORBIDDEN) {
          if (isPackageScheduleMilesToken(entry.path, token)) continue;
          if (
            entry.path.replace(/\\/g, "/").endsWith("packages/types/src/maintenance.ts") &&
            (token === "next_due_miles" || token === "next_due_miles_max")
          ) {
            continue;
          }
          if (line.includes(token)) {
            hits.push(`${relative(ROOT, entry.path)}:${i + 1}: ${token}`);
          }
        }
      }
    }
  }
  assertEquals(hits, []);
});
