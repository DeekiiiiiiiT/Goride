type Props = {
  scanEvents: Record<string, unknown>[];
};

export function CustodyTimelinePanel({ scanEvents }: Props) {
  return (
    <ol className="space-y-3">
      {scanEvents.length === 0 ? (
        <li className="text-sm text-slate-500">No scan events yet</li>
      ) : (
        scanEvents.map((ev) => (
          <li key={String(ev.id)} className="flex gap-3 text-sm">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <div>
              <p className="font-medium text-slate-900">
                {String(ev.event_type || ev.note || 'Scan')}
              </p>
              <p className="font-mono text-xs text-slate-500">{String(ev.occurred_at || '')}</p>
            </div>
          </li>
        ))
      )}
    </ol>
  );
}
