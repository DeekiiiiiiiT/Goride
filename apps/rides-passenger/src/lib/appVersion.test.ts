import { describe, expect, it } from 'vitest';
import { formatAppVersionLabel } from './appVersion';

describe('appVersion', () => {
  it('formats version label', () => {
    expect(formatAppVersionLabel({ version: '1.0.21', buildYear: '2026' })).toBe('1.0.21 (2026)');
  });

  it('uses safe fallbacks for empty values', () => {
    const label = formatAppVersionLabel({ version: '', buildYear: '' });
    expect(label).toMatch(/^0\.0\.0 \(\d{4}\)$/);
  });
});
