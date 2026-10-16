import type { MaintenanceValue } from '@roam/rush-settings';

const EMPTY: MaintenanceValue = { active: false, message: '', until: null };

export function MaintenanceEditor({
  value,
  onChange,
  readOnly,
  appLabel = 'the app',
}: {
  value: unknown;
  onChange: (next: MaintenanceValue) => void;
  readOnly?: boolean;
  appLabel?: string;
}) {
  const v: MaintenanceValue = {
    ...EMPTY,
    ...(typeof value === 'object' && value ? (value as MaintenanceValue) : {}),
  };

  const field = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white';

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={v.active}
          disabled={readOnly}
          onChange={(e) => onChange({ ...v, active: e.target.checked })}
        />
        Maintenance is on now
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-400">Message shown in {appLabel}</span>
        <textarea
          className={field}
          rows={3}
          value={v.message}
          disabled={readOnly}
          onChange={(e) => onChange({ ...v, message: e.target.value })}
          placeholder="We’re updating the app. Try again shortly."
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-400">Until (optional)</span>
        <input
          className={field}
          type="datetime-local"
          disabled={readOnly}
          value={v.until ? toLocalInput(v.until) : ''}
          onChange={(e) =>
            onChange({
              ...v,
              until: e.target.value ? new Date(e.target.value).toISOString() : null,
            })
          }
        />
      </label>
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Phone preview</p>
        <div className="mx-auto max-w-[220px] rounded-[1.5rem] border border-slate-700 bg-slate-900 p-4 text-center">
          <p className="text-sm font-medium text-white">{v.active ? 'Unavailable' : 'Open'}</p>
          <p className="mt-2 text-xs text-slate-400">
            {v.message || (v.active ? 'Maintenance is on.' : 'App works as normal.')}
          </p>
        </div>
      </div>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
