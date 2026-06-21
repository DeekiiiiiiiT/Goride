import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

export type AddressSelection = {
  line1: string;
  line2?: string;
};

type SavedAddressItem = {
  id: string;
  label: string;
  line1: string;
  line2: string;
  icon: string;
};

const SAVED_ADDRESSES: SavedAddressItem[] = [
  { id: 'home', label: 'Home', line1: '123 Market St, San Francisco, CA', line2: '', icon: 'home' },
  { id: 'work', label: 'Work', line1: '456 Tech Blvd, San Francisco, CA', line2: '', icon: 'work' },
  {
    id: 'recent',
    label: '789 Valencia St',
    line1: 'Apt 4B, San Francisco, CA',
    line2: 'Apt 4B',
    icon: 'history',
  },
];

type DeliveryAddressPageProps = {
  onBack: () => void;
  onConfirm: (address: AddressSelection) => void;
};

export function DeliveryAddressPage({ onBack, onConfirm }: DeliveryAddressPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<AddressSelection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectAddress = (item: SavedAddressItem) => {
    setSelectedId(item.id);
    if (item.id === 'home') {
      setSelected({ line1: '123 Market Street' });
      return;
    }
    if (item.id === 'work') {
      setSelected({ line1: '456 Tech Blvd' });
      return;
    }
    setSelected({ line1: '789 Valencia St', line2: 'Apt 4B' });
  };

  return (
    <div className="app-fullscreen-screen bg-surface-container-lowest text-on-surface antialiased">
      <main className="w-full max-w-md h-full flex flex-col relative bg-surface-container-lowest mx-auto pt-safe">
        <header className="flex items-center justify-between px-4 h-16 w-full shrink-0 z-10">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-surface-variant transition-colors flex items-center justify-center text-on-surface"
          >
            <MaterialIcon name="arrow_back" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-[100px] flex flex-col gap-6 scrollbar-hide">
          <section>
            <h1 className="text-[28px] leading-[34px] font-bold text-on-surface tracking-tight">
              Where should we deliver?
            </h1>
          </section>

          <section className="relative w-full h-[309px] min-h-[250px] rounded-[24px] overflow-hidden shadow-sm border border-surface-variant shrink-0">
            <div
              className="absolute inset-0 bg-surface-variant bg-cover bg-center"
              style={{ backgroundImage: "url('/images/address-map.png')" }}
            />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center dash-bounce-slow">
              <div className="bg-primary text-on-primary rounded-full p-2 shadow-lg mb-1">
                <MaterialIcon name="location_on" filled />
              </div>
              <div className="w-2 h-1 bg-black/20 rounded-full blur-[2px]" />
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedId('current');
                setSelected({ line1: '123 Market Street' });
              }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-container-lowest text-primary px-5 py-3 rounded-full shadow-[0px_10px_30px_rgba(0,0,0,0.08)] flex items-center gap-2 active:scale-95 transition-transform duration-200"
            >
              <MaterialIcon name="my_location" className="text-[20px]" />
              <span className="text-sm font-semibold tracking-wide">Use current location</span>
            </button>
          </section>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-surface-variant" />
            <span className="text-xs font-medium text-outline uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-surface-variant" />
          </div>

          <section className="relative">
            <div className="flex items-center bg-surface-container rounded-xl px-4 py-4 transition-all duration-200 focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary focus-within:shadow-sm">
              <MaterialIcon name="search" className="text-outline mr-3" />
              <input
                className="w-full bg-transparent border-none outline-none text-base text-on-surface placeholder:text-outline p-0 focus:ring-0"
                placeholder="Enter your address"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim()) {
                    setSelectedId('search');
                    setSelected({ line1: e.target.value.trim() });
                  }
                }}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-outline-variant uppercase tracking-wider mb-2">
              Recent &amp; Saved
            </h2>
            <ul className="flex flex-col">
              {SAVED_ADDRESSES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => selectAddress(item)}
                    className={`w-full flex items-center gap-4 py-3 active:bg-surface-variant transition-colors rounded-lg -mx-2 px-2 border-b border-surface-variant/50 last:border-0 text-left ${
                      selectedId === item.id ? 'bg-surface-container-low' : ''
                    }`}
                  >
                    <div className="bg-surface-container-high p-2 rounded-full flex items-center justify-center text-outline">
                      <MaterialIcon name={item.icon} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold tracking-wide text-on-surface">{item.label}</p>
                      <p className="text-sm text-outline mt-0.5 truncate">
                        {item.id === 'recent' ? item.line1 : item.line1}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="absolute bottom-0 left-0 w-full bg-surface-container-lowest/90 backdrop-blur-md px-4 py-4 pb-safe shadow-[0px_-10px_30px_rgba(0,0,0,0.03)] z-50">
          <button
            type="button"
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
            className="w-full bg-primary text-on-primary text-sm font-semibold tracking-wide py-4 rounded-xl shadow-md active:scale-[0.98] transition-transform duration-200 flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Address
          </button>
        </div>
      </main>
    </div>
  );
}
