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

export async function pickContactFromDevice(): Promise<{ name: string; phone: string } | null> {
  const contactsApi = (navigator as ContactPickerNavigator).contacts;
  if (!contactsApi?.select) return null;

  const results = await contactsApi.select(['name', 'tel'], { multiple: false });
  const contact = results[0];
  if (!contact) return null;

  const name = parseContactName(contact);
  const phone = parseContactPhone(contact);
  if (!name && !phone) return null;

  return { name, phone };
}
