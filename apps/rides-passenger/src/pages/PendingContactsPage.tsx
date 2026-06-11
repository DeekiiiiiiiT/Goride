import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Pencil,
  UserMinus,
  X,
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
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  ON_PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Tab = 'sent' | 'received';

function StatusChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: 'rgba(0,74,198,0.08)', color: PRIMARY }}
    >
      {label}
    </span>
  );
}

export default function PendingContactsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'received' ? 'received' : 'sent';
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
      toast.error(e instanceof Error ? e.message : 'Could not load pending items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (!ROAM_CONNECTIONS) return undefined;
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setSearchParams(next === 'received' ? { tab: 'received' } : {});
  };

  if (!ROAM_CONNECTIONS) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6" style={{ backgroundColor: PAGE_BG }}>
        <p style={{ color: ON_SURFACE_VARIANT }}>Pending contacts is not enabled.</p>
        <button type="button" onClick={() => navigate('/account/contacts')} className="mt-4 text-sm font-semibold" style={{ color: PRIMARY }}>
          Back to Contacts
        </button>
      </div>
    );
  }

  const pendingOutgoingRequests = useMemo(
    () => outgoingRequests.filter((r) => r.status === 'pending'),
    [outgoingRequests],
  );

  const activeAuthorizations = useMemo(
    () => authorizations.filter((a) => a.status === 'pending' || a.status === 'claimed'),
    [authorizations],
  );

  const pendingConnectionCount = pendingOutgoingRequests.length
    + incomingRequests.length
    + activeAuthorizations.length;

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header
        className="sticky top-0 z-50 flex h-14 items-center px-4 safe-t"
        style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      >
        <button type="button" onClick={() => navigate('/account/contacts')} className="rounded-full p-2" style={{ color: PRIMARY }} aria-label="Back">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>
          Pending
        </h1>
        {pendingConnectionCount > 0 ? (
          <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}>
            {pendingConnectionCount}
          </span>
        ) : null}
      </header>

      <div className="mx-auto w-full max-w-xl px-4 pt-3 safe-x">
        <div className="flex rounded-2xl p-1" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
          {(['sent', 'received'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold capitalize transition-colors"
              style={{
                backgroundColor: tab === t ? PRIMARY : 'transparent',
                color: tab === t ? ON_PRIMARY : ON_SURFACE_VARIANT,
              }}
            >
              {t}
              {t === 'received' && incomingRequests.length > 0 ? (
                <span className="ml-1.5">({incomingRequests.length})</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-4 py-4 safe-x">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: PRIMARY }} />
          </div>
        ) : tab === 'sent' ? (
          <>
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                Connection requests
              </h2>
              {pendingOutgoingRequests.length === 0 ? (
                <p className="rounded-2xl p-4 text-sm" style={{ backgroundColor: SURFACE_LOWEST, color: ON_SURFACE_VARIANT, boxShadow: CARD_SHADOW }}>
                  No connection requests in progress.
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingOutgoingRequests.map((req) => (
                    <div key={req.id} className="rounded-2xl p-4" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{req.target_display_name}</p>
                          <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>{req.target_phone_masked}</p>
                        </div>
                        <StatusChip label={connectionRequestStatusLabel(req)} />
                      </div>
                      <button
                        type="button"
                        disabled={actionId === req.id}
                        onClick={() => {
                          setActionId(req.id);
                          void cancelRoamConnectionRequest(req.id)
                            .then(() => { toast.success('Request cancelled'); return load(); })
                            .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not cancel'))
                            .finally(() => setActionId(null));
                        }}
                        className="mt-3 text-xs font-semibold disabled:opacity-50"
                        style={{ color: ON_SURFACE_VARIANT }}
                      >
                        Cancel request
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                Ride authorizations
              </h2>
              {activeAuthorizations.length === 0 ? (
                <p className="rounded-2xl p-4 text-sm" style={{ backgroundColor: SURFACE_LOWEST, color: ON_SURFACE_VARIANT, boxShadow: CARD_SHADOW }}>
                  No ride authorizations in progress.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeAuthorizations.map((auth) => (
                    <div key={auth.id} className="rounded-2xl p-4" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{auth.recipient_name}</p>
                          {editingAuthId === auth.id ? (
                            <input
                              type="tel"
                              value={editPhone}
                              onChange={(e) => setEditPhone(formatGuestPhoneDisplay(e.target.value))}
                              className="mt-2 h-10 w-full rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-[#004ac6]/30"
                              style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
                              placeholder="Phone number"
                              autoFocus
                            />
                          ) : (
                            <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                              {auth.phone_e164.replace(/\d(?=\d{4})/g, '*')}
                            </p>
                          )}
                        </div>
                        <StatusChip label={authorizationStatusLabel(auth)} />
                      </div>
                      {editingAuthId === auth.id ? (
                        <div className="mt-3 flex flex-wrap gap-2">
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
                                  toast.success('Phone updated — new authorization link sent');
                                  setEditingAuthId(null);
                                  setEditPhone('');
                                  return load();
                                })
                                .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not update phone'))
                                .finally(() => setActionId(null));
                            }}
                            className="rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
                            style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
                          >
                            Save new number
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAuthId(null);
                              setEditPhone('');
                            }}
                            className="rounded-xl px-3 py-2 text-xs font-semibold"
                            style={{ color: ON_SURFACE_VARIANT }}
                          >
                            Cancel edit
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                          {auth.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(auth.url).then(() => toast.success('Link copied'));
                              }}
                              className="flex items-center gap-1.5 text-xs font-semibold"
                              style={{ color: PRIMARY }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Copy link
                            </button>
                          ) : null}
                          {auth.status === 'claimed' ? (
                            <button
                              type="button"
                              onClick={() => navigate('/services/book-for-someone')}
                              className="text-xs font-semibold"
                              style={{ color: PRIMARY }}
                            >
                              Continue booking
                            </button>
                          ) : null}
                          {auth.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAuthId(auth.id);
                                setEditPhone(formatGuestPhoneDisplay(auth.phone_e164.replace(/^\+1/, '')));
                              }}
                              className="flex items-center gap-1 text-xs font-semibold"
                              style={{ color: ON_SURFACE_VARIANT }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit phone
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={actionId === auth.id}
                            onClick={() => {
                              setActionId(auth.id);
                              void cancelPassengerAuthorization(auth.id)
                                .then(() => {
                                  toast.success('Authorization cancelled');
                                  return load();
                                })
                                .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not cancel'))
                                .finally(() => setActionId(null));
                            }}
                            className="text-xs font-semibold disabled:opacity-50"
                            style={{ color: ON_SURFACE_VARIANT }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section>
            {incomingRequests.length === 0 ? (
              <p className="rounded-2xl p-4 text-sm" style={{ backgroundColor: SURFACE_LOWEST, color: ON_SURFACE_VARIANT, boxShadow: CARD_SHADOW }}>
                No incoming requests.
              </p>
            ) : (
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="rounded-2xl p-4" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {req.requester_display_name ?? 'Someone on Roam'}
                        {req.requester_custom_tag_name ? (
                          <span className="font-normal" style={{ color: ON_SURFACE_VARIANT }}> @{req.requester_custom_tag_name}</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                        Wants to connect with you on Roam
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actionId === req.id}
                        onClick={() => {
                          setActionId(req.id);
                          void acceptRoamConnectionRequest(req.id)
                            .then(() => { toast.success('Connected'); return load(); })
                            .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not accept'))
                            .finally(() => setActionId(null));
                        }}
                        className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
                      >
                        <Check className="h-4 w-4" />
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={actionId === req.id}
                        onClick={() => {
                          setActionId(req.id);
                          void rejectRoamConnectionRequest(req.id)
                            .then(() => { toast.message('Request declined'); return load(); })
                            .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not decline'))
                            .finally(() => setActionId(null));
                        }}
                        className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        style={{ color: ON_SURFACE_VARIANT }}
                      >
                        <X className="h-4 w-4" />
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={actionId === req.id}
                        onClick={() => {
                          if (!req.requester_user_id) return;
                          setActionId(req.id);
                          void createUserBlock({ blocked_user_id: req.requester_user_id })
                            .then(() => { toast.success('User blocked'); return load(); })
                            .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not block'))
                            .finally(() => setActionId(null));
                        }}
                        className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        style={{ color: ON_SURFACE_VARIANT }}
                      >
                        <UserMinus className="h-4 w-4" />
                        Block
                      </button>
                      <button
                        type="button"
                        disabled={actionId === req.id}
                        onClick={() => {
                          if (!req.requester_user_id) return;
                          setActionId(req.id);
                          void createAbuseReport({
                            reported_user_id: req.requester_user_id,
                            reason_code: 'spam',
                            context: { request_id: req.id },
                          })
                            .then(() => toast.success('Report submitted'))
                            .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not report'))
                            .finally(() => setActionId(null));
                        }}
                        className="rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        style={{ color: OUTLINE_VARIANT }}
                      >
                        Report
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
