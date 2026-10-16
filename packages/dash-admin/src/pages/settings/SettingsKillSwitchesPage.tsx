import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  changeAdminSetting,
  listAdminSettings,
  type AdminSettingRow,
} from '@roam/dash-admin-client';
import { SETTINGS_BY_KEY } from '@roam/rush-settings';
import { getJwtRoles } from '@roam/auth-client';
import { EntityDrawer } from '../../components/ui/bits';
import { KILL_SWITCH_KEYS } from './nav';
import { canEditSetting, formatSettingValue, labelForKey, relativeTime } from './settingsFormat';
import type { SettingsOutletContext } from './SettingsLayout';

export function SettingsKillSwitchesPage() {
  const { session, setPendingCount } = useOutletContext<SettingsOutletContext>();
  const roles = getJwtRoles(session.user);

  const [rows, setRows] = useState<AdminSettingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<AdminSettingRow | null>(null);
  const [nextValue, setNextValue] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload() {
    const list = await listAdminSettings(session.access_token);
    setRows(list.settings);
    setPendingCount(list.pending.length);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load kill switches.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.access_token, setPendingCount]);

  const switches = useMemo(() => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return KILL_SWITCH_KEYS.map((key) => {
      const def = SETTINGS_BY_KEY.get(key);
      const row = byKey.get(key);
      return {
        key,
        def,
        row,
        value: Boolean(row?.value ?? def?.default ?? false),
      };
    }).filter((s) => s.def);
  }, [rows]);

  function openToggle(row: AdminSettingRow | undefined, key: string, current: boolean) {
    const def = SETTINGS_BY_KEY.get(key);
    if (!def || !canEditSetting(roles, key)) return;
    const synthetic: AdminSettingRow =
      row ??
      ({
        key,
        app: def.app,
        section: def.section,
        kind: def.kind,
        default: def.default,
        scopes: def.scopes,
        clientVisible: def.clientVisible,
        risk: def.risk,
        envOverride: def.envOverride ?? null,
        onReadError: def.onReadError,
        value: def.default,
        version: 0,
        scope: 'platform',
        scope_id: null,
        updated_by: null,
        updated_at: null,
        source: 'default',
        envActive: false,
      } as AdminSettingRow);
    setTarget(synthetic);
    setNextValue(!current);
    setReason('');
  }

  async function confirm() {
    if (!target) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error('A reason is required.');
      return;
    }
    setSaving(true);
    try {
      const result = await changeAdminSetting(session.access_token, {
        key: target.key,
        value: nextValue,
        reason: trimmed,
        scope: 'platform',
        expected_version: target.version,
      });
      await reload();
      setTarget(null);
      toast.success(
        result.status === 'pending'
          ? 'Sent to Approvals — needs a second person.'
          : nextValue
            ? 'Turned on.'
            : 'Turned off.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Kill switches</h2>
        <p className="text-sm text-slate-400">
          One list for the switches that stop orders, money, or matching. Turning one off asks why.
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
        {switches.map(({ key, def, row, value }) => (
          <li key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-100">{labelForKey(key)}</p>
              <p className="text-xs text-slate-400">{def?.help}</p>
              <p className="mt-1 text-xs text-slate-500">
                {def?.app}
                {row?.updated_at ? ` · Last change ${relativeTime(row.updated_at)}` : ''}
              </p>
              {row?.envActive && row.envOverride ? (
                <p className="mt-1 text-xs text-amber-300">Env override: {row.envOverride}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${value ? 'text-emerald-300' : 'text-red-300'}`}>
                {formatSettingValue(value, def)}
              </span>
              {canEditSetting(roles, key) ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-900"
                  onClick={() => openToggle(row, key, value)}
                >
                  {value ? 'Turn off' : 'Turn on'}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <EntityDrawer
        open={Boolean(target)}
        title={target ? labelForKey(target.key) : 'Kill switch'}
        onClose={() => setTarget(null)}
      >
        {target ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Switch to <strong className="text-white">{nextValue ? 'On' : 'Off'}</strong>.
              {!nextValue ? ' List what stops working in the reason.' : ''}
            </p>
            <p className="text-xs text-slate-500">{SETTINGS_BY_KEY.get(target.key)?.help}</p>
            <label className="block space-y-1 text-sm">
              <span className="text-slate-400">Reason (required)</span>
              <textarea
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why, and what this affects"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              className="w-full rounded-lg bg-amber-500/20 py-2 text-sm font-medium text-amber-200 disabled:opacity-50"
              onClick={() => void confirm()}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        ) : null}
      </EntityDrawer>
    </div>
  );
}
