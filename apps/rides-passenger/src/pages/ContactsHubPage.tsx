import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  MapPinPlus,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { RiderContactRow } from '@roam/types/riderContacts';
import { contactsList } from '@/services/contactsEdge';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import {
  listIncomingConnectionRequests,
  listOutgoingConnectionRequests,
  listOutgoingPassengerAuthorizations,
} from '@/services/roamConnectionsEdge';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { getHomePlace, getOtherPlaces, getWorkPlace } from '@/lib/savedPlaces';
import { SavedPlaceIconGlyph } from '@/components/contacts/SavedPlaceIconGlyph';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  ON_PRIMARY,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  PRIMARY_FIXED,
  SECONDARY,
  SECONDARY_CONTAINER,
  SURFACE_CONTAINER,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type HubTab = 'contacts' | 'places';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function relationLabel(contact: RiderContactRow) {
  if (contact.custom_tag_name) return `@${contact.custom_tag_name}`;
  if (contact.relation === 'other' && contact.relation_custom) return contact.relation_custom;
  return contact.relation.replace(/_/g, ' ');
}

const AVATAR_BG = [SURFACE_CONTAINER, SECONDARY_CONTAINER, PRIMARY_FIXED] as const;

function ContactCard({
  contact,
  index,
  onOpen,
  onAction,
}: {
  contact: RiderContactRow;
  index: number;
  onOpen: () => void;
  onAction: () => void;
}) {
  const { t } = useTranslation('contacts');
  const ActionIcon = contact.trusted_for_safety
    ? BadgeCheck
    : contact.phone_e164
      ? Phone
      : MessageCircle;

  return (
    <div
      className="flex items-center justify-between rounded-[2rem] p-5 transition-all active:scale-[0.98]"
      style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
          style={{
            backgroundColor: AVATAR_BG[index % AVATAR_BG.length],
            color: PRIMARY,
          }}
        >
          {initials(contact.display_name)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
            {contact.display_name}
          </p>
          <p className="truncate text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            {relationLabel(contact)}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onAction}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-90"
        style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
        aria-label={contact.trusted_for_safety ? t('hub.trustedContacts') : contact.phone_e164 ? t('places.callContact') : t('places.messageContact')}
      >
        <ActionIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

export default function ContactsHubPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const { places, isLoading: placesLoading, remove } = useSavedPlaces();

  const tab: HubTab = searchParams.get('tab') === 'places' ? 'places' : 'contacts';
  const [contacts, setContacts] = useState<RiderContactRow[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [pendingBadge, setPendingBadge] = useState(0);

  useEffect(() => {
    void (async () => {
      setLoadingContacts(true);
      try {
        const res = await contactsList();
        let list = res.contacts;
        if (ROAM_CONNECTIONS) {
          list = list.filter((c) => !c.linked_user_id || c.roam_account_linked);
        }
        setContacts([...list].sort((a, b) => a.display_name.localeCompare(b.display_name)));
      } catch {
        setContacts([]);
      } finally {
        setLoadingContacts(false);
      }
    })();
  }, []);

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

  const homePlace = useMemo(() => getHomePlace(places), [places]);
  const workPlace = useMemo(() => getWorkPlace(places), [places]);
  const otherPlaces = useMemo(() => getOtherPlaces(places), [places]);

  const setTab = (next: HubTab) => {
    if (next === 'contacts') {
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ tab: 'places' }, { replace: true });
    }
  };

  const handleDeletePlace = async (id: string) => {
    try {
      await remove(id);
      toast.success(t('places.deleted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('places.deleteFailed'));
    }
  };

  const openAddPlace = (icon?: 'home' | 'work') => {
    if (icon) {
      navigate(`/account/contacts/places/new?icon=${icon}`);
      return;
    }
    navigate('/account/contacts/places/new');
  };

  const handleFab = () => {
    if (tab === 'places') {
      openAddPlace();
    } else {
      navigate('/account/contacts/roam');
    }
  };

  const handleContactAction = (contact: RiderContactRow) => {
    if (contact.trusted_for_safety) {
      navigate('/account/contacts/trusted');
      return;
    }
    if (contact.phone_e164) {
      window.location.href = `tel:${contact.phone_e164}`;
      return;
    }
    navigate(`/account/contacts/${contact.id}`);
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
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
        <h1 className="ml-2 text-xl font-semibold" style={{ color: ON_SURFACE }}>
          {t('hub.pageTitle')}
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-6 safe-x">
        <div className="mb-6">
          <h2 className="text-3xl font-bold leading-tight tracking-tight" style={{ color: PRIMARY }}>
            {t('hub.sectionTitle')}
          </h2>
          <p className="mt-2 text-base" style={{ color: ON_SURFACE_VARIANT }}>
            {t('hub.sectionSubtitle')}
          </p>
        </div>

        <nav
          className="relative z-10 mb-10 flex rounded-full p-1.5"
          style={{ backgroundColor: SURFACE_CONTAINER }}
          aria-label={t('hub.tabLabel')}
        >
          {(['contacts', 'places'] as const).map((id) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="flex-1 rounded-full py-3 text-sm font-semibold tracking-wide transition-all duration-300"
                style={{
                  backgroundColor: active ? SURFACE_LOWEST : 'transparent',
                  color: active ? PRIMARY : SECONDARY,
                  boxShadow: active ? CARD_SHADOW : undefined,
                }}
              >
                {id === 'contacts' ? t('hub.tabContacts') : t('hub.tabPlaces')}
              </button>
            );
          })}
        </nav>

        {tab === 'contacts' ? (
          <div className="space-y-3">
            {ROAM_CONNECTIONS ? (
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/account/contacts/pending')}
                  className="flex items-center justify-between rounded-2xl px-4 py-3 text-left"
                  style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" style={{ color: PRIMARY }} />
                    <span className="text-xs font-semibold">{t('hub.pending')}</span>
                  </div>
                  {pendingBadge > 0 ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
                    >
                      {pendingBadge}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/account/contacts/trusted')}
                  className="flex items-center gap-2 rounded-2xl px-4 py-3 text-left"
                  style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                >
                  <ShieldCheck className="h-4 w-4" style={{ color: PRIMARY }} />
                  <span className="text-xs font-semibold">{t('hub.trustedContacts')}</span>
                </button>
              </div>
            ) : null}

            {loadingContacts ? (
              <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                {tc('loading')}
              </p>
            ) : contacts.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-10 text-center"
                style={{ borderColor: 'rgba(195,198,215,0.5)' }}
              >
                <UserPlus className="mb-4 h-10 w-10" style={{ color: OUTLINE_VARIANT }} />
                <p className="text-sm font-semibold" style={{ color: ON_SURFACE_VARIANT }}>
                  {t('hub.expandCircle')}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/account/contacts/roam')}
                  className="mt-4 rounded-full px-8 py-2 text-sm font-semibold text-white active:scale-95"
                  style={{ backgroundColor: ON_SURFACE }}
                >
                  {t('hub.addContact')}
                </button>
              </div>
            ) : (
              <>
                {contacts.map((contact, index) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    index={index}
                    onOpen={() => navigate(`/account/contacts/${contact.id}`)}
                    onAction={() => handleContactAction(contact)}
                  />
                ))}
                <div
                  className="mt-4 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center"
                  style={{ borderColor: 'rgba(195,198,215,0.5)' }}
                >
                  <UserPlus className="mb-3 h-8 w-8" style={{ color: OUTLINE_VARIANT }} />
                  <p className="text-sm font-semibold" style={{ color: ON_SURFACE_VARIANT }}>
                    {t('hub.expandCircle')}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/account/contacts/roam')}
                    className="mt-3 rounded-full px-8 py-2 text-sm font-semibold text-white active:scale-95"
                    style={{ backgroundColor: ON_SURFACE }}
                  >
                    {t('hub.addContact')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {placesLoading ? (
              <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                {tc('loading')}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              {[homePlace, workPlace].map((place, i) => {
                const isHome = i === 0;
                const label = isHome ? t('places.home') : t('places.work');
                const slotIcon = isHome ? 'home' : 'work';
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => openAddPlace(slotIcon)}
                    className="flex flex-col items-start gap-4 rounded-[2rem] p-6 text-left active:scale-[0.98]"
                    style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                  >
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm"
                      style={
                        isHome
                          ? { background: 'linear-gradient(135deg, #003ea8 0%, #2563eb 100%)', color: '#fff' }
                          : { backgroundColor: SURFACE_LOWEST, border: '1px solid rgba(0,74,198,0.1)', color: PRIMARY }
                      }
                    >
                      <SavedPlaceIconGlyph icon={isHome ? 'home' : 'work'} className="h-6 w-6" filled={isHome} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                        {label}
                      </h4>
                      <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                        {place?.address ?? t('places.tapToSet')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {otherPlaces.length > 0 ? (
              <div>
                <h3
                  className="mb-4 px-2 text-sm font-semibold uppercase tracking-widest"
                  style={{ color: SECONDARY }}
                >
                  {t('places.otherPlaces')}
                </h3>
                <div className="space-y-3">
                  {otherPlaces.map((place) => (
                    <div
                      key={place.id}
                      className="flex items-center gap-4 rounded-[2rem] p-4"
                      style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                    >
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: SURFACE_CONTAINER, color: PRIMARY }}
                      >
                        <SavedPlaceIconGlyph icon={place.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                          {place.name}
                        </p>
                        <p className="truncate text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                          {place.address}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeletePlace(place.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:scale-90"
                        style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE_VARIANT }}
                        aria-label={t('places.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => openAddPlace()}
              className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed py-4 text-sm font-semibold transition-all active:scale-[0.98]"
              style={{ borderColor: 'rgba(195,198,215,0.3)', color: ON_SURFACE_VARIANT }}
            >
              <MapPinPlus className="h-5 w-5" />
              {t('places.pinNewPlace')}
            </button>
          </div>
        )}
      </main>

      <button
        type="button"
        onClick={handleFab}
        className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl active:scale-90"
        style={{ background: 'linear-gradient(135deg, #003ea8 0%, #2563eb 100%)' }}
        aria-label={tab === 'places' ? t('places.addNewTitle') : t('hub.addContact')}
      >
        <Plus className="h-7 w-7" />
      </button>
    </div>
  );
}
