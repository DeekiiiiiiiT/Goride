import { Link } from 'react-router-dom';
import { formatOldestLabel } from '@/app/freight/formatRelativeAge';

export type NeedsYouItem = {
  key: string;
  label: string;
  count: number;
  oldestAt: string | null;
  ageHours: number | null;
  href: string;
  actionLabel: string;
};

type Props = {
  items: NeedsYouItem[];
  canOpenHref?: (href: string) => boolean;
  showCreatePreAlert?: boolean;
};

/** Priority work strip for Overview (and compact reuse elsewhere). */
export function NeedsYouStrip({ items, canOpenHref, showCreatePreAlert }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-600">Nothing needs you right now.</p>
        {showCreatePreAlert ? (
          <Link
            to="/app/packages?tab=expected"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            Create pre-alert
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs you</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, idx) => {
          const clickable = canOpenHref ? canOpenHref(item.href) : true;
          const oldest = formatOldestLabel(item.oldestAt);
          const primary = idx === 0;
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.count} · {oldest ?? 'waiting'}
                  </p>
                </div>
                <span className="text-lg font-semibold tabular-nums text-slate-900">
                  {item.count}
                </span>
              </div>
              <p
                className={`mt-2 text-xs font-semibold ${
                  primary ? 'text-amber-950' : 'text-amber-800'
                }`}
              >
                {item.actionLabel} →
              </p>
            </>
          );
          const className = `rounded-xl border px-4 py-3 text-left transition ${
            primary
              ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200'
              : 'border-slate-200 bg-white'
          } ${clickable ? 'hover:ring-2 hover:ring-amber-300' : 'opacity-60'}`;

          if (clickable) {
            return (
              <Link key={item.key} to={item.href} className={className}>
                {body}
              </Link>
            );
          }
          return (
            <div key={item.key} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
