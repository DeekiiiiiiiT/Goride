import React, { useEffect, useRef } from 'react';

const OTP_LENGTH = 6;

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function OtpInput({ value, onChange }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const chars = value.split('');

  useEffect(() => {
    const timer = window.setTimeout(() => inputsRef.current[0]?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, []);

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
    <div className="flex justify-between gap-2 md:gap-4 max-w-[360px] w-full mx-auto" onPaste={handlePaste}>
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
          className="w-[45px] h-14 md:w-14 md:h-16 rounded-lg bg-surface-container-high border-none text-center text-2xl font-semibold text-on-surface shadow-sm transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none focus:shadow-md dash-otp-input"
        />
      ))}
    </div>
  );
}
