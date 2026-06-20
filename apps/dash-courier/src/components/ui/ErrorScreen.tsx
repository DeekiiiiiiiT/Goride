import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

export type ErrorScreenVariant = 'network' | 'gps' | 'server';

const CONFIG: Record<
  ErrorScreenVariant,
  { icon: string; title: string; description: string; primaryLabel: string; secondaryLabel: string }
> = {
  network: {
    icon: 'wifi_off',
    title: 'No connection',
    description: "We can't reach our servers. Check your internet and try again.",
    primaryLabel: 'Retry',
    secondaryLabel: 'Go offline',
  },
  gps: {
    icon: 'location_off',
    title: "Can't find your location",
    description: 'Enable location services and allow Roam Dash to access your precise location.',
    primaryLabel: 'Open Settings',
    secondaryLabel: 'Retry',
  },
  server: {
    icon: 'cloud_off',
    title: 'Something went wrong',
    description: 'Our servers are having trouble. Please try again in a moment.',
    primaryLabel: 'Retry',
    secondaryLabel: 'Contact Support',
  },
};

type ErrorScreenProps = {
  variant: ErrorScreenVariant;
  onPrimary: () => void;
  onSecondary?: () => void;
  fullScreen?: boolean;
};

export function ErrorScreen({ variant, onPrimary, onSecondary, fullScreen = true }: ErrorScreenProps) {
  const config = CONFIG[variant];

  const content = (
    <div className="flex flex-col items-center text-center px-[var(--spacing-edge)] max-w-md mx-auto">
      <div className="w-24 h-24 rounded-full bg-error-container/30 flex items-center justify-center mb-6 courier-subtle-pulse">
        <MaterialIcon name={config.icon} className="text-error text-5xl" filled />
      </div>
      <h1 className="text-2xl font-semibold text-on-surface mb-2">{config.title}</h1>
      <p className="text-base text-muted mb-8">{config.description}</p>
      <div className="w-full flex flex-col gap-3">
        <button
          type="button"
          onClick={onPrimary}
          className="w-full h-14 bg-primary text-on-primary rounded-xl font-semibold active:scale-[0.98] transition-transform"
        >
          {config.primaryLabel}
        </button>
        {onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="w-full h-14 border border-outline-variant text-on-surface-variant rounded-xl font-semibold active:bg-surface-container-low transition-colors"
          >
            {config.secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[80] bg-background flex items-center justify-center">{content}</div>
    );
  }

  return <div className="py-12">{content}</div>;
}
