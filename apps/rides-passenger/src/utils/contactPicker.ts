import { digitsOnly, formatGuestPhoneDisplay } from '@/lib/guestRecipientBooking';

type ContactPickerContact = {
  name?: string[];
  tel?: string[];
};

type ContactPickerNavigator = Navigator & {
  contacts?: {
    select: (
      properties: ('name' | 'tel' | 'email')[],
      options?: { multiple?: boolean },
    ) => Promise<ContactPickerContact[]>;
  };
};

function parseContactName(contact: ContactPickerContact): string {
  const raw = contact.name?.[0]?.trim();
  return raw ?? '';
}

function parseContactPhone(contact: ContactPickerContact): string {
  const raw = contact.tel?.[0]?.trim();
  if (!raw) return '';
  const digits = digitsOnly(raw);
  if (digits.length === 11 && digits.startsWith('1')) {
    return formatGuestPhoneDisplay(digits.slice(1));
  }
  return formatGuestPhoneDisplay(digits);
}

export function isContactPickerSupported(): boolean {
  return typeof (navigator as ContactPickerNavigator).contacts?.select === 'function';
}

export async function pickContactsFromDevice(): Promise<{ name: string; phone: string }[]> {
  const contactsApi = (navigator as ContactPickerNavigator).contacts;
  if (!contactsApi?.select) return [];

  try {
    const results = await contactsApi.select(['name', 'tel'], { multiple: true });
    const out: { name: string; phone: string }[] = [];
    for (const contact of results) {
      const name = parseContactName(contact);
      const phone = parseContactPhone(contact);
      if (!name && !phone) continue;
      out.push({ name, phone });
    }
    return out;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    if (/contact selector|not allowed|security/i.test(raw)) {
      throw new Error('Contact picker is not available here. Use Add contact or try the Roam Android app.');
    }
    throw e instanceof Error ? e : new Error('Could not pick a contact');
  }
}

/** @deprecated Prefer pickContactsFromDevice */
export async function pickContactFromDevice(): Promise<{ name: string; phone: string } | null> {
  const results = await pickContactsFromDevice();
  return results[0] ?? null;
}
