export type AddressLabel = 'home' | 'work' | 'other';

export type DeliveryAddress = {
  line1: string;
  line2?: string;
  instructions?: string;
  label: AddressLabel;
};

export type SavedAddress = DeliveryAddress & {
  id: string;
  city?: string;
  isDefault?: boolean;
};

const STORAGE_KEY = 'roam-dash-delivery-address';
const ADDRESSES_KEY = 'roam-dash-saved-addresses';

const DEFAULT_ADDRESSES: SavedAddress[] = [
  {
    id: 'home-1',
    label: 'home',
    line1: '45 Constant Spring Rd, Apt 12B',
    city: 'Kingston, Jamaica',
    isDefault: true,
  },
  {
    id: 'work-1',
    label: 'work',
    line1: '123 Business Park, Suite 4',
    city: 'Kingston, Jamaica',
  },
];

export function getSavedAddresses(): SavedAddress[] {
  try {
    const raw = localStorage.getItem(ADDRESSES_KEY);
    if (raw) return JSON.parse(raw) as SavedAddress[];
  } catch {
    // fall through
  }
  return DEFAULT_ADDRESSES;
}

export function saveSavedAddresses(addresses: SavedAddress[]): void {
  try {
    localStorage.setItem(ADDRESSES_KEY, JSON.stringify(addresses));
    const defaultAddr = addresses.find(a => a.isDefault) ?? addresses[0];
    if (defaultAddr) {
      saveDeliveryAddress({
        label: defaultAddr.label,
        line1: defaultAddr.line1,
        line2: defaultAddr.line2,
        instructions: defaultAddr.instructions,
      });
    }
  } catch {
    // ignore
  }
}

export function getSavedAddressById(id: string): SavedAddress | undefined {
  return getSavedAddresses().find(a => a.id === id);
}

export function upsertSavedAddress(address: SavedAddress): void {
  const addresses = getSavedAddresses();
  const index = addresses.findIndex(a => a.id === address.id);
  const next = [...addresses];
  if (index >= 0) next[index] = address;
  else next.push(address);
  if (address.isDefault) {
    for (const a of next) {
      if (a.id !== address.id) a.isDefault = false;
    }
  }
  saveSavedAddresses(next);
}

export function deleteSavedAddress(id: string): void {
  saveSavedAddresses(getSavedAddresses().filter(a => a.id !== id));
}

export function getSavedAddress(): DeliveryAddress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DeliveryAddress;

    const defaultSaved = getSavedAddresses().find(a => a.isDefault) ?? getSavedAddresses()[0];
    if (defaultSaved) {
      return {
        label: defaultSaved.label,
        line1: defaultSaved.line1,
        line2: defaultSaved.line2,
        instructions: defaultSaved.instructions,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDeliveryAddress(address: DeliveryAddress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(address));
  } catch {
    // ignore
  }
}

export function hasDeliveryAddress(): boolean {
  return getSavedAddress() !== null || getSavedAddresses().length > 0;
}
