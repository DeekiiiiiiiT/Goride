import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Search, ShieldCheck } from 'lucide-react';
import { contactInitials } from '@/lib/contactGroups';
import { contactsList } from '@/services/contactsEdge';
import { bulkMarkTrusted, MAX_TRUSTED_CONTACTS } from '@/services/trustedContactsEdge';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

export default function AddTrustedContactsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: trustedData } = useQuery({
    queryKey: ['trusted-contacts'],
    queryFn: () => contactsList({ trusted_for_safety: true }),
  });

  const { data: allData, isLoading } = useQuery({
    queryKey: ['roam-contacts-all'],
    queryFn: () => contactsList(),
  });

  const trustedCount = trustedData?.contacts.length ?? 0;
  const slotsLeft = MAX_TRUSTED_CONTACTS - trustedCount;

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (allData?.contacts ?? [])
      .filter((c) => !c.trusted_for_safety)
      .filter((c) => !q || c.display_name.toLowerCase().includes(q) || c.phone_e164.includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [allData?.contacts, query]);

  useEffect(() => {
    if (slotsLeft <= 0) {
      toast.error(t('addTrusted.alreadyMax', { max: MAX_TRUSTED_CONTACTS }));
      navigate('/account/contacts/trusted', { replace: true });
    }
  }, [slotsLeft, navigate, t]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= slotsLeft) {
        toast.error(
          t(slotsLeft === 1 ? 'addTrusted.canOnlyAdd' : 'addTrusted.canOnlyAdd_plural', { count: slotsLeft }),
        );
        return prev;
      }
      next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!selected.size) return;
    setSaving(true);
    try {
      await bulkMarkTrusted({ contact_ids: [...selected] });
      await queryClient.invalidateQueries({ queryKey: ['trusted-contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['roam-contacts-all'] });
      toast.success(
        t(selected.size === 1 ? 'addTrusted.added' : 'addTrusted.added_plural', { count: selected.size }),
      );
      navigate('/account/contacts/trusted', { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('addTrusted.couldNotUpdate'));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (selected.size > 0) {
      const ok = window.confirm(
        t(selected.size === 1 ? 'addTrusted.leaveConfirm' : 'addTrusted.leaveConfirm_plural', {
          count: selected.size,
        }),
      );
      if (ok) {
        void handleSubmit();
        return;
      }
    }
    navigate('/account/contacts/trusted');
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col"
      style={{
        backgroundColor: PAGE_BG,
        color: ON_SURFACE,
        paddingBottom: 'calc(4.5rem + 5.5rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <header
        className="sticky top-0 z-50 flex h-16 items-center justify-between px-5 safe-t"
        style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="rounded-full p-2"
          style={{ color: PRIMARY }}
          aria-label={t('addTrusted.backAria')}
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-base font-bold uppercase tracking-tight" style={{ color: PRIMARY }}>
          {t('addTrusted.title')}
        </h1>
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: PRIMARY }}
          >
            {saving ? t('addTrusted.saving') : t('addTrusted.addCount', { count: selected.size })}
          </button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-5 pt-6 safe-x">
        <div className="relative mb-3">
          <Search
            className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
            style={{ color: ON_SURFACE_VARIANT }}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('addTrusted.searchPlaceholder')}
            className="h-12 w-full rounded-xl border-none pl-12 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]"
            style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
          />
        </div>

        <button
          type="button"
          onClick={() => navigate('/account/contacts/new?return=/account/contacts/trusted/add')}
          className="mb-6 flex w-full items-center gap-3 rounded-xl border border-[rgba(0,74,198,0.1)] p-4 text-left transition-colors hover:bg-[rgba(0,74,198,0.03)]"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(0, 74, 198, 0.1)', color: PRIMARY }}
          >
            <Plus className="h-5 w-5" aria-hidden />
          </div>
          <span className="font-semibold" style={{ color: PRIMARY }}>
            {t('addTrusted.createNew')}
          </span>
        </button>

        <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: ON_SURFACE_VARIANT }}>
          {t('addTrusted.roamContacts')}
        </p>

        {isLoading ? (
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {tc('loading')}
          </p>
        ) : null}

        {!isLoading && available.length === 0 ? (
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {t('addTrusted.noAvailable')}
          </p>
        ) : null}

        <div className="space-y-3">
          {available.map((c) => {
            const checked = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="flex w-full items-center gap-4 rounded-2xl border border-[rgba(0,74,198,0.08)] p-4 text-left transition-transform active:scale-[0.99]"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ backgroundColor: PRIMARY_CONTAINER, color: PRIMARY }}
                >
                  {contactInitials(c.display_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.display_name}</p>
                  <p className="truncate text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                    {c.phone_e164}
                  </p>
                </div>
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
                  style={{
                    borderColor: checked ? PRIMARY : ON_SURFACE_VARIANT,
                    backgroundColor: checked ? PRIMARY : 'transparent',
                    color: '#fff',
                  }}
                >
                  {checked ? '✓' : null}
                </div>
              </button>
            );
          })}
        </div>
      </main>

      <div
        className="fixed inset-x-0 z-[60] bg-gradient-to-t from-[var(--passenger-page-bg)] via-[var(--passenger-page-bg)] to-[var(--passenger-page-bg)]/80 p-5 safe-x"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          disabled={!selected.size || saving}
          onClick={() => void handleSubmit()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-50 active:scale-[0.98]"
          style={{ backgroundColor: selected.size ? PRIMARY : '#1A1A1A' }}
        >
          <ShieldCheck className="h-5 w-5" aria-hidden />
          {saving
            ? t('addTrusted.saving')
            : selected.size > 0
              ? t('addTrusted.markAsTrusted', { count: selected.size })
              : t('addTrusted.selectToContinue')}
        </button>
      </div>
    </div>
  );
}
