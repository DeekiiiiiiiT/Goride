import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  pnpm,
  ["exec", "vite-node", "scripts/capture-fp6-once.ts"],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, FLEET_BASE_URL: process.env.FLEET_BASE_URL || "http://127.0.0.1:3001" } },
);
process.exit(result.status ?? 1);
