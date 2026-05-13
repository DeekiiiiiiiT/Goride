export interface MerchantStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

export async function getMerchantStats(): Promise<MerchantStats> {
  return {
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  };
}
