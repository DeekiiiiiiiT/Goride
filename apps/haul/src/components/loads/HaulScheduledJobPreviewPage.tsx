import React, { useState } from 'react';
import { toast } from 'sonner';
import { readDepartureReminder, writeDepartureReminder } from '../../lib/haulAppPrefs';
import {
  countdownToStart,
  type HaulScheduledJob,
} from '../../lib/haulScheduledJobs';
import { HaulSubpageHeader } from '../profile/HaulSubpageHeader';
import { HaulToggle } from '../profile/HaulToggle';
import { HaulConfirmModal } from '../ui/HaulConfirmModal';
import { HaulActionSheet } from '../ui/HaulActionSheet';
import { haulHaptic } from '../../utils/haulHaptics';

const MAP_PLACEHOLDER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCQJUGlW9E-r6B1NuL6zvsuR3msCNx8ziPWAKzdRcETDEk59GM4UP-o-Yn2SeLL3zcHTGiJa19O2Dc_e8NXnzmcxXdP7ScofThlFOrXnTZW60etvgcqcX5khfvE9jUAb1sUhPgtZ4VmjIlBozyBpBUdIhjk14MHiOtcXnFngqH-fFhvYBlxUrfckrK1NrIRjRp4PUi9ZSZtQG2x9aECqrcWSLLeOmmKhmtgjzbQeiyshs1TcdU-O2pZ7O_u34yN9x2IVgulx_YkVA';

type Props = {
  job: HaulScheduledJob;
  onBack: () => void;
};

function formatPickupTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function HaulScheduledJobPreviewPage({ job, onBack }: Props) {
  const [reminder, setReminder] = useState(() => readDepartureReminder(job.id));
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const manifest = job.manifest;

  const handleReminder = (v: boolean) => {
    setReminder(v);
    writeDepartureReminder(job.id, v);
    haulHaptic('light');
  };

  const handleCancel = () => {
    haulHaptic('warning');
    toast.info('Cancellation request submitted');
    setShowCancelConfirm(false);
    onBack();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader
        title="Job Preview"
        onBack={onBack}
        rightSlot={
          <button
            type="button"
            onClick={() => setShowActions(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#ffc174]"
            aria-label="More options"
          >
            <span className="material-symbols-outlined">more_vert</span>
          </button>
        }
      />

      <main className="mx-auto w-full max-w-2xl flex-1 pb-32">
        <section className="px-4 pt-8 pb-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#ffc174]" />
            <span className="text-sm font-medium tracking-widest text-[#ffc174] uppercase">Scheduled Dispatch</span>
          </div>
          <h2 className="text-5xl leading-tight font-extrabold tracking-tight text-[#dae2fd]">
            Starts in <br />
            <span className="text-[#ffc174]">{countdownToStart(job.scheduledAt)}</span>
          </h2>
          <p className="mt-2 text-[#d8c3ad]">
            Order #{job.orderRef}
            {job.arriveBy ? ` • Arrive by ${job.arriveBy}` : ''}
          </p>
        </section>

        <section className="mb-8 px-4">
          <div className="overflow-hidden rounded-xl border border-[#534434] bg-[#171f33]">
            <div className="relative h-[180px] border-b border-[#534434] bg-[#060e20]">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-80 mix-blend-screen"
                style={{ backgroundImage: `url('${MAP_PLACEHOLDER}')` }}
              />
              <div className="absolute top-1/4 left-1/4 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#ffc174] bg-[#0b1326] shadow-[0_0_15px_rgba(255,193,116,0.3)]">
                <span
                  className="material-symbols-outlined text-base text-[#ffc174]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  warehouse
                </span>
              </div>
              <div className="absolute right-1/4 bottom-1/4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#ffc174] shadow-[0_0_15px_rgba(255,193,116,0.5)]">
                <span
                  className="material-symbols-outlined text-base text-[#472a00]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  flag
                </span>
              </div>
              <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
                <path
                  d="M 25% 25% Q 50% 10%, 75% 75%"
                  fill="none"
                  stroke="#ffc174"
                  strokeDasharray="4 4"
                  strokeWidth="2"
                  opacity="0.7"
                />
              </svg>
            </div>

            <div className="relative p-6">
              <div className="absolute top-10 bottom-10 left-[39px] w-0.5 bg-[#534434]" />
              <div className="relative z-10 mb-6 flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#534434] bg-[#2d3449]">
                  <span className="material-symbols-outlined text-[#dae2fd]">arrow_upward</span>
                </div>
                <div>
                  <p className="mb-1 text-sm tracking-wider text-[#d8c3ad] uppercase">
                    Pickup • {formatPickupTime(job.scheduledAt)}
                  </p>
                  <h3 className="text-lg font-semibold text-[#dae2fd]">
                    {job.pickupName ?? job.pickupAddress.split(',')[0]}
                  </h3>
                  <p className="mt-1 text-[#d8c3ad]">{job.pickupDetail ?? job.pickupAddress}</p>
                </div>
              </div>
              <div className="relative z-10 flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ffc174]/30 bg-[#ffc174]/10">
                  <span className="material-symbols-outlined text-[#ffc174]">arrow_downward</span>
                </div>
                <div>
                  <p className="mb-1 text-sm tracking-wider text-[#d8c3ad] uppercase">Dropoff • Est. 16:30</p>
                  <h3 className="text-lg font-semibold text-[#dae2fd]">
                    {job.dropoffName ?? job.dropoffAddress.split(',')[0]}
                  </h3>
                  <p className="mt-1 text-[#d8c3ad]">{job.dropoffDetail ?? job.dropoffAddress}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 px-4">
          <div className="flex items-center justify-between rounded-xl border border-[#534434] bg-[#171f33] p-4">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-2xl text-[#ffc174]">notifications_active</span>
              <div>
                <h4 className="font-semibold text-[#dae2fd]">Departure Reminder</h4>
                <p className="text-sm text-[#d8c3ad]">Notify me 1 hour before start</p>
              </div>
            </div>
            <HaulToggle checked={reminder} onChange={handleReminder} label="Departure reminder" />
          </div>
        </section>

        {manifest ? (
          <section className="mb-8 px-4">
            <h3 className="mb-4 text-lg font-semibold text-[#dae2fd]">Cargo Manifest</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 flex items-center justify-between rounded-xl border border-[#534434] bg-[#171f33] p-4">
                <div>
                  <p className="text-sm tracking-wider text-[#d8c3ad] uppercase">Total Payload</p>
                  <p className="text-2xl font-bold text-[#dae2fd]">
                    {manifest.totalLbs.toLocaleString()}{' '}
                    <span className="text-lg font-normal text-[#d8c3ad]">lbs</span>
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#534434] bg-[#2d3449]">
                  <span className="material-symbols-outlined text-[#ffc174]">scale</span>
                </div>
              </div>
              {manifest.items.slice(0, 2).map((item) => (
                <div
                  key={item.name}
                  className="relative overflow-hidden rounded-xl border border-[#534434] bg-[#171f33] p-4"
                >
                  <div className="absolute top-0 right-0 -z-0 h-16 w-16 rounded-bl-3xl bg-[#2d3449] opacity-50" />
                  <span className="material-symbols-outlined relative z-10 mb-2 text-[#d8c3ad]">{item.icon}</span>
                  <h4 className="relative z-10 text-sm font-medium text-[#dae2fd]">{item.name}</h4>
                  <p className="relative z-10 mt-1 text-sm text-[#d8c3ad]">
                    {item.qty} • {item.weight}
                  </p>
                </div>
              ))}
              {manifest.items[2] ? (
                <div className="col-span-2 flex items-center justify-between rounded-xl border border-[#534434] bg-[#171f33] p-4">
                  <div className="flex items-center gap-4">
                    <span className="material-symbols-outlined text-[#d8c3ad]">{manifest.items[2].icon}</span>
                    <div>
                      <h4 className="text-sm font-medium text-[#dae2fd]">{manifest.items[2].name}</h4>
                      <p className="text-sm text-[#d8c3ad]">
                        {manifest.items[2].qty} • {manifest.items[2].weight}
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-sm text-[#d8c3ad]">chevron_right</span>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      <div className="fixed bottom-0 z-50 w-full border-t border-[#534434] bg-[#0b1326]/95 p-4 pb-8 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowCancelConfirm(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#534434] bg-[#0b1326] text-sm font-medium text-[#dae2fd] transition-colors hover:border-[#ffc174] active:bg-[#171f33]"
          >
            <span className="material-symbols-outlined text-xl text-[#d8c3ad]">cancel</span>
            Cancel Job
          </button>
          <p className="text-center text-xs text-[#d8c3ad]">
            Cancellations within 2 hours of start time may incur a 15% penalty fee.
          </p>
        </div>
      </div>

      <HaulConfirmModal
        open={showCancelConfirm}
        title="Cancel this job?"
        message="Cancellations within 2 hours of start time may incur a 15% penalty fee."
        confirmLabel="Cancel Job"
        destructive
        onConfirm={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />

      <HaulActionSheet
        open={showActions}
        title="Job actions"
        onClose={() => setShowActions(false)}
        items={[
          { id: 'share', label: 'Share job details', icon: 'share', onClick: () => toast.info('Share coming soon') },
          { id: 'support', label: 'Contact support', icon: 'support_agent', onClick: () => toast.info('Support chat opening…') },
          { id: 'cancel', label: 'Cancel job', icon: 'cancel', destructive: true, onClick: () => setShowCancelConfirm(true) },
        ]}
      />
    </div>
  );
}
