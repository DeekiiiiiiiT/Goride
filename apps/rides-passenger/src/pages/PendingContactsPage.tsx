import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Ban,
  Briefcase,
  Check,
  Copy,
  Flag,
  Inbox,
  Loader2,
  MoreVertical,
  Pencil,
  Search,
} from 'lucide-react';
import {
  cancelPassengerAuthorization,
  updatePassengerAuthorizationPhone,
} from '@/services/contactsEdge';
import {
  buildGuestPhoneE164,
  formatGuestPhoneDisplay,
  isValidGuestPhone,
} from '@/lib/guestRecipientBooking';
import type { RoamConnectionRequestDto } from '@roam/types/roamConnections';
import type { PassengerAuthorizationDto } from '@roam/types/passengerAuthorization';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import {
  authorizationStatusLabel,
  connectionRequestStatusLabel,
} from '@/lib/roamConnectionCopy';
import {
  acceptRoamConnectionRequest,
  cancelRoamConnectionRequest,
  createAbuseReport,
  createUserBlock,
  listIncomingConnectionRequests,
  listOutgoingConnectionRequests,
  listOutgoingPassengerAuthorizations,
  rejectRoamConnectionRequest,
} from '@/services/roamConnectionsEdge';
import '@/styles/pending-contacts.css';

type Tab = 'sent' | 'received';

function displayInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function IncomingRequestCard({
  req,
  actionId,
  onAccept,
  onDecline,
  onBlock,
  onReport,
}: {
  req: RoamConnectionRequestDto;
  actionId: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onBlock: () => void;
  onReport: () => void;
}) {
  const { t } = useTranslation('contacts');
  const name = req.requester_display_name ?? t('pending.someoneOnRoam');
  const handle = req.requester_custom_tag_name ? `@${req.requester_custom_tag_name}` : null;
  const busy = actionId === req.id;

  return (
    <article className="pending-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <div className="pending-card__avatar" aria-hidden>
            {displayInitials(name)}
          </div>
          <div className="min-w-0">
            <h3 className="pending-card__name truncate">{name}</h3>
            {handle ? <p className="pending-card__handle truncate">{handle}</p> : null}
          </div>
        </div>
        {req.status === 'pending' ? <span className="pending-card__badge">{t('pending.active')}</span> : null}
      </div>

      <p className="pending-card__body">
        {t('pending.wantsToConnect')}
        {req.source === 'book_for_someone' ? t('pending.bookedBefore') : null}
      </p>

      <div className="pending-card__actions">
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="pending-card__accept inline-flex items-center justify-center gap-2"
        >
          <Check className="h-4 w-4" aria-hidden />
          {t('pending.accept')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDecline}
          className="pending-card__decline"
        >
          {t('pending.decline')}
        </button>
      </div>

      <div className="pending-card__footer">
        <button
          type="button"
          disabled={busy || !req.requester_user_id}
          onClick={onBlock}
          className="pending-card__footer-btn"
        >
          <Ban className="h-4 w-4" aria-hidden />
          {t('pending.block')}
        </button>
        <button
          type="button"
          disabled={busy || !req.requester_user_id}
          onClick={onReport}
          className="pending-card__footer-btn"
        >
          <Flag className="h-4 w-4" aria-hidden />
          {t('pending.report')}
        </button>
      </div>
    </article>
  );
}

export default function PendingContactsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'sent' ? 'sent' : 'received';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [outgoingRequests, setOutgoingRequests] = useState<RoamConnectionRequestDto[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<RoamConnectionRequestDto[]>([]);
  const [authorizations, setAuthorizations] = useState<PassengerAuthorizationDto[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [editingAuthId, setEditingAuthId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState('');

  const load = useCallback(async () => {
    if (!ROAM_CONNECTIONS) return;
    try {
      const [outgoing, incoming, auths] = await Promise.all([
        listOutgoingConnectionRequests(),
        listIncomingConnectionRequests(),
        listOutgoingPassengerAuthorizations('active'),
      ]);
      setOutgoingRequests(outgoing.requests);
      setIncomingRequests(incoming.requests);
      setAuthorizations(auths.authorizations);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('pending.toast.couldNotLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    if (!ROAM_CONNECTIONS) return undefined;
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setSearchParams(next === 'sent' ? { tab: 'sent' } : {});
  };

  const pendingOutgoingRequests = useMemo(
    () => outgoingRequests.filter((r) => r.status === 'pending'),
    [outgoingRequests],
  );

  const activeAuthorizations = useMemo(
    () => authorizations.filter((a) => a.status === 'pending' || a.status === 'claimed'),
    [authorizations],
  );

  if (!ROAM_CONNECTIONS) {
    return (
      <div className="pending-page flex min-h-[100dvh] flex-col items-center justify-center px-6">
        <p style={{ color: 'var(--pending-on-surface-variant)' }}>{t('pending.notEnabled')}</p>
        <button
          type="button"
          onClick={() => navigate('/account/contacts')}
          className="mt-4 text-sm font-semibold"
          style={{ color: 'var(--pending-primary)' }}
        >
          {t('pending.backToContacts')}
        </button>
      </div>
    );
  }

  const sentEmpty =
    pendingOutgoingRequests.length === 0 && activeAuthorizations.length === 0;

  return (
    <div className="pending-page flex min-h-[100dvh] flex-col pb-28">
      <header className="pending-page__header">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/account/contacts')}
            className="pending-page__icon-btn"
            aria-label={tc('back')}
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="pending-page__title">{t('pending.title')}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => toast.message(t('pending.searchComingSoon'))}
            className="pending-page__icon-btn pending-page__icon-btn--muted"
            aria-label={t('pending.searchAria')}
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => toast.message(t('pending.moreComingSoon'))}
            className="pending-page__icon-btn pending-page__icon-btn--muted"
            aria-label={t('pending.moreOptionsAria')}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-6 pt-6 safe-x">
        <div className="pending-page__tabs">
          <button
            type="button"
            onClick={() => switchTab('received')}
            className={`pending-page__tab ${tab === 'received' ? 'pending-page__tab--active' : ''}`}
          >
            {t('pending.received')}
            {incomingRequests.length > 0 ? (
              <span className="ml-1">({incomingRequests.length})</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => switchTab('sent')}
            className={`pending-page__tab ${tab === 'sent' ? 'pending-page__tab--active' : ''}`}
          >
            {t('pending.sent')}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--pending-primary)' }} />
          </div>
        ) : tab === 'received' ? (
          incomingRequests.length === 0 ? (
            <div className="pending-empty">
              <div className="pending-empty__icon">
                <Inbox className="h-16 w-16" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold">{t('pending.noIncoming')}</h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--pending-secondary)' }}>
                {t('pending.incomingHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {incomingRequests.map((req) => (
                <IncomingRequestCard
                  key={req.id}
                  req={req}
                  actionId={actionId}
                  onAccept={() => {
                    setActionId(req.id);
                    void acceptRoamConnectionRequest(req.id)
                      .then(() => {
                        toast.success(t('pending.toast.connected'));
                        return load();
                      })
                      .catch((e) => toast.error(e instanceof Error ? e.message : t('pending.toast.couldNotAccept')))
                      .finally(() => setActionId(null));
                  }}
                  onDecline={() => {
                    setActionId(req.id);
                    void rejectRoamConnectionRequest(req.id)
                      .then(() => {
                        toast.message(t('pending.toast.requestDeclined'));
                        return load();
                      })
                      .catch((e) => toast.error(e instanceof Error ? e.message : t('pending.toast.couldNotDecline')))
                      .finally(() => setActionId(null));
                  }}
                  onBlock={() => {
                    if (!req.requester_user_id) return;
                    setActionId(req.id);
                    void createUserBlock({ blocked_user_id: req.requester_user_id })
                      .then(() => {
                        toast.success(t('pending.toast.userBlocked'));
                        return load();
                      })
                      .catch((e) => toast.error(e instanceof Error ? e.message : t('pending.toast.couldNotBlock')))
                      .finally(() => setActionId(null));
                  }}
                  onReport={() => {
                    if (!req.requester_user_id) return;
                    setActionId(req.id);
                    void createAbuseReport({
                      reported_user_id: req.requester_user_id,
                      reason_code: 'spam',
                      context: { request_id: req.id },
                    })
                      .then(() => toast.success(t('pending.toast.reportSubmitted')))
                      .catch((e) => toast.error(e instanceof Error ? e.message : t('pending.toast.couldNotReport')))
                      .finally(() => setActionId(null));
                  }}
                />
              ))}
            </div>
          )
        ) : sentEmpty ? (
          <div className="pending-empty">
            <div className="pending-empty__icon">
              <Inbox className="h-16 w-16" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold">{t('pending.noSent')}</h3>
            <p className="mt-2 px-4 text-sm" style={{ color: 'var(--pending-secondary)' }}>
              {t('pending.sentHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="pending-sent-section-title">{t('pending.connectionRequests')}</h2>
              {pendingOutgoingRequests.length === 0 ? (
                <p className="pending-card text-sm" style={{ color: 'var(--pending-secondary)' }}>
                  {t('pending.noConnectionRequests')}
                </p>
              ) : (
                <div className="space-y-4">
                  {pendingOutgoingRequests.map((req) => (
                    <article key={req.id} className="pending-card">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="pending-card__avatar" aria-hidden>
                            <Briefcase className="h-7 w-7" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="pending-card__name truncate">{req.target_display_name}</h3>
                            <p className="pending-card__handle truncate">{req.target_phone_masked}</p>
                          </div>
                        </div>
                        <span className="pending-card__badge">
                          {connectionRequestStatusLabel(req)}
                        </span>
                      </div>
                      <p className="pending-card__body">
                        {t('pending.waitingForAccept', { name: req.target_display_name })}
                      </p>
                      <button
                        type="button"
                        disabled={actionId === req.id}
                        onClick={() => {
                          setActionId(req.id);
                          void cancelRoamConnectionRequest(req.id)
                            .then(() => {
                              toast.success(t('pending.toast.requestCancelled'));
                              return load();
                            })
                            .catch((e) => toast.error(e instanceof Error ? e.message : t('pending.toast.couldNotCancel')))
                            .finally(() => setActionId(null));
                        }}
                        className="pending-card__decline w-full"
                      >
                        {t('pending.cancelRequest')}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="pending-sent-section-title">{t('pending.rideAuthorizations')}</h2>
              {activeAuthorizations.length === 0 ? (
                <p className="pending-card text-sm" style={{ color: 'var(--pending-secondary)' }}>
                  {t('pending.noAuthorizations')}
                </p>
              ) : (
                <div className="space-y-4">
                  {activeAuthorizations.map((auth) => (
                    <article key={auth.id} className="pending-card">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="pending-card__avatar" aria-hidden>
                            {displayInitials(auth.recipient_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="pending-card__name truncate">{auth.recipient_name}</p>
                            {editingAuthId === auth.id ? (
                              <input
                                type="tel"
                                value={editPhone}
                                onChange={(e) => setEditPhone(formatGuestPhoneDisplay(e.target.value))}
                                className="mt-2 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#006d43] dark:border-white/10 dark:bg-white/5"
                                placeholder={t('pending.phoneNumber')}
                                autoFocus
                              />
                            ) : (
                              <p className="pending-card__handle">
                                {auth.phone_e164.replace(/\d(?=\d{4})/g, '*')}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="pending-card__badge">{authorizationStatusLabel(auth)}</span>
                      </div>

                      {editingAuthId === auth.id ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={actionId === auth.id || !isValidGuestPhone(editPhone)}
                            onClick={() => {
                              setActionId(auth.id);
                              void updatePassengerAuthorizationPhone(
                                auth.id,
                                buildGuestPhoneE164('+1', editPhone),
                              )
                                .then(() => {
                                  toast.success(t('pending.toast.phoneUpdated'));
                                  setEditingAuthId(null);
                                  setEditPhone('');
                                  return load();
                                })
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : t('pending.toast.couldNotUpdatePhone')),
                                )
                                .finally(() => setActionId(null));
                            }}
                            className="pending-card__accept px-4 py-2 text-sm"
                          >
                            {t('pending.saveNewNumber')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAuthId(null);
                              setEditPhone('');
                            }}
                            className="pending-sent-muted"
                          >
                            {t('pending.cancelEdit')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          {auth.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(auth.url)
                                  .then(() => toast.success(t('pending.toast.linkCopied')));
                              }}
                              className="pending-sent-link inline-flex items-center gap-1.5"
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden />
                              {t('pending.copyLink')}
                            </button>
                          ) : null}
                          {auth.status === 'claimed' ? (
                            <button
                              type="button"
                              onClick={() => navigate('/services/book-for-someone')}
                              className="pending-sent-link"
                            >
                              {t('pending.continueBooking')}
                            </button>
                          ) : null}
                          {auth.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAuthId(auth.id);
                                setEditPhone(
                                  formatGuestPhoneDisplay(auth.phone_e164.replace(/^\+1/, '')),
                                );
                              }}
                              className="pending-sent-muted inline-flex items-center gap-1"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                              {t('pending.editPhone')}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={actionId === auth.id}
                            onClick={() => {
                              setActionId(auth.id);
                              void cancelPassengerAuthorization(auth.id)
                                .then(() => {
                                  toast.success(t('pending.toast.authCancelled'));
                                  return load();
                                })
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : t('pending.toast.couldNotCancel')),
                                )
                                .finally(() => setActionId(null));
                            }}
                            className="pending-sent-muted disabled:opacity-50"
                          >
                            {tc('cancel')}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
