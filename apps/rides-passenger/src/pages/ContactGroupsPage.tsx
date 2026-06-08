import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Pin, Plus } from 'lucide-react';
import type { RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
import {
  contactGroupAddMembers,
  contactGroupCreate,
  contactGroupDelete,
  contactGroupGet,
  contactGroupUpdate,
  contactGroupsList,
  contactsList,
} from '@/services/contactsEdge';
import { AddGroupMembersSheet } from '@/components/contacts/AddGroupMembersSheet';
import { CreateGroupSheet } from '@/components/contacts/CreateGroupSheet';
import { GroupActionsMenu } from '@/components/contacts/GroupActionsMenu';
import { GroupIconCircle } from '@/components/contacts/GroupIconCircle';
import { GroupMemberAvatarStack } from '@/components/contacts/GroupMemberAvatarStack';
import { sortGroupsByName, sortGroupsByRecent, sortPinnedGroups } from '@/lib/contactGroups';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type SortMode = 'recent' | 'name';

export default function ContactGroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<RiderContactGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [allContacts, setAllContacts] = useState<RiderContactRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addGroupId, setAddGroupId] = useState<string | null>(null);
  const [addMemberIds, setAddMemberIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contactGroupsList();
      setGroups(res.groups);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pinnedGroups = useMemo(
    () => groups.filter((g) => g.is_pinned).sort(sortPinnedGroups),
    [groups],
  );

  const unpinnedGroups = useMemo(() => {
    const list = groups.filter((g) => !g.is_pinned);
    list.sort(sortMode === 'recent' ? sortGroupsByRecent : sortGroupsByName);
    return list;
  }, [groups, sortMode]);

  const handleCreate = async (payload: { name: string; emoji: string; color: string }) => {
    await contactGroupCreate(payload);
    toast.success('Group created');
    await load();
  };

  const handleTogglePin = async (group: RiderContactGroupRow) => {
    try {
      await contactGroupUpdate(group.id, { is_pinned: !group.is_pinned });
      toast.success(group.is_pinned ? 'Unpinned' : 'Pinned');
      setMenuGroupId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update group');
    }
  };

  const handleDelete = async (group: RiderContactGroupRow) => {
    try {
      await contactGroupDelete(group.id);
      toast.success('Group deleted');
      setMenuGroupId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete group');
    }
  };

  const handleAddContacts = async (group: RiderContactGroupRow) => {
    setMenuGroupId(null);
    try {
      const [contactsRes, detailRes] = await Promise.all([
        allContacts.length > 0 ? Promise.resolve({ contacts: allContacts }) : contactsList(),
        contactGroupGet(group.id),
      ]);
      if (!allContacts.length) setAllContacts(contactsRes.contacts);
      setAddMemberIds(new Set(detailRes.group.members.map((m) => m.id)));
      setAddGroupId(group.id);
      setAddOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load contacts');
    }
  };

  const handleAddMembers = async (contactIds: string[]) => {
    if (!addGroupId) return;
    await contactGroupAddMembers(addGroupId, { contact_ids: contactIds });
    toast.success(`Added ${contactIds.length} contact${contactIds.length === 1 ? '' : 's'}`);
    setAddOpen(false);
    setAddGroupId(null);
    await load();
  };

  const renderGroupRow = (g: RiderContactGroupRow) => (
    <li key={g.id} className="relative overflow-visible">
      <div
        className="flex items-stretch rounded-2xl"
        style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      >
        <button
          type="button"
          onClick={() => {
            if (menuGroupId) setMenuGroupId(null);
            else navigate(`/account/contacts/groups/${g.id}`);
          }}
          className="flex min-w-0 flex-1 items-center gap-3 p-4 pr-2 text-left"
        >
          <GroupIconCircle emoji={g.emoji} color={g.color} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {g.is_pinned ? (
                <Pin className="h-3.5 w-3.5 shrink-0" style={{ color: PRIMARY }} aria-label="Pinned" />
              ) : null}
              <p className="truncate font-semibold">{g.name}</p>
            </div>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {g.member_count ?? 0} member{(g.member_count ?? 0) === 1 ? '' : 's'}
            </p>
          </div>
          <GroupMemberAvatarStack
            members={(g.preview_members ?? []).map((m) => ({
              id: m.id,
              display_name: m.display_name,
            }))}
            size="sm"
            showEmptyLabel={false}
          />
        </button>
        <GroupActionsMenu
          group={g}
          open={menuGroupId === g.id}
          onToggle={() => setMenuGroupId((id) => (id === g.id ? null : g.id))}
          onClose={() => setMenuGroupId(null)}
          onPin={() => void handleTogglePin(g)}
          onAddContacts={() => void handleAddContacts(g)}
          onDelete={() => void handleDelete(g)}
        />
      </div>
    </li>
  );

  const hasGroups = pinnedGroups.length > 0 || unpinnedGroups.length > 0;

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 items-center bg-[#f7f9fb] px-4 safe-t">
        <button
          type="button"
          onClick={() => navigate('/account/contacts/roam')}
          className="rounded-full p-2"
          style={{ color: PRIMARY }}
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>
          Groups
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 safe-x">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              ALL GROUPS
            </p>
            <div className="flex rounded-full p-0.5" style={{ backgroundColor: SURFACE_LOW }}>
              <button
                type="button"
                onClick={() => setSortMode('recent')}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: sortMode === 'recent' ? SURFACE_LOWEST : 'transparent',
                  color: sortMode === 'recent' ? PRIMARY : ON_SURFACE_VARIANT,
                }}
              >
                Recent
              </button>
              <button
                type="button"
                onClick={() => setSortMode('name')}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: sortMode === 'name' ? SURFACE_LOWEST : 'transparent',
                  color: sortMode === 'name' ? PRIMARY : ON_SURFACE_VARIANT,
                }}
              >
                Name
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Loading…
            </p>
          ) : !hasGroups ? (
            <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              No groups yet. Create one to organize contacts.
            </p>
          ) : (
            <ul className="space-y-2">
              {pinnedGroups.map(renderGroupRow)}
              {pinnedGroups.length > 0 && unpinnedGroups.length > 0 ? (
                <li aria-hidden className="list-none py-1">
                  <div className="border-b" style={{ borderColor: OUTLINE_VARIANT }} />
                </li>
              ) : null}
              {unpinnedGroups.map(renderGroupRow)}
            </ul>
          )}
        </section>
      </main>

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="fixed right-4 z-[45] flex h-14 w-14 items-center justify-center rounded-full shadow-lg safe-r"
        style={{
          backgroundColor: PRIMARY,
          color: '#fff',
          bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px) + 1rem)',
        }}
        aria-label="Create group"
      >
        <Plus className="h-6 w-6" />
      </button>

      <CreateGroupSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />

      <AddGroupMembersSheet
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddGroupId(null);
        }}
        existingMemberIds={addMemberIds}
        contacts={allContacts}
        onAdd={handleAddMembers}
      />
    </div>
  );
}

