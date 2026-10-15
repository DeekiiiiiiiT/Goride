import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  },
});

vi.mock('../services/offlineBlobStore', () => ({
  offlineBlobStore: {
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    convertFileSrc: (p: string) => p,
  },
}));

import {
  CAMERA_DRAFT_TTL_MS,
  clearCameraDraft,
  getCameraResumeTarget,
  isCameraPluginUnimplementedError,
  peekPendingCameraFlow,
  saveCameraDraft,
} from './nativePhotoCapture';

describe('nativePhotoCapture resume helpers', () => {
  beforeEach(() => {
    store.clear();
  });

  afterEach(() => {
    store.clear();
  });

  it('isCameraPluginUnimplementedError detects UNIMPLEMENTED', () => {
    expect(isCameraPluginUnimplementedError({ code: 'UNIMPLEMENTED' })).toBe(true);
    expect(isCameraPluginUnimplementedError({ message: 'Camera not implemented on web' })).toBe(true);
    expect(isCameraPluginUnimplementedError({ message: 'User cancelled' })).toBe(false);
  });

  it('getCameraResumeTarget prefers pendingPhoto over stale drafts', () => {
    const now = 1_000_000;
    saveCameraDraft('odometer', { step: 'ai' });
    // Overwrite savedAt to be fresh
    store.set(
      'roam:driver:camera-draft:odometer',
      JSON.stringify({ step: 'ai', savedAt: now - 1000 }),
    );
    store.set('roam:driver:camera-draft:toll:pendingPhoto', '1');
    expect(getCameraResumeTarget(now)).toBe('toll');
  });

  it('getCameraResumeTarget ignores expired drafts', () => {
    const now = 1_000_000;
    store.set(
      'roam:driver:camera-draft:receipt',
      JSON.stringify({ label: 'Pump', savedAt: now - CAMERA_DRAFT_TTL_MS - 1 }),
    );
    expect(getCameraResumeTarget(now)).toBeNull();
    expect(store.has('roam:driver:camera-draft:receipt')).toBe(false);
  });

  it('peekPendingCameraFlow reads in-flight key', () => {
    store.set('roam:driver:pending-camera-flow', 'checkin');
    expect(peekPendingCameraFlow()).toBe('checkin');
    clearCameraDraft('checkin');
  });

  it('getCameraResumeTarget uses pending flow when draft is fresh', () => {
    const now = 1_000_000;
    store.set('roam:driver:pending-camera-flow', 'odometer');
    store.set(
      'roam:driver:camera-draft:odometer',
      JSON.stringify({ step: 'ai', savedAt: now - 5000 }),
    );
    expect(getCameraResumeTarget(now)).toBe('odometer');
  });
});
