import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RidesContactsTables } from "../_shared/ridesContactsDb.ts";
import { SYSTEM_DEFAULT_GROUPS } from "./contactGroupCatalog.ts";

type GroupRow = Record<string, unknown>;

export async function ensureDefaultContactGroups(
  db: SupabaseClient,
  tables: RidesContactsTables,
  ownerId: string,
): Promise<void> {
  const { data: existing } = await db.from(tables.rider_contact_groups)
    .select("name")
    .eq("owner_user_id", ownerId)
    .eq("is_system", true);

  const have = new Set((existing ?? []).map((r) => String(r.name).toLowerCase()));
  const now = new Date().toISOString();

  for (const def of SYSTEM_DEFAULT_GROUPS) {
    if (have.has(def.name.toLowerCase())) continue;
    await db.from(tables.rider_contact_groups).insert({
      owner_user_id: ownerId,
      name: def.name,
      emoji: def.emoji,
      color: def.color,
      is_system: true,
      is_pinned: def.is_pinned,
      sort_order: def.sort_order,
      updated_at: now,
    });
  }
}

function systemNameTaken(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return SYSTEM_DEFAULT_GROUPS.some((d) => d.name.toLowerCase() === lower);
}

export function isSystemGroup(row: GroupRow): boolean {
  return row.is_system === true;
}

async function loadMembersForGroup(
  db: SupabaseClient,
  tables: RidesContactsTables,
  groupId: string,
  ownerId: string,
): Promise<Record<string, unknown>[]> {
  const { data: members } = await db.from(tables.rider_contact_group_members)
    .select("contact_id")
    .eq("group_id", groupId);
  if (!members?.length) return [];
  const contactIds = members.map((m) => m.contact_id as string);
  const { data: contacts } = await db.from(tables.rider_contacts)
    .select("id, display_name, phone_e164, relation, relation_custom, linked_user_id")
    .eq("owner_user_id", ownerId)
    .in("id", contactIds)
    .order("display_name");
  return contacts ?? [];
}

export async function enrichGroupSummary(
  db: SupabaseClient,
  tables: RidesContactsTables,
  group: GroupRow,
  ownerId: string,
): Promise<Record<string, unknown>> {
  const members = await loadMembersForGroup(db, tables, group.id as string, ownerId);
  const preview = members.slice(0, 3).map((m) => ({
    id: m.id,
    display_name: m.display_name,
    linked_user_id: m.linked_user_id ?? null,
  }));
  return {
    ...group,
    member_count: members.length,
    preview_members: preview,
  };
}

export async function enrichGroupDetail(
  db: SupabaseClient,
  tables: RidesContactsTables,
  group: GroupRow,
  ownerId: string,
): Promise<Record<string, unknown>> {
  const members = await loadMembersForGroup(db, tables, group.id as string, ownerId);
  return {
    ...group,
    member_count: members.length,
    members,
  };
}

export async function addContactsToGroup(
  db: SupabaseClient,
  tables: RidesContactsTables,
  ownerId: string,
  groupId: string,
  contactIds: string[],
): Promise<number> {
  if (!contactIds.length) return 0;
  const { data: validContacts } = await db.from(tables.rider_contacts)
    .select("id")
    .eq("owner_user_id", ownerId)
    .in("id", contactIds);
  const validIds = (validContacts ?? []).map((c) => c.id as string);
  if (!validIds.length) return 0;

  const { data: existing } = await db.from(tables.rider_contact_group_members)
    .select("contact_id")
    .eq("group_id", groupId)
    .in("contact_id", validIds);
  const existingSet = new Set((existing ?? []).map((r) => r.contact_id as string));
  const toInsert = validIds
    .filter((id) => !existingSet.has(id))
    .map((contact_id) => ({ group_id: groupId, contact_id }));

  if (toInsert.length) {
    await db.from(tables.rider_contact_group_members).insert(toInsert);
    await db.from(tables.rider_contact_groups).update({
      updated_at: new Date().toISOString(),
    }).eq("id", groupId);
  }
  return toInsert.length;
}

export { systemNameTaken };
