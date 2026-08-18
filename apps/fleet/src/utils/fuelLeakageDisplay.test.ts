import { describe, expect, it } from 'vitest';
import { getLeakageDisplay } from './fuelLeakageDisplay';

describe('getLeakageDisplay', () => {
  it('flags high leakage above $50', () => {
    const d = getLeakageDisplay(51);
    expect(d.kind).toBe('high');
    expect(d.label).toBe('High leakage');
  });

  it('flags minor leakage above spend epsilon', () => {
    expect(getLeakageDisplay(1).kind).toBe('minor');
    expect(getLeakageDisplay(1).label).toBe('Minor leakage');
  });

  it('flags savings when negative', () => {
    expect(getLeakageDisplay(-2).kind).toBe('savings');
    expect(getLeakageDisplay(-2).label).toBe('Savings');
  });

  it('treats near-zero as balanced', () => {
    expect(getLeakageDisplay(0).kind).toBe('balanced');
    expect(getLeakageDisplay(0.001).kind).toBe('balanced');
  });
});
