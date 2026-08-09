export const LAST_DOMESTIC_BOOK_KEY = 'freight-last-domestic-book';
export const LAST_FULFILLMENT_ASSIGN_KEY = 'freight-last-fulfillment-assign';
export const LAST_DISPATCH_ASSIGN_KEY = 'freight-last-dispatch-assign';

export type DomesticBookDefaults = {
  originLabel?: string;
  destinationLabel?: string;
  mode?: 'own' | '3pl' | 'mixed';
  clientId?: string;
  carrierId?: string;
  rateCardId?: string;
  suiteId?: string;
};

export type AssignDefaults = {
  assigneeType?: string;
  clientFleetAssetId?: string;
  thirdPartyCarrierId?: string;
};

export function readLastJob<T extends object>(key: string): Partial<T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

export function writeLastJob(key: string, value: object): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}
