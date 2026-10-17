/** Build / apply published MenuSnapshot from normalised rows or legacy conversion. */

import type { MenuSnapshot } from './types.ts';

export function parseMenuSnapshot(raw: unknown): MenuSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (!Array.isArray(row.groups) || !Array.isArray(row.products)) return null;
  return {
    menuId: String(row.menuId || ''),
    version: Number(row.version) || 0,
    groups: row.groups as MenuSnapshot['groups'],
    priceMatrix: Array.isArray(row.priceMatrix) ? row.priceMatrix as MenuSnapshot['priceMatrix'] : [],
    products: row.products as MenuSnapshot['products'],
    sections: Array.isArray(row.sections) ? row.sections as MenuSnapshot['sections'] : [],
  };
}

export function snapshotJson(snapshot: MenuSnapshot): MenuSnapshot {
  return structuredClone(snapshot);
}
