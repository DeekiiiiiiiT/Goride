/**
 * §3.2 — after the parts are saved, queue a picture for every proven Roam-type row, `saved` or `already on file`
 * (PP-08: most numbers are already on file, so queueing only new ones would picture almost nothing).
 *
 * Per row: find its interchange group; skip when the group's template is off or a picture already exists
 * (ready / queued / making / hidden); otherwise add `part_picture` (queued) and store its diagram(s) in the PRIVATE
 * bucket. Best effort: any error is logged, the upload still succeeds, and `pictures.failed` says so (PP-25).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  diagramsForPart,
  imageExtension,
  partAreaTitleFromGroupLine,
  partLabelFromGroupLine,
  type SavedPageImages,
} from "./saved_page_text.ts";
import {
  loadPartPicturesSettings,
  type PartPicturesSettings,
} from "./part_pictures_settings.ts";

export type PictureRowStatus = "queued" | "alreadyHave" | "noDiagram" | "templateOff";

export type PicturesResult = {
  queued: number;
  alreadyHave: number;
  noDiagram: number;
  /** The picture step threw: the parts are saved, the pictures were not queued. */
  failed: boolean;
  rows: Array<{ number: string; status: PictureRowStatus }>;
};

export function emptyPictures(): PicturesResult {
  return { queued: 0, alreadyHave: 0, noDiagram: 0, failed: false, rows: [] };
}

/** One proven row to picture. `groupLine` is the page's own group row, used for the label and the image map. */
export type PartPictureQueueRow = {
  number: string;
  lineNo: number;
  groupLine: string | null;
  componentId: string;
};

/** The one R2 call this step makes: the diagram goes to the private bucket. */
export type PartDiagramStore = {
  put(
    bucket: "public" | "private",
    key: string,
    bytes: Uint8Array,
    contentType: string,
    cacheControl: string,
  ): Promise<void>;
};

export type PartPictureQueueDeps = {
  r2: PartDiagramStore | null;
  loadSettings?: () => Promise<PartPicturesSettings>;
  now?: () => Date;
};

const DIAGRAM_BUCKET = "private" as const;
const DIAGRAM_CACHE = "private, no-store";
const PICTURES_ALREADY = new Set(["ready", "queued", "making", "hidden"]);

const norm = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const uuid = () => crypto.randomUUID();

type MasterRow = {
  oem_part_number: string | null;
  oem_part_number_norm: string | null;
  manufacturer: string | null;
  name: string | null;
  maintenance_component_id: string | null;
  interchange_group_id: string | null;
  catalog_decision: string | null;
};

type ExistingPicture = { id: string; interchange_group_id: string; status: string; version: number };

/**
 * Queue the pictures. Returns null when AI part pictures are off (S1 shows no pictures line at all).
 * Never throws.
 *
 * R7: the drawings are handed in, never read from a file here — at upload they are the page's drawings (read once and
 * kept in research_saved_page_diagram), and at Add they are the ones loaded back from that table.
 */
export async function queuePartPictures(
  supabase: SupabaseClient,
  args: {
    drawings: SavedPageImages;
    savedPageId: string;
    carMake: string | null;
    rows: PartPictureQueueRow[];
  },
  deps: PartPictureQueueDeps,
): Promise<PicturesResult | null> {
  let result = emptyPictures();
  try {
    const loadSettings = deps.loadSettings ?? loadPartPicturesSettings;
    const settings = await loadSettings();
    if (settings.ai_part_pictures !== true) return null;
    if (!args.rows.length) return result;

    const now = (deps.now ?? (() => new Date()))();

    // 1. The physical part behind each number (explicit columns; the group is the picture's key).
    const norms = [...new Set(args.rows.map((r) => norm(r.number)).filter(Boolean))];
    const masters = await selectIn<MasterRow>(
      supabase,
      "part_master",
      "oem_part_number, oem_part_number_norm, manufacturer, name, maintenance_component_id, interchange_group_id, catalog_decision",
      "oem_part_number_norm",
      norms,
    );
    const masterByNumber = new Map<string, MasterRow>();
    for (const master of masters) {
      if (String(master.catalog_decision ?? "") === "rejected") continue;
      const key = norm(master.oem_part_number_norm ?? master.oem_part_number);
      if (!key) continue;
      const current = masterByNumber.get(key);
      // One number can sit under two makers in one group; prefer the car's own make for the display name.
      if (!current || (sameText(current.manufacturer, args.carMake) === false && sameText(master.manufacturer, args.carMake))) {
        masterByNumber.set(key, master);
      }
    }

    // 2. The catalogue group behind each part type (Brakes, Engine…) — its template carries the materials line.
    const componentIds = [...new Set(masters.map((m) => m.maintenance_component_id).filter((v): v is string => Boolean(v)))];
    const components = await selectIn<{ id: string; parent_id: string | null }>(
      supabase,
      "maintenance_service_categories",
      "id, parent_id",
      "id",
      componentIds,
    );
    const groupOfComponent = new Map(components.map((c) => [c.id, c.parent_id]));

    // 3. The templates (one row per part group) — small and fixed.
    const { data: templateData, error: templateError } = await supabase
      .from("part_picture_template")
      .select("catalog_group_id, materials, enabled, version");
    if (templateError) throw templateError;
    const templateByGroup = new Map(
      ((templateData ?? []) as Array<Record<string, unknown>>).map((row) => [
        String(row.catalog_group_id),
        { materials: String(row.materials ?? ""), enabled: row.enabled === true, version: Number(row.version ?? 1) },
      ]),
    );

    // 4. Which groups already have a picture.
    const groupIds = [...new Set(masters.map((m) => m.interchange_group_id).filter((v): v is string => Boolean(v)))];
    const existing = await selectIn<ExistingPicture>(
      supabase,
      "part_picture",
      "id, interchange_group_id, status, version",
      "interchange_group_id",
      groupIds,
    );
    const pictureByGroup = new Map(existing.map((p) => [p.interchange_group_id, p]));

    // 5. The drawings this upload kept (R7): read once at upload, loaded from the table at Add.
    const images = args.drawings;

    // Diagrams already stored for a failed picture we are re-queueing.
    const failedIds = existing.filter((p) => p.status === "failed").map((p) => p.id);
    const storedDiagramPictureIds = new Set(
      (
        await selectIn<{ picture_id: string }>(
          supabase,
          "part_picture_diagram",
          "picture_id",
          "picture_id",
          failedIds,
        )
      ).map((row) => row.picture_id),
    );

    // One part can appear on several rows of a page (the same number for two periods). It is queued once; its other
    // rows answer the same, and never insert a second picture for the group (that broke the whole upload's queue).
    const queuedThisRun = new Set<string>();

    for (const row of args.rows) {
      const master = masterByNumber.get(norm(row.number));
      const groupId = master?.interchange_group_id ? String(master.interchange_group_id) : "";
      if (groupId && queuedThisRun.has(groupId)) {
        result.rows.push({ number: row.number, status: "queued" });
        continue;
      }
      if (!master || !groupId) {
        result.noDiagram++;
        result.rows.push({ number: row.number, status: "noDiagram" });
        continue;
      }

      const componentId = master.maintenance_component_id ? String(master.maintenance_component_id) : row.componentId;
      const catalogGroupId = groupOfComponent.get(componentId) ?? null;
      const template = catalogGroupId ? templateByGroup.get(catalogGroupId) : undefined;
      if (template && template.enabled === false) {
        // PP-10: Fluids and tyres start off. Nothing is queued and nothing is counted.
        result.rows.push({ number: row.number, status: "templateOff" });
        continue;
      }

      const picture = pictureByGroup.get(groupId);
      if (picture && PICTURES_ALREADY.has(picture.status)) {
        result.alreadyHave++;
        result.rows.push({ number: row.number, status: "alreadyHave" });
        continue;
      }

      const label = partLabelFromGroupLine(row.groupLine);
      const found = diagramsForPart(images, {
        label,
        groupLine: row.groupLine,
        partName: String(master.name ?? partAreaTitleFromGroupLine(row.groupLine) ?? ""),
      });
      if (!found.length) {
        result.noDiagram++;
        result.rows.push({ number: row.number, status: "noDiagram" });
        continue;
      }

      // No object storage (local copy): the diagram cannot be stored, so no row is created for the worker to fail on.
      if (!deps.r2) {
        result.noDiagram++;
        result.rows.push({ number: row.number, status: "noDiagram" });
        continue;
      }

      let pictureId: string;
      if (picture) {
        // A failed picture is retried on the same row, same version (no file was ever stored).
        const { error: requeueError } = await supabase
          .from("part_picture")
          .update({
            status: "queued",
            attempts: 0,
            next_attempt_at: now.toISOString(),
            lease_until: null,
            last_error: null,
            label,
            source_saved_page_id: args.savedPageId,
          })
          .eq("id", picture.id);
        if (requeueError) throw requeueError;
        pictureId = picture.id;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("part_picture")
          .insert({
            interchange_group_id: groupId,
            manufacturer: String(master.manufacturer ?? args.carMake ?? ""),
            part_number: String(master.oem_part_number ?? row.number),
            part_name: String(master.name ?? ""),
            catalog_group_id: catalogGroupId,
            component_id: componentId || null,
            status: "queued",
            label,
            version: 1,
            source_saved_page_id: args.savedPageId,
            next_attempt_at: now.toISOString(),
          })
          .select("id, version")
          .single();
        if (insertError) throw insertError;
        pictureId = String((inserted as { id: string }).id);
      }

      if (!storedDiagramPictureIds.has(pictureId)) {
        let stored = 0;
        for (const diagram of found.slice(0, 3)) {
          const ext = imageExtension(diagram.image.contentType) || "bin";
          const key = `part-diagrams/${pictureId}/${uuid()}.${ext}`;
          try {
            await deps.r2.put(DIAGRAM_BUCKET, key, diagram.image.bytes, diagram.image.contentType, DIAGRAM_CACHE);
            const { error: diagramError } = await supabase.from("part_picture_diagram").insert({
              picture_id: pictureId,
              saved_page_id: args.savedPageId,
              r2_key: key,
              map_box: diagram.mapBox,
              delete_after: new Date(now.getTime() + settings.retention_days * 24 * 60 * 60 * 1000).toISOString(),
            });
            if (diagramError) throw diagramError;
            stored += 1;
          } catch (err) {
            console.error("part picture diagram not stored", err);
          }
        }
        if (!stored) {
          await supabase.from("part_picture").update({
            status: "failed",
            last_error: "The diagram couldn't be saved.",
          }).eq("id", pictureId);
          result.noDiagram++;
          result.rows.push({ number: row.number, status: "noDiagram" });
          continue;
        }
        storedDiagramPictureIds.add(pictureId);
      }

      result.queued++;
      queuedThisRun.add(groupId);
      result.rows.push({ number: row.number, status: "queued" });
    }

    return result;
  } catch (err) {
    console.error("part picture queue failed", err);
    result = { ...result, failed: true };
    return result;
  }
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/** `.in(column, values)` with an empty list answered without a request. */
async function selectIn<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  values: string[],
): Promise<T[]> {
  if (!values.length) return [];
  const { data, error } = await supabase.from(table).select(columns).in(column, values);
  if (error) throw error;
  return (data ?? []) as T[];
}
