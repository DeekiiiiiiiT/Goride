import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateScopedStitchCss, mergeThemeExtend, parseTailwindConfigFromHtml } from './stitch-tailwind-theme.mjs';

const repo = join(import.meta.dirname, '..');
const htmlDir = join(repo, 'docs', 'stitch', 'dominion-redesign', 'html');
const htmlFiles = [
  'S10b-pending-catalog-parts.html',
  'S10c-pending-part-request-drawer.html',
  'S10d-pending-catalog-states.html',
];

const configs = htmlFiles.map((f) => parseTailwindConfigFromHtml(join(htmlDir, f)));
const theme = mergeThemeExtend(configs);

const manualTail = `.pending-parts-stitch .text-headline-sm, .pending-parts-stitch .font-headline-sm { font-size: 18px; line-height: 26px; letter-spacing: -0.01em; font-weight: 600; }
.pending-parts-stitch .material-symbols-outlined { vertical-align: middle; }
.pending-parts-stitch .font-caption { font-size: 12px; line-height: 16px; font-weight: 400; }
.pending-parts-stitch .text-caption { font-size: 12px; line-height: 16px; }
`;

const generated = generateScopedStitchCss('pending-parts-stitch', theme, {
  monoFontTokens: ['label-plate', 'label-code', 'label-price', 'mono-sm', 'mono-md', 'mono-lg'],
});
const out = join(repo, 'apps', 'admin', 'src', 'components', 'admin', 'vehicle-catalog', 'pending-parts', 'pendingParts.css');
// Hand-written styles (e.g. auto-match conflicts) live in scripts/stitch-css/pendingParts.manual.css so regeneration keeps them.
const manualExtra = readFileSync(join(repo, 'scripts', 'stitch-css', 'pendingParts.manual.css'), 'utf8').replace(/\r\n/g, '\n');
writeFileSync(out, `${generated.join('\n')}\n${manualTail}\n${manualExtra}`);
console.log(`wrote ${generated.length} sections → ${out}`);
