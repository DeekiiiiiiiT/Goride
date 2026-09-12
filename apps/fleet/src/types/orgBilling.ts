/** Org billing — Payment methods + Payout accounts (Balances desk). */

export type OrgPaymentMethod = {
  id: string;
  organizationId: string;
  provider: 'wipay';
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  nickname?: string | null;
  isDefault: boolean;
  vaultStatus: 'manual_pending' | 'vaulted';
  wipayToken?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type OrgPayoutAccount = {
  id: string;
  organizationId: string;
  bankName: string;
  accountHolderName: string;
  accountType: 'checking' | 'savings';
  accountLast4: string;
  currency: string;
  isDefault: boolean;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};
