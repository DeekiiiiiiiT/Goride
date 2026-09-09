/**
 * After Phase 3 H-1 — preview writes nothing; prepare owns seals.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'fixtures',
  'preview-week-close-characterization.json',
);

describe('previewWeekClose (H-1 fixed)', () => {
  it('documents pure preview vs prepare writes', () => {
    expect(existsSync(FIXTURE)).toBe(true);
    const f = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
      previewWeekClose: { actuallyWrites: string[] };
      prepareWeekClose: { writes: string[] };
      status?: string;
    };
    expect(f.previewWeekClose.actuallyWrites.length).toBe(0);
    expect(f.prepareWeekClose.writes.length).toBeGreaterThan(0);
    expect(f.status).toBe('fixed');
  });
});
