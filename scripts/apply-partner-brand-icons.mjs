import sharp from 'sharp';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const appDir = 'apps/dash-merchant';
const master = join(appDir, 'public/images/brand/roam-partner-icon-master.png');
const res = join(appDir, 'android/app/src/main/res');
// Partner brand emerald from capacitor.config.ts
const brand = { r: 16, g: 185, b: 129, alpha: 1 };

const densities = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];
const names = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];

async function writePngViaTemp(pipeline, dest) {
  const tmp = join(tmpdir(), `partner-icon-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  await pipeline.png().toFile(tmp);
  mkdirSync(join(dest, '..'), { recursive: true });
  try {
    if (existsSync(dest)) unlinkSync(dest);
  } catch {
    // OneDrive may hold a lock briefly; overwrite via copy still works often
  }
  copyFileSync(tmp, dest);
  try {
    unlinkSync(tmp);
  } catch {
    // ignore temp cleanup
  }
}

for (const { folder, size } of densities) {
  const dir = join(res, folder);
  mkdirSync(dir, { recursive: true });
  for (const name of names) {
    const pad = name.includes('foreground') ? Math.round(size * 0.12) : 0;
    const inner = size - pad * 2;
    const pipeline = sharp(master)
      .resize(inner, inner, { fit: 'cover', position: 'centre' })
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    await writePngViaTemp(pipeline, join(dir, name));
  }
}

writeFileSync(
  join(res, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#10b981</color>
</resources>
`,
);

const logo = await sharp(master)
  .resize(1200, 1200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const splashPipeline = sharp({
  create: { width: 2732, height: 2732, channels: 4, background: brand },
}).composite([{ input: logo, gravity: 'centre' }]);
await writePngViaTemp(splashPipeline, join(res, 'drawable/splash.png'));

for (const folder of readdirSync(res)) {
  if (!folder.startsWith('drawable-')) continue;
  const dest = join(res, folder, 'splash.png');
  if (existsSync(dest) || folder.includes('land') || folder.includes('port')) {
    copyFileSync(join(res, 'drawable/splash.png'), dest);
  }
}

console.log('Partner icons + splash from official master');
console.log('xxxhdpi bytes', statSync(join(res, 'mipmap-xxxhdpi/ic_launcher.png')).size);
