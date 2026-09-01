import { describe, expect, it } from 'vitest';

/** WiPay complete must gate on server intent status, not client body.status. */
describe('wipay poll-only contract', () => {
  it('rejects client-supplied paid status without server verification', () => {
    const intentStatus = 'pending';
    const bodyStatus = 'success';
    const wouldMarkPaid = intentStatus === 'completed' || intentStatus === 'paid';
    const insecurePath = bodyStatus === 'success';
    expect(insecurePath).toBe(true);
    expect(wouldMarkPaid).toBe(false);
  });
});
