import React, { useMemo } from 'react';
import {
  DEMO_DRIVER_REVIEWS,
  DEMO_OVERALL_RATING,
  DEMO_RATING_DISTRIBUTION,
  DEMO_TOTAL_REVIEWS,
} from '../../lib/haulDriverFeedback';
import { HaulSubpageHeader } from './HaulSubpageHeader';

type Props = {
  onBack: () => void;
};

function Stars({ count, size = 16 }: { count: number; size?: number }) {
  return (
    <div className="flex text-[#ffc174]">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="material-symbols-outlined"
          style={{ fontSize: size, fontVariationSettings: n <= Math.floor(count) ? "'FILL' 1" : "'FILL' 0" }}
        >
          {n <= count ? 'star' : n - 0.5 <= count ? 'star_half' : 'star'}
        </span>
      ))}
    </div>
  );
}

export function HaulDriverFeedbackPage({ onBack }: Props) {
  const reviews = useMemo(() => DEMO_DRIVER_REVIEWS, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="Driver Feedback" onBack={onBack} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 pt-[88px] pb-8">
        <div>
          <h2 className="text-2xl font-bold text-[#dae2fd]">Driver Feedback</h2>
          <p className="mt-1 text-[#d8c3ad]">Your performance overview based on recent hauls.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-12">
          <div className="flex flex-col items-center justify-center rounded-xl border border-[#534434] bg-[#171f33] p-6 text-center md:col-span-4">
            <p className="mb-2 text-sm tracking-wider text-[#a08e7a] uppercase">Overall Rating</p>
            <div className="text-5xl font-extrabold text-[#dae2fd]">{DEMO_OVERALL_RATING}</div>
            <div className="my-3">
              <Stars count={DEMO_OVERALL_RATING} size={28} />
            </div>
            <p className="text-[#d8c3ad]">Total {DEMO_TOTAL_REVIEWS} reviews</p>
          </div>

          <div className="rounded-xl border border-[#534434] bg-[#171f33] p-6 md:col-span-8">
            <h3 className="mb-6 text-lg font-semibold text-[#dae2fd]">Rating Distribution</h3>
            <div className="flex flex-col gap-3">
              {DEMO_RATING_DISTRIBUTION.map((row) => (
                <div key={row.stars} className="flex items-center gap-2">
                  <span className="w-4 text-sm text-[#d8c3ad]">{row.stars}</span>
                  <span
                    className="material-symbols-outlined text-[18px] text-[#ffc174]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    star
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#2d3449]">
                    <div className="h-full rounded-full bg-[#ffc174]" style={{ width: `${row.pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-sm text-[#d8c3ad]">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#dae2fd]">Recent Reviews</h3>
            <button type="button" className="text-sm font-medium text-[#ffc174] hover:text-[#ffddb8]">
              View All
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {reviews.map((r) => (
              <article
                key={r.id}
                className="rounded-lg border border-[#534434] bg-[#0b1326] p-4 transition-colors hover:bg-[#131b2e]"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#534434] bg-[#2d3449] text-sm font-semibold text-[#dae2fd]">
                      {r.initials}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-[#dae2fd]">{r.name}</h4>
                      <p className="text-xs text-[#a08e7a]">
                        {r.date} • Load {r.loadRef}
                      </p>
                    </div>
                  </div>
                  <Stars count={r.stars} />
                </div>
                <p className="text-[#d8c3ad]">{r.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
