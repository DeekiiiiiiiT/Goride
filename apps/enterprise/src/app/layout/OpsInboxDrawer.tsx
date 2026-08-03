import { Link } from 'react-router-dom';
import {
  useMarkAlertRead,
  useMarkAllAlertsRead,
  useOpsAlerts,
} from '@/app/hooks/useLogistics';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function OpsInboxDrawer({ open, onClose }: Props) {
  const { data, isLoading, error } = useOpsAlerts();
  const markRead = useMarkAlertRead();
  const markAll = useMarkAllAlertsRead();
  const alerts = data?.alerts ?? [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close inbox backdrop"
        className="absolute inset-0 bg-slate-900/30"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Ops inbox</h2>
            <p className="text-xs text-slate-500">
              {data?.unreadCount ?? 0} unread
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={markAll.isPending}
              onClick={() => void markAll.mutateAsync()}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {error && (
            <p className="p-4 text-sm text-red-600">{(error as Error).message}</p>
          )}
          {!isLoading && alerts.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">No alerts yet.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {alerts.map((a) => {
              const unread = !a.read_at;
              const href = a.job_id
                ? `/app/dispatch?job=${String(a.job_id)}`
                : a.shipment_id
                  ? `/app/shipments/${String(a.shipment_id)}`
                  : null;
              return (
                <li
                  key={String(a.id)}
                  className={`px-4 py-3 ${unread ? 'bg-amber-50/40' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{String(a.title)}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{String(a.body)}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
                        {String(a.kind).replace(/_/g, ' ')} · {String(a.severity)}
                      </p>
                    </div>
                    {unread ? (
                      <button
                        type="button"
                        className="shrink-0 text-xs font-medium text-amber-800 underline-offset-2 hover:underline"
                        onClick={() => void markRead.mutateAsync(String(a.id))}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                  {href ? (
                    <Link
                      to={href}
                      onClick={() => {
                        if (unread) void markRead.mutateAsync(String(a.id));
                        onClose();
                      }}
                      className="mt-2 inline-block text-xs font-semibold text-amber-900 underline-offset-2 hover:underline"
                    >
                      Open
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
