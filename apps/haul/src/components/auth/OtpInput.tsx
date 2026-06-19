import React, { useEffect, useRef } from 'react';

const LENGTH = 6;

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function OtpInput({ value, onChange, disabled }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('');

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const setDigit = (index: number, char: string) => {
    const next = digits.map((d, i) => (i === index ? char : d === ' ' ? '' : d));
    onChange(next.join('').replace(/\s/g, '').slice(0, LENGTH));
  };

  return (
    <div className="flex justify-between gap-2" dir="ltr">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
          value={digit === ' ' ? '' : digit}
          className="h-14 w-12 rounded-lg border border-[#534434] bg-[#060e20] text-center text-2xl font-bold text-[#ffc174] shadow-inner outline-none transition-all focus:border-[#ffc174] focus:ring-1 focus:ring-[#ffc174] md:h-16 md:w-14"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1);
            setDigit(index, v);
            if (v && index < LENGTH - 1) refs.current[index + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digit.trim() && index > 0) {
              refs.current[index - 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
            if (pasted) onChange(pasted);
          }}
        />
      ))}
    </div>
  );
}
