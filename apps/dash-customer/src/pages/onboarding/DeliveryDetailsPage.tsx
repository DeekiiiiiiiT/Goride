import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { AddressLabel } from '@/lib/addressStorage';
import { checkDeliveryZone } from '@/lib/deliveryZones';
import type { AddressSelection } from './DeliveryAddressPage';

type DeliveryDetailsPageProps = {
  address: AddressSelection;
  onBack: () => void;
  onSave: (details: {
    line1: string;
    line2?: string;
    instructions?: string;
    label: AddressLabel;
  }) => void;
  onOutOfZone?: (address: AddressSelection) => void;
};

const LABEL_OPTIONS: { value: AddressLabel; icon: string; label: string }[] = [
  { value: 'home', icon: 'home', label: 'Home' },
  { value: 'work', icon: 'work', label: 'Work' },
  { value: 'other', icon: 'location_on', label: 'Other' },
];

export function DeliveryDetailsPage({ address, onBack, onSave, onOutOfZone }: DeliveryDetailsPageProps) {
  const [line1, setLine1] = useState(address.line1);
  const [line2, setLine2] = useState(address.line2 ?? '');
  const [instructions, setInstructions] = useState('');
  const [label, setLabel] = useState<AddressLabel>('home');

  const handleSave = () => {
    const zone = checkDeliveryZone({ line1, line2 });
    if (!zone.inZone) {
      onOutOfZone?.({ line1, line2 });
      return;
    }
    onSave({
      line1,
      line2: line2 || undefined,
      instructions: instructions || undefined,
      label,
    });
  };

  return (
    <div className="app-fullscreen-screen bg-surface text-on-surface antialiased">
      <header className="flex items-center justify-between px-4 h-16 w-full max-w-[1200px] mx-auto bg-surface z-50 shrink-0">
        <button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors text-on-surface"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-xl font-semibold text-on-surface absolute left-1/2 -translate-x-1/2">
          Delivery Details
        </h1>
        <div className="w-10 h-10" />
      </header>

      <main className="flex-1 flex flex-col w-full max-w-[1200px] mx-auto pb-32 min-h-0 overflow-y-auto scrollbar-hide">
        <section className="relative w-full h-48 md:h-64 bg-surface-container overflow-hidden shrink-0">
          <img alt="Map view" className="w-full h-full object-cover" src="/images/delivery-map.png" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative flex flex-col items-center -translate-y-1/2">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg dash-bounce-slow">
                <MaterialIcon name="location_on" className="text-on-primary" filled />
              </div>
              <div className="w-4 h-1 bg-black/20 rounded-full mt-1 blur-sm" />
            </div>
          </div>
          <button
            type="button"
            className="absolute bottom-4 right-4 w-10 h-10 bg-surface text-on-surface rounded-full shadow-md flex items-center justify-center hover:bg-surface-variant transition-colors"
          >
            <MaterialIcon name="my_location" />
          </button>
        </section>

        <section className="px-4 pt-6 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-on-surface-variant pl-1" htmlFor="address-line-1">
                Address line 1
              </label>
              <div className="relative flex items-center">
                <MaterialIcon name="home" className="absolute left-4 text-on-surface-variant" />
                <input
                  id="address-line-1"
                  type="text"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  className="w-full bg-surface-container border border-transparent rounded-lg pl-12 pr-4 py-3 text-base text-on-surface focus:outline-none focus:border-primary focus:bg-surface transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-on-surface-variant pl-1" htmlFor="apt-suite">
                Apt/Suite/Floor <span className="text-sm text-outline">(Optional)</span>
              </label>
              <input
                id="apt-suite"
                type="text"
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                placeholder="e.g. Apt 4B"
                className="w-full bg-surface-container border border-transparent rounded-lg px-4 py-3 text-base text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary focus:bg-surface transition-all"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-on-surface-variant pl-1" htmlFor="instructions">
                Delivery instructions
              </label>
              <textarea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Gate code, landmarks, drop-off location..."
                rows={3}
                className="w-full bg-surface-container border border-transparent rounded-lg px-4 py-3 text-base text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary focus:bg-surface transition-all resize-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <span className="text-xs font-medium text-on-surface-variant pl-1">Save as</span>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {LABEL_OPTIONS.map((option) => {
                const active = label === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLabel(option.value)}
                    className={`px-5 py-2.5 rounded-full text-sm font-semibold tracking-wide flex items-center gap-1 transition-all border shrink-0 ${
                      active
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container text-on-surface border-transparent hover:bg-surface-variant'
                    }`}
                  >
                    <MaterialIcon
                      name={option.icon}
                      className={`text-[18px] ${active ? '' : 'text-on-surface-variant'}`}
                    />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface shadow-[0px_-10px_30px_rgba(0,0,0,0.05)] z-50 px-4 py-4 pb-safe border-t border-surface-container">
        <div className="max-w-[1200px] mx-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={!line1.trim()}
            className="w-full bg-primary text-on-primary rounded-lg py-4 text-sm font-semibold tracking-wide flex justify-center items-center shadow-sm active:scale-[0.98] transition-transform duration-200 disabled:opacity-50"
          >
            Save Address
          </button>
        </div>
      </div>
    </div>
  );
}
