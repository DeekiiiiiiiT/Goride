import { useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  defaultJobStationForRole,
  ROLE_DEFAULT_PERMISSIONS,
  TEAM_PERMISSIONS,
  TEAM_ROLE_OPTIONS,
  TeamMember,
  TeamPermission,
  TeamRole,
  JobStation,
} from '../../types/team';
import JobStationPicker from '../staff-ops/shared/JobStationPicker';
import TeamMemberPinSection from '../staff-ops/station/TeamMemberPinSection';

interface EditTeamMemberSheetProps {
  member: TeamMember;
  onClose: () => void;
  onSave: (updates: {
    role: TeamRole;
    permissions: TeamPermission[];
    name?: string;
    jobStation?: JobStation;
  }) => void;
  onResetPin?: (memberId: string) => void;
  isSaving?: boolean;
  isResettingPin?: boolean;
}

export default function EditTeamMemberSheet({
  member,
  onClose,
  onSave,
  onResetPin,
  isSaving = false,
  isResettingPin = false,
}: EditTeamMemberSheetProps) {
  const isRoster = member.loginType === 'roster';
  const [role, setRole] = useState<TeamRole>(member.role);
  const [name, setName] = useState(member.name);
  const [permissions, setPermissions] = useState<TeamPermission[]>(member.permissions);
  const [jobStation, setJobStation] = useState<JobStation>(
    member.jobStation ?? defaultJobStationForRole(member.role),
  );
  const [confirmReset, setConfirmReset] = useState(false);

  const handleRoleChange = (nextRole: TeamRole) => {
    setRole(nextRole);
    setPermissions(ROLE_DEFAULT_PERMISSIONS[nextRole]);
    setJobStation(defaultJobStationForRole(nextRole));
  };

  const togglePermission = (permission: TeamPermission) => {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((entry) => entry !== permission)
        : [...current, permission],
    );
  };

  const handleResetPin = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    onResetPin?.(member.id);
    setConfirmReset(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-surface p-inset-lg shadow-xl sm:rounded-xl">
        <div className="mb-inset-md flex items-center justify-between">
          <h2 className="text-headline-md font-bold text-on-background">Edit team member</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="space-y-inset-md">
          <div>
            <label className="text-label-md text-on-surface-variant" htmlFor="member-name">
              Name
            </label>
            <input
              id="member-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-inset-xs h-12 w-full rounded-lg border border-outline-variant px-4"
            />
          </div>

          {!isRoster && (
            <>
              <div>
                <label className="text-label-md text-on-surface-variant" htmlFor="member-role">
                  Role
                </label>
                <select
                  id="member-role"
                  value={role}
                  onChange={(event) => handleRoleChange(event.target.value as TeamRole)}
                  className="mt-inset-xs h-12 w-full rounded-lg border border-outline-variant px-4"
                >
                  {TEAM_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <JobStationPicker value={jobStation} onChange={setJobStation} />

              <div className="space-y-inset-sm">
                <h3 className="text-label-md text-on-surface-variant">Permissions</h3>
                {TEAM_PERMISSIONS.map((permission) => (
                  <label key={permission.id} className="flex items-center gap-inset-sm">
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission.id)}
                      onChange={() => togglePermission(permission.id)}
                    />
                    <span className="text-body-sm">{permission.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {isRoster && (
            <JobStationPicker
              value={jobStation}
              onChange={setJobStation}
              allowedStations={['counter', 'kitchen']}
            />
          )}

          {isRoster && onResetPin && (
            <div className="space-y-inset-sm">
              <TeamMemberPinSection
                pinStatus={member.pinStatus}
                onResetPin={handleResetPin}
                isResetting={isResettingPin}
              />
              {confirmReset && (
                <p className="text-body-sm text-on-surface-variant">
                  Tap Reset PIN again to confirm. Staff will need to create a new PIN on the store
                  tablet.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-inset-lg flex gap-inset-sm">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-lg border border-outline-variant"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() =>
              onSave({
                role: isRoster ? 'staff' : role,
                permissions: isRoster ? ['orders'] : permissions,
                name: name.trim() || member.name,
                jobStation,
              })
            }
            className="min-h-[48px] flex-1 rounded-lg bg-primary-container font-semibold text-on-primary"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
