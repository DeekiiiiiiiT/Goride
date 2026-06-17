import React, { useState } from 'react';
import { NavigationSettingsRow } from './NavigationSettingsRow';
import { NavigationPreferenceSheet } from './NavigationPreferenceSheet';

export function DriverSettingsPage() {
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>

      <section>
        <h2 className="mb-3 px-1 text-sm font-semibold text-slate-900 dark:text-white">App</h2>
        <NavigationSettingsRow onClick={() => setNavigationOpen(true)} />
      </section>

      <NavigationPreferenceSheet
        open={navigationOpen}
        onOpenChange={setNavigationOpen}
        variant="independent"
      />
    </div>
  );
}
