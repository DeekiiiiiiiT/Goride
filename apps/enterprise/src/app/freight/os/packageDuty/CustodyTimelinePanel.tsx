import { formatOpsWhen, formatOpsWhenTitle } from '@/app/freight/formatRelativeAge';

type Props = {
  scanEvents: Record<string, unknown>[];
};

export function CustodyTimelinePanel({ scanEvents }: Props) {
  return (
    <ol className="space-y-2">
      {scanEvents.length === 0 ? (
        <li className="text-sm text-slate-500">No scan events yet</li>
      ) : (
        scanEvents.map((ev) => {
          const iso = ev.occurred_at != null ? String(ev.occurred_at) : null;
          const when = formatOpsWhen(iso);
          const title = formatOpsWhenTitle(iso);
          return (
            <li key={String(ev.id)} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {String(ev.event_type || ev.note || 'Scan')}
                </p>
                {when ? (
                  <p className="text-xs text-slate-500" title={title}>
                    {when}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })
      )}
    </ol>
  );
}
