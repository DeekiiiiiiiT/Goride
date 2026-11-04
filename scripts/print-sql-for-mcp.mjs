import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/print-sql-for-mcp.mjs <sql-file>");
  process.exit(1);
}
process.stdout.write(readFileSync(path, "utf8"));
