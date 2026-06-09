import { getRidesContactsDb } from "../_shared/ridesContactsDb.ts";

/** Load a passenger's public custom tag name (without @ prefix). */
export async function loadCustomTagNameForUser(userId: string): Promise<string | null> {
  const { db, tables } = await getRidesContactsDb();
  const { data, error } = await db.from(tables.roam_passenger_tags)
    .select("custom_tag_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[passenger_identity] tag_load_failed", userId, error.message);
    return null;
  }

  const name = data?.custom_tag_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
