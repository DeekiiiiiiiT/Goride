import { describe, expect, it } from 'vitest';
import { validateItemSpec, parseItemSpec } from './validation';

describe('haulage validation', () => {
  it('requires weight', () => {
    const errors = validateItemSpec({
      lengthCm: '',
      widthCm: '',
      heightCm: '',
      weightKg: '',
    });
    expect(errors.weightKg).toBe('weightRequired');
  });

  it('flags incomplete dimensions', () => {
    const errors = validateItemSpec({
      lengthCm: '100',
      widthCm: '',
      heightCm: '',
      weightKg: '50',
    });
    expect(errors.lengthCm).toBe('dimensionsIncomplete');
  });

  it('parses valid spec', () => {
    const parsed = parseItemSpec({
      lengthCm: '100',
      widthCm: '50',
      heightCm: '80',
      weightKg: '42',
    });
    expect(parsed.weightKg).toBe(42);
    expect(parsed.lengthCm).toBe(100);
  });
});
