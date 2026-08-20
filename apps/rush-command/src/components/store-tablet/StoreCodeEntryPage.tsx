import { useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface StoreCodeEntryPageProps {
  initialCode?: string;
  onContinue: (code: string) => void;
  onBack?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

const inputClass =
  'h-14 w-full rounded-lg border border-outline-variant bg-transparent px-4 text-center text-headline-md font-bold uppercase tracking-widest text-on-background outline-none transition-colors placeholder:text-on-surface-variant/40 focus:border-primary-container focus:ring-1 focus:ring-primary-container';

export default function StoreCodeEntryPage({
  initialCode = '',
  onContinue,
  onBack,
  isLoading = false,
  error,
}: StoreCodeEntryPageProps) {
  const [code, setCode] = useState(initialCode);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {onBack && (
        <header className="safe-t flex h-16 items-center px-margin-mobile">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 items-center justify-center rounded-full text-primary"
            aria-label="Back"
          >
            <MaterialIcon name="arrow_back" />
          </button>
        </header>
      )}

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-inset-lg px-margin-mobile py-inset-xl">
        <div className="text-center">
          <h1 className="text-headline-md font-bold text-on-background">Connect this tablet</h1>
          <p className="mt-inset-xs text-body-lg text-on-surface-variant">
            Enter your store pairing code from Team settings.
          </p>
        </div>

        <div className="space-y-inset-xs">
          <label className="block text-label-md text-on-surface-variant" htmlFor="store-code">
            Store code
          </label>
          <input
            id="store-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ROAM-XXXX"
            className={inputClass}
            autoComplete="off"
            spellCheck={false}
          />
          {error && <p className="text-body-sm text-error">{error}</p>}
        </div>

        <button
          type="button"
          disabled={isLoading || !code.trim()}
          onClick={() => onContinue(code.trim())}
          className="h-12 w-full rounded-full bg-primary-container text-label-lg font-semibold text-on-primary-container disabled:opacity-50"
        >
          {isLoading ? 'Connecting…' : 'Continue'}
        </button>
      </main>
    </div>
  );
}
