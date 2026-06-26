import { useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import JobStationPicker from '../staff-ops/shared/JobStationPicker';
import {
  defaultJobStationForRole,
  jobStationFromApi,
  jobStationSelectionToApi,
  resolveAllowedJobStations,
  ROLE_DEFAULT_PERMISSIONS,
  STATION_LABELS,
  TEAM_PERMISSIONS,
  TEAM_ROLE_OPTIONS,
  type JobStation,
  type JobStationSelection,
  type TeamPermission,
  type TeamRole,
} from '../../types/team';

interface AddTeamMemberPanelProps {
  pinSignInEnabled: boolean;
  inStoreEnabled?: boolean;
  onAddRoster: (payload: {
    name: string;
    role: 'staff' | 'manager';
    jobStation: ReturnType<typeof jobStationSelectionToApi>;
    displayTitle?: string | null;
  }) => void;
  onSendInvite: (payload: {
    email: string;
    name?: string;
    role: TeamRole;
    permissions: TeamPermission[];
    jobStation: ReturnType<typeof jobStationSelectionToApi>;
    displayTitle?: string | null;
  }) => boolean;
  isSaving?: boolean;
  venueOpsV2?: boolean;
}

const inputClass =
  'h-12 w-full rounded-lg border border-outline-variant bg-transparent px-4 text-body-lg text-on-background outline-none transition-colors placeholder:text-on-surface-variant/50 focus:border-primary-container focus:ring-1 focus:ring-primary-container';

const ROLE_HINTS: Record<TeamRole, string> = {
  staff: 'Signs in with a PIN on the store tablet. No email needed.',
  manager: 'Signs in with a PIN on the store tablet, then gets the full manager dashboard.',
  admin: 'Receives an email invite for full back-office access on any device.',
};

export default function AddTeamMemberPanel({
  pinSignInEnabled,
  inStoreEnabled = false,
  onAddRoster,
  onSendInvite,
  isSaving = false,
  venueOpsV2 = false,
}: AddTeamMemberPanelProps) {
  const [name, setName] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('staff');
  const [jobStation, setJobStation] = useState<JobStationSelection>('none');
  const [permissions, setPermissions] = useState<TeamPermission[]>(ROLE_DEFAULT_PERMISSIONS.staff);

  const usesEmail = !pinSignInEnabled || role === 'admin';
  const usesPin = pinSignInEnabled && (role === 'staff' || role === 'manager');
  const allowedStations = resolveAllowedJobStations({ venueOpsV2, inStoreEnabled });
  const permissionOptions = inStoreEnabled
    ? TEAM_PERMISSIONS
    : TEAM_PERMISSIONS.filter((entry) => entry.id !== 'inventory');

  const handleRoleChange = (nextRole: TeamRole) => {
    setRole(nextRole);
    setPermissions(ROLE_DEFAULT_PERMISSIONS[nextRole]);
    setJobStation(jobStationFromApi(defaultJobStationForRole(nextRole)));
  };

  const togglePermission = (permission: TeamPermission) => {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((entry) => entry !== permission)
        : [...current, permission],
    );
  };

  const resetForm = () => {
    setName('');
    setDisplayTitle('');
    setEmail('');
    setRole('staff');
    setJobStation('none');
    setPermissions(ROLE_DEFAULT_PERMISSIONS.staff);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const station = jobStationSelectionToApi(jobStation);

    const title = venueOpsV2 ? displayTitle.trim() || null : undefined;

    if (usesPin) {
      if (!trimmedName) return;
      onAddRoster({
        name: trimmedName,
        role: role as 'staff' | 'manager',
        jobStation: station,
        displayTitle: title,
      });
      resetForm();
      return;
    }

    const sent = onSendInvite({
      email,
      name: trimmedName || undefined,
      role,
      permissions,
      jobStation: station,
      displayTitle: title,
    });
    if (sent) resetForm();
  };

  const canSubmit = usesPin ? !!name.trim() : !!email.trim();

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm"
    >
      <div>
        <h2 className="text-headline-md font-bold text-on-background">Add team member</h2>
        <p className="mt-inset-xs text-body-sm text-on-surface-variant">
          Choose a role, optionally assign a station, then add them in one step.
        </p>
      </div>

      <div className="space-y-inset-xs">
        <label className="block text-label-md text-on-surface-variant" htmlFor="team-member-name">
          {usesPin ? 'Full name' : 'Name (optional)'}
        </label>
        <input
          id="team-member-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Team member name"
          className={inputClass}
          required={usesPin}
        />
      </div>

      <div className="space-y-inset-sm">
        <p className="text-label-md text-on-surface-variant">Role</p>
        <div className="grid grid-cols-3 gap-inset-xs">
          {TEAM_ROLE_OPTIONS.map((option) => {
            const selected = role === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleRoleChange(option.value)}
                className={`min-h-[48px] rounded-lg border px-3 py-2 text-label-lg font-semibold transition-colors ${
                  selected
                    ? 'border-primary-container bg-primary-container text-on-primary-container'
                    : 'border-outline-variant bg-surface text-on-surface-variant'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-body-sm text-on-surface-variant">{ROLE_HINTS[role]}</p>
      </div>

      {usesEmail && (
        <div className="space-y-inset-xs">
          <label className="block text-label-md text-on-surface-variant" htmlFor="team-member-email">
            Email address
          </label>
          <input
            id="team-member-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="colleague@restaurant.com"
            className={inputClass}
            required
          />
        </div>
      )}

      {venueOpsV2 && (
        <div className="space-y-inset-xs">
          <label className="block text-label-md text-on-surface-variant" htmlFor="team-display-title">
            Display title (optional)
          </label>
          <input
            id="team-display-title"
            value={displayTitle}
            onChange={(event) => setDisplayTitle(event.target.value)}
            placeholder="e.g. Line Cook"
            className={inputClass}
          />
        </div>
      )}

      {venueOpsV2 ? (
        <div className="space-y-inset-xs">
          <label className="block text-label-md text-on-surface-variant" htmlFor="team-job-station">
            Job station
          </label>
          <select
            id="team-job-station"
            value={jobStation}
            onChange={(event) => setJobStation(event.target.value as JobStationSelection)}
            className={inputClass}
          >
            <option value="none">No station</option>
            {allowedStations.map((station) => (
              <option key={station} value={station}>
                {STATION_LABELS[station]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <JobStationPicker
          value={jobStation}
          onChange={setJobStation}
          allowedStations={allowedStations}
        />
      )}

      {!pinSignInEnabled && (
        <div className="space-y-inset-sm border-t border-outline-variant pt-inset-md">
          <h4 className="text-label-md text-on-surface-variant">Permissions</h4>
          <div className="grid grid-cols-1 gap-inset-sm sm:grid-cols-2">
            {permissionOptions.map((permission) => (
              <label
                key={permission.id}
                className="flex min-h-[48px] cursor-pointer items-center gap-inset-sm rounded-lg border border-outline-variant p-3 transition-colors hover:bg-surface-variant"
              >
                <input
                  type="checkbox"
                  checked={permissions.includes(permission.id)}
                  onChange={() => togglePermission(permission.id)}
                  className="h-5 w-5 rounded border-outline-variant text-primary-container focus:ring-2 focus:ring-primary-container focus:ring-offset-2"
                />
                <span className="text-body-sm text-on-background">{permission.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isSaving || !canSubmit}
        className="flex min-h-[48px] w-full items-center justify-center gap-inset-xs rounded-full bg-primary-container px-inset-lg text-label-lg font-semibold text-on-primary-container disabled:opacity-50"
      >
        {isSaving ? (
          'Saving…'
        ) : usesPin ? (
          <>
            <MaterialIcon name="pin" size={20} />
            Add team member
          </>
        ) : (
          <>
            <MaterialIcon name="send" size={20} />
            Send invite
          </>
        )}
      </button>
    </form>
  );
}
