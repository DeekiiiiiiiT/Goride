import { ReactNode } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface SettingsDetailLayoutProps {
  title: string;
  onBack: () => void;
  onSave: () => void;
  isSaving?: boolean;
  children: ReactNode;
}

export default function SettingsDetailLayout({
  title,
  onBack,
  onSave,
  isSaving = false,
  children,
}: SettingsDetailLayoutProps) {
  return (
    <div className="fixed inset-0 z-[55] flex min-h-dvh flex-col bg-surface pt-16 pb-24">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md md:px-margin-tablet">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low active:scale-95"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-md font-bold text-on-surface">{title}</h1>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="text-label-md font-semibold text-primary disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-margin-mobile py-inset-md md:px-margin-tablet">
        {children}
      </main>
    </div>
  );
}
