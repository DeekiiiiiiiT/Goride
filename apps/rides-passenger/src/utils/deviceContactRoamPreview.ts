import { lookupPassengerByPhone } from '@/services/contactsEdge';
import { formatRoamTagDisplay } from '@/services/roamTagEdge';
import { splitRoamDisplayName } from '@/lib/roamContactName';
import type { DeviceContactOption } from '@/utils/deviceContactsImport';

export type DeviceContactRoamPreview = {
  device: DeviceContactOption;
  found: boolean;
  firstName: string;
  tagLabel: string | null;
  avatarUrl: string | null;
};

export async function previewDeviceContactsOnRoam(
  selected: DeviceContactOption[],
): Promise<DeviceContactRoamPreview[]> {
  const results = await Promise.all(
    selected.map(async (device) => {
      try {
        const lookup = await lookupPassengerByPhone(device.phoneE164);
        if (!lookup.found || !lookup.profile) {
          return {
            device,
            found: false,
            firstName: '—',
            tagLabel: null,
            avatarUrl: null,
          } satisfies DeviceContactRoamPreview;
        }

        const { firstName } = splitRoamDisplayName(lookup.profile.display_name);
        const tagLabel = formatRoamTagDisplay(lookup.profile.custom_tag_name);

        return {
          device,
          found: true,
          firstName,
          tagLabel,
          avatarUrl: lookup.profile.avatar_url ?? null,
        } satisfies DeviceContactRoamPreview;
      } catch {
        return {
          device,
          found: false,
          firstName: '—',
          tagLabel: null,
          avatarUrl: null,
        } satisfies DeviceContactRoamPreview;
      }
    }),
  );

  return results;
}
