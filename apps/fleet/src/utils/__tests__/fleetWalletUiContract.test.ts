import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyFleetWalletSnapshot } from '../../types/fleetWallet';

const ROOT = resolve(__dirname, '../..');

describe('Fleet Wallet UI contract', () => {
  it('exposes Wallet under Money nav', () => {
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

  it('Wallet page + types exist', () => {
    expect(existsSync(resolve(ROOT, 'components/wallet/WalletPage.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'types/fleetWallet.ts'))).toBe(true);
  });

  it('Wallet page is read-only cards (no Log Cash / invent repay)', () => {
    const page = readFileSync(resolve(ROOT, 'components/wallet/WalletPage.tsx'), 'utf8');
    expect(page).toMatch(/Cash in Hand/);
    expect(page).toMatch(/Debt/);
    expect(page).toMatch(/Balance/);
    expect(page).toMatch(/Roam Cash/);
    expect(page).toMatch(/Coming soon/);
    expect(page).toMatch(/Roam rider change debt/);
    expect(page).toMatch(/Cash drivers are holding/);
    expect(page).not.toMatch(/Log Cash/);
    expect(page).not.toMatch(/Record Payout/);
    // CTAs navigate only
    expect(page).toMatch(/onNavigate\('driver-settlements'\)/);
    expect(page).toMatch(/onNavigate\('fleet-financials'\)/);
  });

  it('empty snapshot never invents a combined total wallet', () => {
    const s = emptyFleetWalletSnapshot('2026-09-07', '2026-09-13');
    expect(s.roamCash.status).toBe('coming_soon');
    expect(s.cashInHand.amount + s.debt.amount + s.balance.amount).toBe(0);
    // Four separate fields — no `total` key
    expect(s).not.toHaveProperty('total');
    expect(s).not.toHaveProperty('totalWallet');
  });

  it('maps wallet page permission like Earnings', () => {
    const perms = readFileSync(
      resolve(ROOT, '../../../packages/auth-client/src/permissions.ts'),
      'utf8',
    );
    expect(perms).toMatch(/'wallet':\s*'nav\.tier_config'/);
  });
});
