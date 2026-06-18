/**
 * Self-contained consumer segment settings with inline tab navigation.
 */
import React, { useState } from 'react';
import { Globe, UserPlus, Megaphone, Shield } from 'lucide-react';
import {
  ConsumerSegmentSettingsPage,
  type ConsumerSegmentSettingsPageProps,
} from './ConsumerSegmentSettingsPage';

const TABS = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'registration', label: 'Registration', icon: UserPlus },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'security', label: 'Security', icon: Shield },
] as const;

export type ConsumerSegmentSettingsShellProps = Omit<
  ConsumerSegmentSettingsPageProps,
  'activeTab'
>;

export function ConsumerSegmentSettingsShell(props: ConsumerSegmentSettingsShellProps) {
  const [activeTab, setActiveTab] = useState<string>('general');

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 pb-px">
        {TABS.map(({ id, label, icon: Icon }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                selected
                  ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-500 -mb-px'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          );
        })}
      </nav>
      <ConsumerSegmentSettingsPage {...props} activeTab={activeTab} />
    </div>
  );
}
