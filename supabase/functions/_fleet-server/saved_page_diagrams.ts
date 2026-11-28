/**
 * R7 (docs/part-type-learning-audit.md §3, §2 D4): the page's drawings, kept privately for 30 days so a part type
 * added an hour after the upload can still get a picture (PT-16).
 *
 * At upload the drawings are read out of the single-file page once, up to 3 are stored here, and the same set is passed
 * to the picture queue. At Add they are loaded back for that upload. The picture worker deletes a file past its
 * `delete_after` and then marks the row, the same way it treats a picture's own diagram.
 *
 * Every read names its columns: the table is server-only (D4), and a `select("*")` would start returning new columns.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { imageExtension, type SavedPageImages } from "./saved_page_text.ts";

export const SAVED_PAGE_DIAGRAM_COLUMNS =
  "id, saved_page_id, r2_key, content_type, width, height, map_box, delete_after, deleted_at, created_at";

export type SavedPageDiagramRow = {
  id: string;
  saved_page_id: string;
  r2_key: string;
  content_type: string;
  width: number;
  height: number;
  map_box: unknown;
  delete_after: string;
  deleted_at: string | null;
  created_at: string;
};

/** The private R2 surface this module needs (R2Client satisfies it; tests pass a fake). */
export type SavedPageDiagramStore = {
  put(
    bucket: "public" | "private",
    key: string,
    bytes: Uint8Array,
    contentType: string,
    cacheControl: string,
  ): Promise<void>;
  read(bucket: "public" | "private", key: string): Promise<Uint8Array>;
  remove(bucket: "public" | "private", keys: string[]): Promise<void>;
};

/** D4: at most this many drawings per upload. */
export const MAX_PAGE_DRAWINGS = 3;
const DIAGRAM_BUCKET = "private" as const;
const DIAGRAM_CACHE = "private, no-store";

const uuid = () => crypto.randomUUID();

/**
 * Which drawings to keep, in the order the picture queue would look at them: the images the page's map wires to a part
 * first, then the biggest ones. At most 3 (D4), and only pictures the page itself carries.
 */
function drawingsToKeep(images: SavedPageImages): SavedPageImages["images"] {
  const mapped = images.images.filter((image) => image.usemap && (images.maps[image.usemap] ?? []).length > 0);
  const rest = images.images
    .filter((image) => !mapped.includes(image))
    .sort((a, b) => b.width * b.height - a.width * a.height);
  return [...mapped, ...rest].slice(0, MAX_PAGE_DRAWINGS);
}

/**
 * D4: store up to 3 of the page's drawings for this upload and return them as the picture queue's input.
 *
 * `delete_after` is left to the table's own 30-day default (D4 says 30 days, not the picture switch's retention).
 * The map rectangle is kept only when the page wires one drawing to exactly one part: with several areas there is no
 * one box for "this drawing", and the box is a hint only.
 */
export async function storePageDrawings(
  supabase: SupabaseClient,
  args: { savedPageId: string; images: SavedPageImages; r2: SavedPageDiagramStore | null },
): Promise<SavedPageImages> {
  const keep = drawingsToKeep(args.images);
  if (!keep.length) return { images: [], maps: args.images.maps };
  // No object storage (a local copy): nothing can be stored, and nothing can be loaded back later either.
  if (!args.r2) return { images: [], maps: args.images.maps };

  const images: SavedPageImages["images"] = [];
  for (const image of keep) {
    const ext = imageExtension(image.contentType) || "bin";
    const key = `part-diagrams/pages/${args.savedPageId}/${uuid()}.${ext}`;
    const areas = image.usemap ? args.images.maps[image.usemap] ?? [] : [];
    const mapBox = areas.length === 1 ? areas[0].box : null;
    try {
      await args.r2.put(DIAGRAM_BUCKET, key, image.bytes, image.contentType, DIAGRAM_CACHE);
      const { error } = await supabase.from("research_saved_page_diagram").insert({
        saved_page_id: args.savedPageId,
        r2_key: key,
        content_type: image.contentType,
        width: Math.max(1, Math.round(image.width)),
        height: Math.max(1, Math.round(image.height)),
        map_box: mapBox,
      });
      if (error) throw error;
      images.push({ ...image, source: key });
    } catch (err) {
      // Best effort: a drawing that could not be kept never fails the upload (PP-25 applies here too).
      console.error("saved page drawing not stored", err);
    }
  }
  return { images, maps: args.images.maps };
}

/** A stored row → the image the picture queue reads, with no page left to say which map area belongs to which part. */
export function drawingFromRow(row: SavedPageDiagramRow, bytes: Uint8Array): SavedPageImages["images"][number] {
  return {
    contentType: row.content_type,
    bytes,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    usemap: null,
    source: row.r2_key,
  };
}

/**
 * R7: the drawings kept for one upload, for a part type added after the upload. Empty when the upload kept none (an
 * `.html` page, or no object storage), which is the `noDiagram` case.
 */
export async function loadPageDrawings(
  supabase: SupabaseClient,
  args: { savedPageId: string; r2: SavedPageDiagramStore | null },
): Promise<SavedPageImages> {
  const empty: SavedPageImages = { images: [], maps: {} };
  if (!args.r2) return empty;
  const { data, error } = await supabase
    .from("research_saved_page_diagram")
    .select(SAVED_PAGE_DIAGRAM_COLUMNS)
    .eq("saved_page_id", args.savedPageId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_PAGE_DRAWINGS);
  if (error) throw error;
  const images: SavedPageImages["images"] = [];
  for (const row of (data ?? []) as SavedPageDiagramRow[]) {
    try {
      images.push(drawingFromRow(row, await args.r2.read(DIAGRAM_BUCKET, row.r2_key)));
    } catch (err) {
      console.error("saved page drawing unreadable", err);
    }
  }
  return { images, maps: {} };
}

/** The drawings past their 30 days that still have a file, newest deadline first (the picture worker deletes them). */
export async function duePageDrawings(
  supabase: SupabaseClient,
  limit: number,
  nowIso: string = new Date().toISOString(),
): Promise<Array<{ id: string; r2Key: string }>> {
  const { data, error } = await supabase
    .from("research_saved_page_diagram")
    .select("id, r2_key")
    .is("deleted_at", null)
    .lte("delete_after", nowIso)
    .order("delete_after", { ascending: true })
    .limit(Math.max(0, limit));
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; r2_key: string }>).map((row) => ({ id: String(row.id), r2Key: String(row.r2_key) }));
}

/** Mark one stored drawing's file gone. Only after R2 confirms the delete. */
export async function markPageDrawingDeleted(supabase: SupabaseClient, id: string, deletedAtIso: string): Promise<void> {
  const { error } = await supabase.from("research_saved_page_diagram").update({ deleted_at: deletedAtIso }).eq("id", id);
  if (error) throw error;
}
