import { describe, expect, it } from 'vitest';
import { createAmberAdapterStub, resolveFleetCheckoutProvider } from './index';

describe('payment-gateways', () => {
  it('defaults to wipay', () => {
    expect(resolveFleetCheckoutProvider()).toBe('wipay');
  });

  it('amber stub returns not enabled', async () => {
    const adapter = createAmberAdapterStub();
    const result = await adapter.createCheckoutIntent({
      amountJmd: 1000,
      reference: 'test',
      customerEmail: 'a@b.com',
      returnUrl: 'https://example.com/return',
      callbackUrl: 'https://example.com/callback',
    });
    expect(result.error).toContain('not enabled');
  });
});
