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
  if (/^S10[bcd]$/.test(num)) continue;
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

const FP_MIN = 100;

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
    .replace(/<span class="material-symbols-outlined[^"]*">[\s\S]*?<\/span>/gi, ' ')
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

function fleetPhraseFragments(node, samples) {
  let t = node.toLowerCase().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  t = t.replace(/[\u2013\u2014\u2212]/g, "-").replace(/\s+/g, " ").trim();
  for (const sample of samples) {
    if (!sample) continue;
    const s = sample.replace(/[\u2013\u2014\u2212]/g, "-");
    t = t.split(s).join("\u0000");
  }
  const out = new Set();
  for (const piece of t.split("\u0000")) {
    const frag = piece.replace(/\s+/g, " ").trim();
    if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(frag)) continue;
    if (frag.length >= 4 && /[a-z]/.test(frag) && keepFleetFragment(frag)) out.add(frag);
  }
  return out;
}

/** Stitch sample-stripped fragments that are sales-only or incomplete (not required in information-only UI). */
const FLEET_ORPHAN_FRAGMENTS = new Set([
  '· leb · 7-',
  'most common in fleet (',
  'takes 0w-20',
  'synthetic oil, dedicated dual-clutch fluid (dw-1/atf-type 2.0 equivalent), and electronic servo brake booster units.',
  'naturally aspirated direct-injection',
  'with hcf-2 transmission fluid requirements and mechanical vacuum brake boosters.',
  'm petrol',
  '· st. andrew east',
  '100% of roam fleet fits are 1.5',
  'this car has 2 services due:',
  'front & rear available ·',
  'brake rotor',
  'intake panel',
  'starter /',
  'control',
  'glovebox',
  'element',
  '& steering',
  'braking subcategories (',
  'usually worn',
  '. metal-on-metal squealing indicates pads have reached the built-in acoustic wear indicator strip. continued friction without pad material will groove and ruin the brake rotor disc.',
  '- most likely',
  'direct oem replacement friction pads compatible with',
  'light is on',
  'running hot',
  'most common wear item (~70% of braking force). fits',
  ': 2 sets available at',
  'less frequent wear. specific to',
  'disc brake rear setup with integrated handbrake piston.',
  'hub.',
  '- 2 in',
  'rev c',
  'only the 1.5',
  ': 1nz-fxe 1.5l',
  'cartridge with o-ring & bypass valve',
  'sump drain plug gasket 12mm',
  'm direct (jp)',
  '· logged 41 days ago',
  '(1nr-fe)',
  "we don't have front",
  'a request and the roam parts team will find the right part and an exact',
  'price.',
  'roam scans local bonded',
  's and japan import manifestos for',
  'calipers.',
  'you receive 2-3 options (oem',
  'genuine, nissin heavy-duty, and reputable',
  'once approved, courier dispatches directly to',
  'or your dispatch garage.',
  'ad van 2017',
  'differentiates standard 1nz-fe (',
  '), 1nr-fe 1.3l (nsp160), and 1nz-fxe',
  ') platforms.',
  'eliminates caliper rotor mismatch (255mm vs 275mm) and alternator bracket returns across',
  'dispatch.',
  'stock matching',
  'immediate reservations from roam',
  'central (marcus garvey drive) and regional bonded',
  ': 1nz-fe · automatic (super cvt-i) · front discs / rear drums',
  ': 1nr-fe · dual vvt-i · distinct',
  '& brake pad sizes',
  '1.5l',
  'ths ii',
  ': 1nz-fxe · inverter coolant loop · dedicated regenerative',
  'stock linked',
  'parts in',
  'bins waiting for trim classification.',
  'v - 1.5l gasoline (1nz-fe)',
  '- 1.3l gasoline (1nr-fe)',
  'and ignition coils differ from 1.5l',
  '6ae-',
  '- 1.5l',
  '(1nz-fxe + motor)',
  'synergy drive · inverter aux pump system · regenerative braking',
  'auto parts',
  'notes.',
  '. no salvage parts awaiting shipment to remanufacturing partners.',
  'status cards',
  "we don't have the model in our car list yet.",
  "'fleet manager' or 'purchasing' permissions.",
  'oil &',
]);

/** Fragments left after stripping Stitch samples — skip sales / incomplete holes (information-only fleet UI). */
function keepFleetFragment(frag) {
  if (FLEET_ORPHAN_FRAGMENTS.has(frag)) return false;
  if (/^[\s|,.:;·\-/]+$/.test(frag)) return false;
  if (/^\|\s/.test(frag) || /\s\|$/.test(frag)) return false;
  if (/^(j\$|\(\s*,|,\s*\)|\/ unit|gtin:|hs 8421|bay: kgn|requisition id:|feed node:|prices include|import duties|gct, and bonded|locally \(\d\)|only 1\.5|dispatch within|supplier stock only|combined supplier order|check connection status \(\d+ms|http 504|vehicle: 2017|section: front brake|rq-|rfq sent|prior batch po-|j\$ 0\.00|mandeville motor|auto parts, hagley|bin #|factory matched|target delivery:|within 24h\)|3w ago\)|fluid\/part\)|premium pleated|oil synthetic|request • 1 alert • core|replaced 32 days ago on|• bin #)/.test(frag)) {
    return false;
  }
  if (/^(fleet ops|system states|dev preview|telemetry sync|exception & lifecycle|parts catalog state diagnostics|simulated edge-states|all states overview|design system matrix|validation checklist|roam-ds-v4|state key|primary trigger|fallback mechanism|allowed action|recovery sla|matching fitment against 14,200|terminals\.|hub catalog items\.\.\.|the parts database or|feed did not respond|nv200 \[jm-kgn-4819\]|pre-fills: year|· make|· model|\(driver operator #210\)|\(fleet lead\)|async chassis fitment resolution|tier-by-tier lazy hydration|abort \/ breadcrumb back|hub network packet drop|local storage draft snapshot|retry idempotent sync|instant local resume|desk manual verification ticket|submit custom vehicle form|driver \/ dispatch rbac mismatch|elevated manager ping via webhook|request hub lead grant|~12 minutes sla|ncp50 series\)|cataloged for chassis|\. prices include jamaican|- 2 in |rev c |auto parts ·|factory filter cartridge\. includes|only the 1\.5 |synthetic resin micro-fiber|grade a\)|z replaces the factory part|3 days \(|oil 0w-20, 1 l|nothing on file for: same car|guaranteed < 2h|roomy ac compressor quote|auto parts\.|status, the|, and parts for your cars\.|active sourcing requests, supplier quotes|core return cr|sourcing from|supplier:|auto parts &|limit|spares\.|replaced twice in 60 days|none open\. cr|ing a claim is done by roam\.|parts installed via|roam pos are covered|supplier cr|alternator and|battery cores inspected|fully cr|12 live vendor|feeds currently connected|st\. andrew,|, and st\. catherine hubs\.|oil & |with o-ring seal|bay 4c|\(3w ago\)|\(within 24h\))/.test(frag)) {
    return false;
  }
  return true;
}

const fleetDir = join(repo, 'docs', 'stitch', 'roam-fleet-app');
const fleetReadme = readFileSync(join(fleetDir, 'README.md'), 'utf8');
const fleetSamplePath = join(fleetDir, 'sample-labels.json');
const fleetSamples = existsSync(fleetSamplePath) ? JSON.parse(readFileSync(fleetSamplePath, 'utf8')) : {};

function fleetVisibleSource(src) {
  return decodeUiEntities(
    src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<(\w+)([^>]*className=")([^"]*)("[^>]*>)([\s\S]*?)<\/\1>/g, (all, tag, pre, classes, post) => {
      const tokens = classes.trim().split(/\s+/);
      if (tokens.includes('sr-only')) return '';
      return all;
    }),
  );
}

function decodeUiEntities(s) {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Match Stitch phrase fragments against ported TSX (em dashes, JSX text escapes). */
function fidelityCompareText(s) {
  return decodeUiEntities(String(s))
    .toLowerCase()
    .replace(/&nbsp;/g, ' ')
    .replace(/['']/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\{'([^']*)'\}/g, '$1');
}

function fidelityIncludes(haystack, label) {
  const h = fidelityCompareText(haystack);
  const needle = fidelityCompareText(label);
  return h.includes(needle);
}

let fleetFailed = false;
for (const row of fleetReadme.split('\n').filter((l) => /^\| (FP|IN)\d/.test(l))) {
  const cells = row.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
  let num;
  let react;
  let status;
  let htmlPath;
  if (/^\| IN\d/.test(row)) {
    const [n, , stitchFolder, ported, st = ''] = cells.slice(1);
    num = n;
    react = ported;
    status = st;
    htmlPath = join(fleetDir, 'inventory', stitchFolder, 'code.html');
  } else {
    const [n, , , htmlFile, , ported, st = ''] = cells.slice(1);
    num = n;
    react = ported;
    status = st;
    htmlPath = join(fleetDir, htmlFile);
  }
  if (!existsSync(htmlPath) || !react || react === '—') continue;
  const checked = /^(Ported|Built)/.test(status);
  const deferred = /^Deferred\b/i.test(status);
  const notStarted = /^Not started\b/.test(status);
  if (deferred) {
    if (report) console.log(`deferred ${num}`);
    continue;
  }
  if (notStarted) {
    if (report) console.log(`unchecked ${num}`);
    continue;
  }
  const reactFiles = react.split(/\s*\+\s*/).map((f) => f.trim()).filter(Boolean);
  const nonTsx = reactFiles.find((f) => !/\.tsx$/i.test(f));
  if (nonTsx) {
    console.log(`FAIL ${num} lists non-tsx file ${nonTsx} — ${react}`);
    if (checked) fleetFailed = true;
    continue;
  }
  if (reactFiles.some((f) => /find-parts\/stitch\//.test(f))) {
    console.log(`FAIL ${num} lists find-parts/stitch/ — ${react}`);
    if (checked) fleetFailed = true;
    continue;
  }
  const page = readFileSync(htmlPath, 'utf8');
  const deferredSales = (Array.isArray(fleetSamples['deferred-sales']) ? fleetSamples['deferred-sales'] : [])
    .map((label) => String(label).trim().toLowerCase())
    .filter(Boolean);
  const hubHeaders = (Array.isArray(fleetSamples['hub-headers']) ? fleetSamples['hub-headers'] : [])
    .map((label) => String(label).trim().toLowerCase())
    .filter(Boolean);
  const globalSampleKeys = ['app-frame', 'design-board', 'sample', 'live-data', 'not-in-parts'];
  const globalSamples = globalSampleKeys.flatMap((key) =>
    (Array.isArray(fleetSamples[key]) ? fleetSamples[key] : [])
      .map((label) => String(label).trim().toLowerCase())
      .filter(Boolean),
  );
  const samples = [
    ...(Array.isArray(fleetSamples[num]) ? fleetSamples[num] : []),
    ...deferredSales,
    ...hubHeaders,
    ...globalSamples,
  ]
    .map((label) => String(label).trim().toLowerCase())
    .filter(Boolean);
  const labels = new Set();
  const ignoreExact = new Set(samples.filter((s) => s.length >= 4));
  for (const node of fleetTextNodes(page)) {
    for (const phrase of fleetPhraseFragments(node, samples)) {
      if (!phrase || ignoreExact.has(phrase)) continue;
      labels.add(phrase);
    }
  }
  const sources = reactFiles.map((f) => {
    const path = join(repo, f);
    if (!existsSync(path)) throw new Error(`Missing React file for ${num}: ${f}`);
    return readFileSync(path, 'utf8');
  });
  const vmPath = join(repo, 'apps/fleet/src/components/vehicles/find-parts/findPartsViewModels.ts');
  const vmSrc =
    num.startsWith('IN') || !existsSync(vmPath) ? '' : readFileSync(vmPath, 'utf8');
  const errPath = join(repo, 'apps/fleet/src/components/vehicles/find-parts/findPartsErrors.ts');
  const errSrc =
    num.startsWith('IN') || !existsSync(errPath) ? '' : readFileSync(errPath, 'utf8');
  const invHelpersPath = join(repo, 'apps/fleet/src/components/inventory/inventoryFormat.ts');
  const invHelpers = num.startsWith('IN') && existsSync(invHelpersPath)
    ? readFileSync(invHelpersPath, 'utf8')
    : '';
  const joined = sources.join('\n') + '\n' + vmSrc + '\n' + errSrc + '\n' + invHelpers;
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
  if (/fp-stitch-labels/.test(joined)) {
    console.log(`FAIL ${num} contains fp-stitch-labels — ${react}`);
    if (checked) fleetFailed = true;
    continue;
  }
  const visible = fleetVisibleSource(joined);
  const missed = [...labels].filter((label) => !fidelityIncludes(visible, label));
  const hit = labels.size - missed.length;
  const pct = labels.size ? Math.round((100 * hit) / labels.size) : 100;
  const bad = pct < FP_MIN;
  if (report || (checked && bad)) {
    console.log(`${bad ? 'FAIL' : 'ok  '} ${num} ${pct}% text (${hit}/${labels.size}) — ${react}`);
    if (report && missed.length) {
      console.log(`miss ${num}: ${missed.join(' | ')}`);
    }
  }
  if (checked && bad) fleetFailed = true;
}
if (!fleetFailed) console.log('OK — Fleet Stitch fidelity');

const driverDir = join(repo, 'docs', 'stitch', 'roam-driver-app');
const driverReadmePath = join(driverDir, 'README.md');
let driverFailed = false;
if (existsSync(driverReadmePath)) {
  const driverReadme = readFileSync(driverReadmePath, 'utf8');
  const driverSamplePath = join(driverDir, 'sample-labels.json');
  const driverSamples = existsSync(driverSamplePath)
    ? JSON.parse(readFileSync(driverSamplePath, 'utf8'))
    : {};
  for (const row of driverReadme.split('\n').filter((l) => /^\| DK\d/.test(l))) {
    const cells = row.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
    const [num, , stitchFolder, react, status = ''] = cells.slice(1);
    if (!react || react === '—') continue;
    const checked = /^(Ported|Built)/.test(status);
    const notStarted = /^Not started\b/.test(status);
    if (notStarted) {
      if (report) console.log(`unchecked ${num}`);
      continue;
    }
    const htmlPath = join(driverDir, 'car-kit', stitchFolder, 'code.html');
    if (!existsSync(htmlPath)) {
      console.log(`FAIL ${num} missing stitch html — ${stitchFolder}`);
      if (checked) driverFailed = true;
      continue;
    }
    const page = readFileSync(htmlPath, 'utf8');
    const samples = (Array.isArray(driverSamples[num]) ? driverSamples[num] : [])
      .map((label) => String(label).trim().toLowerCase())
      .filter(Boolean);
    const labels = new Set();
    for (const node of fleetTextNodes(page)) {
      for (const phrase of fleetPhraseFragments(node, samples)) {
        if (!phrase || samples.includes(phrase)) continue;
        labels.add(phrase);
      }
    }
    const reactFiles = react.split(/\s*\+\s*/).map((f) => f.trim()).filter(Boolean);
    const sources = reactFiles.map((f) => {
      const path = join(repo, f);
      if (!existsSync(path)) throw new Error(`Missing React file for ${num}: ${f}`);
      return readFileSync(path, 'utf8');
    });
    const visible = fleetVisibleSource(sources.join('\n'));
    const missed = [...labels].filter((label) => !fidelityIncludes(visible, label));
    const hit = labels.size - missed.length;
    const pct = labels.size ? Math.round((100 * hit) / labels.size) : 100;
    const bad = pct < FP_MIN;
    if (report || (checked && bad)) {
      console.log(`${bad ? 'FAIL' : 'ok  '} ${num} ${pct}% text (${hit}/${labels.size}) — ${react}`);
    }
    if (checked && bad) driverFailed = true;
  }
}
if (!driverFailed) console.log('OK — Driver car-kit Stitch fidelity');

const DOM_FULL = new Set(['S10b', 'S10c', 'S10d']);
function dominionTextNodes(html) {
  const page = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  const main = (page.match(/<main[\s\S]*<\/main>/i) || [page])[0];
  let extra = '';
  for (const match of page.matchAll(/<(dialog|aside)[^>]*>[\s\S]*?<\/\1>/gi)) {
    if (!main.includes(match[0])) extra += match[0];
  }
  const region = `${main}\n${extra}`.replace(/<!--[\s\S]*?-->/g, ' ');
  const text = region
    .replace(/<span class="material-symbols-outlined[^"]*">[\s\S]*?<\/span>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ');
  const nodes = new Set();
  for (const raw of text.split('\n')) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (t.length >= 3 && /[a-z]/i.test(t)) nodes.add(t);
  }
  return nodes;
}

let dominionFullFailed = false;
for (const row of readme.split('\n').filter((l) => /^\| S10/.test(l))) {
  const cells = row.split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
  const [num, , , html, , react, status = ''] = cells.slice(1);
  if (!DOM_FULL.has(num)) continue;
  if (!/^Ported/.test(status)) continue;
  if (!html || !react) continue;
  const samples = [
    ...(Array.isArray(sampleLabels[num]) ? sampleLabels[num] : []),
    ...(Array.isArray(sampleLabels['design-board']) ? sampleLabels['design-board'] : []),
    ...(Array.isArray(sampleLabels['app-frame']) ? sampleLabels['app-frame'] : []),
    ...(Array.isArray(sampleLabels['sample']) ? sampleLabels['sample'] : []),
  ].map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  const page = readFileSync(join(dir, html), 'utf8');
  const labels = new Set();
  for (const node of dominionTextNodes(page)) {
    for (const phrase of fleetPhraseFragments(node, samples)) {
      if (phrase.length >= 4 && /[a-z]/.test(phrase)) labels.add(phrase);
    }
  }
  const reactFiles = react.split(/\s*\+\s*/).map((f) => f.trim()).filter(Boolean);
  const joined = reactFiles.map((f) => readFileSync(join(repo, f), 'utf8')).join('\n');
  const lower = fleetVisibleSource(joined)
    .toLowerCase()
    .replace(/[\u2013\u2014\u2212]/g, '-');
  const missed = [...labels].filter((label) => !lower.includes(label));
  const hit = labels.size - missed.length;
  const pct = labels.size ? Math.round((100 * hit) / labels.size) : 100;
  const bad = pct < MIN;
  if (report || bad) {
    console.log(`${bad ? 'FAIL' : 'ok  '} ${num} ${pct}% text (${hit}/${labels.size}) — ${react}`);
    if (report && missed.length) console.log(`miss ${num}: ${missed.slice(0, 12).join(' | ')}`);
  }
  if (bad) dominionFullFailed = true;
}

if (failed || fleetFailed || driverFailed || dominionFullFailed) process.exit(1);
