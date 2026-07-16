/**
 * Shared InDrive wallet top-up payload for Overview + Fleet InDrive Wallet Center.
 */
import {
  INDRIVE_WALLET_LOAD_CATEGORY,
  INDRIVE_WALLET_LOAD_TRANSACTION_TYPE,
  INDRIVE_WALLET_PLATFORM,
} from '../constants/indriveWallet';
import type { FinancialTransaction, IndriveWalletLoadTransactionInput } from '../types/data';

export type IndriveWalletLoadBuildInput = {
  driverId: string;
  /** Must be > 0. */
  amount: number;
  /** yyyy-MM-dd */
  date: string;
  description?: string;
  id?: string;
};

/** Build the saveTransaction payload for a fleet InDrive wallet credit. */
export function buildIndriveWalletLoadTransaction(
  input: IndriveWalletLoadBuildInput,
): Partial<FinancialTransaction> & IndriveWalletLoadTransactionInput & { platform: string } {
  const desc = (input.description || '').trim();
  return {
    id: input.id || crypto.randomUUID(),
    driverId: input.driverId,
    date: input.date,
    amount: input.amount,
    category: INDRIVE_WALLET_LOAD_CATEGORY,
    platform: INDRIVE_WALLET_PLATFORM,
    type: INDRIVE_WALLET_LOAD_TRANSACTION_TYPE,
    description: desc || 'Fleet load — InDrive digital wallet',
    paymentMethod: 'Digital Wallet',
    status: 'Completed',
    isReconciled: true,
  };
}
