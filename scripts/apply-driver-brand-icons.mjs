/**
 * Bake Play Store Roam Driver icon into Android launcher + iOS AppIcon.
 * Source: apps/driver/public/images/brand/roam-driver-icon-master.png
 * (same asset as Play Console store listing 512 icon)
 *
 * Usage (repo root): node scripts/apply-driver-brand-icons.mjs
 */
import sharp from 'sharp';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'apps/driver');
const master = join(appDir, 'public/images/brand/roam-driver-icon-master.png');
const res = join(appDir, 'android/app/src/main/res');
// Corner sample from store 512 icon (#252A2D)
const brandHex = '#252A2D';
const brand = { r: 37, g: 42, b: 45, alpha: 1 };

if (!existsSync(master)) {
  console.error('Missing master icon:', master);
  process.exit(1);
}

const densities = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];
const names = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];

for (const { folder, size } of densities) {
  const dir = join(res, folder);
  mkdirSync(dir, { recursive: true });
  for (const name of names) {
    // Full-bleed for legacy launchers; light pad for adaptive foreground safe zone
    const pad = name.includes('foreground') ? Math.round(size * 0.1) : 0;
    const inner = size - pad * 2;
    await sharp(master)
      .resize(inner, inner, { fit: 'cover', position: 'centre' })
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(join(dir, name));
  }
}

writeFileSync(
  join(res, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${brandHex}</color>
</resources>
`,
);

const drawableBg = join(res, 'drawable/ic_launcher_background.xml');
if (existsSync(drawableBg)) {
  let xml = readFileSync(drawableBg, 'utf8');
  xml = xml.replace(/android:fillColor="#[0-9A-Fa-f]{6,8}"/, `android:fillColor="${brandHex}"`);
  writeFileSync(drawableBg, xml);
}

// Keep splash brand green (capacitor.config SplashScreen), logo centered
const splashBrand = { r: 0, g: 109, b: 67, alpha: 1 };
const logo = await sharp(master)
  .resize(1200, 1200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: splashBrand },
})
  .composite([{ input: logo, gravity: 'centre' }])
  .png()
  .toFile(join(res, 'drawable/splash.png'));

for (const folder of readdirSync(res)) {
  if (!folder.startsWith('drawable-')) continue;
  const dest = join(res, folder, 'splash.png');
  if (existsSync(dest) || folder.includes('land') || folder.includes('port')) {
    copyFileSync(join(res, 'drawable/splash.png'), dest);
  }
}

// iOS AppIcon (single 1024 asset used by Contents.json)
const iosIcon = join(appDir, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
if (existsSync(dirname(iosIcon))) {
  await sharp(master).resize(1024, 1024, { fit: 'cover' }).png().toFile(iosIcon);
  console.log('iOS AppIcon updated');
}

console.log('Driver icons from store listing master', brandHex);
console.log('xxxhdpi bytes', statSync(join(res, 'mipmap-xxxhdpi/ic_launcher.png')).size);
