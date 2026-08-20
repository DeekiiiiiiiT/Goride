import { useState } from 'react';
import { MaterialIcon } from '../../../signup/components/MaterialIcon';

const PIN_LENGTH = 6;

export type PinPadMode = 'enter' | 'create' | 'create-after-reset';

interface PinPadProps {
  memberName: string;
  mode: PinPadMode;
  error?: string | null;
  onBack: () => void;
  onComplete: (pin: string) => void;
}

const MODE_COPY: Record<PinPadMode, { title: string; subtitle: string }> = {
  enter: { title: 'Enter your PIN', subtitle: 'Sign in to start your shift' },
  create: {
    title: 'Create your PIN',
    subtitle: 'Welcome — choose a PIN only you know',
  },
  'create-after-reset': {
    title: 'Create a new PIN',
    subtitle: 'Your PIN was reset. Set a new one to continue',
  },
};

export default function PinPad({ memberName, mode, error, onBack, onComplete }: PinPadProps) {
  const [step, setStep] = useState<'first' | 'confirm'>('first');
  const [firstPin, setFirstPin] = useState('');
  const [digits, setDigits] = useState('');

  const isCreate = mode !== 'enter';
  const copy = MODE_COPY[mode];
  const subtitle =
    isCreate && step === 'confirm' ? 'Enter your PIN again to confirm' : copy.subtitle;

  const handleDigit = (digit: string) => {
    if (digits.length >= PIN_LENGTH) return;
    const next = `${digits}${digit}`;
    setDigits(next);
    if (next.length < PIN_LENGTH) return;

    if (!isCreate) {
      onComplete(next);
      setDigits('');
      return;
    }

    if (step === 'first') {
      setFirstPin(next);
      setDigits('');
      setStep('confirm');
      return;
    }

    if (next !== firstPin) {
      setDigits('');
      setStep('first');
      setFirstPin('');
      onComplete('__mismatch__');
      return;
    }

    onComplete(next);
    setDigits('');
    setStep('first');
    setFirstPin('');
  };

  const handleBackspace = () => {
    setDigits((current) => current.slice(0, -1));
  };

  const handleBack = () => {
    if (isCreate && step === 'confirm') {
      setStep('first');
      setDigits('');
      setFirstPin('');
      return;
    }
    onBack();
  };

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-margin-tablet py-inset-lg">
      <p className="text-headline-md font-bold text-on-background">{memberName}</p>
      <p className="mt-inset-xs text-body-md text-on-surface-variant">{copy.title}</p>
      <p className="mt-1 text-label-md text-on-surface-variant">{subtitle}</p>

      {isCreate && (
        <p className="mt-inset-sm text-label-sm text-on-surface-variant">
          Step {step === 'first' ? '1' : '2'} of 2
        </p>
      )}

      <div className="mt-inset-lg flex gap-3">
        {Array.from({ length: PIN_LENGTH }).map((_, index) => (
          <div
            key={index}
            className={`h-4 w-4 rounded-full border-2 ${
              index < digits.length
                ? 'border-primary-container bg-primary-container'
                : 'border-outline-variant bg-transparent'
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="mt-inset-md text-body-sm font-medium text-error" role="alert">
          {error}
        </p>
      )}

      <div className="mt-inset-xl grid w-full max-w-sm grid-cols-3 gap-inset-sm">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            className="flex h-16 items-center justify-center rounded-xl bg-surface-container-low text-headline-md font-semibold text-on-background transition-colors hover:bg-surface-container-high active:scale-95"
          >
            {digit}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => handleDigit('0')}
          className="flex h-16 items-center justify-center rounded-xl bg-surface-container-low text-headline-md font-semibold text-on-background transition-colors hover:bg-surface-container-high active:scale-95"
        >
          0
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          aria-label="Backspace"
          className="flex h-16 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-low active:scale-95"
        >
          <MaterialIcon name="backspace" />
        </button>
      </div>

      <button
        type="button"
        onClick={handleBack}
        className="mt-inset-lg text-body-md font-medium text-primary-container"
      >
        Back to staff list
      </button>
    </div>
  );
}
