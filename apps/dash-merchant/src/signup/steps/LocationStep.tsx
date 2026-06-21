import { isLocationComplete, type LocationValue } from '@roam/location';
import PartnerLocationPicker from '../../components/PartnerLocationPicker';
import { SignUpFormData } from '../types';
import { MaterialIcon } from '../components/MaterialIcon';
import StickyBottomButton from '../components/StickyBottomButton';

interface LocationStepProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  onBack: () => void;
  onContinue: () => void;
}

export default function LocationStep({ data, onChange, onBack, onContinue }: LocationStepProps) {
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

  const canContinue = isLocationComplete(data.location ?? locationValue);

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-on-background">
      <header className="sticky top-0 z-50 flex h-16 w-full items-center bg-background/80 px-margin-mobile backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-start text-on-surface transition-colors duration-150 hover:text-primary active:scale-95"
        >
          <MaterialIcon name="arrow_back" size={24} />
        </button>
        <div className="flex-1" />
        <div className="flex gap-1 text-label-sm text-on-surface-variant">
          <span>Step 2</span>
          <span className="text-outline-variant">/</span>
          <span>6</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col px-margin-mobile pb-[100px] pt-inset-sm md:px-margin-tablet md:pb-inset-xl">
        <h1 className="mb-inset-lg text-headline-lg-mobile font-bold text-primary md:text-headline-lg">
          Restaurant location
        </h1>

        <PartnerLocationPicker
          value={data.location ?? locationValue}
          onChange={handleLocationChange}
        />
      </main>

      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-outline-variant bg-surface px-margin-mobile py-4 pb-[max(16px,env(safe-area-inset-bottom))] md:static md:mx-auto md:mb-inset-xl md:max-w-[600px] md:border-none md:bg-transparent md:p-0 md:px-margin-tablet">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-label-md font-semibold text-on-primary shadow-sm transition-all duration-200 hover:bg-primary-fixed hover:text-on-primary-fixed hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Confirm Location
        </button>
      </div>
    </div>
  );
}
