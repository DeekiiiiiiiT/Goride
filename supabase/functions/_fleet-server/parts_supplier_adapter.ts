/** Supplier price/stock plug-in. Live vendors stay off until one is confirmed. */

export type SupplierPriceHit = {
  supplierKey: string;
  partNumber: string;
  unitPrice: number | null;
  currency: string | null;
  stockQty: number | null;
  observedAt: string;
};

export interface PartsSupplierAdapter {
  readonly id: string;
  searchByPartNumber(partNumber: string): Promise<SupplierPriceHit | null>;
  getPriceAndStock(partNumber: string): Promise<SupplierPriceHit | null>;
}

export class CacheOnlySupplierAdapter implements PartsSupplierAdapter {
  readonly id = "cache";
  constructor(private readonly lookup: (partNumber: string) => Promise<SupplierPriceHit | null>) {}
  searchByPartNumber(partNumber: string): Promise<SupplierPriceHit | null> {
    return this.lookup(partNumber);
  }
  getPriceAndStock(partNumber: string): Promise<SupplierPriceHit | null> {
    return this.searchByPartNumber(partNumber);
  }
}
