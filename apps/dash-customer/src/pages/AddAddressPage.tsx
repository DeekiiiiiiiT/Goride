import { FormEvent, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { ADD_ADDRESS_MAP } from '@/lib/accountContent';
import {
  getSavedAddressById,
  upsertSavedAddress,
  type AddressLabel,
  type SavedAddress,
} from '@/lib/addressStorage';
import { checkDeliveryZone } from '@/lib/deliveryZones';

type Props = {
  addressId?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

const LABEL_OPTIONS: { id: AddressLabel; icon: string; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'work', icon: 'work', label: 'Work' },
  { id: 'other', icon: 'bookmark', label: 'Other' },
];

export default function AddAddressPage({ addressId, onNavigate }: Props) {
  const existing = addressId ? getSavedAddressById(addressId) : undefined;

  const [line1, setLine1] = useState(existing?.line1 ?? '123 Culinary Ave');
  const [line2, setLine2] = useState(existing?.line2 ?? '');
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [label, setLabel] = useState<AddressLabel>(existing?.label ?? 'home');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const city = existing?.city ?? 'Kingston, Jamaica';
    const zone = checkDeliveryZone({ line1, line2, city });
    if (!zone.inZone) {
      onNavigate('out-of-delivery', { returnTo: 'add-address', attemptedAddress: line1 });
      return;
    }
    const address: SavedAddress = {
      id: existing?.id ?? `addr-${Date.now()}`,
      label,
      line1,
      line2: line2 || undefined,
      instructions: instructions || undefined,
      city,
      isDefault: existing?.isDefault ?? !addressId,
    };
    upsertSavedAddress(address);
    onNavigate('saved-addresses');
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col antialiased">
      <header className="flex items-center justify-between px-4 py-2 w-full max-w-[1200px] mx-auto bg-surface shadow-sm sticky top-0 z-50">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => onNavigate('saved-addresses')}
          className="p-2 text-on-surface-variant rounded-full"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-sm font-bold text-primary absolute left-1/2 -translate-x-1/2">
          {addressId ? 'Edit Address' : 'Add Address'}
        </h1>
        <div className="w-10" />
      </header>

      <main className="flex-1 flex flex-col relative max-w-[1200px] mx-auto w-full">
        <div className="relative h-[309px] w-full bg-surface-container-highest overflow-hidden">
          <img src={ADD_ADDRESS_MAP} alt="Map" className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-multiply" />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center"
            style={{ animation: 'bounce 2s 3' }}
          >
            <div className="bg-primary-container rounded-full p-2 shadow-[0px_10px_30px_rgba(0,0,0,0.15)] relative z-10">
              <MaterialIcon name="location_on" className="text-on-primary" filled />
            </div>
            <div className="w-2 h-2 bg-on-surface/20 rounded-full mt-1 shadow-inner" />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-16 map-gradient z-20 pointer-events-none" />
        </div>

        <div className="flex-1 bg-surface px-4 py-6 flex flex-col gap-6 relative z-30 rounded-t-xl -mt-4 shadow-[0px_-4px_20px_rgba(0,0,0,0.04)]">
          <AddressAutocomplete
            value={line1}
            onChange={setLine1}
            onSelect={(s) => {
              setLine1(s.line1);
              if (s.line2) setLine2(s.line2);
            }}
            placeholder="Search for address in Kingston"
          />

          <div className="w-full h-px bg-surface-container-high" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-1">
              <label htmlFor="line1" className="text-label-md font-semibold text-on-surface-variant block ml-1">
                Address Line 1
              </label>
              <input
                id="line1"
                value={line1}
                onChange={e => setLine1(e.target.value)}
                className="form-input-soft"
                placeholder="Street address, P.O. box, etc."
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="line2" className="text-label-md font-semibold text-on-surface-variant block ml-1">
                Apt / Suite / Floor (Optional)
              </label>
              <input
                id="line2"
                value={line2}
                onChange={e => setLine2(e.target.value)}
                className="form-input-soft"
                placeholder="e.g. Apt 4B"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="instructions" className="text-label-md font-semibold text-on-surface-variant block ml-1">
                Delivery Instructions
              </label>
              <textarea
                id="instructions"
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                className="form-input-soft resize-none"
                placeholder="e.g. Leave at the front door, gate code 1234"
                rows={2}
              />
            </div>

            <div className="pt-2">
              <label className="text-label-md font-semibold text-on-surface-variant block ml-1 mb-2">Save as</label>
              <div className="flex gap-2">
                {LABEL_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setLabel(option.id)}
                    className={`label-chip ${label === option.id ? 'active' : ''}`}
                  >
                    <MaterialIcon
                      name={option.icon}
                      className="mr-2 text-[18px]"
                      filled={label === option.id}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-24" />
          </form>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface/90 backdrop-blur-md border-t border-surface-container-low p-4 pb-safe z-50 flex justify-center shadow-[0px_-10px_30px_rgba(0,0,0,0.03)]">
        <button
          type="button"
          onClick={handleSubmit}
          className="w-full max-w-[1200px] bg-primary-container text-on-primary text-headline-sm font-semibold py-4 rounded-lg shadow-md hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Save Address
        </button>
      </div>
    </div>
  );
}
