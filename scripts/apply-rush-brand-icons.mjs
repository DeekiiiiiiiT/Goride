import sharp from 'sharp';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const appDir = 'apps/dash-customer';
const master = join(appDir, 'public/images/brand/roam-rush-icon-master.png');
const res = join(appDir, 'android/app/src/main/res');
const brand = { r: 0, g: 109, b: 67, alpha: 1 };

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
    const pad = name.includes('foreground') ? Math.round(size * 0.12) : 0;
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
    <color name="ic_launcher_background">#006d43</color>
</resources>
`,
);

const logo = await sharp(master)
  .resize(1200, 1200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: brand },
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

console.log('Rush icons + splash from official RR master');
console.log('xxxhdpi bytes', statSync(join(res, 'mipmap-xxxhdpi/ic_launcher.png')).size);
