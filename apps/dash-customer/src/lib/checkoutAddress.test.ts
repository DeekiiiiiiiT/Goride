import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { calculateOrderTotals, parseDeliveryFeeLabel } from './orderPricing';

describe('parseDeliveryFeeLabel', () => {
  it('parses J$ amounts', () => {
    expect(parseDeliveryFeeLabel('J$150 delivery fee')).toBe(150);
    expect(parseDeliveryFeeLabel('J$1,200 delivery fee')).toBe(1200);
  });

  it('treats free delivery as zero', () => {
    expect(parseDeliveryFeeLabel('Free delivery')).toBe(0);
  });
});

describe('calculateOrderTotals', () => {
  it('uses the provided merchant delivery fee (not a hardcoded constant)', () => {
    const totals = calculateOrderTotals(1000, null, 50, 175, 0.05);
    expect(totals.deliveryFee).toBe(175);
    expect(totals.tip).toBe(50);
    expect(totals.serviceFee).toBe(50);
    expect(totals.total).toBeGreaterThan(1000);
  });

  it('keeps delivery fee at zero when merchant fee is zero', () => {
    const totals = calculateOrderTotals(500, null, 0, 0, 0.05);
    expect(totals.deliveryFee).toBe(0);
  });
});

describe('resolveCheckoutAddress', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('./mocksGate');
  });

  it('returns null address when no saved address and mocks disallowed', async () => {
    vi.doMock('./mocksGate', () => ({ allowMocks: () => false }));
    const { resolveCheckoutAddress } = await import('./checkoutAddress');
    const result = resolveCheckoutAddress(null);
    expect(result.address).toBeNull();
    expect(result.hasRealAddress).toBe(false);
  });

  it('formats a real saved address', async () => {
    vi.doMock('./mocksGate', () => ({ allowMocks: () => false }));
    const { resolveCheckoutAddress } = await import('./checkoutAddress');
    const result = resolveCheckoutAddress({
      line1: '12 Hope Rd',
      line2: 'Kingston 6',
      instructions: 'Ring bell',
    });
    expect(result.address).toBe('12 Hope Rd, Kingston 6');
    expect(result.instructions).toBe('Ring bell');
    expect(result.hasRealAddress).toBe(true);
  });

  it('allows demo address only when mocks are allowed', async () => {
    vi.doMock('./mocksGate', () => ({ allowMocks: () => true }));
    const { resolveCheckoutAddress } = await import('./checkoutAddress');
    const result = resolveCheckoutAddress(null);
    expect(result.address).toContain('Constant Spring');
    expect(result.hasRealAddress).toBe(false);
  });
});
