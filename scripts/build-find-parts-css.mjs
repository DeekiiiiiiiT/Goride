import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateScopedStitchCss, mergeThemeExtend, parseTailwindConfigFromHtml } from './stitch-tailwind-theme.mjs';

const repo = join(import.meta.dirname, '..');
const htmlDir = join(repo, 'docs', 'stitch', 'roam-fleet-app', 'html');
const htmlFiles = [
  'find-parts-browse.html',
  'find-parts-position.html',
  'find-parts-results.html',
  'find-parts-request.html',
  'find-parts-requests-timeline.html',
  'find-parts-phone.html',
  'find-parts-car.html',
  'find-parts-variant.html',
  'find-parts-states.html',
  'find-parts-area-overlay.html',
  'find-parts-area-overlay-states.html',
  'find-parts-area-not-on-file.html',
  'find-parts-phone-area-sheet.html',
];

const configs = htmlFiles.map((f) => parseTailwindConfigFromHtml(join(htmlDir, f)));
const theme = mergeThemeExtend(configs);

const manualHead = `/* Scoped to Find parts. Other Fleet tabs do not use these names. */
.fleet-find-parts-stitch.find-parts-nested-markup .find-parts-markup-root > main > div > div:first-child,
.fleet-find-parts-stitch.find-parts-nested-markup .find-parts-markup-root > main > div > div:nth-child(2) {
  display: none;
}`;

/** Not emitted by Stitch Tailwind scan — React FP screens / SVG diagram only. */
const manualFp4 = `.fleet-find-parts-stitch .find-parts-screen-root > .fp-screen-root {
  scroll-margin-top: 5rem;
}
.fleet-find-parts-stitch .fill-primary { fill: #0061a4; }
.fleet-find-parts-stitch .outline-none { outline: 2px solid transparent; outline-offset: 2px; }
.fleet-find-parts-stitch .bg-emerald-100\\/50 { background-color: rgb(209 250 229 / 0.5); }
`;

const manualTail = `.fleet-find-parts-stitch .find-parts-stepbar, .fleet-find-parts-stitch .find-parts-trail { overflow-x: auto; }
.fleet-find-parts-stitch .divide-y > :not([hidden]) ~ :not([hidden]) { border-top-width: 1px; border-top-style: solid; }
.fleet-find-parts-stitch .divide-surface-container-high > :not([hidden]) ~ :not([hidden]) { border-color: #e6e8ea; }
.dark .fleet-find-parts-stitch .divide-surface-container-high > :not([hidden]) ~ :not([hidden]) { border-color: #444444; }
@media (max-width: 420px) {
  .fleet-find-parts-stitch .find-parts-sheet { position: fixed; inset: 0; max-width: none; border-radius: 0; }
}
@media (max-width: 420px) { .fleet-find-parts-stitch .find-parts-columns { display: flex; flex-direction: column; } }
`;

const generated = generateScopedStitchCss('fleet-find-parts-stitch', theme);
const out = join(repo, 'apps', 'fleet', 'src', 'components', 'vehicles', 'find-parts', 'findParts.css');
// Hand-written styles (e.g. AM-S4F results) live in scripts/stitch-css/findParts.manual.css so regeneration keeps them.
const manualExtra = readFileSync(join(repo, 'scripts', 'stitch-css', 'findParts.manual.css'), 'utf8').replace(/\r\n/g, '\n');
writeFileSync(out, `${manualHead}\n${manualFp4}${generated.join('\n')}\n${manualTail}\n${manualExtra}`);
console.log(`wrote ${generated.length + 2} sections → ${out}`);
