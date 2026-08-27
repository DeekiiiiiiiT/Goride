import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isResumePaymentEligible, resumeOrderPayment } from './resumePayment';

describe('isResumePaymentEligible', () => {
  it('allows wipay when unpaid', () => {
    expect(isResumePaymentEligible('pending', 'wipay')).toBe(true);
    expect(isResumePaymentEligible('requires_payment', 'wipay')).toBe(true);
  });

  it('rejects paid, paypal, or unsupported rails', () => {
    expect(isResumePaymentEligible('paid', 'wipay')).toBe(false);
    expect(isResumePaymentEligible('pending', 'paypal')).toBe(false);
    expect(isResumePaymentEligible('pending', 'cash')).toBe(false);
    expect(isResumePaymentEligible(undefined, 'wipay')).toBe(false);
  });
});

describe('resumeOrderPayment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts intent payload and redirects on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ paymentRedirectUrl: 'https://jm.wipayfinancial.com/pay/abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { origin: 'https://roamrush.app', href: '' } });

    await resumeOrderPayment('order-1', 'wipay', 'token-abc');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      orderId: 'order-1',
      provider: 'wipay',
      returnOrigin: 'https://roamrush.app',
    });
    expect(window.location.href).toBe('https://jm.wipayfinancial.com/pay/abc');
  });

  it('rejects non-wipay providers', async () => {
    await expect(resumeOrderPayment('order-1', 'paypal', 'token')).rejects.toThrow(
      'Unsupported payment provider',
    );
  });

  it('throws server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Payment already completed' }),
    }));
    vi.stubGlobal('window', { location: { origin: 'https://roamrush.app', href: '' } });

    await expect(resumeOrderPayment('order-1', 'wipay', 'token')).rejects.toThrow(
      'Payment already completed',
    );
  });
});
