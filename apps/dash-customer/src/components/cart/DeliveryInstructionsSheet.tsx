import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { getSavedAddress, saveDeliveryAddress } from '@/lib/addressStorage';

type Props = {
  open: boolean;
  onClose: () => void;
  value: string;
  onSave: (instructions: string) => void;
};

export function DeliveryInstructionsSheet({ open, onClose, value, onSave }: Props) {
  const [instructions, setInstructions] = useState(value);

  useEffect(() => {
    if (open) setInstructions(value);
  }, [open, value]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-4 pb-safe pt-2">
        <h2 className="text-headline-sm font-semibold mb-4">Delivery Instructions</h2>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
          placeholder="Gate code, landmarks, drop-off preference..."
          className="w-full bg-surface-container-high rounded-lg p-4 text-body-md resize-none focus:outline-none focus:ring-2 focus:ring-primary mb-4"
        />
        <button
          type="button"
          onClick={() => {
            const saved = getSavedAddress();
            if (saved) {
              saveDeliveryAddress({ ...saved, instructions });
            }
            onSave(instructions);
            onClose();
          }}
          className="w-full bg-primary text-on-primary py-4 rounded-lg font-semibold text-label-md"
        >
          Save Instructions
        </button>
      </div>
    </BottomSheet>
  );
}
