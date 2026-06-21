import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { KINGSTON_MAP_PREVIEW } from '@/lib/accountContent';
import {
  deleteSavedAddress,
  getSavedAddresses,
  type AddressLabel,
  type SavedAddress,
} from '@/lib/addressStorage';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

const LABEL_ICONS: Record<AddressLabel, { icon: string; filled: boolean; bg: string; text: string }> = {
  home: { icon: 'home', filled: true, bg: 'bg-primary-container/10', text: 'text-primary' },
  work: { icon: 'apartment', filled: false, bg: 'bg-surface-variant', text: 'text-on-surface-variant' },
  other: { icon: 'bookmark', filled: false, bg: 'bg-surface-variant', text: 'text-on-surface-variant' },
};

function AddressCard({
  address,
  onEdit,
  onDelete,
}: {
  address: SavedAddress;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = LABEL_ICONS[address.label];

  return (
    <div className="bg-surface-container-lowest rounded-xl p-4 card-shadow flex flex-col border border-transparent">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <div className={`${meta.bg} p-2 rounded-full ${meta.text}`}>
            <MaterialIcon name={meta.icon} filled={meta.filled} />
          </div>
          <h2 className="text-headline-sm font-semibold capitalize">{address.label}</h2>
          {address.isDefault && (
            <span className="bg-secondary-container/20 text-secondary-container px-2 py-1 rounded-full text-label-sm flex items-center ml-1">
              <MaterialIcon name="check_circle" className="text-[14px] mr-1" filled />
              Default
            </span>
          )}
        </div>
      </div>
      <p className="text-body-md text-on-surface-variant pl-11 mt-2">
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        {address.city && (
          <>
            <br />
            {address.city}
          </>
        )}
      </p>
      <div className="flex justify-end gap-4 pt-3 mt-3 border-t border-surface-variant">
        <button type="button" onClick={onEdit} className="text-label-md font-semibold text-on-surface-variant hover:text-primary btn-press">
          Edit
        </button>
        <button type="button" onClick={onDelete} className="text-label-md font-semibold text-error hover:text-error/80 btn-press">
          Delete
        </button>
      </div>
    </div>
  );
}

export default function SavedAddressesPage({ onNavigate }: Props) {
  const [addresses, setAddresses] = useState(getSavedAddresses);

  const handleDelete = (id: string) => {
    deleteSavedAddress(id);
    setAddresses(getSavedAddresses());
  };

  return (
    <div className="font-body-md text-on-surface antialiased flex flex-col min-h-screen bg-[#FAFAFA]">
      <header className="w-full top-0 sticky bg-surface shadow-sm z-50">
        <div className="flex items-center justify-between px-4 py-2 w-full max-w-[1200px] mx-auto h-16">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => onNavigate('account')}
            className="text-on-surface-variant p-2 -ml-2 rounded-full btn-press"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm font-bold absolute left-1/2 -translate-x-1/2">Saved Addresses</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="flex-grow px-4 py-6 max-w-[1200px] mx-auto w-full space-y-6 pb-32">
        <div className="space-y-4">
          {addresses.map(address => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={() => onNavigate('add-address', { addressId: address.id })}
              onDelete={() => handleDelete(address.id)}
            />
          ))}
        </div>

        <div className="rounded-xl overflow-hidden h-32 card-shadow relative border border-surface-variant/50">
          <div
            className="bg-cover bg-center w-full h-full opacity-60"
            style={{ backgroundImage: `url('${KINGSTON_MAP_PREVIEW}')` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 to-transparent flex items-end p-4">
            <p className="text-label-sm text-on-surface-variant">Viewing addresses in Kingston</p>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface-container-lowest border-t border-surface-variant/30 p-4 pb-safe shadow-[0px_-10px_30px_rgba(0,0,0,0.05)] z-40">
        <div className="max-w-[1200px] mx-auto w-full">
          <button
            type="button"
            onClick={() => onNavigate('add-address')}
            className="w-full bg-primary-container text-on-primary font-semibold text-label-md py-4 rounded-lg flex items-center justify-center gap-2 btn-press shadow-md hover:bg-primary-container/90"
          >
            <MaterialIcon name="add" />
            <span>Add New Address</span>
          </button>
        </div>
      </div>
    </div>
  );
}
