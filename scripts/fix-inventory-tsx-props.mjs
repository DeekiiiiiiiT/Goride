/**
 * Fix Stitch HTML artifacts in inventory TSX (R3-11).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "apps", "fleet", "src", "components", "inventory");

function walk(d, out = []) {
  for (const name of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (name.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

for (const file of walk(dir)) {
  let s = readFileSync(file, "utf8");
  const before = s;

  s = s.replace(/\bviewbox=/g, "viewBox=");
  s = s.replace(/\bonclick="[^"]*"/g, "");
  s = s.replace(/\bid="([^"]+)"/g, 'data-stitch-id="$1"');
  s = s.replace(/\bdisabled="true"/g, "disabled");
  s = s.replace(/\bdisabled="false"/g, "");
  s = s.replace(/\breadonly="true"/g, "readOnly");
  s = s.replace(/\breadonly="false"/g, "");
  s = s.replace(/\bchecked="true"/g, "defaultChecked");
  s = s.replace(/\bchecked="false"/g, "");
  s = s.replace(/\bselected="true"/g, "defaultValue");
  s = s.replace(/style="width:\s*([^";]+);"/g, 'style={{ width: "$1" }}');
  s = s.replace(/style="([^"]+)"/g, (_, css) => {
    const parts = css.split(";").filter(Boolean);
    const obj = parts
      .map((p) => p.trim().split(":"))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => `${k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())}: ${JSON.stringify(v.trim())}`)
      .join(", ");
    return obj ? `style={{ ${obj} }}` : "";
  });
  s = s.replace(/\bmaxlength=/g, "maxLength=");
  s = s.replace(/\bautocomplete=/g, "autoComplete=");
  s = s.replace(/\bfor=/g, "htmlFor=");
  s = s.replace(/\btabindex=/g, "tabIndex=");
  s = s.replace(/\bcolspan=/g, "colSpan=");
  s = s.replace(/\browspan=/g, "rowSpan=");

  if (s !== before) {
    writeFileSync(file, s);
    console.log("fixed", file.replace(process.cwd(), ""));
  }
}
