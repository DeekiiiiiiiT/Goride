import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type Props = {
  open: boolean;
  subtotal: number;
  initialTip: number;
  onClose: () => void;
  onConfirm: (tip: number) => void;
};

const PRESETS = [10, 15, 20] as const;

export function AddTipSheet({ open, subtotal, initialTip, onClose, onConfirm }: Props) {
  const [tip, setTip] = useState(initialTip);
  const [preset, setPreset] = useState<number | null>(null);
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    if (open) {
      setTip(initialTip);
      const match = PRESETS.find(p => Math.round(subtotal * (p / 100)) === initialTip);
      setPreset(match ?? null);
      setCustomMode(!match && initialTip > 0);
    }
  }, [open, initialTip, subtotal]);

  if (!open) return null;

  const displayAmount = customMode ? tip : tip;

  const selectPreset = (pct: number) => {
    setPreset(pct);
    setCustomMode(false);
    setTip(Math.round(subtotal * (pct / 100)));
  };

  const handleKey = (key: string) => {
    setCustomMode(true);
    setPreset(null);
    if (key === 'back') {
      setTip(prev => Math.floor(prev / 10));
      return;
    }
    const digit = parseInt(key, 10);
    setTip(prev => Math.min(99999, prev * 10 + digit));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-inverse-surface/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-surface-container-lowest rounded-t-3xl shadow-[0px_-10px_30px_rgba(0,0,0,0.08)] animate-slide-up">
        <div className="w-full flex justify-center pt-4 pb-2">
          <div className="w-12 h-1.5 bg-surface-dim rounded-full" />
        </div>

        <div className="px-4 pb-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-headline-md font-bold text-on-surface">Add a Tip</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-high"
            >
              <MaterialIcon name="close" className="text-[20px] text-on-surface-variant" />
            </button>
          </div>

          <p className="text-body-md text-on-surface-variant mb-4 text-center">100% of tips go to your driver</p>

          <div className="flex justify-center gap-2 mb-8">
            {PRESETS.map(pct => (
              <button
                key={pct}
                type="button"
                onClick={() => selectPreset(pct)}
                className={`px-6 py-2 rounded-full text-body-md transition-colors ${
                  preset === pct && !customMode
                    ? 'border-2 border-primary bg-primary/5 text-primary font-bold shadow-sm'
                    : 'border border-surface-container-highest bg-surface-container-low text-on-surface-variant'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>

          <div className="flex justify-center items-end mb-8">
            <span className="text-headline-md text-on-surface-variant mr-1 pb-1">J$</span>
            <span className="text-display-lg font-bold tracking-tight text-on-surface">
              {displayAmount.toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-y-6 gap-x-4 mb-8 px-8">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key => (
              <button
                key={key}
                type="button"
                onClick={() => handleKey(key)}
                className="text-headline-lg font-bold text-on-surface py-2 active:scale-95 transition-transform"
              >
                {key}
              </button>
            ))}
            <div />
            <button
              type="button"
              onClick={() => handleKey('0')}
              className="text-headline-lg font-bold text-on-surface py-2 active:scale-95 transition-transform"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => handleKey('back')}
              className="flex items-center justify-center py-2 active:scale-95 transition-transform text-on-surface-variant"
            >
              <MaterialIcon name="backspace" className="text-[28px]" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onConfirm(tip)}
            className="w-full bg-primary text-on-primary rounded-lg py-4 text-headline-sm font-bold active:scale-[0.98] transition-transform mb-4"
          >
            Add Tip
          </button>
        </div>
      </div>
    </div>
  );
}
