import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@roam/auth-client';
import { claimPassengerAuthorization, getPassengerAuthorizationPreview } from '@/services/contactsEdge';
import { ON_SURFACE, ON_SURFACE_VARIANT, PAGE_BG, PRIMARY, PRIMARY_CONTAINER, ON_PRIMARY } from '@/lib/passengerTheme';

export default function PassengerAuthorizePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof getPassengerAuthorizationPreview>
  >['authorization'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) return;
    void getPassengerAuthorizationPreview(token)
      .then((r) => setPreview(r.authorization))
      .catch((e) => toast.error(e instanceof Error ? e.message : t('authorize.notFound')))
      .finally(() => setLoading(false));
  }, [token, t]);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !token) return;
      setClaiming(true);
      try {
        await claimPassengerAuthorization(token);
        toast.success(t('authorize.linked'));
        navigate('/', { replace: true });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('authorize.couldNotComplete'));
      } finally {
        setClaiming(false);
      }
    })();
  }, [token, navigate, t]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <p style={{ color: ON_SURFACE_VARIANT }}>{t('authorize.loading')}</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6 safe-x"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>{t('authorize.title')}</h1>
        {preview ? (
          <>
            <p className="text-lg">
              {t('authorize.greeting', { name: preview.recipient_name })}
            </p>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {t('authorize.signInHint', { phone: preview.phone_masked })}
            </p>
          </>
        ) : (
          <p style={{ color: ON_SURFACE_VARIANT }}>{t('authorize.invalid')}</p>
        )}
        <button
          type="button"
          disabled={claiming || !preview}
          onClick={() => navigate(`/login?return=${encodeURIComponent(`/ride/authorize/${token}`)}`)}
          className="h-14 w-full rounded-2xl text-lg font-semibold disabled:opacity-50"
          style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
        >
          {claiming ? t('authorize.authorizing') : t('authorize.continue')}
        </button>
      </div>
    </div>
  );
}
