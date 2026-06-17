import React from 'react';
import { cn, Label, RadioGroup, RadioGroupItem } from '@roam/ui';
import { useNavigationPreference } from '../../contexts/NavigationPreferenceContext';
import {
  NAVIGATION_PROVIDER_LABELS,
  type NavigationProvider,
} from '../../utils/navigationPreference';

const PROVIDERS: NavigationProvider[] = ['google_maps', 'waze'];

type Props = {
  variant?: 'independent' | 'fleet';
};

export function NavigationPreferenceOptions({ variant = 'independent' }: Props) {
  const { provider, setProvider } = useNavigationPreference();

  return (
    <RadioGroup
      value={provider}
      onValueChange={(value) => setProvider(value as NavigationProvider)}
      className="space-y-3"
    >
      {PROVIDERS.map((option) => (
        <label
          key={option}
          htmlFor={`navigation-provider-${option}`}
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
            provider === option
              ? variant === 'independent'
                ? 'border-[#004ac6]/30 bg-blue-50/80 dark:border-blue-500/30 dark:bg-blue-950/20'
                : 'border-indigo-200 bg-indigo-50 dark:border-indigo-900/50 dark:bg-indigo-950/20'
              : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/80',
          )}
        >
          <RadioGroupItem value={option} id={`navigation-provider-${option}`} />
          <div className="min-w-0 flex-1">
            <Label
              htmlFor={`navigation-provider-${option}`}
              className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white"
            >
              {NAVIGATION_PROVIDER_LABELS[option]}
            </Label>
          </div>
        </label>
      ))}
    </RadioGroup>
  );
}
