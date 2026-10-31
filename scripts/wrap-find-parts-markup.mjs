/**
 * Wrap _html-jsx/*.jsx into exported React components with button onClick hooks.
 * Run after port-find-parts-html-once.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "apps", "fleet", "src", "components", "vehicles", "find-parts");
const jsxDir = join(dir, "_html-jsx");
const outDir = join(dir, "markup");
import { mkdirSync } from "node:fs";
mkdirSync(outDir, { recursive: true });

function injectHandlers(jsx) {
  let n = jsx;
  n = n.replace(/<button([^>]*)type="button"([^>]*)>/gi, (full, a, b) => {
    const chunk = `${a}${b}`;
    if (/onClick=/.test(chunk)) return full;
    return `<button${a}type="button"${b} onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\\s+/g, " ").trim() }, e.nativeEvent)}>`;
  });
  n = n.replace(
    /<div className="vehicle-select-card([^"]*)"([^>]*data-vehicle-id="([^"]*)"[^>]*)>/gi,
    (full, rest, tail, vehicleId) => {
      if (/onClick=/.test(full)) return full;
      return `<div role="button" tabIndex={0} className="vehicle-select-card${rest}"${tail} onClick={(e) => onFpClick?.({ card: true, vehicleId: "${vehicleId}" }, e.nativeEvent)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}>`;
    },
  );
  return n;
}

for (const name of readdirSync(jsxDir).filter((f) => f.endsWith(".jsx"))) {
  const base = name.replace(".jsx", "");
  const comp = base.replace(/-main$/, "").replace(/fp(\d+)/i, (_, d) => `Fp${d}Markup`);
  const raw = readFileSync(join(jsxDir, name), "utf8");
  const body = injectHandlers(raw);
  const file = `/** Auto-generated from Stitch HTML — edit port script, not by hand. */\n// @ts-nocheck\nimport type { ReactNode } from "react";\n\nexport type MarkupHandlers = {\n  onFpClick?: (detail: { label?: string; card?: boolean; vehicleId?: string }, event: Event) => void;\n  children?: ReactNode;\n};\n\nexport function ${comp}({ onFpClick }: MarkupHandlers) {\n  return (\n    <div className="find-parts-markup-root">\n${body}\n    </div>\n  );\n}\n`;
  writeFileSync(join(outDir, `${comp}.tsx`), file, "utf8");
  console.log("wrote", comp);
}
