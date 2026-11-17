/**
 * Dominion → Vehicle pictures (audit §5.2, §6). Calls /admin/vehicle-pictures on fleet-core.
 * Responses carry no fleet data (no org, plate, driver or vehicle count) — see dominionPictureJsonLeak.
 */
import { API_ENDPOINTS } from "../../../../services/apiConfig";
import { publicAnonKey } from "../../../../utils/supabase/info";
import { supabase } from "../../../../utils/supabase/client";
import { type StartUploadResponse, uploadToStorage } from "@roam/roam-shared";

export type PictureRowStatus = "queued" | "generating" | "ready" | "failed";

export type AdminPicture = {
  id: string;
  make: string;
  model: string;
  generation: string | null;
  bodyType: string | null;
  startYear: number | null;
  endYear: number | null;
  color: string;
  status: PictureRowStatus;
  rating: "good" | "wrong" | null;
  source: string | null;
  madeAt: string | null;
  url: { src: string; srcSet: string } | null;
  stale: boolean | null;
};

export type AdminPictureList = {
  items: AdminPicture[];
  total: number;
  counts: { ready: number; beingMade: number; failed: number; stale: number };
  pictureSpend: { usedUsd: number; budgetUsd: number };
  aiPicturesOn: boolean;
  pause: { until: string | null; reason: string | null } | null;
  remakePausedLeft: number | null;
};

export type AdminPictureDetail = {
  picture: AdminPicture;
  inUse: boolean;
  howMade: {
    promptVersion: number | null;
    aiModel: string | null;
    costUsd: number | null;
    madeAt: string | null;
    attempts: number | null;
    lastError: string | null;
  };
  versions: Array<{
    version: number;
    source: string | null;
    createdAt: string;
    retiredAt: string | null;
    url: { src: string; srcSet: string } | null;
  }>;
};

export type RemakePreview = { count: number; costUsd: number; hours: number; fitsThisMonth: boolean };

export type PictureFilters = {
  search?: string;
  color?: string;
  status?: string;
  rating?: string;
  stale?: boolean;
  page: number;
};

const BASE = () => `${API_ENDPOINTS.admin}/admin/vehicle-pictures`;

export class PictureApiError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  const headers: Record<string, string> = { Authorization: token ? `Bearer ${token}` : "", apikey: publicAnonKey };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE()}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) throw new PictureApiError(body.error || "Something went wrong", body.code, response.status);
  return body as T;
}

export function listPictures(f: PictureFilters) {
  const q = new URLSearchParams({ page: String(f.page) });
  if (f.search?.trim()) q.set("search", f.search.trim());
  if (f.color) q.set("color", f.color);
  if (f.status) q.set("status", f.status);
  if (f.rating) q.set("rating", f.rating);
  if (f.stale) q.set("stale", "1");
  return call<AdminPictureList>(`?${q.toString()}`);
}

export const getPicture = (id: string) => call<AdminPictureDetail>(`/${encodeURIComponent(id)}`);
export const setAiPictures = (enabled: boolean) =>
  call<{ ok: boolean; aiPicturesOn: boolean }>("/toggle", { method: "POST", body: { enabled } });
export const previewRemake = () => call<RemakePreview>("/remake-outdated/preview", { method: "POST", body: {} });
export const startRemake = () => call<{ ok: boolean; queued: number }>("/remake-outdated", { method: "POST", body: {} });
export const ratePicture = (id: string, rating: "good" | "wrong") =>
  call<{ ok: boolean }>(`/${encodeURIComponent(id)}/rate`, { method: "POST", body: { rating } });
export const regeneratePicture = (id: string) =>
  call<{ ok: boolean }>(`/${encodeURIComponent(id)}/regenerate`, { method: "POST", body: {} });
export const restorePicture = (id: string) =>
  call<{ ok: boolean }>(`/${encodeURIComponent(id)}/restore`, { method: "POST", body: {} });
export const removePicture = (id: string) => call<{ ok: boolean }>(`/${encodeURIComponent(id)}`, { method: "DELETE" });

/** D4: browser → R2 one-time link → server checks the file and swaps the picture. */
export async function replacePicture(id: string, file: File) {
  const path = `/${encodeURIComponent(id)}/replace`;
  await uploadToStorage({
    file,
    shrinkPhotos: false,
    start: (req) => call<StartUploadResponse>(`${path}/start`, { method: "POST", body: req }),
    finish: async (req) => {
      const done = await call<{ ok: boolean; key: string }>(`${path}/finish`, { method: "POST", body: req });
      return { key: done.key, bucket: "public", size: file.size, contentType: file.type, publicUrl: null };
    },
  });
}
