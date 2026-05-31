import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

type Props = {
  onSubmit: (pin: string) => Promise<void>;
  error?: string | null;
  disabled?: boolean;
};

/** Inline 4-digit PIN entry for arrived-at-pickup. */
export function RiderPinEntry({ onSubmit, error, disabled = false }: Props) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    const t = window.setTimeout(() => inputRefs[0].current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const handleInputChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d?$/.test(value)) return;
      const next = [...pin];
      next[index] = value;
      setPin(next);
      if (value && index < 3) inputRefs[index + 1].current?.focus();
    },
    [pin],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !pin[index] && index > 0) {
        inputRefs[index - 1].current?.focus();
      }
    },
    [pin],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      setPin(pasted.split(''));
      inputRefs[3].current?.focus();
    }
  }, []);

  const pinComplete = pin.every((d) => d !== '');

  const handleSubmit = async () => {
    const pinString = pin.join('');
    if (pinString.length !== 4 || disabled) return;
    setSubmitting(true);
    try {
      await onSubmit(pinString);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-slate-600 dark:text-slate-300">
        Ask the rider for their 4-digit PIN (same code shown on their app).
      </p>
      <div className="flex justify-center gap-3">
        {pin.map((digit, i) => (
          <input
            key={i}
            ref={inputRefs[i]}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleInputChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            disabled={disabled || submitting}
            className="h-14 w-14 rounded-xl border-2 border-slate-200 bg-white text-center text-2xl font-bold text-slate-900 outline-none transition-colors focus:border-[#2DD4BF] focus:ring-2 focus:ring-[#2DD4BF]/25 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            aria-label={`PIN digit ${i + 1}`}
          />
        ))}
      </div>
      {error ? (
        <p className="text-center text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={!pinComplete || submitting || disabled}
        onClick={() => void handleSubmit()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2DD4BF] py-4 text-lg font-bold text-slate-900 shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Verifying…
          </>
        ) : (
          'Verify PIN & start trip'
        )}
      </button>
    </div>
  );
}
