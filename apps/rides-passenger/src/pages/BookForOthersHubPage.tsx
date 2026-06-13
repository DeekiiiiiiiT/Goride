import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ChevronRight, Tag, UserPlus } from 'lucide-react';
import { BookForOthersActiveTripBanner } from '@/components/book-for-others/BookForOthersActiveTripBanner';
import { BookForOthersActivitySections } from '@/components/book-for-others/BookForOthersActivitySections';
import { useBookForOthersActivity } from '@/hooks/useBookForOthersActivity';
import {
  NAVY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  SERVICES_PAGE_BG as PAGE_BG,
  SERVICES_MUTED as MUTED,
} from '@/lib/passengerTheme';

function HubRow({
  icon,
  iconWrapClassName,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  iconWrapClassName: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-4 text-left touch-manipulation transition-colors active:bg-black/[0.03]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconWrapClassName}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight" style={{ color: ON_SURFACE }}>
            {label}
          </p>
          <p className="mt-1 text-[12px] leading-snug" style={{ color: ON_SURFACE_VARIANT }}>
            {description}
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE_VARIANT }} aria-hidden />
    </button>
  );
}

export default function BookForOthersHubPage() {
  const navigate = useNavigate();
  const { data, isLoading, isFetching, error } = useBookForOthersActivity();

  useEffect(() => {
    if (error instanceof Error) {
      toast.error(error.message);
    }
  }, [error]);

  const bookForSomeone = data?.book_for_someone ?? [];
  const bookForMe = data?.book_for_me ?? [];
  const activityLoading = isLoading || (isFetching && !data);

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-[calc(4rem+env(safe-area-inset-bottom,0px))]"
      style={{ backgroundColor: PAGE_BG }}
    >
      <header className="services-subheader sticky top-0 z-10 safe-t">
        <div className="mx-auto grid max-w-lg grid-cols-[3rem_1fr_3rem] items-center px-2 py-3.5">
          <button
            type="button"
            onClick={() => navigate('/services')}
            className="btn-touch flex h-11 w-11 items-center justify-center touch-manipulation"
            style={{ color: NAVY }}
            aria-label="Back to services"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1
            className="text-center text-[13px] font-bold uppercase tracking-[0.18em]"
            style={{ color: NAVY }}
          >
            Book for others
          </h1>
          <span className="w-11" aria-hidden />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 safe-x px-4 pt-5 pb-6">
        <p className="mb-4 text-center text-[13px] leading-relaxed" style={{ color: MUTED }}>
          Book a ride for someone else, or publish a trip on your tag for someone to pay.
        </p>

        <div className="services-menu-card overflow-hidden rounded-2xl">
          <HubRow
            icon={<UserPlus className="h-5 w-5" strokeWidth={1.65} aria-hidden />}
            iconWrapClassName="bg-[#E8F1FC] text-[#4A7FD4]"
            label="Book for someone"
            description="Friend, child, or family member"
            onClick={() => navigate('/services/book-for-someone')}
          />
          <div className="mx-4 h-px bg-black/[0.06]" />
          <HubRow
            icon={<Tag className="h-5 w-5" strokeWidth={1.65} aria-hidden />}
            iconWrapClassName="bg-[#E8F1FC] text-[#004AC6]"
            label="Gift me ride"
            description="Let someone pay for your ride"
            onClick={() => navigate('/services/book-for-me')}
          />
        </div>

        <BookForOthersActiveTripBanner />

        <BookForOthersActivitySections
          bookForSomeone={bookForSomeone}
          bookForMe={bookForMe}
          loading={activityLoading}
        />
      </main>
    </div>
  );
}
