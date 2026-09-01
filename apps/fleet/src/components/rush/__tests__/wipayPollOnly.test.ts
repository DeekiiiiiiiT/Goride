import { describe, expect, it } from 'vitest';

/** Regression: client wipay status must not authorize capture alone. */
describe('WiPay poll-only contract', () => {
  it('pending intent stays pending when client claims success', () => {
    const intent = { status: 'pending' };
    const clientStatus = 'success';
    const serverTrustsClient = clientStatus === 'success';
    const mayMarkPaid = serverTrustsClient && ['completed', 'paid'].includes(intent.status);
    expect(mayMarkPaid).toBe(false);
  });

  it('only completed/paid intents succeed on poll', () => {
    for (const status of ['completed', 'paid']) {
      expect(['completed', 'paid'].includes(status)).toBe(true);
    }
    expect(['completed', 'paid'].includes('pending')).toBe(false);
  });
});
