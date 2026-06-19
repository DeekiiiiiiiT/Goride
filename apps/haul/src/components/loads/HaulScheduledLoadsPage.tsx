import React, { useMemo, useState } from 'react';
import {
  buildDemoScheduledJobs,
  datesWithJobs,
  formatScheduledDateTime,
  formatScheduledEarnings,
  jobsForDate,
  type HaulScheduledJob,
} from '../../lib/haulScheduledJobs';
import { HaulEmptyState } from '../ui/HaulEmptyState';

type Props = {
  jobs?: HaulScheduledJob[];
  onSelectJob: (job: HaulScheduledJob) => void;
  onBrowseBoard: () => void;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function ScheduledJobCard({ job, onClick }: { job: HaulScheduledJob; onClick: () => void }) {
  const confirmed = job.status === 'confirmed';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-full flex-col overflow-hidden rounded-xl border border-[#534434] bg-[#171f33] text-left transition-colors hover:border-[#a08e7a] ${
        confirmed ? '' : 'opacity-90 hover:opacity-100'
      }`}
    >
      <div
        className={`absolute top-0 left-0 h-full w-1 transition-colors ${
          confirmed ? 'bg-[#ffc174] group-hover:bg-[#ffddb8]' : 'bg-[#2d3449] group-hover:bg-[#534434]'
        }`}
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div className={`flex items-center gap-2 ${confirmed ? 'text-[#ffc174]' : 'text-[#dae2fd]'}`}>
            <span
              className="material-symbols-outlined"
              style={confirmed ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              schedule
            </span>
            <span className="text-lg font-semibold">{formatScheduledDateTime(job.scheduledAt)}</span>
          </div>
          <span
            className={`rounded-md border px-2 py-1 text-[10px] font-medium tracking-wider uppercase ${
              confirmed
                ? 'border-[#534434] bg-[#2d3449] text-[#d8c3ad]'
                : 'border-[#534434] bg-[#060e20] text-[#d8c3ad]'
            }`}
          >
            {job.status}
          </span>
        </div>

        <div className="relative flex flex-col gap-2 py-2">
          <div className="absolute top-6 bottom-6 left-[11px] w-0.5 border-l-2 border-dashed border-[#534434]" />
          <div className="relative z-10 flex items-start gap-4">
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-[#0b1326] ${
                confirmed ? 'border-[#ffc174]' : 'border-[#534434]'
              }`}
            >
              <div className={`h-2 w-2 rounded-full ${confirmed ? 'bg-[#ffc174]' : 'bg-[#534434]'}`} />
            </div>
            <div>
              <p className="text-[10px] tracking-wider text-[#d8c3ad] uppercase">Pickup</p>
              <p className="text-[#dae2fd]">{job.pickupAddress}</p>
            </div>
          </div>
          <div className="relative z-10 mt-2 flex items-start gap-4">
            <div
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-[#0b1326] ${
                confirmed ? 'border-[#7bd0ff]' : 'border-[#534434]'
              }`}
            >
              <span className={`material-symbols-outlined text-sm ${confirmed ? 'text-[#7bd0ff]' : 'text-[#534434]'}`}>
                location_on
              </span>
            </div>
            <div>
              <p className="text-[10px] tracking-wider text-[#d8c3ad] uppercase">Dropoff</p>
              <p className="text-[#dae2fd]">{job.dropoffAddress}</p>
            </div>
          </div>
        </div>

        <hr className="border-[#534434]" />

        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex items-center gap-2 text-[#d8c3ad]">
            <span className="material-symbols-outlined text-lg">{job.itemsIcon}</span>
            <span>{job.itemsLabel}</span>
          </div>
          <div className="sm:text-right">
            <p className="mb-1 text-[10px] tracking-wider text-[#d8c3ad] uppercase">Est. Earnings</p>
            <p className={`text-2xl font-bold tracking-tight ${confirmed ? 'text-[#ffc174]' : 'text-[#dae2fd]'}`}>
              {formatScheduledEarnings(job)}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyScheduledState({ onBrowseBoard }: { onBrowseBoard: () => void }) {
  return (
    <HaulEmptyState
      icon="event_busy"
      title="No Scheduled Jobs"
      description="You have no upcoming hauls assigned for this date. Check the load board to secure your next run."
      action={{ label: 'Browse Load Board', icon: 'search', onClick: onBrowseBoard }}
    />
  );
}

export function HaulScheduledLoadsPage({ jobs: jobsProp, onSelectJob, onBrowseBoard }: Props) {
  const jobs = jobsProp ?? buildDemoScheduledJobs();
  const jobDates = useMemo(() => datesWithJobs(jobs), [jobs]);

  const today = startOfDay(new Date());
  const calendarDays = useMemo(() => {
    const start = addDays(today, -2);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [today]);

  const defaultSelected = calendarDays.find((d) => jobDates.has(d.getTime())) ?? today;
  const [selected, setSelected] = useState(defaultSelected);

  const dayJobs = jobsForDate(jobs, selected);
  const now = today.getTime();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#dae2fd]">Scheduled</h1>
        <p className="mt-1 text-[#d8c3ad]">Review your upcoming hauls and routes.</p>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {calendarDays.map((d) => {
          const ts = d.getTime();
          const isSelected = startOfDay(selected).getTime() === ts;
          const isPast = ts < now && !isSelected;
          const hasJobs = jobDates.has(ts);
          const hasFutureDot = hasJobs && !isSelected;

          return (
            <button
              key={ts}
              type="button"
              disabled={isPast}
              onClick={() => setSelected(d)}
              className={`relative flex min-w-[64px] snap-start flex-col items-center justify-center rounded-xl border px-2 py-3 transition-all ${
                isSelected
                  ? 'border-2 border-[#ffc174] bg-[#171f33] text-[#ffc174] shadow-[0_0_15px_rgba(255,193,116,0.1)]'
                  : isPast
                    ? 'cursor-not-allowed border border-[#534434] bg-[#131b2e] text-[#d8c3ad] opacity-50'
                    : 'border border-[#534434] bg-[#171f33] text-[#dae2fd] hover:border-[#a08e7a] hover:bg-[#222a3d]'
              }`}
            >
              {hasFutureDot ? (
                <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[#7bd0ff]" />
              ) : null}
              <span className="text-xs font-medium uppercase">
                {d.toLocaleDateString([], { weekday: 'short' })}
              </span>
              <span className="mt-1 text-lg font-semibold">{d.getDate()}</span>
              {isSelected && hasJobs ? <div className="mt-1 h-1.5 w-1.5 rounded-full bg-[#ffc174]" /> : null}
            </button>
          );
        })}
      </div>

      {dayJobs.length > 0 ? (
        <div className="flex flex-col gap-4">
          {dayJobs.map((job) => (
            <ScheduledJobCard key={job.id} job={job} onClick={() => onSelectJob(job)} />
          ))}
        </div>
      ) : (
        <EmptyScheduledState onBrowseBoard={onBrowseBoard} />
      )}
    </div>
  );
}
