/**
 * Part-picture addresses (docs/part-pictures-audit.md §3.5 / §4 F1): one stored public key → the card and detail
 * addresses, through the same helpers the car pictures use (`publicMediaUrl` + Cloudflare resizing on
 * media.roamfleet.co, PP-22). Nothing here reads the database, so Fleet can import it without Dominion code.
 */
import { publicMediaUrl } from "../_shared/objectStorage/index.ts";
import { vehiclePictureSrc } from "../../../packages/roam-shared/src/storage/vehiclePicture.ts";

/** `src` + `srcSet`, exactly as the car pictures return them. */
export type PictureUrl = { src: string; srcSet: string };

/** Card (list) or detail (large view) address for a `catalogue/parts/<id>/v<n>.<ext>` key. Null when no key. */
export function partPictureUrlFromKey(
  r2Key: string | null | undefined,
  slot: "card" | "detail",
): PictureUrl | null {
  const base = publicMediaUrl(r2Key);
  return base ? vehiclePictureSrc(base, slot) : null;
}
