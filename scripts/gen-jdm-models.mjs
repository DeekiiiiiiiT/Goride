import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mdPath = path.join(__dirname, "../src/IDEA_2.md");
const text = fs.readFileSync(mdPath, "utf8");
const lines = text.split(/\r?\n/);
let currentBrand = null;
/** @type {Record<string, string[]>} */
const modelsByBrand = {};
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/Here is (?:an |the )?alphabetized list of (\w+) models/i);
  if (m) {
    currentBrand = m[1];
    if (!modelsByBrand[currentBrand]) modelsByBrand[currentBrand] = [];
    continue;
  }
  if (currentBrand && /^\* (.+)/.test(line)) {
    let name = line.replace(/^\* /, "").trim();
    name = name.replace(/\s*\[[\d,\s]*\]\s*$/, "").trim();
    if (name) modelsByBrand[currentBrand].push(name);
  }
}

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const order = ["Nissan", "Honda", "Mazda", "Mitsubishi", "Subaru", "Daihatsu", "Suzuki", "Isuzu"];
let out = `/**
 * JDM brand model lists parsed from \`src/IDEA_2.md\`.
 * Regenerate: \`node scripts/gen-jdm-models.mjs > src/data/jdmBrandModels.generated.ts\`
 * (or run the script and paste — this file is checked in for stable builds).
 */
`;

for (const brand of order) {
  const arr = modelsByBrand[brand];
  if (!arr) throw new Error(`Missing brand ${brand}`);
  const constName = `${brand.toUpperCase()}_MODELS`;
  out += `\nexport const ${constName}: readonly string[] = [\n`;
  for (const x of arr) out += `  '${esc(x)}',\n`;
  out += `] as const;\n`;
}

const outPath = path.join(__dirname, "../src/data/jdmBrandModels.generated.ts");
fs.writeFileSync(outPath, out, "utf8");
console.log("Wrote", outPath);
