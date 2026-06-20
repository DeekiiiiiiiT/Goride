import React, { useRef } from 'react';

const OTP_LENGTH = 6;

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function OtpInput({ value, onChange }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const chars = value.split('');

  const setChars = (nextChars: string[]) => {
    onChange(nextChars.join('').slice(0, OTP_LENGTH));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = Array.from({ length: OTP_LENGTH }, (_, i) => chars[i] ?? '');
    next[index] = digit;
    setChars(next);
    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !chars[index] && index > 0) {
      const next = Array.from({ length: OTP_LENGTH }, (_, i) => chars[i] ?? '');
      next[index - 1] = '';
      setChars(next);
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
  };

  return (
    <div className="flex justify-between gap-2 mb-6" onPaste={handlePaste}>
      {Array.from({ length: OTP_LENGTH }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          aria-label={`Digit ${index + 1}`}
          value={chars[index] ?? ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className="otp-input w-12 h-14 text-center rounded-lg border border-outline-variant bg-surface text-xl font-semibold shadow-sm focus:ring-0 transition-all"
        />
      ))}
    </div>
  );
}
