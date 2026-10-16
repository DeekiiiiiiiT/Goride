import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { listSettingHistory, undoSettingChange, type SettingChangeRow } from '@roam/dash-admin-client';
import { ALL_SETTINGS } from '@roam/rush-settings';
import { getJwtRoles } from '@roam/auth-client';
import { EntityDrawer } from '../../components/ui/bits';
import { canEditSetting, formatSettingValue, labelForKey, relativeTime, defForKey } from './settingsFormat';
import type { SettingsOutletContext } from './SettingsLayout';

export function SettingsHistoryPage() {
  const { session } = useOutletContext<SettingsOutletContext>();
  const roles = getJwtRoles(session.user);

  const [rows, setRows] = useState<SettingChangeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [appFilter, setAppFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [undoRow, setUndoRow] = useState<SettingChangeRow | null>(null);
  const [reason, setReason] = useState('Undo');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSettingHistory(session.access_token, { limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setRows(res.history);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load history.');
      });
    return () => {
      cancelled = true;
    };
  }, [session.access_token]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const def = defForKey(row.key);
      if (appFilter && def?.app !== appFilter) return false;
      if (sectionFilter && def?.section !== sectionFilter) return false;
      return true;
    });
  }, [rows, appFilter, sectionFilter]);

  const sections = useMemo(() => {
    const set = new Set(ALL_SETTINGS.map((s) => s.section));
    return [...set].sort();
  }, []);

  async function confirmUndo() {
    if (!undoRow) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error('A reason is required.');
      return;
    }
    setSaving(true);
    try {
      const result = await undoSettingChange(session.access_token, {
        change_id: undoRow.id,
        reason: trimmed,
      });
      const hist = await listSettingHistory(session.access_token, { limit: 100 });
      setRows(hist.history);
      setUndoRow(null);
      toast.success(
        result.status === 'pending'
          ? 'Undo sent to Approvals (high-risk).'
          : 'Undone.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Undo failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Change history</h2>
        <p className="text-sm text-slate-400">Who changed what, why, and undo in one click.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          value={appFilter}
          onChange={(e) => setAppFilter(e.target.value)}
        >
          <option value="">All apps</option>
          <option value="platform">Shared</option>
          <option value="customer">Roam Rush</option>
          <option value="courier">Courier</option>
          <option value="partner">Partner</option>
        </select>
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
        >
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <ul className="space-y-2">
        {filtered.length === 0 ? (
          <li className="text-sm text-slate-500">No matching changes.</li>
        ) : (
          filtered.map((row) => {
            const def = defForKey(row.key);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-800 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-100">{labelForKey(row.key)}</p>
                  <p className="text-slate-400">
                    {formatSettingValue(row.old_value, def)} → {formatSettingValue(row.new_value, def)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {relativeTime(row.created_at)}
                    {row.reason ? ` · “${row.reason}”` : ''}
                  </p>
                </div>
                {canEditSetting(roles, row.key) && row.old_value != null ? (
                  <button
                    type="button"
                    className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-900"
                    onClick={() => {
                      setReason(`Undo: ${row.reason || labelForKey(row.key)}`);
                      setUndoRow(row);
                    }}
                  >
                    Undo
                  </button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>

      <EntityDrawer open={Boolean(undoRow)} title="Undo change" onClose={() => setUndoRow(null)}>
        {undoRow ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Restore {labelForKey(undoRow.key)} to{' '}
              {formatSettingValue(undoRow.old_value, defForKey(undoRow.key))}.
            </p>
            <label className="block space-y-1 text-sm">
              <span className="text-slate-400">Reason</span>
              <textarea
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={saving}
              className="w-full rounded-lg bg-amber-500/20 py-2 text-sm font-medium text-amber-200 disabled:opacity-50"
              onClick={() => void confirmUndo()}
            >
              {saving ? 'Working…' : 'Undo'}
            </button>
          </div>
        ) : null}
      </EntityDrawer>
    </div>
  );
}
