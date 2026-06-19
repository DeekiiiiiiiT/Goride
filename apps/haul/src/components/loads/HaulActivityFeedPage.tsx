import React, { useState } from 'react';
import { DEMO_ACTIVITY_FEED, type ActivityFilter } from '../../lib/haulActivityFeed';
import { HaulPullToRefresh } from '../ui/HaulPullToRefresh';
import { HaulEmptyState } from '../ui/HaulEmptyState';

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

export function HaulActivityFeedPage() {
  const [filter, setFilter] = useState<ActivityFilter>('active');
  const [refreshKey, setRefreshKey] = useState(0);

  const entries = DEMO_ACTIVITY_FEED.filter((e) => e.filter === filter);

  return (
    <HaulPullToRefresh onRefresh={() => setRefreshKey((k) => k + 1)} className="flex flex-col gap-6">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-[#dae2fd] md:text-[40px]">Activity Feed</h1>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`flex h-11 shrink-0 items-center justify-center rounded-full px-6 text-sm font-medium transition-colors ${
                active
                  ? 'border border-[#ffc174] bg-[#2d3449] text-[#ffc174] shadow-[0_0_15px_rgba(255,193,116,0.1)]'
                  : 'border border-[#534434] bg-[#171f33] text-[#d8c3ad] hover:bg-[#222a3d] hover:text-[#dae2fd]'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {entries.length === 0 ? (
        <HaulEmptyState icon="timeline" title="No activity" description={`No ${filter} activity to show.`} />
      ) : (
        <div key={refreshKey} className="relative ml-2 space-y-8 border-l border-[#534434] pl-8 before:absolute before:top-0 before:bottom-0 before:-left-px before:w-0.5 before:bg-gradient-to-b before:from-[#ffc174] before:via-[#534434] before:to-transparent">
          {entries.map((entry, idx) => (
            <div key={entry.id} className="relative">
              <div
                className={`absolute top-1 flex items-center justify-center rounded-full bg-[#0b1326] ${
                  entry.highlight
                    ? '-left-[43px] h-5 w-5 border-2 border-[#ffc174] shadow-[0_0_10px_rgba(255,193,116,0.4)]'
                    : '-left-[41px] h-4 w-4 border-2 border-[#534434]'
                }`}
                style={entry.iconColor && !entry.highlight ? { borderColor: entry.iconColor } : undefined}
              >
                {entry.highlight ? <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[#ffc174]" /> : null}
              </div>

              <div
                className={`rounded-xl border p-4 transition-colors md:p-6 ${
                  entry.highlight
                    ? 'border-[#ffc174]/50 bg-[#171f33] shadow-lg hover:bg-[#222a3d]'
                    : idx % 2 === 1
                      ? 'border-[#534434] bg-[#131b2e] hover:border-[#a08e7a]'
                      : 'border-[#534434] bg-[#171f33] hover:border-[#a08e7a]'
                }`}
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="material-symbols-outlined"
                      style={{
                        color: entry.iconColor ?? (entry.highlight ? '#ffc174' : '#d8c3ad'),
                        fontVariationSettings: entry.iconFill ? "'FILL' 1" : "'FILL' 0",
                      }}
                    >
                      {entry.icon}
                    </span>
                    <h3 className={`text-lg font-semibold ${entry.highlight ? 'text-[#dae2fd]' : 'text-[#d8c3ad]'}`}>
                      {entry.title}
                    </h3>
                  </div>
                  {entry.badge ? (
                    <span className="rounded-md bg-[#ffc174]/10 px-2 py-1 text-sm text-[#ffc174]">{entry.badge}</span>
                  ) : (
                    <span className="text-sm text-[#d8c3ad] opacity-60">{entry.timestamp}</span>
                  )}
                </div>
                <p className="leading-relaxed text-[#d8c3ad]">{entry.body}</p>
                {entry.footer ? (
                  <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-[#534434]/50 pt-3 text-sm text-[#d8c3ad]">
                    {entry.footer.map((f) => (
                      <div
                        key={f.label}
                        className={`flex items-center gap-1 ${f.action ? 'cursor-pointer text-[#ffc174] hover:underline' : ''}`}
                      >
                        <span className="material-symbols-outlined text-lg">{f.icon}</span>
                        <span>{f.label}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          <div className="relative pt-4">
            <div className="absolute top-4 -left-[35px] h-2 w-2 rounded-full bg-[#534434]" />
            <p className="ml-2 text-sm text-[#d8c3ad] opacity-50">End of recent activity</p>
          </div>
        </div>
      )}
    </HaulPullToRefresh>
  );
}
