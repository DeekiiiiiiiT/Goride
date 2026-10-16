import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_SETTINGS } from './catalog';

/** packages/rush-settings/src → repo root */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Allowed templates when a reader uses dynamic app suffixes. */
function readerCoversKey(content: string, key: string): boolean {
  if (content.includes(key)) return true;
  const templateChecks: Array<{ re: RegExp; needles: string[] }> = [
    {
      re: /^platform\.maintenance\.(customer|courier|partner)$/,
      needles: ['platform.maintenance.', 'platform.maintenance.${app}'],
    },
    {
      re: /^platform\.announcement\.(customer|courier|partner)$/,
      needles: ['platform.announcement.', 'platform.announcement.${app}'],
    },
    {
      re: /^platform\.app_version\.(customer|courier|partner)\./,
      needles: ['platform.app_version.', 'platform.app_version.${app}'],
    },
    {
      re: /^platform\.brand\.name\.(customer|courier|partner)$/,
      needles: ['platform.brand.name.', 'platform.brand.name.${app}'],
    },
    {
      re: /^platform\.support\.(customer|courier|partner)$/,
      needles: ['platform.support.', 'platform.support.${app}'],
    },
    {
      re: /^platform\.legal\.(terms|privacy)\.(customer|courier|partner)$/,
      needles: ['platform.legal.terms.', 'platform.legal.privacy.', 'platform.legal.terms.${app}'],
    },
    {
      re: /^platform\.store_links\.(customer|courier|partner)$/,
      needles: ['platform.store_links.', 'platform.store_links.${app}'],
    },
    {
      re: /^enterprise\.rollouts\.(customer|courier|partner)$/,
      needles: ['enterprise.rollouts.', 'enterprise.rollouts.${app}'],
    },
  ];
  for (const { re, needles } of templateChecks) {
    if (re.test(key) && needles.some((n) => content.includes(n))) return true;
  }
  return false;
}

describe('every setting reader path exists', () => {
  it('every setting has at least one reader', () => {
    for (const setting of ALL_SETTINGS) {
      expect(setting.readers.length, setting.key).toBeGreaterThan(0);
    }
  });

  for (const setting of ALL_SETTINGS) {
    it(`${setting.key} readers exist on disk`, () => {
      for (const reader of setting.readers) {
        const abs = resolve(REPO_ROOT, reader);
        expect(existsSync(abs), `missing reader for ${setting.key}: ${reader}`).toBe(true);
      }
    });
  }
});

describe('visible settings have a reader that references the key', () => {
  for (const setting of ALL_SETTINGS) {
    if (setting.hidden) {
      it.skip(`${setting.key} is hidden until wired`, () => undefined);
      continue;
    }

    it(`${setting.key} is referenced in at least one reader file`, () => {
      const covered = setting.readers.some((reader) => {
        const abs = resolve(REPO_ROOT, reader);
        if (!existsSync(abs)) return false;
        return readerCoversKey(readFileSync(abs, 'utf8'), setting.key);
      });
      expect(
        covered,
        `${setting.key} has no reader file containing the key (or allowed template). ` +
          `Readers: ${setting.readers.join(', ')}`,
      ).toBe(true);
    });
  }
});
