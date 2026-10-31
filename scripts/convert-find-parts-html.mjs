/**
 * One-off helper: extract Stitch find-parts <main> workflow and rough JSX for review.
 * Run: node scripts/convert-find-parts-html.mjs find-parts-car.html > out.txt
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(import.meta.dirname, "..");
const file = process.argv[2] || "find-parts-car.html";
const html = readFileSync(join(repo, "docs/stitch/roam-fleet-app/html", file), "utf8");
let main = (html.match(/<main[\s\S]*<\/main>/i) || [html])[0];
main = main.replace(/^<main[^>]*>/i, "").replace(/<\/main>$/i, "");
main = main.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
main = main.replace(/<!--[\s\S]*?-->/g, "");
main = main.replace(/\son[a-z]+="[^"]*"/gi, "");
main = main.replace(/\sclass=/g, " className=");
main = main.replace(/\sfor=/g, " htmlFor=");
main = main.replace(/\stabindex=/g, " tabIndex=");
main = main.replace(/selected=""/g, "");
main = main.replace(/(<(?:input|img|br|hr|meta|link|span)[^>]*?)(?<!\/)>/gi, "$1 />");
process.stdout.write(main);
