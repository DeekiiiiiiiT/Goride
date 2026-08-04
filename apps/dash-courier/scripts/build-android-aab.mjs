import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');
const bundlePath = join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const releaseDir = join(androidDir, 'app', 'release');
const releasePath = join(releaseDir, 'app-release.aab');

function findJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Android', 'Android Studio', 'jbr'),
    join(process.env.ProgramFiles ?? '', 'Android', 'Android Studio', 'jbr'),
    join(process.env['ProgramFiles(x86)'] ?? '', 'Android', 'Android Studio', 'jbr'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, 'bin', 'java.exe'))) {
      return candidate;
    }
  }
  return null;
}

const javaHome = findJavaHome();
if (!javaHome) {
  console.error('JAVA_HOME not found. Open Android Studio once, or set JAVA_HOME to its jbr folder.');
  process.exit(1);
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(gradlew, [':app:bundleRelease', '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, JAVA_HOME: javaHome },
});

if (result.error) {
  console.error('Gradle failed to start:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!existsSync(bundlePath)) {
  console.error(`Build finished but AAB missing: ${bundlePath}`);
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
copyFileSync(bundlePath, releasePath);

console.log('');
console.log('Upload this file to Play Console:');
console.log(releasePath);
