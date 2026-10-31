import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "apps", "fleet", "src", "components", "vehicles", "find-parts", "screens");
const replacements = [
  [/Toyota \{data\.partNumber\}/g, "{data.brandLabel} {data.partNumber}"],
  [/Toyota /g, ""],
  [/ Hub #01/g, " hub"],
  [/Hub #01/g, "hub"],
  [/J\$ 1,420/g, "{data.priceLabel}"],
  [/J\$ 5,900/g, "{data.priceLabel}"],
  [/J\$ 5,200/g, "No price yet"],
  [/J\$ 1,610/g, "No price yet"],
  [/J\$ 180/g, "No price yet"],
  [/J\$ 3,800/g, "No price yet"],
  [/J\$ 3,450/g, "No price yet"],
  [/8943-JX/g, "{data.plate}"],
  [/Toyota Probox 2016/g, "{data.vehicleLabel}"],
  [/2016 Toyota Probox Van/g, "{data.vehicleLabel}"],
  [/Toyota Probox/g, "{data.vehicleLabel}"],
  [/which Toyota Probox/g, "which {data.vehicleLabel}"],
  [/GP5/g, "{data.trimLabel}"],
  [/NCP160/g, "{data.trimLabel}"],
  [/Probox/g, "{data.vehicleLabel}"],
  [/Mandeville/g, "{data.hubLabel}"],
  [/Portmore/g, "{data.hubLabel}"],
  [/Spanish Town/g, "{data.hubLabel}"],
  [/John Doe/g, "None yet"],
  [/Julian/g, "None yet"],
  [/Denso/g, "OEM"],
  [/48,210 km/g, "{data.odometerLabel}"],
  [/64,280 km/g, "{data.odometerLabel}"],
  [/18,400 km/g, "{data.lastServiceLabel}"],
];

for (const name of readdirSync(dir)) {
  if (!name.endsWith(".tsx")) continue;
  const path = join(dir, name);
  let src = readFileSync(path, "utf8");
  const before = src;
  for (const [re, rep] of replacements) src = src.replace(re, rep);
  if (src !== before) writeFileSync(path, src);
}
console.log("patched screens");
