import { MEDIA_BASE_URL } from "./mediaUrl.ts";

export type PictureSlot = "card" | "detail";
export type PictureDisplayStatus =
  | "queued"
  | "generating"
  | "paused"
  | "limited"
  | "failed"
  | "none";

const SLOT_OPTS: Record<PictureSlot, { w1: number; w2: number; q: number }> = {
  card: { w1: 480, w2: 960, q: 80 },
  detail: { w1: 1200, w2: 2400, q: 85 },
};

function mediaPath(url: string): string {
  const base = MEDIA_BASE_URL.replace(/\/+$/, "");
  if (url.startsWith(base + "/")) return url.slice(base.length + 1);
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return new URL(url).pathname.replace(/^\//, "");
  }
  return url.replace(/^\/+/, "");
}

/** Cloudflare image URLs for list vs detail (§3.6). Idempotent when already transformed. */
export function vehiclePictureSrc(
  url: string | null | undefined,
  slot: PictureSlot,
): { src: string; srcSet: string } | null {
  if (url == null || !String(url).trim()) return null;
  const u = url.trim();
  if (u.includes("/cdn-cgi/image/")) {
    return { src: u, srcSet: "" };
  }

  const base = MEDIA_BASE_URL.replace(/\/+$/, "");
  const path = mediaPath(u);
  const { w1, w2, q } = SLOT_OPTS[slot];
  const opts1 = `width=${w1},quality=${q},format=auto`;
  const opts2 = `width=${w2},quality=${q},format=auto`;
  const src = `${base}/cdn-cgi/image/${opts1}/${path}`;
  const srcSet = `${base}/cdn-cgi/image/${opts2}/${path} ${w2}w, ${src} ${w1}w`;
  return { src, srcSet };
}

/** User-facing status line while a picture is not ready (§3.6). */
export function pictureStateLabel(status: PictureDisplayStatus): string {
  switch (status) {
    case "queued":
    case "generating":
      return "Picture coming";
    case "paused":
      return "Pictures are paused for now — Roam will add yours shortly";
    case "limited":
      return "Picture will be added tomorrow";
    case "failed":
      return "Picture unavailable — Roam is on it";
    case "none":
      return "";
  }
}