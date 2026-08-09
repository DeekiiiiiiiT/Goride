import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  compactSectionOverrides,
  ENTERPRISE_ACCESS_SECTIONS,
  ENTERPRISE_INVITABLE_ROLES,
  effectiveSectionAccess,
  resolveEnterpriseSeatRole,
  type EnterpriseAccessSection,
  type EnterpriseSeatRole,
  type EnterpriseSectionOverrides,
} from '@roam/auth-client';
import { Copy, Shield, UserPlus } from 'lucide-react';
import { useAuth } from '@/app/auth/AuthProvider';
import { useSeatAccess } from '@/app/seats/SeatAccessProvider';
import { teamService, type TeamMember } from '@/app/services/teamService';

const ROLE_LABELS: Record<string, { label: string; description: string }> = {
  enterprise_owner: {
    label: 'Owner',
    description: 'Full access, including Team management',
  },
  ...Object.fromEntries(
    ENTERPRISE_INVITABLE_ROLES.map((r) => [
      r.value,
      { label: r.label, description: r.description },
    ]),
  ),
  fleet_owner: { label: 'Owner', description: 'Full access' },
  admin: { label: 'Owner', description: 'Full access' },
};

function roleDisplay(role: string) {
  return (
    ROLE_LABELS[role] || {
      label: role.replace(/^enterprise_/, '').replace(/_/g, ' '),
      description: '',
    }
  );
}

function SectionAccessEditor({
  role,
  value,
  onChange,
  disabled,
}: {
  role: EnterpriseSeatRole;
  value: Record<EnterpriseAccessSection, boolean>;
  onChange: (next: Record<EnterpriseAccessSection, boolean>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ENTERPRISE_ACCESS_SECTIONS.map((s) => (
        <label
          key={s.key}
          className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2 text-sm ${
            value[s.key]
              ? 'border-amber-200 bg-amber-50/60'
              : 'border-slate-200 bg-white'
          } ${disabled ? 'opacity-60' : ''}`}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={value[s.key]}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [s.key]: e.target.checked })}
          />
          <span>
            <span className="font-medium text-slate-900">{s.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{s.description}</span>
          </span>
        </label>
      ))}
      <p className="sm:col-span-2 text-xs text-slate-500">
        Defaults follow the {roleDisplay(role).label} role. Uncheck or check boxes to customize
        this person.
      </p>
    </div>
  );
}

export function EnterpriseTeamPage() {
  const { organizationId, session } = useAuth();
  const { can } = useSeatAccess();
  const canManage = can('ops.team.manage');
  const qc = useQueryClient();

  const membersQ = useQuery({
    queryKey: ['enterprise', 'team', organizationId],
    queryFn: () => teamService.listMembers(organizationId),
    enabled: Boolean(session && canManage),
  });

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'enterprise_warehouse' as EnterpriseSeatRole,
  });
  const [inviteSections, setInviteSections] = useState(() =>
    effectiveSectionAccess('enterprise_warehouse', {}),
  );
  const [inviteResult, setInviteResult] =
    useState<{ name: string; email: string; temporaryPassword: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [accessEditorId, setAccessEditorId] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setInviteSections(effectiveSectionAccess(form.role, {}));
  }, [form.role]);

  const inviteMut = useMutation({
    mutationFn: () => {
      const sectionOverrides = compactSectionOverrides(form.role, inviteSections);
      return teamService.invite(
        {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          sectionOverrides,
        },
        organizationId,
      );
    },
    onSuccess: (res) => {
      setInviteResult({
        name: form.name.trim(),
        email: form.email.trim(),
        temporaryPassword: res.temporaryPassword,
      });
      setForm({ name: '', email: '', role: 'enterprise_warehouse' });
      setInviteSections(effectiveSectionAccess('enterprise_warehouse', {}));
      setFormError(null);
      void qc.invalidateQueries({ queryKey: ['enterprise', 'team'] });
    },
    onError: (err) => setFormError((err as Error).message),
  });

  const accessMut = useMutation({
    mutationFn: ({
      id,
      role,
      sectionOverrides,
    }: {
      id: string;
      role: string;
      sectionOverrides: EnterpriseSectionOverrides;
    }) => teamService.updateAccess(id, { role, sectionOverrides }, organizationId),
    onSuccess: (res) => {
      setAccessMessage(res.message);
      setAccessEditorId(null);
      void qc.invalidateQueries({ queryKey: ['enterprise', 'team'] });
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => teamService.remove(id, organizationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['enterprise', 'team'] }),
  });

  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.email.trim()) {
      setFormError('Name and email are required.');
      return;
    }
    await inviteMut.mutateAsync();
  }

  async function copyPassword() {
    if (!inviteResult?.temporaryPassword) return;
    await navigator.clipboard.writeText(inviteResult.temporaryPassword);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Only organization owners can manage Team members.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          Invite people who work for your company. Pick a role, then choose which sections they can
          open.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Invite teammate</h2>
        </div>

        {inviteResult ? (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-900">
              {inviteResult.name} invited
            </p>
            <p className="text-sm text-emerald-900/90">
              Share this temporary password with them (shown once):
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-white px-3 py-1.5 font-mono text-sm text-slate-900 ring-1 ring-emerald-200">
                {inviteResult.temporaryPassword}
              </code>
              <button
                type="button"
                onClick={() => void copyPassword()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-emerald-800">Login email: {inviteResult.email}</p>
            <button
              type="button"
              onClick={() => setInviteResult(null)}
              className="text-xs font-semibold text-emerald-900 underline-offset-2 hover:underline"
            >
              Invite another person
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void onInvite(e)} className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Full name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Email
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              Role
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as EnterpriseSeatRole })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {ENTERPRISE_INVITABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.description}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium text-slate-800">Sections they can see</p>
              <SectionAccessEditor
                role={form.role}
                value={inviteSections}
                onChange={setInviteSections}
                disabled={inviteMut.isPending}
              />
            </div>
            {formError && (
              <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={inviteMut.isPending}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
              >
                {inviteMut.isPending ? 'Inviting…' : 'Send invite'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Shield className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Team members</h2>
        </div>
        {accessMessage && (
          <p className="m-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            {accessMessage}
          </p>
        )}
        {membersQ.isLoading && (
          <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
        )}
        {membersQ.error && (
          <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {(membersQ.error as Error).message}
          </p>
        )}
        {!membersQ.isLoading && !members.length && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            No team members yet. Invite someone to get started.
          </p>
        )}
        {members.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Member</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Access</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Last active</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    editing={accessEditorId === m.id}
                    busy={accessMut.isPending || removeMut.isPending}
                    onToggleEdit={() =>
                      setAccessEditorId((id) => (id === m.id ? null : m.id))
                    }
                    onSaveAccess={(role, sectionOverrides) =>
                      accessMut.mutate({ id: m.id, role, sectionOverrides })
                    }
                    onRemove={() => {
                      if (
                        window.confirm(
                          `Remove ${m.name || m.email} from your team? They will lose access.`,
                        )
                      ) {
                        removeMut.mutate(m.id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(accessMut.error || removeMut.error) && (
          <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {((accessMut.error || removeMut.error) as Error).message}
          </p>
        )}
      </section>
    </div>
  );
}

function MemberRow({
  member,
  editing,
  busy,
  onToggleEdit,
  onSaveAccess,
  onRemove,
}: {
  member: TeamMember;
  editing: boolean;
  busy: boolean;
  onToggleEdit: () => void;
  onSaveAccess: (role: string, sectionOverrides: EnterpriseSectionOverrides) => void;
  onRemove: () => void;
}) {
  const display = roleDisplay(member.role);
  const seatRole = resolveEnterpriseSeatRole(member.isOwner ? 'enterprise_owner' : member.role);
  const [draftRole, setDraftRole] = useState(
    ENTERPRISE_INVITABLE_ROLES.some((r) => r.value === member.role)
      ? (member.role as EnterpriseSeatRole)
      : ('enterprise_viewer' as EnterpriseSeatRole),
  );
  const [draftSections, setDraftSections] = useState(
    () =>
      member.effectiveSections ??
      effectiveSectionAccess(seatRole, member.sectionOverrides ?? {}),
  );

  useEffect(() => {
    if (!editing) return;
    const nextRole = ENTERPRISE_INVITABLE_ROLES.some((r) => r.value === member.role)
      ? (member.role as EnterpriseSeatRole)
      : 'enterprise_viewer';
    setDraftRole(nextRole);
    setDraftSections(
      member.effectiveSections ??
        effectiveSectionAccess(
          resolveEnterpriseSeatRole(member.role),
          member.sectionOverrides ?? {},
        ),
    );
  }, [editing, member]);

  return (
    <>
      <tr className="border-b border-slate-50">
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900">{member.name}</div>
          <div className="text-xs text-slate-500">{member.email}</div>
        </td>
        <td className="px-4 py-3">
          {member.isOwner ? (
            <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
              {display.label}
            </span>
          ) : (
            <span className="text-sm text-slate-800">{display.label}</span>
          )}
          {member.accessCustomized && !member.isOwner && (
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Customized
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-slate-600">
          {member.isOwner
            ? 'All sections'
            : Object.entries(member.effectiveSections ?? {})
                .filter(([, on]) => on)
                .map(([k]) => ENTERPRISE_ACCESS_SECTIONS.find((s) => s.key === k)?.label || k)
                .join(', ') || 'None'}
        </td>
        <td className="px-4 py-3 text-slate-600">{member.status}</td>
        <td className="px-4 py-3 text-slate-600">{member.lastActive}</td>
        <td className="px-4 py-3">
          {!member.isOwner && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onToggleEdit}
                className="text-xs font-semibold text-amber-800 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {editing ? 'Close' : 'Edit access'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onRemove}
                className="text-xs font-semibold text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          )}
        </td>
      </tr>
      {editing && !member.isOwner && (
        <tr className="border-b border-slate-100 bg-slate-50/80">
          <td colSpan={6} className="px-4 py-4">
            <div className="space-y-3">
              <label className="block max-w-md text-sm">
                Role
                <select
                  value={draftRole}
                  disabled={busy}
                  onChange={(e) => {
                    const role = e.target.value as EnterpriseSeatRole;
                    setDraftRole(role);
                    setDraftSections(effectiveSectionAccess(role, {}));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {ENTERPRISE_INVITABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <SectionAccessEditor
                role={draftRole}
                value={draftSections}
                onChange={setDraftSections}
                disabled={busy}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onSaveAccess(draftRole, compactSectionOverrides(draftRole, draftSections))
                  }
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Save access'}
                </button>
                <p className="text-xs text-slate-500">
                  They may need to sign out and back in before the menu updates.
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
