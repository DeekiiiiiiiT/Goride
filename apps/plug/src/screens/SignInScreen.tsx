import { useEffect, useRef } from 'react';
import { onPlugClick } from '../shell/actions';
import { bindScreen } from '../shell/bind';
import { SignInForm } from './SignInForm';

export function SignInScreen({ screen }: { screen: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) bindScreen(screen, ref.current); }, [screen]);
  return (
    <div ref={ref} data-plug-screen={screen} className="flex min-h-screen flex-col bg-surface px-margin pb-safe pt-safe text-on-surface">
      <header className="flex items-center pt-2">
        <button type="button" onClick={onPlugClick} aria-label="Go back" className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high" data-act="arrow-back" data-way-out="back">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </header>
      <h1 className="mt-4 font-headline-sm text-headline-sm">Sign in to Roam Plug</h1>
      <p className="mt-1 text-sm text-on-surface-variant">Google, Apple, or email. Free, and nothing is sold.</p>
      <div className="mt-2">
        <SignInForm />
      </div>
    </div>
  );
}
