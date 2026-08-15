/**
 * Best-effort Android launcher branding for Rush / Partner / Courier.
 *
 * Prefer: `pnpm dlx @capacitor/assets generate` or Android Asset Studio before store submit.
 * This script:
 *  - Sets adaptive-icon background colors to brand hex
 *  - If `sharp` is resolvable, resizes each app logo into mipmap-* launcher PNGs
 *  - Else copies the logo PNG into mipmap folders (may be wrong size — regenerate later)
 *  - Courier has no logo.png yet — background color only unless you add one
 *
 * Usage (repo root): node scripts/generate-dash-android-icons.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {{ id: string; appDir: string; brand: string; logoCandidates: string[] }[]} */
const APPS = [
  {
    id: 'rush',
    appDir: 'apps/dash-customer',
    brand: '#006d43',
    logoCandidates: ['public/images/logo.png'],
  },
  {
    id: 'partner',
    appDir: 'apps/dash-merchant',
    brand: '#10b981',
    logoCandidates: ['public/assets/logo.png'],
  },
  {
    id: 'courier',
    appDir: 'apps/dash-courier',
    brand: '#006d43',
    logoCandidates: ['public/images/logo.png', 'public/images/courier-avatar.png'],
  },
];

const DENSITIES = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

const NAMES = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];

async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function resolveLogo(appDir, candidates) {
  for (const rel of candidates) {
    const abs = join(root, appDir, rel);
    if (existsSync(abs) && abs.toLowerCase().endsWith('.png')) return abs;
  }
  return null;
}

function setLauncherBackground(appDir, brand) {
  const valuesPath = join(root, appDir, 'android/app/src/main/res/values/ic_launcher_background.xml');
  const drawablePath = join(root, appDir, 'android/app/src/main/res/drawable/ic_launcher_background.xml');

  if (existsSync(valuesPath)) {
    writeFileSync(
      valuesPath,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${brand}</color>\n</resources>\n`,
    );
  }

  if (existsSync(drawablePath)) {
    let xml = readFileSync(drawablePath, 'utf8');
    xml = xml.replace(/android:fillColor="#[0-9A-Fa-f]{6,8}"/, `android:fillColor="${brand}"`);
    writeFileSync(drawablePath, xml);
  }
}

async function writeMipmaps(sharp, logoPath, appDir) {
  const resRoot = join(root, appDir, 'android/app/src/main/res');
  for (const { folder, size } of DENSITIES) {
    const dir = join(resRoot, folder);
    mkdirSync(dir, { recursive: true });
    for (const name of NAMES) {
      const out = join(dir, name);
      if (sharp) {
        // Foreground gets padding for adaptive icons; legacy launchers get full-bleed square.
        const pad = name.includes('foreground') ? Math.round(size * 0.18) : 0;
        const inner = size - pad * 2;
        await sharp(logoPath)
          .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .extend({
            top: pad,
            bottom: pad,
            left: pad,
            right: pad,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toFile(out);
      } else {
        copyFileSync(logoPath, out);
      }
    }
  }
}

const sharp = await loadSharp();
if (!sharp) {
  console.warn(
    '[generate-dash-android-icons] sharp not installed — copying logos as-is and tinting backgrounds.\n' +
      '  Install optional: pnpm add -Dw sharp\n' +
      '  Before Play submit: Android Asset Studio or `pnpm dlx @capacitor/assets generate`',
  );
} else {
  console.log('[generate-dash-android-icons] using sharp for resized mipmaps');
}

for (const app of APPS) {
  const androidRes = join(root, app.appDir, 'android/app/src/main/res');
  if (!existsSync(androidRes)) {
    console.warn(`[${app.id}] skip — android res missing at ${androidRes}`);
    continue;
  }

  setLauncherBackground(app.appDir, app.brand);
  const logo = resolveLogo(app.appDir, app.logoCandidates);
  if (!logo) {
    console.warn(`[${app.id}] no PNG logo found — brand background only (${app.brand})`);
    continue;
  }

  await writeMipmaps(sharp, logo, app.appDir);
  console.log(`[${app.id}] branded icons from ${logo.replace(root, '')} (${app.brand})`);
}

console.log('Done. Regenerate adaptive icons via Asset Studio / @capacitor/assets before store submit.');
