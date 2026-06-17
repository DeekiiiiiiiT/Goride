import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, MoreVertical, Search, UserPlus } from 'lucide-react';
import type { RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
import {
  contactGroupAddMembers,
  contactGroupGet,
  contactGroupRemoveMember,
  contactGroupUpdate,
  contactsList,
} from '@/services/contactsEdge';
import { AddGroupMembersSheet } from '@/components/contacts/AddGroupMembersSheet';
import { GroupIconCircle } from '@/components/contacts/GroupIconCircle';
import { contactInitials } from '@/lib/contactGroups';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

export default function ContactGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const [group, setGroup] = useState<(RiderContactGroupRow & { members: RiderContactRow[] }) | null>(null);
  const [allContacts, setAllContacts] = useState<RiderContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [memberMenuId, setMemberMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detailRes, contactsRes] = await Promise.all([
        contactGroupGet(id),
        contactsList(),
      ]);
      setGroup(detailRes.group);
      setAllContacts(contactsRes.contacts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('groupDetail.couldNotLoad'));
      navigate('/account/contacts/groups', { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const members = useMemo(() => {
    if (!group?.members) return [];
    const q = query.trim().toLowerCase();
    return group.members
      .filter((m) =>
        !q ||
        m.display_name.toLowerCase().includes(q) ||
        m.phone_e164.includes(q),
      )
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [group, query]);

  const memberIds = useMemo(
    () => new Set((group?.members ?? []).map((m) => m.id)),
    [group],
  );

  const memberCount = group?.member_count ?? group?.members.length ?? 0;

  const handleTogglePin = async () => {
    if (!group) return;
    try {
      await contactGroupUpdate(group.id, { is_pinned: !group.is_pinned });
      toast.success(group.is_pinned ? t('groups.unpinned') : t('groups.pinned'));
      setMenuOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('groups.couldNotUpdate'));
    }
  };

  const handleRemoveMember = async (contactId: string) => {
    if (!group) return;
    try {
      await contactGroupRemoveMember(group.id, contactId);
      toast.success(t('groupDetail.removedFromGroup'));
      setMemberMenuId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('groupDetail.couldNotRemove'));
    }
  };

  const handleAddMembers = async (contactIds: string[]) => {
    if (!group) return;
    await contactGroupAddMembers(group.id, { contact_ids: contactIds });
    toast.success(
      t(contactIds.length === 1 ? 'groupDetail.addedMembers' : 'groupDetail.addedMembers_plural', {
        count: contactIds.length,
      }),
    );
    await load();
  };

  if (loading || !group) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>{tc('loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between bg-[#f7f9fb] px-4 safe-t">
        <div className="flex min-w-0 items-center">
          <button
            type="button"
            onClick={() => navigate('/account/contacts/groups')}
            className="rounded-full p-2"
            style={{ color: PRIMARY }}
            aria-label={tc('back')}
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="ml-2 truncate text-xl font-semibold" style={{ color: PRIMARY }}>
            {group.name}
          </h1>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-full p-2"
            style={{ color: PRIMARY }}
            aria-label={t('groupDetail.groupOptionsAria')}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-xl py-1"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <button type="button" onClick={() => void handleTogglePin()} className="block w-full px-4 py-2.5 text-left text-sm">
                {group.is_pinned ? t('groupDetail.unpinGroup') : t('groupDetail.pinGroup')}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 py-4 safe-x">
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <GroupIconCircle emoji={group.emoji} color={group.color} size="lg" />
          <h2 className="text-xl font-bold">{group.name}</h2>
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {t(memberCount === 1 ? 'groups.member' : 'groups.member_plural', { count: memberCount })}
            {group.is_system ? ` · ${t('groupDetail.defaultGroup')}` : null}
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: ON_SURFACE_VARIANT }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('groupDetail.searchMembers')}
            className="h-12 w-full rounded-2xl border-none pl-11 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          />
        </div>

        {members.length === 0 ? (
          <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {query ? t('groupDetail.noMatchingMembers') : t('groupDetail.noMembers')}
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="relative">
                <button
                  type="button"
                  onClick={() => navigate(`/account/contacts/${m.id}`)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMemberMenuId(m.id);
                  }}
                  className="flex w-full items-center gap-4 rounded-2xl p-4 text-left"
                  style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
                  >
                    {contactInitials(m.display_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{m.display_name}</p>
                    <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                      {m.phone_e164}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMemberMenuId((cur) => (cur === m.id ? null : m.id))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2"
                  style={{ color: ON_SURFACE_VARIANT }}
                  aria-label={t('groupDetail.memberOptionsAria')}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {memberMenuId === m.id ? (
                  <div
                    className="absolute right-3 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-xl py-1"
                    style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                  >
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(m.id)}
                      className="block w-full px-4 py-2.5 text-left text-sm"
                      style={{ color: '#b91c1c' }}
                    >
                      {t('groupDetail.removeFromGroup')}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t px-4 py-4 safe-x safe-b" style={{ backgroundColor: SURFACE_LOWEST, borderColor: SURFACE_LOW }}>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mx-auto flex h-14 w-full max-w-2xl items-center justify-center gap-2 rounded-2xl text-base font-semibold"
          style={{ backgroundColor: PRIMARY, color: '#fff' }}
        >
          <UserPlus className="h-5 w-5" />
          {t('groupDetail.addMembers')}
        </button>
      </div>

      <AddGroupMembersSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingMemberIds={memberIds}
        contacts={allContacts}
        onAdd={handleAddMembers}
      />
    </div>
  );
}
