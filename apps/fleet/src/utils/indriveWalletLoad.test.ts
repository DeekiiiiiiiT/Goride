import { describe, expect, it } from 'vitest';
import { buildIndriveWalletLoadTransaction } from './indriveWalletLoad';
import {
  INDRIVE_WALLET_LOAD_CATEGORY,
  INDRIVE_WALLET_LOAD_TRANSACTION_TYPE,
  INDRIVE_WALLET_PLATFORM,
} from '../constants/indriveWallet';

describe('buildIndriveWalletLoadTransaction', () => {
  it('builds a positive Adjustment credit for InDrive wallet', () => {
    const tx = buildIndriveWalletLoadTransaction({
      driverId: 'drv-1',
      amount: 1500,
      date: '2026-07-12',
      description: 'batch A',
      id: 'fixed-id',
    });
    expect(tx).toMatchObject({
      id: 'fixed-id',
      driverId: 'drv-1',
      amount: 1500,
      date: '2026-07-12',
      category: INDRIVE_WALLET_LOAD_CATEGORY,
      platform: INDRIVE_WALLET_PLATFORM,
      type: INDRIVE_WALLET_LOAD_TRANSACTION_TYPE,
      description: 'batch A',
      paymentMethod: 'Digital Wallet',
      status: 'Completed',
      isReconciled: true,
    });
  });

  it('defaults description when note empty', () => {
    const tx = buildIndriveWalletLoadTransaction({
      driverId: 'drv-1',
      amount: 100,
      date: '2026-07-12',
    });
    expect(tx.description).toBe('Fleet load — InDrive digital wallet');
  });
});
