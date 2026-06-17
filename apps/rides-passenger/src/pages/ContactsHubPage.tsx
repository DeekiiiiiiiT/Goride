import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, Clock, Contact, ShieldCheck } from 'lucide-react';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import {
  listIncomingConnectionRequests,
  listOutgoingConnectionRequests,
  listOutgoingPassengerAuthorizations,
} from '@/services/roamConnectionsEdge';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

function HubRow({
  icon,
  iconColor,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="passenger-row-hover flex w-full items-center justify-between px-5 py-4 text-left transition-colors"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span style={{ color: iconColor }}>{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
            {label}
          </p>
          <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            {description}
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE_VARIANT }} aria-hidden />
    </button>
  );
}

export default function ContactsHubPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const [pendingBadge, setPendingBadge] = useState(0);

  useEffect(() => {
    if (!ROAM_CONNECTIONS) return;
    void (async () => {
      try {
        const [outgoing, incoming, auths] = await Promise.all([
          listOutgoingConnectionRequests(),
          listIncomingConnectionRequests(),
          listOutgoingPassengerAuthorizations('active'),
        ]);
        const count =
          outgoing.requests.filter((r) => r.status === 'pending').length +
          incoming.requests.length +
          auths.authorizations.filter((a) => a.status === 'pending' || a.status === 'claimed').length;
        setPendingBadge(count);
      } catch {
        /* non-blocking */
      }
    })();
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header
        className="sticky top-0 z-50 flex h-14 items-center px-4 safe-t"
        style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      >
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="rounded-full p-2"
          style={{ color: PRIMARY }}
          aria-label={tc('back')}
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>
          {t('title')}
        </h1>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4 safe-x">
        <div
          className="overflow-hidden rounded-[20px]"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <HubRow
            icon={<Contact className="h-5 w-5" />}
            iconColor={PRIMARY}
            label={t('hub.roamContacts')}
            description={t('hub.roamContactsDescription')}
            onClick={() => navigate('/account/contacts/roam')}
          />
          {ROAM_CONNECTIONS ? (
            <>
              <div className="mx-5 h-px" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }} />
              <div className="relative">
                <HubRow
                  icon={<Clock className="h-5 w-5" />}
                  iconColor={PRIMARY}
                  label={t('hub.pending')}
                  description={t('hub.pendingDescription')}
                  onClick={() => navigate('/account/contacts/pending')}
                />
                {pendingBadge > 0 ? (
                  <span
                    className="absolute right-12 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: 'var(--passenger-primary-container)', color: 'var(--passenger-on-primary)' }}
                  >
                    {pendingBadge}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="mx-5 h-px" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }} />
          <HubRow
            icon={<ShieldCheck className="h-5 w-5" />}
            iconColor={PRIMARY}
            label={t('hub.trustedContacts')}
            description={t('hub.trustedDescription')}
            onClick={() => navigate('/account/contacts/trusted')}
          />
        </div>
      </main>
    </div>
  );
}
