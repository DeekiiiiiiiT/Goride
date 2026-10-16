import type { AnnouncementList } from '@roam/rush-settings';

type Item = AnnouncementList[number];

function newItem(): Item {
  return {
    id: crypto.randomUUID(),
    type: 'info',
    message: '',
    dismissible: true,
    startAt: null,
    endAt: null,
  };
}

export function AnnouncementsEditor({
  value,
  onChange,
  readOnly,
}: {
  value: unknown;
  onChange: (next: AnnouncementList) => void;
  readOnly?: boolean;
}) {
  const list: AnnouncementList = Array.isArray(value) ? (value as AnnouncementList) : [];
  const field = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white';

  function update(index: number, patch: Partial<Item>) {
    onChange(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function remove(index: number) {
    onChange(list.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">No banners yet.</p>
      ) : (
        list.map((item, index) => {
          const status = bannerStatus(item);
          return (
            <div key={item.id} className="space-y-2 rounded-xl border border-slate-800 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(status)}`}>{status}</span>
                {!readOnly && (
                  <button type="button" className="text-xs text-red-300" onClick={() => remove(index)}>
                    Remove
                  </button>
                )}
              </div>
              <select
                className={field}
                disabled={readOnly}
                value={item.type}
                onChange={(e) => update(index, { type: e.target.value as Item['type'] })}
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
              <textarea
                className={field}
                rows={2}
                disabled={readOnly}
                value={item.message}
                onChange={(e) => update(index, { message: e.target.value })}
                placeholder="Banner message"
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={item.dismissible}
                  disabled={readOnly}
                  onChange={(e) => update(index, { dismissible: e.target.checked })}
                />
                People can dismiss it
              </label>
            </div>
          );
        })
      )}
      {!readOnly && (
        <button
          type="button"
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
          onClick={() => onChange([...list, newItem()])}
        >
          Add banner
        </button>
      )}
    </div>
  );
}

function bannerStatus(item: Item): 'Scheduled' | 'Live' | 'Ended' | 'Draft' {
  if (!item.message.trim()) return 'Draft';
  const now = Date.now();
  const start = item.startAt ? new Date(item.startAt).getTime() : null;
  const end = item.endAt ? new Date(item.endAt).getTime() : null;
  if (end != null && end < now) return 'Ended';
  if (start != null && start > now) return 'Scheduled';
  return 'Live';
}

function statusClass(status: string): string {
  if (status === 'Live') return 'bg-emerald-500/15 text-emerald-300';
  if (status === 'Scheduled') return 'bg-amber-500/15 text-amber-300';
  if (status === 'Ended') return 'bg-slate-700 text-slate-300';
  return 'bg-slate-800 text-slate-400';
}
