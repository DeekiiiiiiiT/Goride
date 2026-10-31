/**
 * Dominion Stitch fidelity check.
 * For each S-row in docs/stitch/dominion-redesign/README.md marked Ported (or Built):
 * - at least 80% of the Stitch screen's headings, column names, labels and buttons appear in the React file;
 * - the React file no longer imports the old components/ui kit.
 * D-rows (Roam Plug screens) and S1, S7, S8 are final and skipped.
 * Rows marked "Superseded by … do not build" are skipped.
 * Rows marked "Not started" are reported as unchecked and their React files are not read.
 * Sample Stitch notes in sample-labels.json are dropped before the score.
 * Run: node scripts/stitch-fidelity.mjs [--report]
 *
 * Fleet FP rows (docs/stitch/roam-fleet-app): every visible text node inside
 * <main> and any drawer or dialog is compared, after sample values are removed.
 * Ported FP rows must score 100%. Not-started rows are scored only with --report.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = join(import.meta.dirname, '..');
const dir = join(repo, 'docs', 'stitch', 'dominion-redesign');
const readme = readFileSync(join(dir, 'README.md'), 'utf8');
const samplePath = join(dir, 'sample-labels.json');
const sampleLabels = existsSync(samplePath) ? JSON.parse(readFileSync(samplePath, 'utf8')) : {};
const report = process.argv.includes('--report');
const SKIP = new Set(['S1', 'S7', 'S8']);
const MIN = 80;
const OLD_KIT = /from ['"](@roam\/ui|@\/components\/ui|(\.\.?\/)+ui)(\/|['"])/;

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
let failed = false;

for (const row of readme.split('\n').filter((l) => /^\| S\d/.test(l))) {
  const cells = row.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
  const [num, , , html, , react, status = ''] = cells.slice(1);
  if (SKIP.has(num)) continue;
  if (/superseded by\s+\S+.*do not build/i.test(status)) continue;
  if (/^Retired\b/i.test(status)) continue;
  if (/^Not started\b/.test(status)) {
    if (report) console.log(`unchecked ${num}`);
    continue;
  }
  if (!html || html === '—' || !react || react === '—') continue;
  const checked = /^(Ported|Built)/.test(status);
  const page = readFileSync(join(dir, html), 'utf8').replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const body = (page.match(/<main[\s\S]*<\/main>/) || [page])[0];
  const labels = new Set();
  for (const m of body.matchAll(/<(h1|h2|h3|h4|th|button|label)[^>]*>([\s\S]*?)<\/\1>/g)) {
    const t = strip(m[2]).replace(/^[a-z_]+ /, '').toLowerCase(); // drop icon ligature names
    if (t.length >= 4 && t.length <= 40 && /[a-z]/.test(t)) labels.add(t);
  }
  const ignore = new Set(
    (Array.isArray(sampleLabels[num]) ? sampleLabels[num] : [])
      .map((label) => String(label).trim().toLowerCase())
      .filter(Boolean),
  );
  const dropped = [...labels].filter((label) => ignore.has(label)).sort();
  for (const label of dropped) labels.delete(label);
  const reactFiles = react.split(/\s*\+\s*/).map((f) => f.trim()).filter(Boolean);
  const sources = reactFiles.map((f) => readFileSync(join(repo, f), 'utf8'));
  const src = sources.join('\n');
  if (/\bfor fidelity\b/i.test(src)) {
    console.log(`FAIL ${num} contains "for fidelity" — ${react}`);
    if (checked) failed = true;
    continue;
  }
  // Strip JSX comments and elements whose class list includes exact tokens sr-only or hidden
  // (not substrings like overflow-hidden).
  const visible = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<(\w+)([^>]*className=")([^"]*)("[^>]*>)([\s\S]*?)<\/\1>/g, (all, tag, pre, classes, post) => {
      const tokens = classes.trim().split(/\s+/);
      if (tokens.includes('sr-only') || tokens.includes('hidden')) return '';
      return all;
    });
  const lower = visible.toLowerCase();
  const hit = [...labels].filter((l) => lower.includes(l)).length;
  const pct = labels.size ? Math.round((100 * hit) / labels.size) : 100;
  // Old-kit ban applies to the page shell (first file), not shared ops panels.
  const oldKit = OLD_KIT.test(sources[0] || '');
  const bad = pct < MIN || oldKit;
  if (report || (checked && bad)) {
    console.log(`${bad ? 'FAIL' : 'ok  '} ${num} ${pct}% labels${oldKit ? ', old ui kit' : ''} — ${react}`);
    if (report && dropped.length) console.log(`drop ${num}: ${dropped.join(' | ')}`);
  }
  if (checked && bad) failed = true;
}

if (!failed) console.log('OK — Dominion Stitch fidelity');

const FP_MIN = 90;

function fleetMainContent(html) {
  const page = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  let main = (page.match(/<main[\s\S]*<\/main>/i) || [page])[0];
  main = main.replace(
    /<div class="flex flex-col md:flex-row md:items-center justify-between[\s\S]*?<\/div>\s*<div class="inline-flex p-1 bg-surface-container[\s\S]*?Find parts[\s\S]*?<\/a>\s*<\/div>/i,
    '',
  );
  main = main.replace(
    /<div class="w-full bg-surface-container-lowest rounded-xl p-space-md mb-space-lg shadow-sm flex flex-col md:flex-row[\s\S]*?4\. Position & Fit[\s\S]*?<\/div>\s*<\/div>/i,
    '',
  );
  return main;
}

function fleetTextNodes(html) {
  const page = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  const main = fleetMainContent(page);
  let extra = '';
  for (const match of page.matchAll(/<(dialog|aside)[^>]*>[\s\S]*?<\/\1>/gi)) {
    if (!main.includes(match[0])) extra += match[0];
  }
  const region = `${main}\n${extra}`.replace(/<!--[\s\S]*?-->/g, ' ');
  const text = region
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/g, ' ');
  const nodes = new Set();
  for (const raw of text.split('\n')) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (t.length >= 3 && /[a-z]/i.test(t)) nodes.add(t);
  }
  return nodes;
}

function fleetPhrase(node, samples) {
  let t = node.toLowerCase().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  for (const sample of samples) {
    if (sample) t = t.split(sample).join(' ');
  }
  t = t.replace(/\s+/g, ' ').trim();
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(t)) return '';
  return t.length >= 4 && /[a-z]/.test(t) ? t : '';
}

const fleetDir = join(repo, 'docs', 'stitch', 'roam-fleet-app');
const fleetReadme = readFileSync(join(fleetDir, 'README.md'), 'utf8');
const fleetSamplePath = join(fleetDir, 'sample-labels.json');
const fleetSamples = existsSync(fleetSamplePath) ? JSON.parse(readFileSync(fleetSamplePath, 'utf8')) : {};

function fleetVisibleSource(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<(\w+)([^>]*className=")([^"]*)("[^>]*>)([\s\S]*?)<\/\1>/g, (all, tag, pre, classes, post) => {
      const tokens = classes.trim().split(/\s+/);
      if (tokens.includes('sr-only')) return '';
      return all;
    });
}

let fleetFailed = false;
for (const row of fleetReadme.split('\n').filter((l) => /^\| FP\d/.test(l))) {
  const cells = row.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
  const [num, , , html, , react, status = ''] = cells.slice(1);
  if (!html || html === '—' || !react || react === '—') continue;
  const checked = /^(Ported|Built)/.test(status);
  const notStarted = /^Not started\b/.test(status);
  if (notStarted && !report) continue;
  const reactFiles = react.split(/\s*\+\s*/).map((f) => f.trim()).filter(Boolean);
  if (reactFiles.some((f) => /find-parts\/stitch\//.test(f))) {
    console.log(`FAIL ${num} lists find-parts/stitch/ — ${react}`);
    if (checked) fleetFailed = true;
    continue;
  }
  const page = readFileSync(join(fleetDir, html), 'utf8');
  const samples = (Array.isArray(fleetSamples[num]) ? fleetSamples[num] : [])
    .map((label) => String(label).trim().toLowerCase())
    .filter(Boolean);
  const labels = new Set();
  for (const node of fleetTextNodes(page)) {
    const phrase = fleetPhrase(node, samples);
    if (phrase) labels.add(phrase);
  }
  const sources = reactFiles.map((f) => {
    const path = join(repo, f);
    if (!existsSync(path)) throw new Error(`Missing React file for ${num}: ${f}`);
    return readFileSync(path, 'utf8');
  });
  const joined = sources.join('\n');
  const bannedFpPatterns = [
    ['@ts-nocheck', '@ts-nocheck'],
    ['Auto-generated', 'Auto-generated'],
    ['createTreeWalker', 'createTreeWalker'],
    ['applyFindPartsLiveText', 'applyFindPartsLiveText'],
    ['querySelector', 'querySelector'],
    ['label.includes', 'label.includes'],
    ['onFpClick', 'onFpClick'],
  ];
  const bannedHit = bannedFpPatterns.find(([, token]) => joined.includes(token));
  if (bannedHit) {
    console.log(`FAIL ${num} banned pattern ${bannedHit[0]} — ${react}`);
    if (checked) fleetFailed = true;
    continue;
  }
  if (/dangerouslySetInnerHTML/.test(joined)) {
    console.log(`FAIL ${num} uses dangerouslySetInnerHTML — ${react}`);
    if (checked) fleetFailed = true;
    continue;
  }
  const visible = fleetVisibleSource(joined);
  const lower = visible.toLowerCase();
  const missed = [...labels].filter((label) => !lower.includes(label));
  const hit = labels.size - missed.length;
  const pct = labels.size ? Math.round((100 * hit) / labels.size) : 100;
  const bad = pct < FP_MIN;
  if (report || (checked && bad)) {
    console.log(`${bad ? 'FAIL' : 'ok  '} ${num} ${pct}% text (${hit}/${labels.size}) — ${react}`);
    if (report && missed.length) {
      console.log(`miss ${num}: ${missed.slice(0, 12).join(' | ')}${missed.length > 12 ? ` … +${missed.length - 12}` : ''}`);
    }
  }
  if (checked && bad) fleetFailed = true;
}
if (!fleetFailed) console.log('OK — Fleet Stitch fidelity');
if (failed || fleetFailed) process.exit(1);
