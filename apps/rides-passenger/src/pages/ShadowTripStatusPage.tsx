import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ridesGetRequest } from '@/services/ridesEdge';
import { delegatedRidePath, isShadowBookerTrip } from '@/lib/delegatedRideNavigation';
import {
  SHADOW_PAYER_ACTIVE_SUBTITLE,
  SHADOW_PAYER_ACTIVE_TITLE,
} from '@/lib/shadowPayerCopy';
import { ON_SURFACE, ON_SURFACE_VARIANT, PAGE_BG, PRIMARY, PRIMARY_CONTAINER } from '@/lib/passengerTheme';

export default function ShadowTripStatusPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await ridesGetRequest(id);
        if (cancelled) return;

        const role = res.participant_role;
        const roamMode = res.roam_mode ?? res.ride.roam_mode ?? null;
        if (!isShadowBookerTrip(role, roamMode, res.booker_visibility)) {
          navigate(delegatedRidePath(id, role, roamMode, res.booker_visibility), { replace: true });
          return;
        }

        if (res.ride.status === 'completed') {
          navigate(`/shadow-trip/${id}/receipt`, { replace: true });
        }
      } catch {
        /* retry on focus */
      }
    };

    void poll();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, navigate]);

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: PAGE_BG }}>
      <header className="flex h-16 shrink-0 items-center px-4 safe-t">
        <button
          type="button"
          onClick={() => navigate('/services/book-for-others')}
          className="rounded-full p-2 touch-manipulation"
          style={{ color: PRIMARY }}
          aria-label="Back to Book for others"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16 safe-x">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
            {SHADOW_PAYER_ACTIVE_TITLE}
          </h1>
          <p
            className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
            style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_SURFACE }}
          >
            {SHADOW_PAYER_ACTIVE_SUBTITLE}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
            Need help? Contact support — trips cannot be cancelled after payment.
          </p>
        </div>
      </main>
    </div>
  );
}
