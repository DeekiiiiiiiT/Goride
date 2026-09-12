import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyFleetWalletSnapshot } from '../../types/fleetWallet';

const ROOT = resolve(__dirname, '../..');

describe('Fleet Balances UI contract', () => {
  it('exposes Wallet under Money nav (page id wallet)', () => {
    const nav = readFileSync(
      resolve(ROOT, 'components/layout/fleetNavModel.ts'),
      'utf8',
    );
    expect(nav).toMatch(/id: 'wallet'/);
    expect(nav).toMatch(/label: 'Wallet'/);
    // Third Money item after Earnings + Earnings Policy
    const moneyBlock = nav.slice(nav.indexOf('const moneyItems'), nav.indexOf('return {'));
    expect(moneyBlock.indexOf("'earnings'")).toBeLessThan(moneyBlock.indexOf("'wallet'"));
    expect(moneyBlock.indexOf("'earnings-policy'")).toBeLessThan(moneyBlock.indexOf("'wallet'"));
  });

  it('Wallet page shell + tabs exist', () => {
    expect(existsSync(resolve(ROOT, 'components/wallet/WalletPage.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'components/wallet/BalancesTab.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'components/wallet/PaymentMethodsTab.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'components/wallet/PayoutTab.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'types/fleetWallet.ts'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'types/orgBilling.ts'))).toBe(true);

    const page = readFileSync(resolve(ROOT, 'components/wallet/WalletPage.tsx'), 'utf8');
    expect(page).toMatch(/>\s*Wallet\s*</);
    expect(page).toMatch(/payment-methods/);
    expect(page).toMatch(/Payment methods/);
    expect(page).toMatch(/Payout/);
    expect(page).toMatch(/BalancesTab/);
    expect(page).toMatch(/PaymentMethodsTab/);
    expect(page).toMatch(/PayoutTab/);
  });

  it('Balances tab is read-only cards (no Log Cash / invent repay)', () => {
    const page = readFileSync(resolve(ROOT, 'components/wallet/BalancesTab.tsx'), 'utf8');
    expect(page).toMatch(/Cash in Hand/);
    expect(page).toMatch(/Debt/);
    expect(page).toMatch(/Balance/);
    expect(page).toMatch(/Roam Cash/);
    expect(page).toMatch(/Coming soon/);
    expect(page).toMatch(/Roam rider change debt/);
    expect(page).toMatch(/Expected/);
    expect(page).toMatch(/Received/);
    expect(page).toMatch(/onOpenDriver/);
    expect(page).toMatch(/Bank Deposits/);
    expect(page).not.toMatch(/Log Cash/);
    expect(page).not.toMatch(/Record Payout/);
    expect(page).toMatch(/onNavigate\('driver-settlements'\)/);
    expect(page).not.toMatch(/Related desks/);
  });

  it('Payment methods + Payout are save-only (no live charge/deposit)', () => {
    const pay = readFileSync(
      resolve(ROOT, 'components/wallet/PaymentMethodsTab.tsx'),
      'utf8',
    );
    const out = readFileSync(resolve(ROOT, 'components/wallet/PayoutTab.tsx'), 'utf8');
    expect(pay).toMatch(/WiPay/);
    expect(pay).toMatch(/Charging is not enabled yet/);
    expect(pay).not.toMatch(/Charge now/);
    expect(pay).not.toMatch(/Load Roam Cash/);
    expect(out).toMatch(/Deposits are not enabled yet/);
    expect(out).not.toMatch(/Deposit now/);
    // create payloads send last4 / accountNumber once — never a full PAN field name for cards
    expect(pay).toMatch(/last4/);
    expect(pay).not.toMatch(/cardNumber/);
    expect(pay).not.toMatch(/\bfullPan\b|\bpanToken\b/i);
  });

  it('org billing API never persists full card number fields', () => {
    const routes = readFileSync(
      resolve(ROOT, '../../../supabase/functions/_fleet-server/org_billing_routes.ts'),
      'utf8',
    );
    expect(routes).toMatch(/last4/);
    expect(routes).toMatch(/accountLast4/);
    expect(routes).toMatch(/do not persist full account number/i);
    expect(routes).not.toMatch(/fullPan|cardNumber\s*:/);
    // Reject accidental full PAN
    expect(routes).toMatch(/Do not enter a full card number/);
    // Create record stores last4 only
    expect(routes).toMatch(/accountLast4:\s*accountDigits\.slice\(-4\)/);
  });

  it('empty snapshot exposes bank outstanding fields', () => {
    const s = emptyFleetWalletSnapshot('2026-09-07', '2026-09-13');
    expect(s.roamCash.status).toBe('coming_soon');
    expect(s.balance).toMatchObject({
      amount: 0,
      expected: 0,
      bankReceived: 0,
      outstanding: 0,
    });
    expect(s.cashInHand.amount + s.debt.amount + s.balance.amount).toBe(0);
    expect(s).not.toHaveProperty('total');
    expect(s).not.toHaveProperty('totalWallet');
  });

  it('App deep-links Cash in Hand holders to driver Cash Wallet tab', () => {
    const app = readFileSync(resolve(ROOT, 'App.tsx'), 'utf8');
    expect(app).toMatch(/WalletPage/);
    expect(app).toMatch(/openDriverDetail\(id,\s*'wallet'\)/);
  });

  it('maps wallet page permission like Earnings', () => {
    const perms = readFileSync(
      resolve(ROOT, '../../../packages/auth-client/src/permissions.ts'),
      'utf8',
    );
    expect(perms).toMatch(/'wallet':\s*'nav\.tier_config'/);
  });
});
