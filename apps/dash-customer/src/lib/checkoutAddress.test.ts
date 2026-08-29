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
    expect(totals.smallOrderFee).toBe(0);
    expect(totals.total).toBeGreaterThan(1000);
  });

  it('keeps delivery fee at zero when merchant fee is zero', () => {
    const totals = calculateOrderTotals(500, null, 0, 0, 0.05);
    expect(totals.deliveryFee).toBe(0);
  });

  it('matches server Island Grill smoke totals at 15% platform fee', () => {
    const totals = calculateOrderTotals(1200, null, 100, 150, 0.15);
    expect(totals.serviceFee).toBe(180);
    expect(totals.tax).toBe(198);
    expect(totals.total).toBe(1828);
  });

  it('uses v2 server totals verbatim when customer total is provided', () => {
    const totals = calculateOrderTotals(800, null, 0, 999, 0.05, undefined, {
      v2Quote: {
        pricingModel: 'v2',
        platformFeeRate: 0,
        deliveryFee: 200,
        serviceFee: 40,
        tax: 132,
        taxRatePercent: 16.5,
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
