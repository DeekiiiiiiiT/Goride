/**
 * Render Find parts Stitch HTML to reference pictures.
 * Opens each HTML file in Chromium, waits for fonts, and saves a full-page PNG.
 * Dominion screens 2, 4 and 5 are checked against the real export PNGs.
 * Fleet export PNGs are empty placeholders, so those screens are not compared.
 *
 * Run: node scripts/stitch-render.mjs [dominion-redesign|roam-fleet-app] [--id S42b]
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const repo = join(import.meta.dirname, '..');

const APPS = {
  'dominion-redesign': {
    done: 'OK — S42 reference pictures',
    exportRoot: 'C:\\Users\\deeki\\Downloads\\stitch_dominion_parts_matcher_admin\\stitch_dominion_parts_matcher_admin',
    screens: [
      { id: 'S42', html: 'html/S42-find-parts-car.html', width: 1280 },
      { id: 'S42b', html: 'html/S42b-find-parts-variant.html', width: 1280, exportFolder: 'find_parts_which_one_is_yours' },
      { id: 'S42c', html: 'html/S42c-find-parts-browse.html', width: 1280 },
      { id: 'S42d', html: 'html/S42d-find-parts-position.html', width: 1280, exportFolder: 'find_parts_front_or_back' },
      { id: 'S42e', html: 'html/S42e-find-parts-results.html', width: 1280, exportFolder: 'find_parts_results_in_five_match_types' },
      { id: 'S42f', html: 'html/S42f-find-parts-detail.html', width: 1280 },
      { id: 'S42g', html: 'html/S42g-find-parts-missing.html', width: 1280 },
      { id: 'S42h', html: 'html/S42h-find-parts-all.html', width: 1280 },
      { id: 'S42i', html: 'html/S42i-find-parts-problems.html', width: 1280 },
      { id: 'S42j', html: 'html/S42j-find-parts-states.html', width: 1280 },
      { id: 'S42k', html: 'html/S42k-find-parts-phone.html', width: 390 },
    ],
  },
  'roam-fleet-app': {
    done: 'OK — FP reference pictures',
    exportRoot: null,
    screens: [
      { id: 'FP1', html: 'html/find-parts-car.html', width: 1280 },
      { id: 'FP2', html: 'html/find-parts-variant.html', width: 1280 },
      { id: 'FP3', html: 'html/find-parts-browse.html', width: 1280 },
      { id: 'FP4', html: 'html/find-parts-position.html', width: 1280 },
      { id: 'FP5', html: 'html/find-parts-results.html', width: 1280 },
      { id: 'FP6', html: 'html/find-parts-detail.html', width: 1280 },
      { id: 'FP7', html: 'html/find-parts-quote.html', width: 1280 },
      { id: 'FP8', html: 'html/find-parts-request.html', width: 1280 },
      { id: 'FP9', html: 'html/find-parts-link-car.html', width: 1280 },
      { id: 'FP10', html: 'html/find-parts-activity.html', width: 1280 },
      { id: 'FP11', html: 'html/find-parts-states.html', width: 1280 },
      { id: 'FP12', html: 'html/find-parts-phone.html', width: 390 },
    ],
  },
};

function readArgs() {
  const out = { id: null, app: 'dominion-redesign' };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--id') {
      out.id = argv[++i];
      continue;
    }
    if (argv[i] === '--app') {
      out.app = argv[++i];
      continue;
    }
    if (!argv[i].startsWith('--')) out.app = argv[i];
  }
  return out;
}

const { id: onlyId, app: appName } = readArgs();
const app = APPS[appName];
if (!app) {
  console.error(`Unknown folder ${appName}. Use dominion-redesign or roam-fleet-app.`);
  process.exit(1);
}

const stitchDir = join(repo, 'docs', 'stitch', appName);
const outDir = join(stitchDir, 'screenshots');
const exportRoot = app.exportRoot;
const SCREENS = app.screens;

const MATCH_MIN = 0.99;
const CHANNEL_TOLERANCE = 24;
const SLIGHT_WIDTH = 8;
const SLIGHT_HEIGHT = 80;

function rawOverlap(a, b) {
  const width = Math.min(a.info.width, b.info.width);
  const height = Math.min(a.info.height, b.info.height);
  const channels = a.info.channels;
  let different = 0;
  let strong = 0;
  const pixels = width * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ai = (y * a.info.width + x) * channels;
      const bi = (y * b.info.width + x) * channels;
      const delta = Math.max(
        Math.abs(a.data[ai] - b.data[bi]),
        Math.abs(a.data[ai + 1] - b.data[bi + 1]),
        Math.abs(a.data[ai + 2] - b.data[bi + 2]),
      );
      if (delta > CHANNEL_TOLERANCE) different++;
      if (delta > 64) strong++;
    }
  }
  return {
    width,
    height,
    different,
    strong,
    match: pixels ? 1 - different / pixels : 0,
    strongRatio: pixels ? strong / pixels : 0,
  };
}

async function compareToExport(renderPath, exportPath) {
  const rendered = await sharp(renderPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const exported = await sharp(exportPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const widthDelta = Math.abs(rendered.info.width - exported.info.width);
  const heightDelta = Math.abs(rendered.info.height - exported.info.height);
  const overlap = rawOverlap(rendered, exported);
  const slight = widthDelta <= SLIGHT_WIDTH && heightDelta <= SLIGHT_HEIGHT;
  const sameSize = widthDelta === 0 && heightDelta === 0;
  // A raw 99% match is the bar. Same-size pictures can still miss that on Windows
  // because letter edges smooth differently. Those stay under 1.5% of pixels.
  // A broken font or a missing stylesheet shows up as a much larger strong diff.
  const fontEdgesOnly = sameSize && overlap.match >= 0.95 && overlap.strongRatio <= 0.015;
  const ok = slight && (overlap.match >= MATCH_MIN || fontEdgesOnly);
  return {
    ok,
    slight,
    widthDelta,
    heightDelta,
    render: `${rendered.info.width}x${rendered.info.height}`,
    exported: `${exported.info.width}x${exported.info.height}`,
    match: overlap.match,
    strongRatio: overlap.strongRatio,
    crop: widthDelta > 0 || heightDelta > 0 ? `${overlap.width}x${overlap.height}` : null,
  };
}

async function renderScreen(page, screen) {
  const htmlPath = join(stitchDir, screen.html);
  const outPath = join(outDir, `${screen.id}-stitch.png`);
  await page.setViewportSize({ width: screen.width, height: 900 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const heading = document.querySelector('h1, h2');
    if (!heading) return false;
    const size = parseFloat(getComputedStyle(heading).fontSize);
    return size >= 16 && size <= 32;
  }, { timeout: 20000 });
  // One tall viewport, not a scrolled stitch. The Stitch sidebar is position:fixed,
  // so a scrolled full-page shot leaves the sidebar only in the first screenful.
  let height = 900;
  for (let i = 0; i < 4; i++) {
    await page.setViewportSize({ width: screen.width, height });
    const next = await page.evaluate(() => document.documentElement.scrollHeight);
    if (next === height) break;
    height = next;
  }
  await page.screenshot({ path: outPath, fullPage: false, animations: 'disabled', caret: 'hide' });
  return outPath;
}

mkdirSync(outDir, { recursive: true });
const screens = SCREENS.filter((screen) => !onlyId || screen.id === onlyId);
if (screens.length === 0) {
  console.error(`No screen named ${onlyId}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1, colorScheme: 'light' });
let failed = false;
try {
  for (const screen of screens) {
    const outPath = await renderScreen(page, screen);
    console.log(`wrote ${screen.id} ${outPath}`);
    if (!screen.exportFolder) continue;
    const exportPath = join(exportRoot, screen.exportFolder, 'screen.png');
    const result = await compareToExport(outPath, exportPath);
    const pct = `${(result.match * 100).toFixed(2)}%`;
    const strong = `${(result.strongRatio * 100).toFixed(2)}% strong`;
    const cropNote = result.crop ? `, overlap ${result.crop}` : '';
    console.log(
      `${result.ok ? 'trust' : 'FAIL '} ${screen.id} ${pct} (${strong}) render ${result.render} export ${result.exported}${cropNote}`,
    );
    if (!result.ok) failed = true;
  }
} finally {
  await browser.close();
}

if (failed) {
  console.error('Trust gate failed. Rendered pictures are not close enough to the real export PNGs.');
  process.exit(1);
}
console.log(app.done);
