import React from 'react';
import { Power } from 'lucide-react';
import { HaulGoingOnlineScreen } from '../dispatch/HaulGoingOnlineScreen';
import { HaulSlideOfflineButton } from '../dispatch/HaulSlideOfflineButton';

const MAP_BG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDM6HTfP9Gnadkeo8EqoOi_JI66_Lwzv7CPD2qwPgtJVNombQbLkiFgXhk7Invu0N9sYepttZOrxf8hfzT0sCadI6szxPAXgIVto3f6v1E4v1GdCKdRoqsVVIfr8705dCuLZ301tWFIk7D1uojKkCsb4AUcirbcKexpSScXW_LzbZ2LOYKJhEWFhgDFA768Yl92QIBnupuLtUEJEl2gx9ivwOgKs3I0vKRZVDAaavJU5nGAdTN9w-hcR9WmeF5zxAhI-cPDgKkrDQ';

type Props = {
  online: boolean;
  goingOnline: boolean;
  onToggleOnline: () => void;
  deliveries?: number;
  earnings?: string;
};

export function HaulDashboardHome({
  online,
  goingOnline,
  onToggleOnline,
  deliveries = 0,
  earnings = 'J$0.00',
}: Props) {
  if (goingOnline) {
    return <HaulGoingOnlineScreen />;
  }

  if (!online) {
    return (
      <div className="flex flex-col gap-6">
        <section className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-[#534434] bg-[#171f33] p-8 text-center">
          <div className="absolute inset-0 bg-gradient-to-t from-[#060e20]/50 to-transparent opacity-50" />
          <div className="relative z-10 mb-2 rounded-full border border-[#31394d] bg-[#222a3d] p-6">
            <span
              className="material-symbols-outlined text-6xl text-[#31394d]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              local_shipping
            </span>
          </div>
          <h3 className="relative z-10 text-[28px] leading-9 font-bold text-[#dae2fd] md:text-[32px]">
            You&apos;re offline
          </h3>
          <p className="relative z-10 mx-auto mt-2 max-w-md text-lg text-[#d8c3ad]">
            Go online to start receiving freight requests and view active hauls near your location.
          </p>
          <button
            type="button"
            onClick={onToggleOnline}
            className="relative z-10 mt-6 flex items-center gap-2 rounded-lg border border-[#ffc174] bg-[#ffc174] px-8 py-3 text-lg font-semibold text-[#472a00] transition-colors hover:bg-[#ffddb8] active:scale-95"
          >
            <Power className="h-5 w-5" />
            Go Online
          </button>
        </section>

        <section>
          <h3 className="mb-2 text-lg font-semibold text-[#dae2fd]">Today&apos;s Summary</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 rounded-lg border border-[#534434] bg-[#131b2e] p-4">
              <span className="text-xs font-medium tracking-wide text-[#d8c3ad] uppercase">Earnings</span>
              <span className="text-2xl font-bold text-[#dae2fd]">{earnings}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-[#534434] bg-[#131b2e] p-4">
              <span className="text-xs font-medium tracking-wide text-[#d8c3ad] uppercase">
                Completed Hauls
              </span>
              <span className="text-2xl font-bold text-[#dae2fd]">{deliveries}</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="relative flex h-[min(486px,55dvh)] min-h-[320px] flex-col justify-end overflow-hidden rounded-xl border border-[#534434] bg-[#060e20] shadow-lg">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{ backgroundImage: `url('${MAP_BG}')` }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326] via-[#0b1326]/40 to-transparent" />

        <div className="relative z-10 m-4 flex items-center gap-4 rounded-lg border border-[#534434] bg-[#171f33]/90 p-4 shadow-2xl backdrop-blur-md">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full border-2 border-[#56e5a9] opacity-40"
              style={{ animationDuration: '2s' }}
            />
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#56e5a9]/50 bg-[#56e5a9]/20 shadow-[0_0_15px_rgba(86,229,169,0.3)]">
              <span className="material-symbols-outlined text-2xl text-[#56e5a9]">radar</span>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#dae2fd]">Online — Waiting for freight</h2>
            <p className="mt-1 text-base leading-tight text-[#d8c3ad]">
              You&apos;ll be notified when jobs are available nearby
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1 rounded-xl border border-[#534434] bg-[#171f33] p-4 shadow-md">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#222a3d]">
            <span className="material-symbols-outlined text-xl text-[#d8c3ad]">local_shipping</span>
          </div>
          <span className="text-2xl font-bold leading-none text-[#dae2fd]">{deliveries}</span>
          <span className="text-sm font-medium tracking-wider text-[#d8c3ad] uppercase">Deliveries</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-[#534434] bg-[#171f33] p-4 shadow-md">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#222a3d]">
            <span className="material-symbols-outlined text-xl text-[#d8c3ad]">payments</span>
          </div>
          <span className="text-2xl font-bold leading-none text-[#ffc174]">{earnings}</span>
          <span className="text-sm font-medium tracking-wider text-[#d8c3ad] uppercase">Earnings</span>
        </div>
      </section>

      <section className="flex justify-center pb-2 pt-4">
        <HaulSlideOfflineButton onConfirm={onToggleOnline} />
      </section>
    </div>
  );
}
