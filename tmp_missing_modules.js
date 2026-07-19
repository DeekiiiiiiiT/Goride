const fs = require("fs");
const path = require("path");

const root = process.cwd();
const deployedPath =
  "C:/Users/deeki/.cursor/projects/c-Users-deeki-OneDrive-Documents-App-and-Web-design-Roam-Goride/agent-tools/151b41c8-498e-4d42-aa7a-9f585871ee15.txt";
const d = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
console.log("version", d.version, "files", d.files.length);
const deployed = new Set(d.files.map((f) => f.name.replace(/\\/g, "/")));

const entry = "supabase/functions/make-server-37f42386/index.ts";
const visited = new Set();
const missingLocal = [];
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
  ) {
    return null;
  }
  if (
    spec.startsWith(".") &&
    !/\.(ts|tsx|js|jsx|mjs|json)$/.test(spec)
  ) {
    extensionless.push({ from: fromFile, spec });
  }
  const fromAbs = path.resolve(root, fromFile);
  const base = path.resolve(path.dirname(fromAbs), spec);
  const candidates = [base, base + ".ts", base + ".tsx", base + ".js", path.join(base, "index.ts")];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return toPosix(path.relative(root, c));
    }
  }
  return toPosix(path.relative(root, base));
}

const importRes = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

while (queue.length) {
  const file = queue.pop();
  const key = toPosix(file);
  if (visited.has(key)) continue;
  visited.add(key);
  const abs = path.resolve(root, key);
  if (!fs.existsSync(abs)) {
    missingLocal.push(key);
    continue;
  }
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

console.log("visited", visited.size);
console.log("missing local", missingLocal.length);
missingLocal.forEach((f) => console.log("LOCAL", f));
console.log("missing deployed", missingDeployed.length);
missingDeployed.forEach((f) => console.log("DEPLOY", f));
console.log("extensionless relative imports in graph:", extensionless.length);
extensionless.slice(0, 40).forEach((e) => console.log("EXT", e.from, "->", e.spec));

// Also scan deployed contents for extensionless relative imports that Deno will choke on
let denochoke = [];
for (const f of d.files) {
  const content = f.content || "";
  const re = /\bfrom\s+['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content))) {
    const spec = m[1];
    if (!/\.(ts|tsx|js|jsx|mjs|json|css|wasm)$/.test(spec)) {
      denochoke.push(`${f.name}: ${spec}`);
    }
  }
}
console.log("deployed extensionless from:", denochoke.length);
denochoke.slice(0, 50).forEach((x) => console.log("CHOKE", x));
