import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  getSavedAddress,
  getSavedAddresses,
  type SavedAddress,
} from '@/lib/addressStorage';

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (address: SavedAddress) => void;
  onAdd: () => void;
};

export function AddressPickerSheet({ open, onClose, onSelect, onAdd }: Props) {
  const addresses = open ? getSavedAddresses() : [];
  const current = getSavedAddress();

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-4 pb-safe">
        <h2 className="text-headline-sm font-semibold mb-1">Deliver to</h2>
        <p className="text-body-sm text-on-surface-variant mb-4">Pick a saved address for this order.</p>
        {addresses.length === 0 ? (
          <p className="text-body-md text-on-surface-variant mb-4">No saved addresses yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 mb-4">
            {addresses.map((address) => {
              const selected = current?.line1 === address.line1 && current?.line2 === address.line2;
              return (
                <li key={address.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(address)}
                    className={`w-full text-left rounded-xl p-4 border transition-colors ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-outline-variant bg-surface-container-lowest'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-label-md font-semibold capitalize">{address.label}</p>
                        <p className="text-body-md text-on-surface-variant mt-1">
                          {address.line1}
                          {address.line2 ? `, ${address.line2}` : ''}
                        </p>
                      </div>
                      {selected ? <MaterialIcon name="check_circle" className="text-primary shrink-0" filled /> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={onAdd}
          className="w-full border border-primary text-primary font-semibold text-label-md py-3 rounded-lg mb-4"
        >
          Add new address
        </button>
      </div>
    </BottomSheet>
  );
}
