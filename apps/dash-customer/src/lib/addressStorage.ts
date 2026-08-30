import { allowMocks } from './mocksGate';
import {
  fetchCustomerProfile,
  isCustomerLoggedIn,
  patchCustomerProfile,
  type CustomerSavedAddressDto,
} from './customerApi';

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
  lat?: number;
  lng?: number;
};

const STORAGE_KEY = 'roam-dash-delivery-address';
const ADDRESSES_KEY = 'roam-dash-saved-addresses';

const DEMO_ADDRESSES: SavedAddress[] = [
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

function asSavedAddress(row: CustomerSavedAddressDto | SavedAddress): SavedAddress {
  return {
    id: row.id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    instructions: row.instructions,
    city: row.city,
    isDefault: row.isDefault,
    lat: row.lat,
    lng: row.lng,
  };
}

function readLocalAddresses(): SavedAddress[] | null {
  try {
    const raw = localStorage.getItem(ADDRESSES_KEY);
    if (raw) return JSON.parse(raw) as SavedAddress[];
  } catch {
    // fall through
  }
  return null;
}

function writeLocalAddresses(addresses: SavedAddress[]): void {
  try {
    localStorage.setItem(ADDRESSES_KEY, JSON.stringify(addresses));
    if (addresses.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    let defaultAddr = addresses.find((a) => a.isDefault);
    if (!defaultAddr) {
      defaultAddr = { ...addresses[0], isDefault: true };
      addresses[0] = defaultAddr;
      localStorage.setItem(ADDRESSES_KEY, JSON.stringify(addresses));
    }

    saveDeliveryAddress({
      label: defaultAddr.label,
      line1: defaultAddr.line1,
      line2: defaultAddr.line2,
      instructions: defaultAddr.instructions,
    });
  } catch {
    // ignore
  }
}

function finalizeAddressListAfterDelete(
  addresses: SavedAddress[],
  deletedId: string,
): SavedAddress[] {
  const next = addresses.filter((a) => a.id !== deletedId);
  if (next.length === 0) return next;

  const deletedWasDefault = addresses.find((a) => a.id === deletedId)?.isDefault;
  const hasDefault = next.some((a) => a.isDefault);
  if (deletedWasDefault || !hasDefault) {
    return next.map((a, index) => ({ ...a, isDefault: index === 0 }));
  }
  return next;
}

export function getSavedAddresses(): SavedAddress[] {
  const local = readLocalAddresses();
  if (local) return local;
  return allowMocks() ? DEMO_ADDRESSES : [];
}

export function saveSavedAddresses(addresses: SavedAddress[]): void {
  writeLocalAddresses(addresses);
  void syncAddressesToBackend(addresses);
}

async function syncAddressesToBackend(addresses: SavedAddress[]): Promise<void> {
  if (!(await isCustomerLoggedIn())) return;
  try {
    await patchCustomerProfile({ savedAddresses: addresses });
  } catch {
    // Local cache remains; next sync can retry
  }
}

/** Load saved_addresses from delivery.customers when logged in. */
export async function syncAddressesFromBackend(): Promise<SavedAddress[]> {
  if (!(await isCustomerLoggedIn())) return getSavedAddresses();
  try {
    const profile = await fetchCustomerProfile();
    if (!profile) return getSavedAddresses();
    const remote = (profile.savedAddresses ?? []).map(asSavedAddress);
    writeLocalAddresses(remote);
    return remote;
  } catch {
    return getSavedAddresses();
  }
}

export function getSavedAddressById(id: string): SavedAddress | undefined {
  return getSavedAddresses().find((a) => a.id === id);
}

export function upsertSavedAddress(address: SavedAddress): void {
  const addresses = getSavedAddresses();
  const index = addresses.findIndex((a) => a.id === address.id);
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

/** Async upsert that awaits backend sync (for UI save buttons). */
export async function upsertSavedAddressAsync(address: SavedAddress): Promise<void> {
  const addresses = getSavedAddresses();
  const index = addresses.findIndex((a) => a.id === address.id);
  const next = [...addresses];
  if (index >= 0) next[index] = address;
  else next.push(address);
  if (address.isDefault) {
    for (const a of next) {
      if (a.id !== address.id) a.isDefault = false;
    }
  }
  writeLocalAddresses(next);
  if (await isCustomerLoggedIn()) {
    await patchCustomerProfile({ savedAddresses: next });
  }
}

export function deleteSavedAddress(id: string): void {
  const next = finalizeAddressListAfterDelete(getSavedAddresses(), id);
  writeLocalAddresses(next);
  void syncAddressesToBackend(next);
}

export async function deleteSavedAddressAsync(id: string): Promise<void> {
  const next = finalizeAddressListAfterDelete(getSavedAddresses(), id);
  writeLocalAddresses(next);
  if (await isCustomerLoggedIn()) {
    await patchCustomerProfile({ savedAddresses: next });
  }
}

/** Default delivery address for cart/checkout — prefer full saved pin (includes lat/lng). */
export function getSavedAddress(): SavedAddress | null {
  try {
    const defaultSaved = getSavedAddresses().find((a) => a.isDefault) ?? getSavedAddresses()[0];
    if (defaultSaved) return defaultSaved;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const legacy = JSON.parse(raw) as DeliveryAddress;
      return {
        id: 'legacy-delivery',
        label: legacy.label,
        line1: legacy.line1,
        line2: legacy.line2,
        instructions: legacy.instructions,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function selectSavedAddress(address: SavedAddress): Promise<void> {
  await upsertSavedAddressAsync({ ...address, isDefault: true });
}

export function saveDeliveryAddress(address: DeliveryAddress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(address));
  } catch {
    // ignore
  }
}

/** Persist onboarding delivery address into saved_addresses (local + backend). */
export async function persistOnboardingAddress(
  details: DeliveryAddress & { city?: string; lat?: number; lng?: number },
): Promise<void> {
  saveDeliveryAddress(details);
  const existing = getSavedAddresses();
  const address: SavedAddress = {
    id: existing.find((a) => a.isDefault)?.id ?? `addr-${Date.now()}`,
    label: details.label,
    line1: details.line1,
    line2: details.line2,
    instructions: details.instructions,
    city: details.city ?? 'Kingston, Jamaica',
    lat: details.lat,
    lng: details.lng,
    isDefault: true,
  };
  await upsertSavedAddressAsync(address);
}

export function hasDeliveryAddress(): boolean {
  return getSavedAddress() !== null || getSavedAddresses().length > 0;
}

/** Lat/lng for checkout — prefer the default saved pin, never 0,0. */
export function getCheckoutLocation(): { lat?: number; lng?: number } {
  const saved = getSavedAddresses().find((a) => a.isDefault) ?? getSavedAddresses()[0];
  const lat = Number(saved?.lat);
  const lng = Number(saved?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  if (lat === 0 && lng === 0) return {};
  return { lat, lng };
}
