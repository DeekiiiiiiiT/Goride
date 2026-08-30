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
  it('uses v2 server totals verbatim', () => {
    const totals = calculateOrderTotals(800, null, 0, 999, undefined, undefined, {
      v2Quote: {
        deliveryFee: 200,
        serviceFee: 40,
        tax: 132,
        taxRatePercent: 15,
        orderTotal: 1172,
        processingFee: 35,
        smallOrderFee: 400,
        total: 1607,
      },
    });
    expect(totals.deliveryFee).toBe(200);
    expect(totals.serviceFee).toBe(40);
    expect(totals.tax).toBe(132);
    expect(totals.processingFee).toBe(35);
    expect(totals.smallOrderFee).toBe(400);
    expect(totals.total).toBe(1607);
  });

  it('throws without a pricing quote', () => {
    expect(() => calculateOrderTotals(1000, null, 50)).toThrow(/pricing quote/);
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

describe('buildDeliveryInstructions', () => {
  it('sends leave-at-door notes as-is', async () => {
    vi.doMock('./mocksGate', () => ({ allowMocks: () => false }));
    const { buildDeliveryInstructions } = await import('./checkoutAddress');
    expect(buildDeliveryInstructions('door', 'Gate code 12')).toBe('Gate code 12');
    expect(buildDeliveryInstructions('door', '  ')).toBe('Leave at door');
  });

  it('keeps handoff plus extra notes for hand-it-to-me', async () => {
    vi.doMock('./mocksGate', () => ({ allowMocks: () => false }));
    const { buildDeliveryInstructions } = await import('./checkoutAddress');
    expect(buildDeliveryInstructions('hand', '')).toBe('Hand it to me');
    expect(buildDeliveryInstructions('hand', 'Call on arrival')).toBe('Hand it to me. Call on arrival');
  });
});
