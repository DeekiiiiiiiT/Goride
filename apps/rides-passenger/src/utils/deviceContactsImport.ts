import { isNativeCapacitorPlatform } from '@roam/types';
import { contactsBatchImport } from '@/services/contactsEdge';
import { buildGuestPhoneE164, digitsOnly } from '@/lib/guestRecipientBooking';
import { isContactPickerSupported, pickContactFromDevice } from '@/utils/contactPicker';

type DeviceContact = { name: string; phone: string };

async function pickMultipleFromDevice(): Promise<DeviceContact[]> {
  if (!isNativeCapacitorPlatform()) {
    const one = await pickContactFromDevice();
    return one ? [one] : [];
  }

  try {
    const { Contacts } = await import('@capacitor-community/contacts');
    const perm = await Contacts.requestPermissions();
    if (perm.contacts !== 'granted') {
      throw new Error('Contacts permission denied');
    }
    const result = await Contacts.getContacts({
      projection: { name: true, phones: true },
    });
    const out: DeviceContact[] = [];
    for (const c of result.contacts ?? []) {
      const name = c.name?.display ?? c.name?.given ?? '';
      const raw = c.phones?.[0]?.number ?? '';
      const digits = digitsOnly(raw);
      if (!name.trim() || digits.length < 10) continue;
      out.push({
        name: name.trim(),
        phone: buildGuestPhoneE164('+1', digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits),
      });
    }
    return out.slice(0, 50);
  } catch (e) {
    if (isContactPickerSupported()) {
      const one = await pickContactFromDevice();
      if (!one) return [];
      return [{
        name: one.name,
        phone: buildGuestPhoneE164('+1', digitsOnly(one.phone)),
      }];
    }
    throw e;
  }
}

export async function importDeviceContacts(): Promise<number> {
  const picked = await pickMultipleFromDevice();
  if (!picked.length) return 0;

  const res = await contactsBatchImport({
    contacts: picked.map((c) => ({
      display_name: c.name,
      phone_e164: c.phone.startsWith('+') ? c.phone : buildGuestPhoneE164('+1', c.phone),
      source: 'device_import' as const,
    })),
  });
  return res.imported;
}
