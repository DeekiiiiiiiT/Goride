import { useMemo, useState } from 'react';
import JobStationBadge from '../shared/JobStationBadge';
import {
  formatJobStationLabel,
  formatRoleLabel,
  STATION_LABELS,
  type JobStation,
  type RosterMember,
} from '../../../types/team';

type StationFilter = 'all' | JobStation;

interface StaffPickerPageProps {
  storeName: string;
  members: RosterMember[];
  onSelect: (member: RosterMember) => void;
  initialFilter?: StationFilter;
  lockFilter?: boolean;
  venueOpsV2?: boolean;
}

const LEGACY_TABS: { key: StationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'counter', label: STATION_LABELS.counter },
  { key: 'kitchen', label: STATION_LABELS.kitchen },
  { key: 'manager', label: STATION_LABELS.manager },
];

const VENUE_OPS_TABS: { key: StationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pos', label: STATION_LABELS.pos },
  { key: 'bar', label: STATION_LABELS.bar },
  { key: 'expo', label: STATION_LABELS.expo },
  { key: 'counter', label: STATION_LABELS.counter },
  { key: 'kitchen', label: STATION_LABELS.kitchen },
  { key: 'manager', label: STATION_LABELS.manager },
];

function MemberAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/15 text-headline-md font-bold text-primary-container">
      {initial}
    </div>
  );
}

export default function StaffPickerPage({
  storeName,
  members,
  onSelect,
  initialFilter = 'all',
  lockFilter = false,
  venueOpsV2 = false,
}: StaffPickerPageProps) {
  const [filter, setFilter] = useState<StationFilter>(initialFilter);
  const activeFilter = lockFilter ? initialFilter : filter;
  const stationLocked = lockFilter && activeFilter !== 'all';
  const stationLabel = stationLocked ? formatJobStationLabel(activeFilter) : null;
  const tabs = venueOpsV2 ? VENUE_OPS_TABS : LEGACY_TABS;

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return members;
    return members.filter((member) => {
      const station = member.jobStation ?? (member.role === 'manager' ? 'manager' : null);
      return station === activeFilter;
    });
  }, [activeFilter, members]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-inset-lg px-margin-tablet py-inset-lg">
      <header className="text-center">
        <h1 className="text-headline-lg font-bold text-on-background">{storeName}</h1>
        <p className="mt-inset-xs text-body-lg text-on-surface-variant">
          {stationLocked
            ? `Who's working ${stationLabel} today?`
            : "Who's working today?"}
        </p>
        {stationLocked && (
          <p className="mt-inset-xs inline-flex items-center gap-1 rounded-full bg-primary-container/20 px-3 py-1 text-label-md font-semibold text-primary-container">
            {stationLabel} shift
          </p>
        )}
      </header>

      {!stationLocked && (
        <div className="flex flex-wrap justify-center gap-inset-sm">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`rounded-full px-5 py-2 text-label-lg font-semibold transition-colors ${
                activeFilter === tab.key
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

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
            {member.displayTitle && (
              <span className="text-label-md text-on-surface-variant">{member.displayTitle}</span>
            )}
            <div className="flex flex-wrap items-center justify-center gap-1">
              <span className="rounded-full bg-surface-variant px-2 py-0.5 text-label-sm text-on-surface-variant">
                {formatRoleLabel(member.role)}
              </span>
              {member.jobStation && <JobStationBadge station={member.jobStation as JobStation} />}
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-body-md text-on-surface-variant">
          {stationLocked
            ? `No ${stationLabel?.toLowerCase()} staff yet. Ask your manager to add team members for this station.`
            : 'No team members yet. Ask your manager to add staff in Team settings.'}
        </p>
      )}

      <p className="text-center text-label-md text-on-surface-variant">
        Tap your name to start your shift
      </p>
    </div>
  );
}
