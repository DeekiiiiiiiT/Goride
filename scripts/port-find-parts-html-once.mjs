/**
 * One-off: extract <main> from fleet find-parts HTML and emit JSX fragments for manual merge.
 * Run: node scripts/port-find-parts-html-once.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const repo = join(import.meta.dirname, "..");
const htmlDir = join(repo, "docs", "stitch", "roam-fleet-app", "html");
const outDir = join(repo, "apps", "fleet", "src", "components", "vehicles", "find-parts", "_html-jsx");
mkdirSync(outDir, { recursive: true });

const ATTR = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  autocomplete: "autoComplete",
  maxlength: "maxLength",
  minlength: "minLength",
  readonly: "readOnly",
  colspan: "colSpan",
  rowspan: "rowSpan",
  crossorigin: "crossOrigin",
  enctype: "encType",
  formaction: "formAction",
  srcset: "srcSet",
};

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

function stripScripts(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function htmlToJsx(html) {
  let s = stripScripts(html);
  s = s.replace(/\s+onclick="[^"]*"/gi, "");
  s = s.replace(/\s+onchange="[^"]*"/gi, "");
  s = s.replace(/\s+onsubmit="[^"]*"/gi, "");
  s = s.replace(/\s+oninput="[^"]*"/gi, "");
  s = s.replace(/\s+onkeydown="[^"]*"/gi, "");
  s = s.replace(/\s+onkeyup="[^"]*"/gi, "");
  s = s.replace(/\s+onfocus="[^"]*"/gi, "");
  s = s.replace(/\s+onblur="[^"]*"/gi, "");
  s = s.replace(/\s+onmouseover="[^"]*"/gi, "");
  s = s.replace(/\s+onmouseout="[^"]*"/gi, "");

  s = s.replace(/<\s*(\/?)\s*([a-zA-Z0-9:-]+)([^>]*?)(\/)?\s*>/g, (full, slash, tag, attrs, selfClose) => {
    const t = tag.toLowerCase();
    if (slash) return `</${tag}>`;
    let a = attrs || "";
    a = a.replace(/\s+class=/g, " className=");
    for (const [from, to] of Object.entries(ATTR)) {
      a = a.replace(new RegExp(`\\s+${from}=`, "g"), ` ${to}=`);
    }
    a = a.replace(/\s+checked(?=\s|>|\/)/gi, " defaultChecked");
    a = a.replace(/\s+selected(?=\s|>|\/)/gi, " defaultValue");
    a = a.replace(/\s+disabled(?=\s|>|\/)/gi, " disabled");
    const voidTag = VOID.has(t) || selfClose === "/";
    if (voidTag) {
      if (!a.trim().endsWith("/")) a = `${a.trim()} /`;
      else a = a.replace(/\/\s*$/, " /");
      return `<${tag}${a}>`;
    }
    return `<${tag}${a}>`;
  });

  s = s.replace(/=\s*"([^"]*)"/g, (m, val) => {
    if (val.includes("${")) return `={\`${val}\`}`;
    if (val.includes("{{")) return `={\`${val.replace(/\{\{/g, "${").replace(/\}\}/g, "}")}\`}`;
    return `="${val}"`;
  });

  s = s.replace(/<(input|img|br|hr|meta|link)(className=)/gi, "<$1 $2");
  s = s.replace(/<(input)([a-z])/gi, "<$1 $2");
  return s;
}

const screens = [
  ["find-parts-car.html", "fp1-main.jsx"],
  ["find-parts-variant.html", "fp2-main.jsx"],
  ["find-parts-browse.html", "fp3-main.jsx"],
  ["find-parts-position.html", "fp4-main.jsx"],
  ["find-parts-results.html", "fp5-main.jsx"],
  ["find-parts-detail.html", "fp6-main.jsx"],
  ["find-parts-quote.html", "fp7-main.jsx"],
  ["find-parts-request.html", "fp8-main.jsx"],
  ["find-parts-link-car.html", "fp9-main.jsx"],
  ["find-parts-activity.html", "fp10-main.jsx"],
  ["find-parts-states.html", "fp11-main.jsx"],
  ["find-parts-phone.html", "fp12-main.jsx"],
];

for (const [file, out] of screens) {
  const raw = readFileSync(join(htmlDir, file), "utf8");
  const main = (raw.match(/<main[\s\S]*<\/main>/i) || [raw])[0];
  const jsx = htmlToJsx(main);
  writeFileSync(join(outDir, out), jsx, "utf8");
  console.log("wrote", out, jsx.length);
}
