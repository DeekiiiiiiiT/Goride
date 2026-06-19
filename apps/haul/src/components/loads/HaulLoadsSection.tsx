import React from 'react';
import { RideDispatchHome } from '@roam/driver-internals/components/rides/RideDispatchHome';
import { HaulScheduledLoadsPage } from './HaulScheduledLoadsPage';
import { HaulScheduledJobPreviewPage } from './HaulScheduledJobPreviewPage';
import { HaulActivityFeedPage } from './HaulActivityFeedPage';
import type { HaulScheduledJob } from '../../lib/haulScheduledJobs';

export type LoadsView = 'scheduled' | 'activity' | 'board';
export type LoadsRoute = LoadsView | 'preview';

type Props = {
  view: LoadsView;
  onViewChange: (view: LoadsView) => void;
  previewJob: HaulScheduledJob | null;
  onSelectJob: (job: HaulScheduledJob) => void;
  onClearPreview: () => void;
  onBrowseBoard: () => void;
};

function LoadsTabBar({ view, onViewChange }: { view: LoadsView; onViewChange: (v: LoadsView) => void }) {
  const tabs: { id: LoadsView; label: string }[] = [
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'activity', label: 'Activity' },
    { id: 'board', label: 'Load Board' },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const active = t.id === view;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onViewChange(t.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-[#ffc174]/15 text-[#ffc174] ring-1 ring-[#ffc174]/40'
                : 'text-[#d8c3ad] hover:bg-[#171f33] hover:text-[#dae2fd]'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function HaulLoadsSection({
  view,
  onViewChange,
  previewJob,
  onSelectJob,
  onClearPreview,
  onBrowseBoard,
}: Props) {
  if (previewJob) {
    return <HaulScheduledJobPreviewPage job={previewJob} onBack={onClearPreview} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <LoadsTabBar view={view} onViewChange={onViewChange} />
      {view === 'scheduled' ? (
        <HaulScheduledLoadsPage onSelectJob={onSelectJob} onBrowseBoard={onBrowseBoard} />
      ) : null}
      {view === 'activity' ? <HaulActivityFeedPage /> : null}
      {view === 'board' ? <RideDispatchHome embedded /> : null}
    </div>
  );
}

export function isLoadsFullscreen(route: LoadsRoute, previewJob: HaulScheduledJob | null): boolean {
  return route === 'preview' || previewJob !== null;
}
