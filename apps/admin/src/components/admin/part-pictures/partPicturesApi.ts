/**
 * Dominion → Part pictures (docs/part-pictures-audit.md §3.5). Calls /admin/part-pictures and
 * /admin/part-picture-templates on the platform-catalog function. Answers carry no fleet data (PP-17).
 */
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { publicAnonKey } from "../../../utils/supabase/info";
import { supabase } from "../../../utils/supabase/client";

export type PictureView = "made" | "being_made" | "waiting" | "failed" | "hidden";
export type PictureWaitReason = "off" | "budget" | "key_refused" | "paused" | null;
export type PictureUrl = { src: string; srcSet: string };

export type PartPicture = {
  id: string;
  status: PictureView;
  waitingReason: PictureWaitReason;
  url: PictureUrl | null;
  urlDetail: PictureUrl | null;
  partNumber: string;
  partName: string;
  manufacturer: string;
  catalogGroup: { id: string; name: string } | null;
  madeAt: string | null;
  version: number;
  templateVersion: number | null;
  hasDiagram: boolean;
};

export type PictureBanner = { kind: "key_refused" | "paused" | "ai_off" | "budget_80"; reason?: string | null; until?: string | null };

export type PartPictureList = {
  items: PartPicture[];
  total: number;
  page: number;
  pageSize: number;
  hasOlder: boolean;
  hasNewer: boolean;
  nextAfter: string | null;
  nextBefore: string | null;
  counts: { ready: number; beingMade: number; waiting: number; failed: number; hidden: number };
  madeToday: { count: number; dailyMax: number };
  partPictureSpendUsd: number;
  pictureSpend: { usedUsd: number; budgetUsd: number };
  aiPicturesOn: boolean;
  pause: { until: string | null; reason: string | null } | null;
  banners: PictureBanner[];
};

export type PartPictureFilters = {
  status?: PictureView;
  catalogGroupId?: string;
  savedPageId?: string;
  search?: string;
  after?: string;
  before?: string;
};

export type PartPictureTemplate = {
  catalogGroupId: string;
  name: string;
  materials: string;
  enabled: boolean;
  version: number;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string;
};

export type RemakeOlder = { count: number; needUpload: number; costUsd: number; days: number };

const BASE = () => `${API_ENDPOINTS.catalog}/make-server-37f42386/admin`;

export class PartPictureApiError extends Error {
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
  if (!response.ok) throw new PartPictureApiError(body.error || "Something went wrong", body.code, response.status);
  return body as T;
}

export function listPartPictures(f: PartPictureFilters) {
  const q = new URLSearchParams();
  if (f.status) q.set("status", f.status);
  if (f.catalogGroupId) q.set("catalogGroupId", f.catalogGroupId);
  if (f.savedPageId) q.set("savedPageId", f.savedPageId);
  if (f.search?.trim()) q.set("search", f.search.trim());
  if (f.after) q.set("after", f.after);
  if (f.before) q.set("before", f.before);
  const qs = q.toString();
  return call<PartPictureList>(`/part-pictures${qs ? `?${qs}` : ""}`);
}

/** S2: number → its picture (or null), for the numbers a job added. */
export function picturesForNumbers(numbers: string[]) {
  const list = [...new Set(numbers.filter(Boolean))].slice(0, 20);
  if (!list.length) return Promise.resolve({ aiPicturesOn: false, items: [] as Array<{ number: string; picture: PartPicture | null }> });
  return call<{ aiPicturesOn: boolean; items: Array<{ number: string; picture: PartPicture | null }> }>(
    `/part-pictures/by-numbers?numbers=${encodeURIComponent(list.join(","))}`,
  );
}

export const remakePartPicture = (id: string) =>
  call<{ ok: boolean; picture?: PartPicture }>(`/part-pictures/${encodeURIComponent(id)}/remake`, { method: "POST", body: {} });
export const hidePartPicture = (id: string) =>
  call<{ ok: boolean; picture?: PartPicture }>(`/part-pictures/${encodeURIComponent(id)}/hide`, { method: "POST", body: {} });
export const showPartPicture = (id: string) =>
  call<{ ok: boolean; picture?: PartPicture }>(`/part-pictures/${encodeURIComponent(id)}/show`, { method: "POST", body: {} });

export const setAiPartPictures = (on: boolean) =>
  call<{ ok: boolean }>("/part-pictures/settings", { method: "PUT", body: { aiPartPictures: on } });

export const listTemplates = () => call<{ items: PartPictureTemplate[] }>("/part-picture-templates").then((r) => r.items ?? []);
export const saveTemplate = (groupId: string, patch: { materials?: string; enabled?: boolean }) =>
  call<{ ok: boolean; template: PartPictureTemplate }>(`/part-picture-templates/${encodeURIComponent(groupId)}`, { method: "PUT", body: patch });
export const remakeOlderCount = (groupId: string) =>
  call<RemakeOlder>(`/part-picture-templates/${encodeURIComponent(groupId)}/remake-older`);
export const remakeOlder = (groupId: string) =>
  call<{ ok: boolean; queued: number; needUpload: number }>(`/part-picture-templates/${encodeURIComponent(groupId)}/remake-older`, {
    method: "POST",
    body: {},
  });
