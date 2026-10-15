/**
 * Capacitor Camera capture with process-death recovery.
 * HTML file+capture opens the system camera and OEMs often kill Roam in the background.
 */
import { Capacitor } from '@capacitor/core';
import { offlineBlobStore } from '../services/offlineBlobStore';

export type CaptureFlowId = 'odometer' | 'checkin' | 'receipt' | 'toll' | 'fuel';

type CaptureHandler = (file: File) => void;

const PENDING_FLOW_KEY = 'roam:driver:pending-camera-flow';
const DRAFT_PREFIX = 'roam:driver:camera-draft:';
/** Stale drafts must not yank drivers into expenses days later. */
export const CAMERA_DRAFT_TTL_MS = 30 * 60 * 1000;

const FLOW_IDS: CaptureFlowId[] = ['odometer', 'checkin', 'receipt', 'toll', 'fuel'];

const handlers = new Map<CaptureFlowId, CaptureHandler>();
let restoredListenerReady = false;

export function registerCaptureHandler(flowId: CaptureFlowId, handler: CaptureHandler): () => void {
  handlers.set(flowId, handler);
  return () => {
    if (handlers.get(flowId) === handler) handlers.delete(flowId);
  };
}

function setPendingFlow(flowId: CaptureFlowId): void {
  try {
    localStorage.setItem(PENDING_FLOW_KEY, flowId);
  } catch {
    /* ignore */
  }
}

function clearPendingFlow(): void {
  try {
    localStorage.removeItem(PENDING_FLOW_KEY);
  } catch {
    /* ignore */
  }
}

function parseFlowId(v: string | null | undefined): CaptureFlowId | null {
  if (v === 'odometer' || v === 'checkin' || v === 'receipt' || v === 'toll' || v === 'fuel') {
    return v;
  }
  return null;
}

function getPendingFlow(): CaptureFlowId | null {
  try {
    return parseFlowId(localStorage.getItem(PENDING_FLOW_KEY));
  } catch {
    return null;
  }
}

/** Pending flow key left by an in-flight Camera.getPhoto (may outlive process death). */
export function peekPendingCameraFlow(): CaptureFlowId | null {
  return getPendingFlow();
}

function hasPendingPhotoFlag(flowId: CaptureFlowId): boolean {
  try {
    return localStorage.getItem(`${DRAFT_PREFIX}${flowId}:pendingPhoto`) === '1';
  } catch {
    return false;
  }
}

function draftSavedAt(flowId: CaptureFlowId): number | null {
  const draft = loadCameraDraft<{ savedAt?: number }>(flowId);
  const t = draft?.savedAt;
  return typeof t === 'number' && Number.isFinite(t) ? t : null;
}

function isFreshDraft(flowId: CaptureFlowId, now = Date.now()): boolean {
  const savedAt = draftSavedAt(flowId);
  if (savedAt == null) return false;
  return now - savedAt <= CAMERA_DRAFT_TTL_MS;
}

/** Drop expired drafts so boot resume cannot reopen ancient expense screens. */
export function clearExpiredCameraDrafts(now = Date.now()): void {
  for (const flowId of FLOW_IDS) {
    const savedAt = draftSavedAt(flowId);
    if (savedAt != null && now - savedAt > CAMERA_DRAFT_TTL_MS) {
      clearCameraDraft(flowId);
    }
  }
  const pending = getPendingFlow();
  if (pending && !hasPendingPhotoFlag(pending) && !isFreshDraft(pending, now)) {
    clearPendingFlow();
  }
}

/**
 * Boot resume target: pending photo stash, in-flight pending flow, or fresh draft.
 * Priority: checkin → toll → odometer → receipt → fuel.
 */
export function getCameraResumeTarget(now = Date.now()): CaptureFlowId | null {
  clearExpiredCameraDrafts(now);

  const priority: CaptureFlowId[] = ['checkin', 'toll', 'odometer', 'receipt', 'fuel'];
  for (const flowId of priority) {
    if (hasPendingPhotoFlag(flowId)) return flowId;
  }

  const pending = getPendingFlow();
  if (pending && (hasPendingPhotoFlag(pending) || isFreshDraft(pending, now))) {
    return pending;
  }

  for (const flowId of priority) {
    if (isFreshDraft(flowId, now)) return flowId;
  }

  return null;
}

export function isCameraPluginUnimplementedError(err: unknown): boolean {
  if (err == null) return false;
  const e = err as { code?: string; message?: string; errorMessage?: string };
  const code = String(e.code ?? '').toUpperCase();
  if (code === 'UNIMPLEMENTED') return true;
  const msg = `${e.message ?? ''} ${e.errorMessage ?? ''}`.toLowerCase();
  return msg.includes('not implemented') || msg.includes('unimplemented');
}

async function pathToFile(path: string, name = 'capture.jpg'): Promise<File> {
  const res = await fetch(Capacitor.convertFileSrc(path));
  const blob = await res.blob();
  const type = blob.type || 'image/jpeg';
  return new File([blob], name, { type });
}

function deliver(flowId: CaptureFlowId, file: File): void {
  clearPendingFlow();
  const handler = handlers.get(flowId);
  if (handler) {
    handler(file);
    return;
  }
  // Handler not mounted yet (cold start after process death) — stash blob for resume.
  void offlineBlobStore.put(`camera-restore:${flowId}`, file).then(() => {
    try {
      localStorage.setItem(`${DRAFT_PREFIX}${flowId}:pendingPhoto`, '1');
    } catch {
      /* ignore */
    }
  });
}

/** Call once from capacitor-native bootstrap. */
export async function initCameraRestoredResultListener(): Promise<void> {
  if (restoredListenerReady || !Capacitor.isNativePlatform()) return;
  restoredListenerReady = true;
  const { App } = await import('@capacitor/app');
  await App.addListener('appRestoredResult', (event) => {
    const raw = event as {
      pluginId?: string;
      success?: boolean;
      data?: { path?: string; webPath?: string };
      pluginData?: { path?: string; webPath?: string };
    };
    if (raw.pluginId != null && raw.pluginId !== 'Camera') return;
    if (raw.success === false) return;
    const flowId = getPendingFlow();
    if (!flowId) return;
    const pluginData = raw.pluginData ?? raw.data;
    const path = pluginData?.path || pluginData?.webPath;
    if (!path) return;
    void pathToFile(path).then((file) => deliver(flowId, file));
  });
}

/** Resume a photo that was stashed because the UI wasn't mounted yet. */
export async function consumeRestoredPhoto(flowId: CaptureFlowId): Promise<File | null> {
  try {
    const pending = localStorage.getItem(`${DRAFT_PREFIX}${flowId}:pendingPhoto`);
    if (!pending) return null;
    const blob = await offlineBlobStore.get(`camera-restore:${flowId}`);
    localStorage.removeItem(`${DRAFT_PREFIX}${flowId}:pendingPhoto`);
    await offlineBlobStore.remove(`camera-restore:${flowId}`);
    if (!blob) return null;
    return new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' });
  } catch {
    return null;
  }
}

export function saveCameraDraft(flowId: CaptureFlowId, draft: Record<string, unknown>): void {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${flowId}`, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function loadCameraDraft<T extends Record<string, unknown>>(flowId: CaptureFlowId): T | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${flowId}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearCameraDraft(flowId: CaptureFlowId): void {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${flowId}`);
    localStorage.removeItem(`${DRAFT_PREFIX}${flowId}:pendingPhoto`);
  } catch {
    /* ignore */
  }
  void offlineBlobStore.remove(`camera-restore:${flowId}`);
}

/**
 * Open the in-app / Capacitor camera (native) or a hidden file input (web).
 * Call saveCameraDraft before this if the form has fields worth keeping.
 */
export async function captureNativePhoto(flowId: CaptureFlowId): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) {
    return captureViaFileInput(true);
  }

  setPendingFlow(flowId);
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      correctOrientation: true,
    });
    const path = photo.path || photo.webPath;
    if (!path) {
      clearPendingFlow();
      return null;
    }
    const file = await pathToFile(path);
    clearPendingFlow();
    return file;
  } catch (err) {
    clearPendingFlow();
    // Bad sync / missing native plugin — fall back so photo buttons still work.
    if (isCameraPluginUnimplementedError(err)) {
      return captureViaFileInput(true);
    }
    return null;
  }
}

/** Gallery / PDF picker for web + native (no process-death risk on gallery). */
export async function pickGalleryFile(accept = 'image/*'): Promise<File | null> {
  return captureViaFileInput(false, accept);
}

function captureViaFileInput(useCapture: boolean, accept = 'image/*'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (useCapture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    const cleanup = () => {
      input.remove();
    };
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    };
    input.oncancel = () => {
      cleanup();
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}
