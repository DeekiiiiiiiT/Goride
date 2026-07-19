const fs = require("fs");
const path = require("path");
const deployedPath =
  "C:/Users/deeki/.cursor/projects/c-Users-deeki-OneDrive-Documents-App-and-Web-design-Roam-Goride/agent-tools/72f6b293-7b83-4c6b-a914-c5a6c838690b.txt";
const d = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
console.log("version", d.version, "files", d.files.length);
const names = d.files.map((f) => f.name).sort();
console.log("has data.ts", names.some((n) => n.includes("types/data")));
console.log("has vehicle.ts", names.some((n) => n.includes("types/vehicle")));
let total = 0;
for (const f of d.files) total += (f.content || "").length;
console.log("total bytes", total);

const root = process.cwd();
const deployed = new Set(names);
const entry = "supabase/functions/make-server-37f42386/index.ts";
const visited = new Set();
const missingDeployed = [];
const extensionless = [];
const queue = [entry];
function toPosix(p) {
  return p.split(path.sep).join("/");
}
function resolveImport(fromFile, spec) {
  if (
    spec.startsWith("npm:") ||
    spec.startsWith("jsr:") ||
    spec.startsWith("https:") ||
    spec.startsWith("http:") ||
    spec.startsWith("node:") ||
    (!spec.startsWith(".") && !spec.startsWith("/"))
  )
    return null;
  if (spec.startsWith(".") && !/\.(ts|tsx|js|jsx|mjs|json)$/.test(spec)) {
    extensionless.push({ from: fromFile, spec });
  }
  const fromAbs = path.resolve(root, fromFile);
  const base = path.resolve(path.dirname(fromAbs), spec);
  for (const c of [base, base + ".ts", base + ".tsx", base + ".js"]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return toPosix(path.relative(root, c));
  }
  return toPosix(path.relative(root, base));
}
const importRes = [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s+['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g];
while (queue.length) {
  const key = toPosix(queue.pop());
  if (visited.has(key)) continue;
  visited.add(key);
  const abs = path.resolve(root, key);
  if (!fs.existsSync(abs)) continue;
  if (!deployed.has(key)) missingDeployed.push(key);
  const content = fs.readFileSync(abs, "utf8");
  for (const re of importRes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content))) {
      const resolved = resolveImport(key, m[1]);
      if (resolved) queue.push(resolved);
    }
  }
}
console.log("visited", visited.size, "missingDeployed", missingDeployed.length, "extensionless", extensionless.length);
missingDeployed.forEach((f) => console.log("MISSING", f));
extensionless.forEach((e) => console.log("EXT", e.from, e.spec));

// Scan deployed for extensionless
const choke = [];
for (const f of d.files) {
  const re = /\bfrom\s+['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(f.content || ""))) {
    if (!/\.(ts|tsx|js|jsx|mjs|json)$/.test(m[1])) choke.push(`${f.name} -> ${m[1]}`);
  }
}
console.log("choke", choke.length);
choke.forEach((c) => console.log(c));
