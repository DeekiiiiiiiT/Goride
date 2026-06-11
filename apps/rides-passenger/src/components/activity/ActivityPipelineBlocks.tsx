import React from 'react';
import { CalendarClock, Package, PartyPopper } from 'lucide-react';
import type { ActivityPipelineItem, ActivityPipelineKind } from '@roam/types/rides';
import { CARD_SHADOW, ON_SURFACE, ON_SURFACE_VARIANT, PRIMARY, SURFACE_LOWEST } from '@/lib/passengerTheme';

const KIND_META: Record<ActivityPipelineKind, { label: string; icon: typeof CalendarClock }> = {
  schedule: { label: 'Scheduled', icon: CalendarClock },
  courier: { label: 'Courier', icon: Package },
  event: { label: 'Event', icon: PartyPopper },
};

type ActivityPipelineBlocksProps = {
  items: ActivityPipelineItem[];
  onSelect: (item: ActivityPipelineItem) => void;
};

export function ActivityPipelineBlocks({ items, onSelect }: ActivityPipelineBlocksProps) {
  if (items.length === 0) return null;

  const kinds = (['schedule', 'courier', 'event'] as const).filter((kind) =>
    items.some((item) => item.kind === kind),
  );

  return (
    <section aria-label="Upcoming bookings">
      <div className="grid grid-cols-3 gap-2">
        {kinds.map((kind) => {
          const item = items.find((row) => row.kind === kind)!;
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onSelect(item)}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[20px] px-2 py-3 text-center touch-manipulation transition-colors active:bg-black/[0.03]"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
              aria-label={`${meta.label} booking, ${item.title}`}
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-2xl"
                style={{ backgroundColor: 'var(--passenger-surface-low)', color: PRIMARY }}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-[11px] font-semibold leading-tight" style={{ color: ON_SURFACE }}>
                {meta.label}
              </span>
              <span className="line-clamp-2 text-[10px] leading-snug" style={{ color: ON_SURFACE_VARIANT }}>
                {item.subtitle ?? item.title}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
