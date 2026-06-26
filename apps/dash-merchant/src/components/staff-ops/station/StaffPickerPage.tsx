import { useMemo, useState } from 'react';
import JobStationBadge from '../shared/JobStationBadge';
import type { JobStation, RosterMember } from '../../../types/team';

type StationFilter = 'all' | 'counter' | 'kitchen';

interface StaffPickerPageProps {
  storeName: string;
  members: RosterMember[];
  onSelect: (member: RosterMember) => void;
}

function MemberAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/15 text-headline-md font-bold text-primary-container">
      {initial}
    </div>
  );
}

export default function StaffPickerPage({ storeName, members, onSelect }: StaffPickerPageProps) {
  const [filter, setFilter] = useState<StationFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return members;
    return members.filter((member) => member.jobStation === filter);
  }, [filter, members]);

  const tabs: { key: StationFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'counter', label: 'Counter' },
    { key: 'kitchen', label: 'Kitchen' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-inset-lg px-margin-tablet py-inset-lg">
      <header className="text-center">
        <h1 className="text-headline-lg font-bold text-on-background">{storeName}</h1>
        <p className="mt-inset-xs text-body-lg text-on-surface-variant">Who&apos;s working today?</p>
      </header>

      <div className="flex justify-center gap-inset-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`rounded-full px-5 py-2 text-label-lg font-semibold transition-colors ${
              filter === tab.key
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container-low text-on-surface-variant'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-inset-md md:grid-cols-3">
        {filtered.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onSelect(member)}
            className="flex min-h-[140px] flex-col items-center justify-center gap-inset-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm transition-transform hover:border-primary-container/40 active:scale-[0.98]"
          >
            <MemberAvatar name={member.name} />
            <span className="text-title-md font-semibold text-on-background">{member.name}</span>
            {member.jobStation && (
              <JobStationBadge station={member.jobStation as JobStation} />
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-body-md text-on-surface-variant">
          No floor staff yet. Ask your manager to add staff in Team settings.
        </p>
      )}

      <p className="text-center text-label-md text-on-surface-variant">
        Tap your name to start your shift
      </p>
    </div>
  );
}
