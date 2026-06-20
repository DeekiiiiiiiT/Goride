import React from 'react';

type AppShellProps = {
  children: React.ReactNode;
  /** Center content on tablet; full-bleed immersive overlays sit outside this. */
  constrainWidth?: boolean;
  className?: string;
};

export function AppShell({ children, constrainWidth = true, className = '' }: AppShellProps) {
  return (
    <div className={`app-shell bg-background text-on-background safe-x ${className}`}>
      <div
        className={`app-shell-inner flex flex-1 flex-col w-full ${
          constrainWidth ? 'mx-auto max-w-xl md:max-w-2xl' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}
