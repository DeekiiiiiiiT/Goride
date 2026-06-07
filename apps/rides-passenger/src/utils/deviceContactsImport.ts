import type { ContactPayload } from '@capacitor-community/contacts';
import { Capacitor } from '@capacitor/core';
import { isNativeCapacitorPlatform } from '@roam/types';
import type { BatchImportContactsResponse } from '@roam/types/riderContacts';
import { contactsBatchImport } from '@/services/contactsEdge';
import { buildGuestPhoneE164, digitsOnly } from '@/lib/guestRecipientBooking';
import { withTimeout } from '@/lib/withTimeout';
import { isContactPickerSupported, pickContactsFromDevice } from '@/utils/contactPicker';

export type DeviceContactOption = {
  deviceId: string;
  name: string;
  phoneE164: string;
  phoneLabel: string;
};

function isNativeApp(): boolean {
  return Capacitor.isNativePlatform() || isNativeCapacitorPlatform();
}

/** Parse a device phone string into E.164 (Jamaica +1 default). */
export function parseDevicePhoneE164(raw: string): string | null {
  const digits = digitsOnly(raw);
  if (digits.length >= 11 && digits.startsWith('1')) {
    return buildGuestPhoneE164('+1', digits.slice(1, 11));
  }
  if (digits.length >= 10) {
    return buildGuestPhoneE164('+1', digits.slice(-10));
  }
  if (digits.length >= 7) {
    return buildGuestPhoneE164('+1', `876${digits.slice(-7)}`);
  }
  return null;
}

function contactToOption(contact: ContactPayload, index: number): DeviceContactOption | null {
  const name = (contact.name?.display ?? contact.name?.given ?? '').trim();
  if (!name) return null;

  let phoneE164: string | null = null;
  let phoneLabel = '';
  for (const p of contact.phones ?? []) {
    const raw = p.number?.trim() ?? '';
    if (!raw) continue;
    const parsed = parseDevicePhoneE164(raw);
    if (parsed) {
      phoneE164 = parsed;
      phoneLabel = raw;
      break;
    }
  }
  if (!phoneE164) return null;

  const deviceId =
    contact.contactId?.trim() ||
    `device-${index}-${phoneE164}`;

  return {
    deviceId,
    name,
    phoneE164,
    phoneLabel,
  };
}

async function ensureContactsPermission(): Promise<void> {
  const { Contacts } = await import('@capacitor-community/contacts');
  const perm = await Contacts.requestPermissions();
  if (perm.contacts !== 'granted' && perm.contacts !== 'limited') {
    throw new Error('Contacts permission is required. Allow access in Settings, then try again.');
  }
}

/** Load device address book entries for in-app selection (native only). */
export async function loadDeviceContactOptions(): Promise<DeviceContactOption[]> {
  if (!isNativeApp()) {
    throw new Error('Use the contact picker in your browser, or open the Roam Android app.');
  }

  await ensureContactsPermission();
  const { Contacts } = await import('@capacitor-community/contacts');

  const result = await withTimeout(
    Contacts.getContacts({ projection: { name: true, phones: true } }),
    30_000,
    'Loading contacts timed out — try again.',
  );

  const seen = new Set<string>();
  const options: DeviceContactOption[] = [];

  for (const [index, c] of (result.contacts ?? []).entries()) {
    const option = contactToOption(c, index);
    if (!option) continue;
    const key = `${option.name}|${option.phoneE164}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }

  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

/** Web Contact Picker API — user selects in the browser UI. */
export async function pickDeviceContactsFromBrowser(): Promise<DeviceContactOption[]> {
  const picked = await pickContactsFromDevice();
  return picked
    .map((c, i) => {
      const phoneE164 = parseDevicePhoneE164(c.phone);
      if (!phoneE164 || !c.name.trim()) return null;
      return {
        deviceId: `web-${i}-${c.name}`,
        name: c.name.trim(),
        phoneE164,
        phoneLabel: c.phone,
      };
    })
    .filter((c): c is DeviceContactOption => c !== null);
}

export async function importDeviceContactSelection(
  selected: DeviceContactOption[],
): Promise<BatchImportContactsResponse & { failed: number; updated: number; error?: string }> {
  if (!selected.length) {
    return { imported: 0, updated: 0, skipped: 0, failed: 0, contacts: [] };
  }

  const res = await contactsBatchImport({
    contacts: selected.map((c) => ({
      display_name: c.name,
      phone_e164: c.phoneE164,
      source: 'device_import' as const,
    })),
  });
  return {
    imported: res.imported,
    updated: res.updated ?? 0,
    skipped: res.skipped ?? 0,
    failed: res.failed ?? 0,
    error: res.error,
    contacts: res.contacts ?? [],
  };
}

export function canUseInAppDeviceContactPicker(): boolean {
  return isNativeApp();
}

export function canUseBrowserContactPicker(): boolean {
  return !isNativeApp() && isContactPickerSupported();
}
