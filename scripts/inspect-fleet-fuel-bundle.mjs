import fs from "node:fs";
const t = fs.readFileSync("supabase/functions/fleet-fuel/index.ts", "utf8");
const i = t.indexOf("fleet-fuel");
console.log("idx", i);
console.log(t.slice(Math.max(0, i - 100), i + 150));
console.log("health literal count", (t.match(/\/health/g) || []).length);
console.log("has get health", t.includes('get("/health"') || t.includes("get('/health'"));
