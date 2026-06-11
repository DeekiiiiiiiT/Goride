import type { PickupLocationRiderSource } from '@roam/types/pickupLocationRequest';
import type { RiderContactRow } from '@roam/types/riderContacts';
import type { RoamPassengerTagBookingLookupDto } from '@roam/types/roamPassengerTag';
import type { DeviceContactOption } from '@/utils/deviceContactsImport';
import { buildGuestPhoneE164 } from '@/lib/guestRecipientBooking';

export type RiderPickupTarget = {
  name: string;
  phone_e164: string;
  user_id?: string | null;
  source: PickupLocationRiderSource;
  contact_id?: string | null;
};

export function riderPickupTargetFromTag(tag: RoamPassengerTagBookingLookupDto): RiderPickupTarget | null {
  if (!tag.phone_e164) return null;
  return {
    name: tag.display_name?.trim() || tag.custom_tag_name,
    phone_e164: tag.phone_e164,
    user_id: tag.user_id,
    source: 'roam_tag',
  };
}

export function riderPickupTargetFromContact(contact: RiderContactRow): RiderPickupTarget {
  return {
    name: contact.display_name,
    phone_e164: contact.phone_e164,
    user_id: contact.linked_user_id ?? null,
    source: 'roam_contact',
    contact_id: contact.id,
  };
}

export function riderPickupTargetFromDevice(contact: DeviceContactOption): RiderPickupTarget {
  return {
    name: contact.name,
    phone_e164: contact.phoneE164,
    source: 'phone_contact',
  };
}

export function riderPickupTargetFromManual(name: string, localDigits: string): RiderPickupTarget | null {
  const digits = localDigits.replace(/\D/g, '');
  if (!name.trim() || digits.length < 10) return null;
  return {
    name: name.trim(),
    phone_e164: buildGuestPhoneE164('+1', digits.slice(-10)),
    source: 'phone_contact',
  };
}
