import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(import.meta.dirname, "..");
const fleetDir = join(repo, "docs", "stitch", "roam-fleet-app");
const fleetReadme = readFileSync(join(fleetDir, "README.md"), "utf8");
const fleetSamples = JSON.parse(readFileSync(join(fleetDir, "sample-labels.json"), "utf8"));

function fleetMainContent(html) {
  const page = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  let main = (page.match(/<main[\s\S]*<\/main>/i) || [page])[0];
  main = main.replace(
    /<div class="flex flex-col md:flex-row md:items-center justify-between[\s\S]*?<\/div>\s*<div class="inline-flex p-1 bg-surface-container[\s\S]*?Find parts[\s\S]*?<\/a>\s*<\/div>/i,
    "",
  );
  main = main.replace(
    /<div class="w-full bg-surface-container-lowest rounded-xl p-space-md mb-space-lg shadow-sm flex flex-col md:flex-row[\s\S]*?4\. Position & Fit[\s\S]*?<\/div>\s*<\/div>/i,
    "",
  );
  return main;
}

function fleetTextNodes(html) {
  const page = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const main = fleetMainContent(page);
  let extra = "";
  for (const match of page.matchAll(/<(dialog|aside)[^>]*>[\s\S]*?<\/\1>/gi)) {
    if (!main.includes(match[0])) extra += match[0];
  }
  const region = `${main}\n${extra}`.replace(/<!--[\s\S]*?-->/g, " ");
  const text = region
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/g, " ");
  const nodes = new Set();
  for (const raw of text.split("\n")) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (t.length >= 3 && /[a-z]/i.test(t)) nodes.add(t);
  }
  return nodes;
}

function fleetPhrase(node, samples) {
  let t = node.toLowerCase().replace(/&amp;/g, "&");
  for (const sample of samples) {
    if (sample) t = t.split(sample).join(" ");
  }
  t = t.replace(/\s+/g, " ").trim();
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(t)) return "";
  return t.length >= 4 && /[a-z]/.test(t) ? t : "";
}

function fleetVisibleSource(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/<(\w+)([^>]*className=")([^"]*)("[^>]*>)([\s\S]*?)<\/\1>/g, (all, tag, pre, classes, post) => {
      const tokens = classes.trim().split(/\s+/);
      if (tokens.includes("sr-only")) return "";
      return all;
    });
}

for (const row of fleetReadme.split("\n").filter((l) => /^\| FP\d/.test(l))) {
  const cells = row.split("|").map((c) => c.trim().replace(/^`|`$/g, ""));
  const [num, , , html, , react] = cells.slice(1);
  if (!html || html === "—" || !react) continue;
  const page = readFileSync(join(fleetDir, html), "utf8");
  const samples = (Array.isArray(fleetSamples[num]) ? fleetSamples[num] : [])
    .map((label) => String(label).trim().toLowerCase())
    .filter(Boolean);
  const labels = new Set();
  for (const node of fleetTextNodes(page)) {
    const phrase = fleetPhrase(node, samples);
    if (phrase) labels.add(phrase);
  }
  const reactFiles = react.split(/\s*\+\s*/).map((f) => f.trim()).filter(Boolean);
  const joined = reactFiles.map((f) => readFileSync(join(repo, f), "utf8")).join("\n");
  const lower = fleetVisibleSource(joined).toLowerCase();
  const missed = [...labels].filter((label) => !lower.includes(label));
  console.log(JSON.stringify({ fp: num, missed, count: missed.length, total: labels.size }));
}
