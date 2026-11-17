/**
 * Public address for files in the roam-public R2 bucket.
 * The database stores keys only (e.g. "catalogue/logos/platform/<id>.png");
 * the address is built here so the domain can change without a data fix.
 */
export const MEDIA_BASE_URL = "https://media.roamfleet.co";

export function mediaPublicUrl(key: string | null | undefined, base = MEDIA_BASE_URL): string | null {
  const k = key?.trim().replace(/^\/+/, "");
  if (!k) return null;
  return `${base.replace(/\/+$/, "")}/${k.split("/").map(encodeURIComponent).join("/")}`;
}
