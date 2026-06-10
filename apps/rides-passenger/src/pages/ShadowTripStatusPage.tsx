import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
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
  const [status, setStatus] = useState<string>('matching');
  const [authorized, setAuthorized] = useState(false);

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

        setAuthorized(true);
        setStatus(res.ride.status);
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

  if (!authorized) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: PRIMARY }} />
      </div>
    );
  }

  const done = status === 'completed';

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 safe-x" style={{ backgroundColor: PAGE_BG }}>
      <div className="w-full max-w-md space-y-6 text-center">
        {done ? (
          <CheckCircle2 className="mx-auto h-16 w-16" style={{ color: PRIMARY }} />
        ) : (
          <Loader2 className="mx-auto h-16 w-16 animate-spin" style={{ color: PRIMARY }} />
        )}
        <h1 className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
          {done ? 'Dropped off' : SHADOW_PAYER_ACTIVE_TITLE}
        </h1>
        <p className="rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_SURFACE }}>
          {done
            ? 'The rider has been dropped off. View your receipt in Wallet.'
            : SHADOW_PAYER_ACTIVE_SUBTITLE}
        </p>
        {!done ? (
          <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            Need help? Contact support — trips cannot be cancelled after payment.
          </p>
        ) : null}
      </div>
    </div>
  );
}
