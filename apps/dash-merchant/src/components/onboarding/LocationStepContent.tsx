import { isLocationComplete, type LocationValue } from '@roam/location';
import PartnerLocationPicker from '../PartnerLocationPicker';
import { SignUpFormData } from '../../signup/types';
import { SectionCard, SectionHeader } from './OnboardingShell';

interface LocationStepContentProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
}

export default function LocationStepContent({ data, onChange }: LocationStepContentProps) {
  const locationValue: Partial<LocationValue> | null = data.location ?? {
    lat: undefined as unknown as number,
    lng: undefined as unknown as number,
    streetAddress: data.streetAddress,
    city: data.city,
    postalCode: data.postalCode,
    formattedAddress: data.addressSearch,
  };

  const handleLocationChange = (value: LocationValue) => {
    onChange({
      location: value,
      streetAddress: value.streetAddress,
      city: value.city,
      postalCode: value.postalCode,
      addressSearch: value.formattedAddress,
    });
  };

  const complete = isLocationComplete(data.location ?? locationValue);

  return (
    <SectionCard>
      <SectionHeader
        icon="map"
        title="Location & Delivery"
        subtitle="Where is your restaurant located?"
        centered
      />
      <PartnerLocationPicker
        value={data.location ?? locationValue}
        onChange={handleLocationChange}
        mapHeightClass="h-[280px]"
      />
      {!complete && (
        <p className="text-center text-body-sm text-on-surface-variant">
          Search for your address and confirm the pin on the map.
        </p>
      )}
    </SectionCard>
  );
}
